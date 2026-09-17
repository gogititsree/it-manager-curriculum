/** quiz_sessions, quiz_answers and card_reviews. SRS maths stays in @itmc/core srs.ts. */
import type { CardState, Level, Mode, Rating } from '@itmc/core';
import type { Db } from '@itmc/db';
import { cardReviews, quizAnswers, quizSessions } from '@itmc/db';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { newId } from '../ids.js';

export type QuizSessionRow = typeof quizSessions.$inferSelect;
export type QuizAnswerRow = typeof quizAnswers.$inferSelect;

export async function createQuizSession(
  db: Db,
  userId: string,
  input: {
    scopeType: 'topic' | 'module' | 'all';
    scopeId?: string | undefined;
    level: Level;
    mode: Mode;
    questionIds: string[];
  },
  now: string,
): Promise<string> {
  const id = newId();
  await db
    .insert(quizSessions)
    .values({
      id,
      userId,
      scopeType: input.scopeType,
      scopeId: input.scopeId ?? null,
      level: input.level,
      mode: input.mode,
      questionIds: input.questionIds,
      startedAt: now,
      finishedAt: null,
      correctCount: 0,
      totalCount: input.questionIds.length,
    })
    .run();
  return id;
}

export async function getQuizSession(
  db: Db,
  userId: string,
  sessionId: string,
): Promise<QuizSessionRow | undefined> {
  return db
    .select()
    .from(quizSessions)
    .where(and(eq(quizSessions.userId, userId), eq(quizSessions.id, sessionId)))
    .get();
}

export async function getAnswer(
  db: Db,
  sessionId: string,
  questionId: string,
): Promise<QuizAnswerRow | undefined> {
  return db
    .select()
    .from(quizAnswers)
    .where(and(eq(quizAnswers.sessionId, sessionId), eq(quizAnswers.questionId, questionId)))
    .get();
}

export async function insertAnswer(
  db: Db,
  sessionId: string,
  questionId: string,
  chosen: number[],
  correct: boolean,
  now: string,
): Promise<QuizAnswerRow> {
  const row = { id: newId(), sessionId, questionId, chosen, correct, answeredAt: now };
  await db.insert(quizAnswers).values(row).run();
  return row;
}

export async function listAnswers(db: Db, sessionId: string): Promise<QuizAnswerRow[]> {
  return db.select().from(quizAnswers).where(eq(quizAnswers.sessionId, sessionId)).all();
}

export async function finishQuizSession(
  db: Db,
  sessionId: string,
  correctCount: number,
  now: string,
): Promise<void> {
  await db
    .update(quizSessions)
    .set({ finishedAt: now, correctCount })
    .where(eq(quizSessions.id, sessionId))
    .run();
}

/**
 * Question ids the user has answered before, newest answer first, and whether that newest answer
 * was wrong. Drives the "recently wrong first, then never asked, then the rest" ordering.
 */
export async function answerHistory(
  db: Db,
  userId: string,
): Promise<{ wrongRecentFirst: string[]; asked: Set<string> }> {
  const rows = await db
    .select({
      questionId: quizAnswers.questionId,
      correct: quizAnswers.correct,
      answeredAt: quizAnswers.answeredAt,
    })
    .from(quizAnswers)
    .innerJoin(quizSessions, eq(quizAnswers.sessionId, quizSessions.id))
    .where(eq(quizSessions.userId, userId))
    .orderBy(desc(quizAnswers.answeredAt))
    .all();

  const asked = new Set<string>();
  const wrongRecentFirst: string[] = [];
  for (const r of rows) {
    if (asked.has(r.questionId)) continue; // rows are newest-first, so this is the latest answer
    asked.add(r.questionId);
    if (!r.correct) wrongRecentFirst.push(r.questionId);
  }
  return { wrongRecentFirst, asked };
}

// ---------- flashcards ----------

type CardRow = typeof cardReviews.$inferSelect;

export function toCardState(row: CardRow): CardState {
  return {
    ease: row.ease,
    intervalDays: row.intervalDays,
    reps: row.reps,
    lapses: row.lapses,
    dueAt: row.dueAt,
    ...(row.lastReviewedAt ? { lastReviewedAt: row.lastReviewedAt } : {}),
    ...(row.lastRating ? { lastRating: row.lastRating as Rating } : {}),
  };
}

export async function cardStates(
  db: Db,
  userId: string,
  cardIds?: string[],
): Promise<Map<string, CardState>> {
  if (cardIds && cardIds.length === 0) return new Map();
  const where = cardIds
    ? and(eq(cardReviews.userId, userId), inArray(cardReviews.cardId, cardIds))
    : eq(cardReviews.userId, userId);
  const rows = await db.select().from(cardReviews).where(where).all();
  return new Map(rows.map((r) => [r.cardId, toCardState(r)] as const));
}

export async function getCardState(
  db: Db,
  userId: string,
  cardId: string,
): Promise<CardState | undefined> {
  const row = await db
    .select()
    .from(cardReviews)
    .where(and(eq(cardReviews.userId, userId), eq(cardReviews.cardId, cardId)))
    .get();
  return row ? toCardState(row) : undefined;
}

export async function upsertCardState(
  db: Db,
  userId: string,
  cardId: string,
  topicId: string,
  state: CardState,
): Promise<void> {
  const values = {
    userId,
    cardId,
    topicId,
    ease: state.ease,
    intervalDays: state.intervalDays,
    reps: state.reps,
    lapses: state.lapses,
    dueAt: state.dueAt,
    lastReviewedAt: state.lastReviewedAt ?? null,
    lastRating: state.lastRating ?? null,
  };
  await db
    .insert(cardReviews)
    .values(values)
    .onConflictDoUpdate({
      target: [cardReviews.userId, cardReviews.cardId],
      set: {
        topicId: values.topicId,
        ease: values.ease,
        intervalDays: values.intervalDays,
        reps: values.reps,
        lapses: values.lapses,
        dueAt: values.dueAt,
        lastReviewedAt: values.lastReviewedAt,
        lastRating: values.lastRating,
      },
    })
    .run();
}
