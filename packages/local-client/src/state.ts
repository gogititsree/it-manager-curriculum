/**
 * The storage-backed twin of apps/api/src/lib/repos/*. One function per repository operation, same
 * names where practical, so the two can be diffed. No business rules live here: every derived value
 * comes from @itmc/core, exactly as in the API's routes.
 *
 * Shapes match the DB rows in packages/db/src/schema.ts closely enough that an export from this
 * client is readable, but they are stored as JSON per record rather than as tables.
 */
import { lessonId } from '@itmc/core';
import type { CardState, Level, LessonProgressRow, Mode, TopicSettings, UserSettings } from '@itmc/core';
import { K, type SafeStore } from './storage.js';

/** Mirrors the column defaults in packages/db/src/schema.ts (and the API's settings repo). */
export const DEFAULT_USER_SETTINGS: UserSettings = {
  defaultLevel: 'rusty',
  defaultMode: 'manager',
  dailyGoalMinutes: 20,
};

const LEVELS = new Set<string>(['beginner', 'intermediate', 'rusty']);
const MODES = new Set<string>(['manager', 'engineer']);

// ---------------------------------------------------------------- settings

export function getUserSettings(store: SafeStore): UserSettings {
  const v = store.getJson<Partial<UserSettings>>(K.settings, {});
  return {
    defaultLevel: LEVELS.has(String(v.defaultLevel)) ? (v.defaultLevel as Level) : DEFAULT_USER_SETTINGS.defaultLevel,
    defaultMode: MODES.has(String(v.defaultMode)) ? (v.defaultMode as Mode) : DEFAULT_USER_SETTINGS.defaultMode,
    dailyGoalMinutes:
      typeof v.dailyGoalMinutes === 'number' && v.dailyGoalMinutes > 0 && v.dailyGoalMinutes <= 240
        ? Math.round(v.dailyGoalMinutes)
        : DEFAULT_USER_SETTINGS.dailyGoalMinutes,
  };
}

export function putUserSettings(store: SafeStore, next: UserSettings): UserSettings {
  store.setJson(K.settings, next);
  return { ...next };
}

export function listTopicSettings(store: SafeStore): TopicSettings[] {
  const list = store.getJson<TopicSettings[]>(K.topicSettings, []);
  return Array.isArray(list)
    ? list.filter((t) => !!t && typeof t.topicId === 'string' && LEVELS.has(t.level) && MODES.has(t.mode))
    : [];
}

export function getTopicSetting(store: SafeStore, topicId: string): TopicSettings | undefined {
  return listTopicSettings(store).find((t) => t.topicId === topicId);
}

export function upsertTopicSetting(store: SafeStore, next: TopicSettings): TopicSettings {
  const list = listTopicSettings(store).filter((t) => t.topicId !== next.topicId);
  list.push({ ...next });
  store.setJson(K.topicSettings, list);
  return { ...next };
}

/** topicId -> the level the user chose for it. Topics without an entry fall back to defaultLevel. */
export function selectedLevelByTopic(store: SafeStore): Map<string, Level> {
  return new Map(listTopicSettings(store).map((t) => [t.topicId, t.level] as const));
}

// ---------------------------------------------------------------- lesson progress

export function getLessonRow(store: SafeStore, lessonId: string): LessonProgressRow | undefined {
  const row = store.getJson<LessonProgressRow | null>(K.progress(lessonId), null);
  return row && typeof row.lessonId === 'string' ? normaliseRow(row) : undefined;
}

export function saveLessonRow(store: SafeStore, row: LessonProgressRow): void {
  store.setJson(K.progress(row.lessonId), row);
}

export function allLessonRows(store: SafeStore): Map<string, LessonProgressRow> {
  const out = new Map<string, LessonProgressRow>();
  for (const key of store.keysWithPrefix(K.progressPrefix)) {
    const row = store.getJson<LessonProgressRow | null>(key, null);
    if (row && typeof row.lessonId === 'string') out.set(row.lessonId, normaliseRow(row));
  }
  return out;
}

/** Most recently viewed lessons, newest first — the dashboard's "resume" list. */
export function recentLessonRows(store: SafeStore, limit = 5): LessonProgressRow[] {
  return [...allLessonRows(store).values()]
    .filter((r) => !!r.lastViewedAt)
    .sort((a, b) => (b.lastViewedAt ?? '').localeCompare(a.lastViewedAt ?? ''))
    .slice(0, limit);
}

function normaliseRow(row: LessonProgressRow): LessonProgressRow {
  return {
    lessonId: row.lessonId,
    status: row.status === 'completed' || row.status === 'in_progress' ? row.status : 'not_started',
    completedSectionIds: Array.isArray(row.completedSectionIds)
      ? row.completedSectionIds.filter((s) => typeof s === 'string')
      : [],
    ...(row.lastViewedAt ? { lastViewedAt: row.lastViewedAt } : {}),
    ...(row.completedAt ? { completedAt: row.completedAt } : {}),
  };
}

// ---------------------------------------------------------------- exercise attempts

export interface ExerciseAttemptRecord {
  id: string;
  exerciseId: string;
  lessonId: string;
  submission: string | null;
  selfRating: number;
  notes: string | null;
  createdAt: string;
}

/** Append-only, like the table. Capped so a long install cannot fill the origin quota. */
export const MAX_ATTEMPTS = 2000;

export function insertExerciseAttempt(store: SafeStore, row: ExerciseAttemptRecord): string {
  const list = store.getJson<ExerciseAttemptRecord[]>(K.exercises, []);
  const next = Array.isArray(list) ? list : [];
  next.push(row);
  store.setJson(K.exercises, next.length > MAX_ATTEMPTS ? next.slice(next.length - MAX_ATTEMPTS) : next);
  return row.id;
}

export function listExerciseAttempts(store: SafeStore): ExerciseAttemptRecord[] {
  const list = store.getJson<ExerciseAttemptRecord[]>(K.exercises, []);
  return Array.isArray(list) ? list : [];
}

// ---------------------------------------------------------------- quiz sessions

export interface QuizAnswerRecord {
  questionId: string;
  chosen: number[];
  correct: boolean;
  answeredAt: string;
}

export interface QuizSessionRecord {
  id: string;
  scopeType: 'topic' | 'module' | 'all';
  scopeId: string | null;
  level: Level;
  mode: Mode;
  questionIds: string[];
  startedAt: string;
  finishedAt: string | null;
  correctCount: number;
  totalCount: number;
  /** quiz_answers, deduped on (session, question) — the array is kept unique by questionId. */
  answers: QuizAnswerRecord[];
}

export function createQuizSession(store: SafeStore, row: QuizSessionRecord): string {
  store.setJson(K.quiz(row.id), row);
  return row.id;
}

export function getQuizSession(store: SafeStore, sessionId: string): QuizSessionRecord | undefined {
  const row = store.getJson<QuizSessionRecord | null>(K.quiz(sessionId), null);
  return row && typeof row.id === 'string' && Array.isArray(row.questionIds) ? row : undefined;
}

export function saveQuizSession(store: SafeStore, row: QuizSessionRecord): void {
  store.setJson(K.quiz(row.id), row);
}

export function allQuizSessions(store: SafeStore): QuizSessionRecord[] {
  const out: QuizSessionRecord[] = [];
  for (const key of store.keysWithPrefix(K.quizPrefix)) {
    const row = store.getJson<QuizSessionRecord | null>(key, null);
    if (row && typeof row.id === 'string' && Array.isArray(row.questionIds)) out.push(row);
  }
  return out;
}

/**
 * Best quiz accuracy per lesson: max(correct/total) over FINISHED sessions scoped to a topic,
 * keyed `topicId@level` so it lines up with ProgressInputs.quizBestByLesson.
 */
export function quizBestByLesson(store: SafeStore): Map<string, number> {
  const best = new Map<string, number>();
  for (const s of allQuizSessions(store)) {
    if (s.scopeType !== 'topic' || !s.finishedAt || !s.scopeId || s.totalCount <= 0) continue;
    const key = lessonId(s.scopeId, s.level);
    const acc = s.correctCount / s.totalCount;
    if (acc > (best.get(key) ?? -1)) best.set(key, acc);
  }
  return best;
}

/**
 * Question ids the user has answered before, newest answer first, and whether that newest answer
 * was wrong. Drives the "recently wrong first, then never asked, then the rest" ordering.
 */
export function answerHistory(store: SafeStore): { wrongRecentFirst: string[]; asked: Set<string> } {
  const rows = allQuizSessions(store)
    .flatMap((s) => s.answers ?? [])
    .sort((a, b) => b.answeredAt.localeCompare(a.answeredAt));

  const asked = new Set<string>();
  const wrongRecentFirst: string[] = [];
  for (const r of rows) {
    if (asked.has(r.questionId)) continue; // newest-first, so this is the latest answer
    asked.add(r.questionId);
    if (!r.correct) wrongRecentFirst.push(r.questionId);
  }
  return { wrongRecentFirst, asked };
}

// ---------------------------------------------------------------- card SRS state

export interface StoredCard extends CardState {
  cardId: string;
  topicId: string;
}

export function getCardState(store: SafeStore, cardId: string): CardState | undefined {
  const row = store.getJson<StoredCard | null>(K.card(cardId), null);
  if (!row || typeof row.dueAt !== 'string') return undefined;
  const { cardId: _cardId, topicId: _topicId, ...state } = row;
  return state;
}

export function upsertCardState(store: SafeStore, cardId: string, topicId: string, state: CardState): void {
  const row: StoredCard = { cardId, topicId, ...state };
  store.setJson(K.card(cardId), row);
}

export function allCardStates(store: SafeStore): StoredCard[] {
  const out: StoredCard[] = [];
  for (const key of store.keysWithPrefix(K.cardPrefix)) {
    const row = store.getJson<StoredCard | null>(key, null);
    if (row && typeof row.cardId === 'string' && typeof row.dueAt === 'string') out.push(row);
  }
  return out;
}

export function cardsDueByTopic(store: SafeStore, nowIso: string): Map<string, number> {
  const m = new Map<string, number>();
  for (const c of allCardStates(store)) {
    if (c.dueAt <= nowIso) m.set(c.topicId, (m.get(c.topicId) ?? 0) + 1);
  }
  return m;
}
