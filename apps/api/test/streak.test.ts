/**
 * Boundary cases for the streak / minutes-today rules in docs/DATA-MODEL.md §4.
 * These exercise the repo functions directly so the local-date bucketing can be pinned to a
 * fixed "now" without faking timers across the whole app.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { activityEvents } from '@itmc/db';
import { eq } from 'drizzle-orm';
import { localDateKey, minutesToday, recordEvent, streakDays } from '../src/lib/repos/events.js';
import { RUSTY_LESSON, USER_ID, makeApp, type TestApp } from './helpers.js';

let app: TestApp;

beforeAll(async () => {
  app = await makeApp();
});
afterAll(async () => {
  await app.close();
});
beforeEach(async () => {
  await app.db.delete(activityEvents).where(eq(activityEvents.userId, USER_ID)).run();
});

/** Midday local time, `daysAgo` days back — safely inside its own local-date bucket. */
function localNoon(daysAgo: number, now = new Date()): string {
  const d = new Date(now.getTime());
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString();
}

const seed = (daysAgo: number, type: 'section_completed' | 'card_reviewed' | 'lesson_viewed') =>
  recordEvent(app.db, USER_ID, type, RUSTY_LESSON, null, localNoon(daysAgo));

describe('streakDays', () => {
  it('is 0 with no activity', async () => {
    expect(await streakDays(app.db, USER_ID)).toBe(0);
  });

  it('is 1 for today only', async () => {
    await seed(0, 'section_completed');
    expect(await streakDays(app.db, USER_ID)).toBe(1);
  });

  it('is 2 for today and yesterday', async () => {
    await seed(0, 'section_completed');
    await seed(1, 'card_reviewed');
    expect(await streakDays(app.db, USER_ID)).toBe(2);
  });

  it('counts several events in one day once', async () => {
    await seed(0, 'section_completed');
    await seed(0, 'card_reviewed');
    await seed(1, 'card_reviewed');
    expect(await streakDays(app.db, USER_ID)).toBe(2);
  });

  it('still counts when today is empty but yesterday is not', async () => {
    await seed(1, 'card_reviewed');
    await seed(2, 'card_reviewed');
    expect(await streakDays(app.db, USER_ID)).toBe(2);
  });

  it('breaks on a gap', async () => {
    await seed(0, 'section_completed');
    await seed(1, 'card_reviewed');
    await seed(3, 'card_reviewed'); // day 2 missing
    expect(await streakDays(app.db, USER_ID)).toBe(2);
  });

  it('is 0 when the most recent activity is two days old', async () => {
    await seed(2, 'card_reviewed');
    await seed(3, 'card_reviewed');
    expect(await streakDays(app.db, USER_ID)).toBe(0);
  });

  it('ignores event types that do not count as study', async () => {
    await seed(0, 'lesson_viewed');
    expect(await streakDays(app.db, USER_ID)).toBe(0);
  });
});

describe('minutesToday', () => {
  it('is 0 with no activity', async () => {
    expect(await minutesToday(app.db, USER_ID, app.content)).toBe(0);
  });

  it('credits a section its share of the lesson estimate', async () => {
    // rusty lesson: 15 estimated minutes over 5 sections => 3 minutes per section
    await recordEvent(app.db, USER_ID, 'section_completed', RUSTY_LESSON, null, localNoon(0));
    await recordEvent(app.db, USER_ID, 'section_completed', RUSTY_LESSON, null, localNoon(0));
    expect(await minutesToday(app.db, USER_ID, app.content)).toBe(6);
  });

  it('credits cards at 0.5 and quizzes at 1 per question, and ignores yesterday', async () => {
    await recordEvent(app.db, USER_ID, 'card_reviewed', 'x', null, localNoon(0));
    await recordEvent(app.db, USER_ID, 'card_reviewed', 'x', null, localNoon(0));
    await recordEvent(app.db, USER_ID, 'quiz_finished', 's1', { totalCount: 5 }, localNoon(0));
    await recordEvent(app.db, USER_ID, 'card_reviewed', 'x', null, localNoon(1));
    expect(await minutesToday(app.db, USER_ID, app.content)).toBe(6);
  });

  it('caps at 240 minutes', async () => {
    for (let i = 0; i < 30; i++) {
      await recordEvent(app.db, USER_ID, 'quiz_finished', `s${i}`, { totalCount: 50 }, localNoon(0));
    }
    expect(await minutesToday(app.db, USER_ID, app.content)).toBe(240);
  });
});

describe('localDateKey', () => {
  it('buckets by local calendar day', () => {
    const d = new Date(2026, 8, 15, 23, 59, 59);
    expect(localDateKey(d)).toBe('2026-09-15');
    expect(localDateKey(new Date(2026, 8, 16, 0, 0, 1))).toBe('2026-09-16');
  });
});
