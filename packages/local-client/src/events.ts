/**
 * The activity log and the two aggregates derived from it, mirroring
 * apps/api/src/lib/repos/events.ts and docs/DATA-MODEL.md §4. Same event types as the
 * `activity_events` table, because streak and minutes-today are computed from them and nothing else.
 *
 * The log is one JSON array in storage rather than a key per event: browser storage has no index and
 * a few thousand small records read faster as one value than as a few thousand `getItem` calls.
 * It is capped (oldest dropped) so a long-lived install cannot exhaust the origin's quota — a streak
 * only ever looks back over consecutive days, so nothing useful is lost.
 */
import type { ContentStore } from './content.js';
import { K, type SafeStore } from './storage.js';

export type ActivityType =
  | 'lesson_viewed'
  | 'section_completed'
  | 'lesson_completed'
  | 'exercise_attempted'
  | 'quiz_finished'
  | 'card_reviewed'
  | 'level_changed'
  | 'mode_changed';

export interface ActivityEvent {
  id: string;
  type: ActivityType;
  refId: string | null;
  payload: Record<string, unknown> | null;
  createdAt: string;
}

/** Event types that count as "studied today" for the streak (docs/DATA-MODEL.md §4). */
export const STREAK_TYPES = [
  'section_completed',
  'quiz_finished',
  'card_reviewed',
  'exercise_attempted',
] as const satisfies readonly ActivityType[];

const STREAK_SET = new Set<string>(STREAK_TYPES);

/** Upper bound on "minutes today" — this is a proxy, not time tracking. */
export const MINUTES_TODAY_CAP = 240;
const CARD_REVIEW_MINUTES = 0.5;
const QUIZ_MINUTES_PER_QUESTION = 1;

/** Plenty for any streak, and small enough that the whole log stays a cheap read. */
export const MAX_EVENTS = 5000;

export function readEvents(store: SafeStore): ActivityEvent[] {
  const list = store.getJson<ActivityEvent[]>(K.events, []);
  return Array.isArray(list) ? list : [];
}

export function recordEvent(
  store: SafeStore,
  id: string,
  type: ActivityType,
  refId: string | null,
  payload: Record<string, unknown> | null,
  at: string,
): void {
  const list = readEvents(store);
  list.push({ id, type, refId, payload, createdAt: at });
  store.setJson(K.events, list.length > MAX_EVENTS ? list.slice(list.length - MAX_EVENTS) : list);
}

// ---------- local-date bucketing (identical rules to the API) ----------

const pad = (n: number): string => String(n).padStart(2, '0');

/** `YYYY-MM-DD` in the browser's local timezone, which is the bucket used for streaks. */
export function localDateKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export const localDateKeyOf = (iso: string): string => localDateKey(new Date(iso));

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
export function streakDays(store: SafeStore, now: Date): number {
  const rows = readEvents(store).filter((e) => STREAK_SET.has(e.type));
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
export function minutesToday(store: SafeStore, content: ContentStore, now: Date): number {
  const start = startOfLocalDay(now).toISOString();
  const end = addDays(startOfLocalDay(now), 1).toISOString();
  const rows = readEvents(store).filter((e) => e.createdAt >= start && e.createdAt < end);

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
