/**
 * Quiz sessions and flashcard (SRS) review.
 *
 * POST /quiz                 body StartQuizBody
 *        pool = questions in scope (topic | the module's topics | all) where q.levels includes level;
 *        keep audience === mode or 'all'; add the other audience only if the pool is short of `count`.
 *        Order: answered wrong most recently first, then never asked, then the rest; shuffle within
 *        each group; take `count`. Insert quiz_sessions with questionIds.
 *        Returns questions WITHOUT `answer` / `explanation`.
 * POST /quiz/:sessionId/answers  body AnswerQuizBody
 *        correct = setEqual(chosen, question.answer). Insert quiz_answers, deduped on
 *        (session_id, question_id): replaying returns the stored result.
 * POST /quiz/:sessionId/finish   -> set finished_at + counts; event 'quiz_finished'. Idempotent.
 *
 * GET  /cards/due?limit&topicId  -> flashcards whose `levels` include the user's level for that topic
 *        (topic_settings or default), ordered by selectSessionCards() from @itmc/core.
 * POST /cards                 body ReviewCardBody -> scheduleReview() from @itmc/core; upsert;
 *        event 'card_reviewed'; returns { dueAt }.
 *
 * NOTE on ordering: the "recently wrong" group keeps its recency order (that is what makes the group
 * useful); the "never asked" and "everything else" groups are shuffled.
 */
import {
  AnswerQuizBody,
  ReviewCardBody,
  StartQuizBody,
  initialCardState,
  isPrimaryForMode,
  scheduleReview,
  selectSessionCards,
  type Flashcard,
  type Level,
  type QuizQuestion,
} from '@itmc/core';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  toPublicQuestion,
  type AnswerQuizResponse,
  type FinishQuizResponse,
  type ReviewCardResponse,
  type StartQuizResponse,
} from '../lib/dto.js';
import { recordEvent } from '../lib/repos/events.js';
import {
  answerHistory,
  cardStates,
  createQuizSession,
  finishQuizSession,
  getAnswer,
  getCardState,
  getQuizSession,
  insertAnswer,
  listAnswers,
  upsertCardState,
} from '../lib/repos/review.js';
import { getUserSettings, selectedLevelByTopic } from '../lib/repos/settings.js';

const sessionParams = z.object({ sessionId: z.string() });

const dueQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  topicId: z.string().optional(),
});

function shuffle<T>(xs: T[]): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const ai = a[i] as T;
    a[i] = a[j] as T;
    a[j] = ai;
  }
  return a;
}

const setEqual = (a: number[], b: number[]): boolean => {
  const sa = new Set(a);
  const sb = new Set(b);
  return sa.size === sb.size && [...sa].every((x) => sb.has(x));
};

export const reviewRoutes: FastifyPluginAsyncZod = async (app) => {
  app.post('/quiz', { schema: { body: StartQuizBody } }, async (req, reply) => {
    const { scopeType, scopeId, level, mode, count } = req.body;

    let scoped: QuizQuestion[];
    if (scopeType === 'topic') {
      if (!scopeId || !app.content.topic(scopeId)) return reply.code(404).send({ error: 'topic not found' });
      scoped = app.content.questionsFor(scopeId);
    } else if (scopeType === 'module') {
      const mod = scopeId ? app.content.module(scopeId) : undefined;
      if (!mod) return reply.code(404).send({ error: 'module not found' });
      scoped = mod.topics.flatMap((t) => app.content.questionsFor(t.id));
    } else {
      scoped = app.content.allQuestions();
    }

    const atLevel = scoped.filter((q) => q.levels.includes(level));
    const primary = atLevel.filter((q) => isPrimaryForMode(q.audience, mode));
    const pool =
      primary.length >= count
        ? primary
        : [...primary, ...atLevel.filter((q) => !isPrimaryForMode(q.audience, mode))];

    const { wrongRecentFirst, asked } = await answerHistory(app.db, req.userId);
    const byId = new Map(pool.map((q) => [q.id, q] as const));
    const wrongIds = new Set(wrongRecentFirst);

    const wrong = wrongRecentFirst.flatMap((id) => {
      const q = byId.get(id);
      return q ? [q] : [];
    });
    const unseen = shuffle(pool.filter((q) => !asked.has(q.id)));
    const rest = shuffle(pool.filter((q) => asked.has(q.id) && !wrongIds.has(q.id)));

    const selected = [...wrong, ...unseen, ...rest].slice(0, count);
    const now = new Date().toISOString();
    const sessionId = await createQuizSession(
      app.db,
      req.userId,
      { scopeType, scopeId, level, mode, questionIds: selected.map((q) => q.id) },
      now,
    );

    const res: StartQuizResponse = { sessionId, questions: selected.map(toPublicQuestion) };
    return res;
  });

  app.post(
    '/quiz/:sessionId/answers',
    { schema: { params: sessionParams, body: AnswerQuizBody } },
    async (req, reply) => {
      const session = await getQuizSession(app.db, req.userId, req.params.sessionId);
      if (!session) return reply.code(404).send({ error: 'quiz session not found' });

      const { questionId, chosen } = req.body;
      if (!session.questionIds.includes(questionId)) {
        return reply.code(404).send({ error: 'question not in this session' });
      }
      const question = app.content.question(questionId);
      if (!question) return reply.code(404).send({ error: 'question not found' });

      // Dedupe on (session_id, question_id): a replayed answer returns the stored result.
      const existing = await getAnswer(app.db, session.id, questionId);
      const correct = existing ? existing.correct : setEqual(chosen, question.answer);
      if (!existing) {
        await insertAnswer(app.db, session.id, questionId, chosen, correct, new Date().toISOString());
      }

      const res: AnswerQuizResponse = {
        correct,
        answer: question.answer,
        explanation: question.explanation,
      };
      return res;
    },
  );

  app.post('/quiz/:sessionId/finish', { schema: { params: sessionParams } }, async (req, reply) => {
    const session = await getQuizSession(app.db, req.userId, req.params.sessionId);
    if (!session) return reply.code(404).send({ error: 'quiz session not found' });

    if (session.finishedAt) {
      const done: FinishQuizResponse = {
        correctCount: session.correctCount,
        totalCount: session.totalCount,
      };
      return done;
    }

    const answers = await listAnswers(app.db, session.id);
    const correctCount = answers.filter((a) => a.correct).length;
    const now = new Date().toISOString();
    await finishQuizSession(app.db, session.id, correctCount, now);
    await recordEvent(
      app.db,
      req.userId,
      'quiz_finished',
      session.id,
      {
        correctCount,
        totalCount: session.totalCount,
        scopeType: session.scopeType,
        scopeId: session.scopeId,
        level: session.level,
      },
      now,
    );

    const res: FinishQuizResponse = { correctCount, totalCount: session.totalCount };
    return res;
  });

  app.get('/cards/due', { schema: { querystring: dueQuery } }, async (req, reply) => {
    const { limit, topicId } = req.query;
    if (topicId && !app.content.topic(topicId)) return reply.code(404).send({ error: 'topic not found' });

    const [settings, chosenLevels] = await Promise.all([
      getUserSettings(app.db, req.userId),
      selectedLevelByTopic(app.db, req.userId),
    ]);
    const levelFor = (t: string): Level => chosenLevels.get(t) ?? settings.defaultLevel;

    const cards = (topicId ? app.content.flashcardsFor(topicId) : app.content.allFlashcards()).filter(
      (c) => c.levels.includes(levelFor(c.topicId)),
    );
    const states = await cardStates(
      app.db,
      req.userId,
      cards.map((c) => c.id),
    );
    const candidates = cards.map((c) => {
      const state = states.get(c.id);
      return state ? { cardId: c.id, card: c, state } : { cardId: c.id, card: c };
    });

    const picked = selectSessionCards(candidates, limit);
    const res: Flashcard[] = picked.map((p) => p.card);
    return res;
  });

  app.post('/cards', { schema: { body: ReviewCardBody } }, async (req, reply) => {
    const { cardId, rating } = req.body;
    const card = app.content.flashcard(cardId);
    if (!card) return reply.code(404).send({ error: 'flashcard not found' });

    const now = new Date();
    const prev = (await getCardState(app.db, req.userId, cardId)) ?? initialCardState(now);
    const next = scheduleReview(prev, rating, now);
    await upsertCardState(app.db, req.userId, cardId, card.topicId, next);
    await recordEvent(
      app.db,
      req.userId,
      'card_reviewed',
      cardId,
      { rating, topicId: card.topicId },
      now.toISOString(),
    );

    const res: ReviewCardResponse = { dueAt: next.dueAt };
    return res;
  });
};
