/**
 * @itmc/local-client — a drop-in replacement for @itmc/api-client that runs entirely in the browser.
 *
 * WHY: the same app has to be deployable to GitHub Pages, where there is no server, no database and
 * no token. Static mode keeps every page, hook and component unchanged by swapping the transport:
 * apps/web/src/lib/api.ts picks this factory instead of `createApiClient` and exports the same `api`.
 *
 * CONTRACT: the object returned by `createLocalClient` is structurally assignable to `ApiClient`
 * (see the compile-time assertion at the bottom of this file), plus `exportState` / `importState`.
 *
 * RULES THIS FILE OBEYS:
 *  - Business rules come from @itmc/core (`applySectionCompleted`, `lessonCompletion`,
 *    `moduleProgress`, `scheduleReview`, `selectSessionCards`, `isPrimaryForMode`, `lessonId`,
 *    `parseLessonId`). Nothing here recomputes progress maths or spaced repetition.
 *  - Semantics mirror apps/api/src/routes/{settings,progress,review}.ts exactly — idempotency,
 *    activity events, quiz selection order, answers withheld until answered. Those route header
 *    comments are the spec; this file is the second implementation of it.
 *  - No Node APIs. No fs, no process. Persistence goes through the injected `KeyValueStore`.
 */
import {
  applySectionCompleted,
  initialCardState,
  isPrimaryForMode,
  lessonCompletion,
  moduleProgress,
  parseLessonId,
  scheduleReview,
  selectSessionCards,
  type AnswerQuizInput,
  type ContentManifest,
  type DashboardDTO,
  type ExerciseAttemptInput,
  type Flashcard,
  type Lesson,
  type LessonProgressDTO,
  type LessonProgressRow,
  type Level,
  type ModuleProgress,
  type ProgressInputs,
  type QuizQuestion,
  type ReviewCardInput,
  type StartQuizInput,
  type TopicSettings,
  type UserSettings,
} from '@itmc/core';
import type { ApiClient, QuizQuestionPublic } from '@itmc/api-client';
import { createContentLoader, type ContentStore } from './content.js';
import { LocalClientError, notFound } from './errors.js';
import { minutesToday, recordEvent, streakDays, type ActivityType } from './events.js';
import { newId } from './ids.js';
import * as db from './state.js';
import { K, NAMESPACE, SCHEMA_VERSION, SafeStore, type KeyValueStore } from './storage.js';

export { LocalClientError } from './errors.js';
export { memoryStore, NAMESPACE, SCHEMA_VERSION, type KeyValueStore } from './storage.js';
export type { ContentStore } from './content.js';

export interface LocalClientOptions {
  /** Where the compiled content bundle lives, e.g. `${import.meta.env.BASE_URL}content/bundle.json`. */
  bundleUrl: string;
  /** Persistence port. The web app passes a localStorage adapter; tests pass a Map. */
  store: KeyValueStore;
  /** Injectable for tests. Defaults to the global fetch. */
  fetchImpl?: typeof fetch;
  /** Injectable clock, so streak and scheduling tests are not wall-clock dependent. */
  now?: () => Date;
}

/** The export envelope written by `exportState()` and accepted by `importState()`. */
export interface LocalStateExport {
  app: 'itmc';
  kind: 'local-state';
  schemaVersion: number;
  exportedAt: string;
  /** Raw namespaced key -> raw stored JSON string. A byte-for-byte snapshot, so it round-trips. */
  data: Record<string, string>;
}

const setEqual = (a: number[], b: number[]): boolean => {
  const sa = new Set(a);
  const sb = new Set(b);
  return sa.size === sb.size && [...sa].every((x) => sb.has(x));
};

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

/** Strip the fields the caller must not see before it has answered (apps/api/src/lib/dto.ts). */
function toPublicQuestion(q: QuizQuestion): QuizQuestionPublic {
  const { answer: _answer, explanation: _explanation, ...rest } = q;
  return rest;
}

function toDto(row: LessonProgressRow): LessonProgressDTO {
  return {
    lessonId: row.lessonId,
    status: row.status,
    completedSectionIds: row.completedSectionIds,
    ...(row.lastViewedAt ? { lastViewedAt: row.lastViewedAt } : {}),
    ...(row.completedAt ? { completedAt: row.completedAt } : {}),
  };
}

export function createLocalClient(opts: LocalClientOptions) {
  const store = new SafeStore(opts.store);
  store.ensureSchema();

  const clock = opts.now ?? (() => new Date());
  const loadContent = createContentLoader(opts.bundleUrl, opts.fetchImpl);

  const log = (type: ActivityType, refId: string | null, payload: Record<string, unknown> | null, at: string): void =>
    recordEvent(store, newId(), type, refId, payload, at);

  /**
   * Guard used by the progress routes: a lesson must be a well-formed `topicId@level` id AND exist
   * in the manifest or the bundle. `parseLessonId` from core is the only place ids are parsed, so a
   * malformed id becomes a 404 rather than an exception thrown mid-render.
   */
  function requireLesson(content: ContentStore, id: string): void {
    try {
      parseLessonId(id);
    } catch {
      throw notFound('lesson');
    }
    if (!content.lessonSummary(id) && !content.lesson(id)) throw notFound('lesson');
  }

  return {
    // ------------------------------------------------------------------ content

    async getManifest(): Promise<ContentManifest> {
      return (await loadContent()).manifest;
    },

    async getLesson(id: string): Promise<Lesson> {
      const lesson = (await loadContent()).lesson(id);
      if (!lesson) throw notFound('lesson');
      return lesson;
    },

    async getTopicQuestions(topicId: string): Promise<QuizQuestion[]> {
      const content = await loadContent();
      if (!content.topic(topicId)) throw notFound('topic');
      return content.questionsFor(topicId);
    },

    async getTopicFlashcards(topicId: string): Promise<Flashcard[]> {
      const content = await loadContent();
      if (!content.topic(topicId)) throw notFound('topic');
      return content.flashcardsFor(topicId);
    },

    // ------------------------------------------------------------------ settings

    async getUserSettings(): Promise<UserSettings> {
      return db.getUserSettings(store);
    },

    async putUserSettings(body: UserSettings): Promise<UserSettings> {
      return db.putUserSettings(store, body);
    },

    async getTopicSettings(): Promise<TopicSettings[]> {
      return db.listTopicSettings(store);
    },

    /**
     * Mirrors PUT /api/settings/topics/:topicId. "Actually changed" is measured against the topic's
     * previous EFFECTIVE value: its own row if there is one, otherwise the user's defaults.
     */
    async putTopicSettings(body: TopicSettings): Promise<TopicSettings> {
      const content = await loadContent();
      if (!content.topic(body.topicId)) throw notFound('topic');

      const now = clock().toISOString();
      const previous = db.getTopicSetting(store, body.topicId);
      const defaults = previous ? undefined : db.getUserSettings(store);
      const prevLevel = previous?.level ?? defaults?.defaultLevel;
      const prevMode = previous?.mode ?? defaults?.defaultMode;

      const saved = db.upsertTopicSetting(store, {
        topicId: body.topicId,
        level: body.level,
        mode: body.mode,
      });

      if (prevLevel !== saved.level) log('level_changed', body.topicId, { from: prevLevel, to: saved.level }, now);
      if (prevMode !== saved.mode) log('mode_changed', body.topicId, { from: prevMode, to: saved.mode }, now);
      return saved;
    },

    // ------------------------------------------------------------------ progress

    async getDashboard(): Promise<DashboardDTO> {
      const content = await loadContent();
      const now = clock();
      const nowIso = now.toISOString();

      const settings = db.getUserSettings(store);
      const cardsDue = db.cardsDueByTopic(store, nowIso);

      const inputs: ProgressInputs = {
        lessonRows: db.allLessonRows(store),
        quizBestByLesson: db.quizBestByLesson(store),
        cardsDueByTopic: cardsDue,
        selectedLevelByTopic: db.selectedLevelByTopic(store),
        defaultLevel: settings.defaultLevel,
      };

      const modules: Record<string, ModuleProgress> = {};
      for (const mod of content.manifest.modules) modules[mod.id] = moduleProgress(mod, inputs);

      let cardsDueTotal = 0;
      for (const n of cardsDue.values()) cardsDueTotal += n;

      const recent = db.recentLessonRows(store, 5).flatMap((row) => {
        const summary = content.lessonSummary(row.lessonId);
        if (!summary || !row.lastViewedAt) return [];
        return [
          {
            lessonId: row.lessonId,
            title: summary.title,
            lastViewedAt: row.lastViewedAt,
            completion: lessonCompletion(summary, row),
          },
        ];
      });

      return {
        streakDays: streakDays(store, now),
        minutesToday: minutesToday(store, content, now),
        cardsDue: cardsDueTotal,
        modules,
        recent,
      };
    },

    async getLessonProgress(id: string): Promise<LessonProgressDTO> {
      const content = await loadContent();
      requireLesson(content, id);
      const row = db.getLessonRow(store, id);
      return row ? toDto(row) : { lessonId: id, status: 'not_started', completedSectionIds: [] };
    },

    /** Upsert: creates the row if absent, otherwise only bumps lastViewedAt. */
    async markLessonViewed(id: string): Promise<LessonProgressDTO> {
      const content = await loadContent();
      requireLesson(content, id);

      const now = clock().toISOString();
      const existing = db.getLessonRow(store, id);
      const row: LessonProgressRow = existing
        ? {
            ...existing,
            status: existing.status === 'not_started' ? 'in_progress' : existing.status,
            lastViewedAt: now,
          }
        : { lessonId: id, status: 'in_progress', completedSectionIds: [], lastViewedAt: now };

      db.saveLessonRow(store, row);
      log('lesson_viewed', id, null, now);
      return toDto(row);
    },

    /**
     * applySectionCompleted() from core decides the next row; replaying is a no-op because the
     * completed set is a set, and no duplicate `section_completed` event is written.
     */
    async completeSection(id: string, sectionId: string): Promise<LessonProgressDTO> {
      const content = await loadContent();
      const summary = content.lessonSummary(id);
      if (!summary) throw notFound('lesson');
      if (!summary.sectionIds.includes(sectionId)) throw notFound('section');

      const now = clock().toISOString();
      const before = db.getLessonRow(store, id);
      const alreadyDone = before?.completedSectionIds.includes(sectionId) ?? false;
      const wasCompleted = before?.status === 'completed';

      const after = applySectionCompleted(before, id, sectionId, summary, now);
      // applySectionCompleted drops completedAt when the lesson is no longer complete; keep a
      // previously recorded completion date if the row was already finished.
      if (wasCompleted && before?.completedAt && !after.completedAt) after.completedAt = before.completedAt;
      db.saveLessonRow(store, after);

      if (!alreadyDone) log('section_completed', id, { sectionId }, now);
      if (after.status === 'completed' && !wasCompleted) log('lesson_completed', id, null, now);
      return toDto(after);
    },

    async submitExercise(body: ExerciseAttemptInput): Promise<{ id: string }> {
      const content = await loadContent();
      const found = content.exercise(body.exerciseId);
      if (!found) throw notFound('exercise');

      const now = clock().toISOString();
      const id = db.insertExerciseAttempt(store, {
        id: newId(),
        exerciseId: body.exerciseId,
        lessonId: found.lessonId,
        submission: body.submission ?? null,
        selfRating: body.selfRating,
        notes: body.notes ?? null,
        createdAt: now,
      });
      log('exercise_attempted', body.exerciseId, { lessonId: found.lessonId, selfRating: body.selfRating }, now);
      return { id };
    },

    // ------------------------------------------------------------------ review: quiz

    /**
     * Selection, exactly as in apps/api/src/routes/review.ts: scope -> level -> prefer the current
     * mode's audience (widening only if the pool is short of `count`), then order
     * "answered wrong most recently first" (recency order preserved), then never asked (shuffled),
     * then the rest (shuffled). Questions are returned WITHOUT `answer` / `explanation`.
     */
    async startQuiz(body: StartQuizInput): Promise<{ sessionId: string; questions: QuizQuestionPublic[] }> {
      const content = await loadContent();
      const { scopeType, scopeId, level, mode } = body;
      const count = body.count ?? 10;

      let scoped: QuizQuestion[];
      if (scopeType === 'topic') {
        if (!scopeId || !content.topic(scopeId)) throw notFound('topic');
        scoped = content.questionsFor(scopeId);
      } else if (scopeType === 'module') {
        const mod = scopeId ? content.module(scopeId) : undefined;
        if (!mod) throw notFound('module');
        scoped = mod.topics.flatMap((t) => content.questionsFor(t.id));
      } else {
        scoped = content.allQuestions();
      }

      const atLevel = scoped.filter((q) => q.levels.includes(level));
      const primary = atLevel.filter((q) => isPrimaryForMode(q.audience, mode));
      const pool =
        primary.length >= count ? primary : [...primary, ...atLevel.filter((q) => !isPrimaryForMode(q.audience, mode))];

      const { wrongRecentFirst, asked } = db.answerHistory(store);
      const byId = new Map(pool.map((q) => [q.id, q] as const));
      const wrongIds = new Set(wrongRecentFirst);

      const wrong = wrongRecentFirst.flatMap((qid) => {
        const q = byId.get(qid);
        return q ? [q] : [];
      });
      const unseen = shuffle(pool.filter((q) => !asked.has(q.id)));
      const rest = shuffle(pool.filter((q) => asked.has(q.id) && !wrongIds.has(q.id)));

      const selected = [...wrong, ...unseen, ...rest].slice(0, count);
      const now = clock().toISOString();
      const sessionId = newId();
      db.createQuizSession(store, {
        id: sessionId,
        scopeType,
        scopeId: scopeId ?? null,
        level,
        mode,
        questionIds: selected.map((q) => q.id),
        startedAt: now,
        finishedAt: null,
        correctCount: 0,
        totalCount: selected.length,
        answers: [],
      });

      return { sessionId, questions: selected.map(toPublicQuestion) };
    },

    /** Deduped on (session, question): a replayed answer returns the stored result. */
    async answerQuiz(
      sessionId: string,
      body: AnswerQuizInput,
    ): Promise<{ correct: boolean; answer: number[]; explanation: string }> {
      const content = await loadContent();
      const session = db.getQuizSession(store, sessionId);
      if (!session) throw notFound('quiz session');
      if (!session.questionIds.includes(body.questionId)) {
        throw new LocalClientError(404, 'question not in this session', { error: 'question not in this session' });
      }
      const question = content.question(body.questionId);
      if (!question) throw notFound('question');

      const existing = (session.answers ?? []).find((a) => a.questionId === body.questionId);
      const correct = existing ? existing.correct : setEqual(body.chosen, question.answer);
      if (!existing) {
        session.answers = [
          ...(session.answers ?? []),
          { questionId: body.questionId, chosen: body.chosen, correct, answeredAt: clock().toISOString() },
        ];
        db.saveQuizSession(store, session);
      }

      return { correct, answer: question.answer, explanation: question.explanation };
    },

    /** Idempotent: finishing twice returns the stored counts and writes no second event. */
    async finishQuiz(sessionId: string): Promise<{ correctCount: number; totalCount: number }> {
      const session = db.getQuizSession(store, sessionId);
      if (!session) throw notFound('quiz session');

      if (session.finishedAt) return { correctCount: session.correctCount, totalCount: session.totalCount };

      const correctCount = (session.answers ?? []).filter((a) => a.correct).length;
      const now = clock().toISOString();
      session.finishedAt = now;
      session.correctCount = correctCount;
      db.saveQuizSession(store, session);

      log(
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

      return { correctCount, totalCount: session.totalCount };
    },

    // ------------------------------------------------------------------ review: flashcards

    async getDueCards(limit = 20, topicId?: string): Promise<Flashcard[]> {
      const content = await loadContent();
      if (topicId && !content.topic(topicId)) throw notFound('topic');

      const settings = db.getUserSettings(store);
      const chosen = db.selectedLevelByTopic(store);
      const levelFor = (t: string): Level => chosen.get(t) ?? settings.defaultLevel;

      const cards = (topicId ? content.flashcardsFor(topicId) : content.allFlashcards()).filter((c) =>
        c.levels.includes(levelFor(c.topicId)),
      );

      const candidates = cards.map((c) => {
        const state = db.getCardState(store, c.id);
        return state ? { cardId: c.id, card: c, state } : { cardId: c.id, card: c };
      });

      return selectSessionCards(candidates, limit, clock()).map((p) => p.card);
    },

    async reviewCard(body: ReviewCardInput): Promise<{ dueAt: string }> {
      const content = await loadContent();
      const card = content.flashcard(body.cardId);
      if (!card) throw notFound('flashcard');

      const now = clock();
      const prev = db.getCardState(store, body.cardId) ?? initialCardState(now);
      const next = scheduleReview(prev, body.rating, now);
      db.upsertCardState(store, body.cardId, card.topicId, next);
      log('card_reviewed', body.cardId, { rating: body.rating, topicId: card.topicId }, now.toISOString());

      return { dueAt: next.dueAt };
    },

    // ------------------------------------------------------------------ beyond the ApiClient surface

    /**
     * Everything this client owns, as JSON. Browser storage is easy to lose — a cleared site, a new
     * machine, a private window — so the user must be able to save progress and restore it.
     * Raw values are copied verbatim so an export round-trips byte for byte.
     */
    exportState(): string {
      const data: Record<string, string> = {};
      for (const key of store.keys()) {
        const raw = store.get(key);
        if (raw !== null) data[key] = raw;
      }
      const payload: LocalStateExport = {
        app: 'itmc',
        kind: 'local-state',
        schemaVersion: SCHEMA_VERSION,
        exportedAt: clock().toISOString(),
        data,
      };
      return JSON.stringify(payload, null, 2);
    },

    /**
     * Replaces this browser's state with the contents of an export. Destructive by design: a merge
     * of two divergent SRS schedules has no correct answer, and "restore my backup" is the request.
     */
    importState(json: string): void {
      let parsed: unknown;
      try {
        parsed = JSON.parse(json);
      } catch {
        throw new LocalClientError(400, 'not valid JSON');
      }
      const env = parsed as Partial<LocalStateExport> | null;
      if (!env || env.app !== 'itmc' || env.kind !== 'local-state' || typeof env.data !== 'object' || env.data === null) {
        throw new LocalClientError(400, 'not an IT Manager Curriculum progress file');
      }
      if (typeof env.schemaVersion === 'number' && env.schemaVersion > SCHEMA_VERSION) {
        throw new LocalClientError(400, `this file was written by a newer version (schema ${env.schemaVersion})`);
      }

      const entries = Object.entries(env.data as Record<string, unknown>).filter(
        (e): e is [string, string] => e[0].startsWith(NAMESPACE) && typeof e[1] === 'string',
      );

      store.clearNamespace();
      for (const [key, value] of entries) store.set(key, value);
      store.setJson(K.meta, { schemaVersion: SCHEMA_VERSION, importedAt: clock().toISOString() });
    },

    /** True when the injected store threw at some point, so the UI can warn that nothing persists. */
    get storageDegraded(): boolean {
      return store.degraded;
    },
  };
}

export type LocalClient = ReturnType<typeof createLocalClient>;

/**
 * COMPILE-TIME CONTRACT. If @itmc/api-client ever gains, renames or reshapes a method, this line
 * stops compiling and `pnpm -r typecheck` fails — which is the point: static mode must never drift
 * from the HTTP client it stands in for.
 *
 * Written as a type-level assertion rather than `const _check: ApiClient = createLocalClient(...)`
 * so it emits no runtime code and needs no fake options object.
 */
type AssertAssignable<T extends U, U> = [T, U];
export type _LocalClientImplementsApiClient = AssertAssignable<LocalClient, ApiClient>;
