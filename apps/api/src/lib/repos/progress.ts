/** lesson_progress + exercise_attempts, plus the aggregate queries the dashboard needs. */
import type { ExerciseAttemptInput, LessonProgressDTO, LessonProgressRow } from '@itmc/core';
import type { Db } from '@itmc/db';
import { cardReviews, exerciseAttempts, lessonProgress, quizSessions } from '@itmc/db';
import { and, desc, eq, isNotNull, lte, sql } from 'drizzle-orm';
import { newId } from '../ids.js';

type Row = typeof lessonProgress.$inferSelect;

/** DB row -> the core progress shape (`@itmc/core` progress.ts). */
export function toCoreRow(row: Row): LessonProgressRow {
  return {
    lessonId: row.lessonId,
    status: row.status,
    completedSectionIds: row.completedSections,
    lastViewedAt: row.lastViewedAt,
    completedAt: row.completedAt ?? undefined,
  };
}

export function toDto(row: LessonProgressRow): LessonProgressDTO {
  return {
    lessonId: row.lessonId,
    status: row.status,
    completedSectionIds: row.completedSectionIds,
    ...(row.lastViewedAt ? { lastViewedAt: row.lastViewedAt } : {}),
    ...(row.completedAt ? { completedAt: row.completedAt } : {}),
  };
}

export async function getLessonRow(
  db: Db,
  userId: string,
  lessonId: string,
): Promise<LessonProgressRow | undefined> {
  const row = await db
    .select()
    .from(lessonProgress)
    .where(and(eq(lessonProgress.userId, userId), eq(lessonProgress.lessonId, lessonId)))
    .get();
  return row ? toCoreRow(row) : undefined;
}

export async function allLessonRows(db: Db, userId: string): Promise<Map<string, LessonProgressRow>> {
  const rows = await db.select().from(lessonProgress).where(eq(lessonProgress.userId, userId)).all();
  return new Map(rows.map((r) => [r.lessonId, toCoreRow(r)] as const));
}

/** Upsert used by POST .../viewed: creates the row if absent, otherwise only bumps last_viewed_at. */
export async function markViewed(
  db: Db,
  userId: string,
  lessonId: string,
  now: string,
): Promise<LessonProgressRow> {
  const existing = await getLessonRow(db, userId, lessonId);
  if (!existing) {
    await db
      .insert(lessonProgress)
      .values({
        userId,
        lessonId,
        status: 'in_progress',
        completedSections: [],
        startedAt: now,
        completedAt: null,
        lastViewedAt: now,
      })
      .run();
    return { lessonId, status: 'in_progress', completedSectionIds: [], lastViewedAt: now };
  }
  const status = existing.status === 'not_started' ? 'in_progress' : existing.status;
  await db
    .update(lessonProgress)
    .set({ lastViewedAt: now, status })
    .where(and(eq(lessonProgress.userId, userId), eq(lessonProgress.lessonId, lessonId)))
    .run();
  return { ...existing, status, lastViewedAt: now };
}

/** Persist the row produced by `applySectionCompleted()`. */
export async function saveLessonRow(
  db: Db,
  userId: string,
  row: LessonProgressRow,
  now: string,
): Promise<void> {
  await db
    .insert(lessonProgress)
    .values({
      userId,
      lessonId: row.lessonId,
      status: row.status,
      completedSections: row.completedSectionIds,
      startedAt: now,
      completedAt: row.completedAt ?? null,
      lastViewedAt: row.lastViewedAt ?? now,
    })
    .onConflictDoUpdate({
      target: [lessonProgress.userId, lessonProgress.lessonId],
      set: {
        status: row.status,
        completedSections: row.completedSectionIds,
        completedAt: row.completedAt ?? null,
        lastViewedAt: row.lastViewedAt ?? now,
      },
    })
    .run();
}

export async function insertExerciseAttempt(
  db: Db,
  userId: string,
  lessonId: string,
  input: ExerciseAttemptInput,
  now: string,
): Promise<string> {
  const id = newId();
  await db
    .insert(exerciseAttempts)
    .values({
      id,
      userId,
      exerciseId: input.exerciseId,
      lessonId,
      submission: input.submission ?? null,
      selfRating: input.selfRating,
      notes: input.notes ?? null,
      createdAt: now,
    })
    .run();
  return id;
}

/**
 * Best quiz accuracy per lesson: max(correct/total) over FINISHED sessions scoped to a topic,
 * keyed `${scopeId}@${level}` so it lines up with ProgressInputs.quizBestByLesson.
 */
export async function quizBestByLesson(db: Db, userId: string): Promise<Map<string, number>> {
  const rows = await db
    .select({
      scopeId: quizSessions.scopeId,
      level: quizSessions.level,
      correctCount: quizSessions.correctCount,
      totalCount: quizSessions.totalCount,
    })
    .from(quizSessions)
    .where(
      and(
        eq(quizSessions.userId, userId),
        eq(quizSessions.scopeType, 'topic'),
        isNotNull(quizSessions.finishedAt),
      ),
    )
    .all();

  const best = new Map<string, number>();
  for (const r of rows) {
    if (!r.scopeId || r.totalCount <= 0) continue;
    const key = `${r.scopeId}@${r.level}`;
    const acc = r.correctCount / r.totalCount;
    if (acc > (best.get(key) ?? -1)) best.set(key, acc);
  }
  return best;
}

export async function cardsDueByTopic(db: Db, userId: string, nowIso: string): Promise<Map<string, number>> {
  const rows = await db
    .select({ topicId: cardReviews.topicId, n: sql<number>`count(*)` })
    .from(cardReviews)
    .where(and(eq(cardReviews.userId, userId), lte(cardReviews.dueAt, nowIso)))
    .groupBy(cardReviews.topicId)
    .all();
  return new Map(rows.map((r) => [r.topicId, Number(r.n)] as const));
}

/** Most recently viewed lessons, newest first — the dashboard's "resume" list. */
export async function recentLessonRows(db: Db, userId: string, limit = 5): Promise<LessonProgressRow[]> {
  const rows = await db
    .select()
    .from(lessonProgress)
    .where(eq(lessonProgress.userId, userId))
    .orderBy(desc(lessonProgress.lastViewedAt))
    .limit(limit)
    .all();
  return rows.map(toCoreRow);
}
