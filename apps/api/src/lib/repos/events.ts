/**
 * activity_events repository: the append-only log plus the two aggregates derived from it
 * (streak days, minutes today). Rules are documented in docs/DATA-MODEL.md §4.
 */
import type { Db } from '@itmc/db';
import { activityEvents } from '@itmc/db';
import { and, eq, gte, inArray, lt } from 'drizzle-orm';
import type { ContentStore } from '../../plugins/content.js';
import { newId } from '../ids.js';

export type ActivityType =
  | 'lesson_viewed'
  | 'section_completed'
  | 'lesson_completed'
  | 'exercise_attempted'
  | 'quiz_finished'
  | 'card_reviewed'
  | 'level_changed'
  | 'mode_changed';

/** Event types that count as "studied today" for the streak (docs/DATA-MODEL.md §4). */
export const STREAK_TYPES = [
  'section_completed',
  'quiz_finished',
  'card_reviewed',
  'exercise_attempted',
] as const satisfies readonly ActivityType[];

/** Upper bound on "minutes today" — this is a proxy, not time tracking. */
export const MINUTES_TODAY_CAP = 240;

const CARD_REVIEW_MINUTES = 0.5;
const QUIZ_MINUTES_PER_QUESTION = 1;

export async function recordEvent(
  db: Db,
  userId: string,
  type: ActivityType,
  refId?: string | null,
  payload?: Record<string, unknown> | null,
  at: string = new Date().toISOString(),
): Promise<void> {
  await db
    .insert(activityEvents)
    .values({ id: newId(), userId, type, refId: refId ?? null, payload: payload ?? null, createdAt: at })
    .run();
}

// ---------- local-date bucketing ----------

const pad = (n: number): string => String(n).padStart(2, '0');

/** `YYYY-MM-DD` in the server's local timezone, which is the bucket used for streaks. */
export function localDateKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export const localDateKeyOf = (iso: string): string => localDateKey(new Date(iso));

/** Local midnight at the start of the day containing `d`. */
export function startOfLocalDay(d: Date): Date {
  const s = new Date(d.getTime());
  s.setHours(0, 0, 0, 0);
  return s;
}

function addDays(d: Date, days: number): Date {
  const n = new Date(d.getTime());
  n.setDate(n.getDate() + days);
  return n;
}

/**
 * Consecutive local-date buckets, ending today OR yesterday (so an evening session is not lost at
 * midnight), that contain at least one event of a STREAK_TYPES type.
 */
export async function streakDays(db: Db, userId: string, now: Date = new Date()): Promise<number> {
  const rows = await db
    .select({ createdAt: activityEvents.createdAt })
    .from(activityEvents)
    .where(and(eq(activityEvents.userId, userId), inArray(activityEvents.type, [...STREAK_TYPES])))
    .all();
  if (rows.length === 0) return 0;

  const days = new Set(rows.map((r) => localDateKeyOf(r.createdAt)));
  const today = startOfLocalDay(now);

  let cursor = today;
  if (!days.has(localDateKey(cursor))) {
    cursor = addDays(today, -1);
    if (!days.has(localDateKey(cursor))) return 0;
  }

  let count = 0;
  while (days.has(localDateKey(cursor))) {
    count += 1;
    cursor = addDays(cursor, -1);
  }
  return count;
}

/**
 * Approximate minutes studied in today's local-date bucket:
 *   section_completed  -> that section's share of the lesson's estimatedMinutes
 *   card_reviewed      -> 0.5
 *   quiz_finished      -> 1 per question in the session
 * Capped at MINUTES_TODAY_CAP.
 */
export async function minutesToday(
  db: Db,
  userId: string,
  content: ContentStore,
  now: Date = new Date(),
): Promise<number> {
  const start = startOfLocalDay(now);
  const end = addDays(start, 1);
  const rows = await db
    .select({ type: activityEvents.type, refId: activityEvents.refId, payload: activityEvents.payload })
    .from(activityEvents)
    .where(
      and(
        eq(activityEvents.userId, userId),
        gte(activityEvents.createdAt, start.toISOString()),
        lt(activityEvents.createdAt, end.toISOString()),
      ),
    )
    .all();

  let total = 0;
  for (const row of rows) {
    if (row.type === 'section_completed') {
      const summary = row.refId ? content.lessonSummary(row.refId) : undefined;
      if (summary && summary.sectionCount > 0) total += summary.estimatedMinutes / summary.sectionCount;
    } else if (row.type === 'card_reviewed') {
      total += CARD_REVIEW_MINUTES;
    } else if (row.type === 'quiz_finished') {
      const n = Number((row.payload as { totalCount?: unknown } | null)?.totalCount ?? 0);
      if (Number.isFinite(n) && n > 0) total += n * QUIZ_MINUTES_PER_QUESTION;
    }
  }
  return Math.min(MINUTES_TODAY_CAP, Math.round(total));
}
