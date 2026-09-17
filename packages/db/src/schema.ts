/**
 * Drizzle schema for the progress store (SQLite; see ADR-002 for why, and docs/DATA-MODEL.md for the
 * narrative). Content is NOT in the database — it is compiled JSON served from content/dist. The DB
 * holds only per-user state that refers to content by stable string IDs.
 *
 * Conventions:
 * - All timestamps are ISO-8601 strings in UTC (portable to Postgres; sortable as text).
 * - JSON columns are TEXT holding JSON; decode at the repository layer, never in routes.
 * - Composite natural keys where the row is "state of X for user U" (settings, progress, cards);
 *   ULID text ids where rows are events (attempts, sessions, answers).
 *
 * OWNERSHIP: architecture-level. Schema changes need an ADR + a generated migration.
 */
import { index, integer, primaryKey, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';

const LEVEL = ['beginner', 'intermediate', 'rusty'] as const;
const MODE = ['manager', 'engineer'] as const;

export const users = sqliteTable('users', {
  id: text('id').primaryKey(), // ULID
  displayName: text('display_name').notNull(),
  createdAt: text('created_at').notNull(),
});

/** Bearer tokens. Web and mobile both use them; the single-user install seeds one from AUTH_TOKEN. */
export const apiTokens = sqliteTable('api_tokens', {
  tokenHash: text('token_hash').primaryKey(), // sha256 hex of the raw token
  userId: text('user_id').notNull().references(() => users.id),
  label: text('label').notNull(), // "laptop browser", "phone"
  createdAt: text('created_at').notNull(),
  expiresAt: text('expires_at'),
  lastUsedAt: text('last_used_at'),
});

export const userSettings = sqliteTable('user_settings', {
  userId: text('user_id').primaryKey().references(() => users.id),
  defaultLevel: text('default_level', { enum: LEVEL }).notNull().default('rusty'),
  defaultMode: text('default_mode', { enum: MODE }).notNull().default('manager'),
  dailyGoalMinutes: integer('daily_goal_minutes').notNull().default(20),
  updatedAt: text('updated_at').notNull(),
});

/** The per-topic level selector + mode toggle. Absent row => user defaults apply. */
export const topicSettings = sqliteTable(
  'topic_settings',
  {
    userId: text('user_id').notNull().references(() => users.id),
    topicId: text('topic_id').notNull(), // e.g. "java/oop-fundamentals"
    level: text('level', { enum: LEVEL }).notNull(),
    mode: text('mode', { enum: MODE }).notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.topicId] })],
);

/**
 * One row per (user, lesson). Since lessonId = topicId@level, progress is inherently tracked per
 * module AND per level: switching a topic from Rusty to Beginner starts a separate row.
 */
export const lessonProgress = sqliteTable(
  'lesson_progress',
  {
    userId: text('user_id').notNull().references(() => users.id),
    lessonId: text('lesson_id').notNull(), // e.g. "java/oop-fundamentals@rusty"
    status: text('status', { enum: ['not_started', 'in_progress', 'completed'] }).notNull(),
    completedSections: text('completed_sections', { mode: 'json' }).$type<string[]>().notNull(),
    startedAt: text('started_at').notNull(),
    completedAt: text('completed_at'),
    lastViewedAt: text('last_viewed_at').notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.lessonId] }), index('lp_user_viewed').on(t.userId, t.lastViewedAt)],
);

export const exerciseAttempts = sqliteTable(
  'exercise_attempts',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull().references(() => users.id),
    exerciseId: text('exercise_id').notNull(), // "<lessonId>/<slug>"
    lessonId: text('lesson_id').notNull(),
    submission: text('submission'), // code / notes; nullable for reflect-type exercises
    selfRating: integer('self_rating').notNull(), // 1..5
    notes: text('notes'),
    createdAt: text('created_at').notNull(),
  },
  (t) => [index('ea_user_exercise').on(t.userId, t.exerciseId)],
);

export const quizSessions = sqliteTable(
  'quiz_sessions',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull().references(() => users.id),
    scopeType: text('scope_type', { enum: ['topic', 'module', 'all'] }).notNull(),
    scopeId: text('scope_id'), // topicId or moduleId; null for 'all'
    level: text('level', { enum: LEVEL }).notNull(),
    mode: text('mode', { enum: MODE }).notNull(),
    questionIds: text('question_ids', { mode: 'json' }).$type<string[]>().notNull(),
    startedAt: text('started_at').notNull(),
    finishedAt: text('finished_at'),
    correctCount: integer('correct_count').notNull().default(0),
    totalCount: integer('total_count').notNull(),
  },
  (t) => [index('qs_user_started').on(t.userId, t.startedAt)],
);

export const quizAnswers = sqliteTable(
  'quiz_answers',
  {
    id: text('id').primaryKey(),
    sessionId: text('session_id').notNull().references(() => quizSessions.id),
    questionId: text('question_id').notNull(),
    chosen: text('chosen', { mode: 'json' }).$type<number[]>().notNull(),
    correct: integer('correct', { mode: 'boolean' }).notNull(),
    answeredAt: text('answered_at').notNull(),
  },
  (t) => [index('qa_session').on(t.sessionId), index('qa_question').on(t.questionId)],
);

/** Spaced-repetition state per (user, card). Mirrors CardState in @itmc/core srs.ts. */
export const cardReviews = sqliteTable(
  'card_reviews',
  {
    userId: text('user_id').notNull().references(() => users.id),
    cardId: text('card_id').notNull(), // "<topicId>/c-001"
    topicId: text('topic_id').notNull(), // denormalised for "cards due per topic"
    ease: real('ease').notNull(),
    intervalDays: integer('interval_days').notNull(),
    reps: integer('reps').notNull(),
    lapses: integer('lapses').notNull(),
    dueAt: text('due_at').notNull(),
    lastReviewedAt: text('last_reviewed_at'),
    lastRating: integer('last_rating'),
  },
  (t) => [primaryKey({ columns: [t.userId, t.cardId] }), index('cr_user_due').on(t.userId, t.dueAt)],
);

/**
 * Append-only activity log. Source of truth for streaks, "minutes today" and the resume list.
 * Cheap to write, easy to rebuild aggregates from. Never updated.
 */
export const activityEvents = sqliteTable(
  'activity_events',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull().references(() => users.id),
    type: text('type', {
      enum: [
        'lesson_viewed',
        'section_completed',
        'lesson_completed',
        'exercise_attempted',
        'quiz_finished',
        'card_reviewed',
        'level_changed',
        'mode_changed',
      ],
    }).notNull(),
    refId: text('ref_id'), // lessonId / cardId / sessionId as appropriate
    payload: text('payload', { mode: 'json' }).$type<Record<string, unknown>>(),
    createdAt: text('created_at').notNull(),
  },
  (t) => [index('ae_user_created').on(t.userId, t.createdAt)],
);

export type User = typeof users.$inferSelect;
export type LessonProgressRow = typeof lessonProgress.$inferSelect;
export type CardReviewRow = typeof cardReviews.$inferSelect;
