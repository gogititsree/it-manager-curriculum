import { activityEvents } from '@itmc/db';
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { RUSTY_LESSON, RUSTY_SECTIONS, USER_ID, authHeaders, makeApp, type TestApp } from './helpers.js';

let app: TestApp;

beforeAll(async () => {
  app = await makeApp();
});
afterAll(async () => {
  await app.close();
});

const lessonUrl = `/api/progress/lessons/${encodeURIComponent(RUSTY_LESSON)}`;

const countEvents = async (type: 'section_completed' | 'lesson_completed' | 'lesson_viewed') =>
  (
    await app.db
      .select()
      .from(activityEvents)
      .where(and(eq(activityEvents.userId, USER_ID), eq(activityEvents.type, type)))
      .all()
  ).length;

describe('lesson progress', () => {
  it('returns a not_started default for a lesson with no row', async () => {
    const res = await app.inject({ method: 'GET', url: lessonUrl, headers: authHeaders });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      lessonId: RUSTY_LESSON,
      status: 'not_started',
      completedSectionIds: [],
    });
  });

  it('404s for a lesson that is not in the content bundle', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/progress/lessons/${encodeURIComponent('java/nope@rusty')}`,
      headers: authHeaders,
    });
    expect(res.statusCode).toBe(404);
  });

  it('records a view and bumps last_viewed_at', async () => {
    // The api-client sends content-type: application/json with no body for this POST.
    const res = await app.inject({
      method: 'POST',
      url: `${lessonUrl}/viewed`,
      headers: { ...authHeaders, 'content-type': 'application/json' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.status).toBe('in_progress');
    expect(body.lastViewedAt).toBeTruthy();
    expect(await countEvents('lesson_viewed')).toBe(1);
  });

  it('404s when the section does not exist in the lesson', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `${lessonUrl}/sections`,
      headers: authHeaders,
      payload: { sectionId: 'not-a-section' },
    });
    expect(res.statusCode).toBe(404);
  });

  it('marks a section done, and doing it twice is a no-op', async () => {
    const first = await app.inject({
      method: 'POST',
      url: `${lessonUrl}/sections`,
      headers: authHeaders,
      payload: { sectionId: RUSTY_SECTIONS[0] },
    });
    expect(first.statusCode).toBe(200);
    expect(first.json().completedSectionIds).toEqual([RUSTY_SECTIONS[0]]);
    expect(first.json().status).toBe('in_progress');
    expect(await countEvents('section_completed')).toBe(1);

    const second = await app.inject({
      method: 'POST',
      url: `${lessonUrl}/sections`,
      headers: authHeaders,
      payload: { sectionId: RUSTY_SECTIONS[0] },
    });
    expect(second.json().completedSectionIds).toEqual([RUSTY_SECTIONS[0]]);
    expect(second.json().status).toBe('in_progress');
    // no duplicate event for a replayed completion
    expect(await countEvents('section_completed')).toBe(1);
  });

  it('auto-completes the lesson when every section is done', async () => {
    let body: { status: string; completedSectionIds: string[]; completedAt?: string } | undefined;
    for (const sectionId of RUSTY_SECTIONS.slice(1)) {
      const res = await app.inject({
        method: 'POST',
        url: `${lessonUrl}/sections`,
        headers: authHeaders,
        payload: { sectionId },
      });
      expect(res.statusCode).toBe(200);
      body = res.json();
    }
    expect(body?.status).toBe('completed');
    expect(body?.completedSectionIds.sort()).toEqual([...RUSTY_SECTIONS].sort());
    expect(body?.completedAt).toBeTruthy();
    expect(await countEvents('lesson_completed')).toBe(1);

    // replaying a section on a completed lesson keeps it completed and emits nothing new
    const replay = await app.inject({
      method: 'POST',
      url: `${lessonUrl}/sections`,
      headers: authHeaders,
      payload: { sectionId: RUSTY_SECTIONS[0] },
    });
    expect(replay.json().status).toBe('completed');
    expect(replay.json().completedAt).toBe(body?.completedAt);
    expect(await countEvents('lesson_completed')).toBe(1);
    expect(await countEvents('section_completed')).toBe(RUSTY_SECTIONS.length);
  });
});

describe('exercise attempts', () => {
  it('404s for an unknown exercise', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/progress/exercises',
      headers: authHeaders,
      payload: { exerciseId: 'java/oop-fundamentals@rusty/nope', selfRating: 3 },
    });
    expect(res.statusCode).toBe(404);
  });

  it('records an attempt', async () => {
    const lesson = app.content.lesson(RUSTY_LESSON);
    const exerciseId = lesson?.exercises[0]?.id;
    expect(exerciseId).toBeTruthy();
    const res = await app.inject({
      method: 'POST',
      url: '/api/progress/exercises',
      headers: authHeaders,
      payload: { exerciseId, selfRating: 4, submission: 'notes', notes: 'went ok' },
    });
    expect(res.statusCode).toBe(200);
    expect(typeof res.json().id).toBe('string');
  });
});

describe('GET /api/progress/dashboard', () => {
  it('reports module progress for the seeded state', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/progress/dashboard', headers: authHeaders });
    expect(res.statusCode).toBe(200);
    const body = res.json();

    expect(Object.keys(body.modules).sort()).toEqual(
      app.content.manifest.modules.map((m) => m.id).sort(),
    );

    // This test seeds exactly one completed lesson: java/oop-fundamentals@rusty. Counts are derived
    // from the manifest rather than hard-coded, so authoring more content cannot break the test —
    // only a real regression in the aggregation can.
    const javaModule = app.content.manifest.modules.find((m) => m.id === 'java')!;
    const authoredRusty = javaModule.topics.filter((t) => t.lessons.rusty && t.lessons.rusty.status !== 'stub');

    const java = body.modules.java;
    expect(java.perLevel.rusty.topicsAuthored).toBe(authoredRusty.length);
    // Exactly one of them is complete: the one this test finished.
    expect(java.perLevel.rusty.topicsCompleted).toBe(1);
    expect(java.perLevel.rusty.completion).toBeCloseTo(1 / authoredRusty.length, 5);
    expect(java.perLevel.beginner.topicsCompleted).toBe(0);
    // The user's default level is rusty, so the selected path is the authored rusty lessons.
    expect(java.selectedPath.topicsTotal).toBe(authoredRusty.length);
    expect(java.selectedPath.topicsCompleted).toBe(1);

    // A module the user has not touched reports no completion at all.
    expect(body.modules.python.perLevel.rusty.topicsCompleted).toBe(0);
    expect(body.modules.python.selectedPath.completion).toBe(0);

    expect(body.recent[0]).toMatchObject({ lessonId: RUSTY_LESSON, completion: 1 });
    expect(body.streakDays).toBe(1);
    expect(body.minutesToday).toBeGreaterThan(0);
    expect(body.cardsDue).toBe(0);
  });
});
