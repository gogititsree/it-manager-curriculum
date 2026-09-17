/**
 * Behavioural tests for the browser-only client. Each block names the API behaviour it mirrors, so
 * a change to apps/api/src/routes/* that is not reflected here shows up as a diff between the two
 * specs rather than as a silent divergence in static mode.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { createLocalClient, memoryStore, type KeyValueStore } from '../src/index.js';
import { LESSON, SECTIONS, TOPIC, fakeFetch, makeBundle } from './fixture.js';

function makeClient(opts: { store?: KeyValueStore; now?: () => Date } = {}) {
  const store = opts.store ?? memoryStore();
  const { impl, calls } = fakeFetch(makeBundle());
  const client = createLocalClient({
    bundleUrl: '/content/bundle.json',
    store,
    fetchImpl: impl,
    ...(opts.now ? { now: opts.now } : {}),
  });
  return { client, store, fetchCalls: calls };
}

describe('content', () => {
  it('validates the bundle and serves the manifest, lessons, questions and cards', async () => {
    const { client } = makeClient();
    const manifest = await client.getManifest();
    expect(manifest.modules).toHaveLength(1);
    expect(manifest.modules[0]?.topics[0]?.id).toBe(TOPIC);

    const lesson = await client.getLesson(LESSON);
    expect(lesson.sections.map((s) => s.id)).toEqual(SECTIONS);
    expect(await client.getTopicQuestions(TOPIC)).toHaveLength(3);
    expect(await client.getTopicFlashcards(TOPIC)).toHaveLength(2);
  });

  it('fetches the bundle once however many calls are made', async () => {
    const { client, fetchCalls } = makeClient();
    await Promise.all([client.getManifest(), client.getManifest(), client.getLesson(LESSON)]);
    await client.getManifest();
    expect(fetchCalls()).toBe(1);
  });

  it('404s an unknown lesson and a malformed lesson id', async () => {
    const { client } = makeClient();
    await expect(client.getLesson('java/oop@nope')).rejects.toMatchObject({ status: 404 });
    await expect(client.getLessonProgress('not-a-lesson-id')).rejects.toMatchObject({ status: 404 });
  });
});

describe('settings', () => {
  it('defaults to the same values as the DB schema, and persists a change', async () => {
    const { client, store } = makeClient();
    expect(await client.getUserSettings()).toEqual({
      defaultLevel: 'rusty',
      defaultMode: 'manager',
      dailyGoalMinutes: 20,
    });

    await client.putUserSettings({ defaultLevel: 'beginner', defaultMode: 'engineer', dailyGoalMinutes: 45 });
    const reread = makeClient({ store }).client;
    expect(await reread.getUserSettings()).toEqual({
      defaultLevel: 'beginner',
      defaultMode: 'engineer',
      dailyGoalMinutes: 45,
    });
  });

  it('emits level_changed / mode_changed only when the effective value actually changes', async () => {
    const { client, store } = makeClient();

    // Defaults are rusty/manager, so this changes the level only.
    await client.putTopicSettings({ topicId: TOPIC, level: 'beginner', mode: 'manager' });
    let events = JSON.parse(store.get('itmc.v1.events') ?? '[]') as { type: string }[];
    expect(events.map((e) => e.type)).toEqual(['level_changed']);

    // Replaying the same value writes no event.
    await client.putTopicSettings({ topicId: TOPIC, level: 'beginner', mode: 'manager' });
    events = JSON.parse(store.get('itmc.v1.events') ?? '[]') as { type: string }[];
    expect(events.map((e) => e.type)).toEqual(['level_changed']);

    await client.putTopicSettings({ topicId: TOPIC, level: 'beginner', mode: 'engineer' });
    events = JSON.parse(store.get('itmc.v1.events') ?? '[]') as { type: string }[];
    expect(events.map((e) => e.type)).toEqual(['level_changed', 'mode_changed']);

    expect(await client.getTopicSettings()).toEqual([{ topicId: TOPIC, level: 'beginner', mode: 'engineer' }]);
  });
});

describe('lesson progress', () => {
  it('marks a section done, and replaying it is a no-op', async () => {
    const { client, store } = makeClient();

    const first = await client.completeSection(LESSON, 'intro');
    expect(first.completedSectionIds).toEqual(['intro']);
    expect(first.status).toBe('in_progress');

    const replay = await client.completeSection(LESSON, 'intro');
    expect(replay.completedSectionIds).toEqual(['intro']);
    expect(replay.status).toBe('in_progress');

    const events = JSON.parse(store.get('itmc.v1.events') ?? '[]') as { type: string }[];
    expect(events.filter((e) => e.type === 'section_completed')).toHaveLength(1);
  });

  it('persists across a fresh client over the same store', async () => {
    const { client, store } = makeClient();
    await client.completeSection(LESSON, 'intro');

    const reloaded = makeClient({ store }).client;
    expect((await reloaded.getLessonProgress(LESSON)).completedSectionIds).toEqual(['intro']);
  });

  it('auto-completes the lesson on the last section and keeps completedAt stable', async () => {
    const { client, store } = makeClient();
    for (const s of SECTIONS.slice(0, -1)) {
      expect((await client.completeSection(LESSON, s)).status).toBe('in_progress');
    }
    const done = await client.completeSection(LESSON, SECTIONS[SECTIONS.length - 1] as string);
    expect(done.status).toBe('completed');
    expect(done.completedAt).toBeTruthy();

    const again = await client.completeSection(LESSON, 'intro');
    expect(again.status).toBe('completed');
    expect(again.completedAt).toBe(done.completedAt);

    const events = JSON.parse(store.get('itmc.v1.events') ?? '[]') as { type: string }[];
    expect(events.filter((e) => e.type === 'lesson_completed')).toHaveLength(1);
  });

  it('404s an unknown section', async () => {
    const { client } = makeClient();
    await expect(client.completeSection(LESSON, 'nope')).rejects.toMatchObject({ status: 404 });
  });

  it('markLessonViewed creates the row then only bumps lastViewedAt', async () => {
    let t = Date.parse('2026-03-01T09:00:00.000Z');
    const { client } = makeClient({ now: () => new Date(t) });

    const a = await client.markLessonViewed(LESSON);
    expect(a.status).toBe('in_progress');
    expect(a.completedSectionIds).toEqual([]);

    await client.completeSection(LESSON, 'intro');
    t += 60_000;
    const b = await client.markLessonViewed(LESSON);
    expect(b.completedSectionIds).toEqual(['intro']);
    expect(b.lastViewedAt).not.toBe(a.lastViewedAt);
  });

  it('records exercise attempts against the owning lesson', async () => {
    const { client } = makeClient();
    const res = await client.submitExercise({ exerciseId: `${LESSON}/ex-one`, selfRating: 4, notes: 'ok' });
    expect(res.id).toBeTruthy();
    await expect(client.submitExercise({ exerciseId: 'nope', selfRating: 1 })).rejects.toMatchObject({ status: 404 });
  });
});

describe('dashboard', () => {
  it('reports module progress from core, cards due and the resume list', async () => {
    const { client } = makeClient();
    await client.markLessonViewed(LESSON);
    for (const s of SECTIONS) await client.completeSection(LESSON, s);

    const dash = await client.getDashboard();
    expect(dash.modules['java']?.perLevel.rusty.completion).toBe(1);
    expect(dash.modules['java']?.perLevel.rusty.topicsCompleted).toBe(1);
    // The default level is rusty, so the chosen path is complete too.
    expect(dash.modules['java']?.selectedPath.completion).toBe(1);
    expect(dash.recent[0]?.lessonId).toBe(LESSON);
    expect(dash.minutesToday).toBe(12); // 3 sections x (12 / 3) minutes
  });
});

describe('quiz', () => {
  it('withholds answer and explanation until the question is answered', async () => {
    const { client } = makeClient();
    const started = await client.startQuiz({ scopeType: 'topic', scopeId: TOPIC, level: 'rusty', mode: 'manager', count: 5 });
    expect(started.questions.length).toBe(2); // only q-001 and q-002 are rusty
    for (const q of started.questions) {
      expect(q).not.toHaveProperty('answer');
      expect(q).not.toHaveProperty('explanation');
    }

    const res = await client.answerQuiz(started.sessionId, { questionId: `${TOPIC}/q-001`, chosen: [1] });
    expect(res).toEqual({ correct: true, answer: [1], explanation: 'Because b.' });
  });

  it('scores multi-answer questions as a set comparison', async () => {
    const { client } = makeClient();
    const s = await client.startQuiz({ scopeType: 'topic', scopeId: TOPIC, level: 'rusty', mode: 'manager' });
    expect((await client.answerQuiz(s.sessionId, { questionId: `${TOPIC}/q-002`, chosen: [2, 0] })).correct).toBe(true);
  });

  it('dedupes answers on (session, question) and returns the stored result on replay', async () => {
    const { client } = makeClient();
    const s = await client.startQuiz({ scopeType: 'topic', scopeId: TOPIC, level: 'rusty', mode: 'manager' });

    const wrong = await client.answerQuiz(s.sessionId, { questionId: `${TOPIC}/q-001`, chosen: [0] });
    expect(wrong.correct).toBe(false);

    // A second, correct attempt must NOT overwrite the recorded answer.
    const replay = await client.answerQuiz(s.sessionId, { questionId: `${TOPIC}/q-001`, chosen: [1] });
    expect(replay.correct).toBe(false);

    const finished = await client.finishQuiz(s.sessionId);
    expect(finished).toEqual({ correctCount: 0, totalCount: 2 });
  });

  it('finishes idempotently and feeds quiz best into the dashboard', async () => {
    const { client } = makeClient();
    const s = await client.startQuiz({ scopeType: 'topic', scopeId: TOPIC, level: 'rusty', mode: 'manager' });
    await client.answerQuiz(s.sessionId, { questionId: `${TOPIC}/q-001`, chosen: [1] });
    await client.answerQuiz(s.sessionId, { questionId: `${TOPIC}/q-002`, chosen: [0, 2] });

    const a = await client.finishQuiz(s.sessionId);
    const b = await client.finishQuiz(s.sessionId);
    expect(a).toEqual({ correctCount: 2, totalCount: 2 });
    expect(b).toEqual(a);

    const dash = await client.getDashboard();
    expect(dash.minutesToday).toBe(2); // 1 minute per question, once — finish is idempotent
  });

  it('puts a recently wrong question first on the next session', async () => {
    const { client } = makeClient();
    const s = await client.startQuiz({ scopeType: 'topic', scopeId: TOPIC, level: 'rusty', mode: 'manager' });
    await client.answerQuiz(s.sessionId, { questionId: `${TOPIC}/q-002`, chosen: [0] });
    await client.answerQuiz(s.sessionId, { questionId: `${TOPIC}/q-001`, chosen: [1] });
    await client.finishQuiz(s.sessionId);

    const next = await client.startQuiz({ scopeType: 'topic', scopeId: TOPIC, level: 'rusty', mode: 'manager' });
    expect(next.questions[0]?.id).toBe(`${TOPIC}/q-002`);
  });

  it('404s an unknown scope and a question outside the session', async () => {
    const { client } = makeClient();
    await expect(
      client.startQuiz({ scopeType: 'topic', scopeId: 'java/nope', level: 'rusty', mode: 'manager' }),
    ).rejects.toMatchObject({ status: 404 });

    const s = await client.startQuiz({ scopeType: 'topic', scopeId: TOPIC, level: 'rusty', mode: 'manager' });
    await expect(client.answerQuiz(s.sessionId, { questionId: `${TOPIC}/q-003`, chosen: [0] })).rejects.toMatchObject({
      status: 404,
    });
  });
});

describe('flashcards', () => {
  it('returns unseen cards, then advances the due date past the review', async () => {
    const now = new Date('2026-03-01T09:00:00.000Z');
    const { client } = makeClient({ now: () => now });

    const due = await client.getDueCards(20, TOPIC);
    expect(due.map((c) => c.id)).toEqual([`${TOPIC}/c-001`, `${TOPIC}/c-002`]);

    const { dueAt } = await client.reviewCard({ cardId: `${TOPIC}/c-001`, rating: 3 });
    expect(new Date(dueAt).getTime()).toBeGreaterThan(now.getTime());
    // rating 3 on a new card schedules it one day out.
    expect(Math.round((new Date(dueAt).getTime() - now.getTime()) / 86_400_000)).toBe(1);

    // Reviewed card is no longer offered; the unseen one still is.
    const after = await client.getDueCards(20, TOPIC);
    expect(after.map((c) => c.id)).toEqual([`${TOPIC}/c-002`]);
  });

  it('a lapse (rating 1) reschedules within the session, not days out', async () => {
    const now = new Date('2026-03-01T09:00:00.000Z');
    const { client } = makeClient({ now: () => now });
    const { dueAt } = await client.reviewCard({ cardId: `${TOPIC}/c-001`, rating: 1 });
    const minutes = (new Date(dueAt).getTime() - now.getTime()) / 60_000;
    expect(minutes).toBe(10);
  });

  it('only offers cards whose levels include the level chosen for that topic', async () => {
    const { client } = makeClient();
    await client.putTopicSettings({ topicId: TOPIC, level: 'beginner', mode: 'manager' });
    expect(await client.getDueCards(20, TOPIC)).toEqual([]);
  });

  it('counts due cards on the dashboard', async () => {
    const now = new Date('2026-03-01T09:00:00.000Z');
    const { client, store } = makeClient({ now: () => now });
    await client.reviewCard({ cardId: `${TOPIC}/c-001`, rating: 1 });

    const later = makeClient({ store, now: () => new Date(now.getTime() + 30 * 60_000) }).client;
    expect((await later.getDashboard()).cardsDue).toBe(1);
  });
});

describe('streak', () => {
  const day = 86_400_000;
  const at = (iso: string) => new Date(iso);

  async function studyOn(store: KeyValueStore, iso: string) {
    const c = makeClient({ store, now: () => at(iso) }).client;
    await c.reviewCard({ cardId: `${TOPIC}/c-001`, rating: 3 });
  }

  it('is zero with no qualifying activity', async () => {
    const { client } = makeClient();
    expect((await client.getDashboard()).streakDays).toBe(0);
  });

  it('counts consecutive local days ending today', async () => {
    const store = memoryStore();
    // Local noon on three consecutive days, so the local-date bucket is unambiguous in any timezone.
    const base = new Date(2026, 2, 1, 12, 0, 0);
    for (let i = 2; i >= 0; i--) await studyOn(store, new Date(base.getTime() - i * day).toISOString());

    const today = makeClient({ store, now: () => new Date(base.getTime()) }).client;
    expect((await today.getDashboard()).streakDays).toBe(3);
  });

  it('survives the midnight boundary: activity yesterday still counts today', async () => {
    const store = memoryStore();
    const yesterdayEvening = new Date(2026, 2, 1, 21, 30, 0);
    await studyOn(store, yesterdayEvening.toISOString());

    const nextMorning = new Date(2026, 2, 2, 7, 0, 0);
    const c = makeClient({ store, now: () => nextMorning }).client;
    expect((await c.getDashboard()).streakDays).toBe(1);
  });

  it('breaks once a whole day is skipped', async () => {
    const store = memoryStore();
    const twoDaysAgo = new Date(2026, 2, 1, 12, 0, 0);
    await studyOn(store, twoDaysAgo.toISOString());

    const now = new Date(2026, 2, 3, 12, 0, 0);
    const c = makeClient({ store, now: () => now }).client;
    expect((await c.getDashboard()).streakDays).toBe(0);
  });

  it('ignores non-qualifying events such as lesson_viewed', async () => {
    const now = new Date(2026, 2, 3, 12, 0, 0);
    const { client } = makeClient({ now: () => now });
    await client.markLessonViewed(LESSON);
    expect((await client.getDashboard()).streakDays).toBe(0);
  });
});

describe('export / import', () => {
  it('round-trips every kind of state into an empty browser', async () => {
    const source = memoryStore();
    const a = makeClient({ store: source }).client;

    await a.putUserSettings({ defaultLevel: 'intermediate', defaultMode: 'engineer', dailyGoalMinutes: 35 });
    await a.putTopicSettings({ topicId: TOPIC, level: 'rusty', mode: 'manager' });
    await a.markLessonViewed(LESSON);
    await a.completeSection(LESSON, 'intro');
    await a.reviewCard({ cardId: `${TOPIC}/c-001`, rating: 4 });
    const s = await a.startQuiz({ scopeType: 'topic', scopeId: TOPIC, level: 'rusty', mode: 'manager' });
    await a.answerQuiz(s.sessionId, { questionId: `${TOPIC}/q-001`, chosen: [1] });
    await a.finishQuiz(s.sessionId);

    const before = await a.getDashboard();
    const json = a.exportState();

    const target = memoryStore();
    const b = makeClient({ store: target }).client;
    expect((await b.getLessonProgress(LESSON)).completedSectionIds).toEqual([]);

    b.importState(json);

    expect(await b.getUserSettings()).toEqual({
      defaultLevel: 'intermediate',
      defaultMode: 'engineer',
      dailyGoalMinutes: 35,
    });
    expect(await b.getTopicSettings()).toEqual([{ topicId: TOPIC, level: 'rusty', mode: 'manager' }]);
    expect((await b.getLessonProgress(LESSON)).completedSectionIds).toEqual(['intro']);
    expect(await b.finishQuiz(s.sessionId)).toEqual({ correctCount: 1, totalCount: 2 });

    const after = await b.getDashboard();
    expect(after.modules).toEqual(before.modules);
    expect(after.cardsDue).toBe(before.cardsDue);
  });

  it('replaces rather than merges, so a restore is a restore', async () => {
    const source = memoryStore();
    const a = makeClient({ store: source }).client;
    await a.completeSection(LESSON, 'intro');
    const json = a.exportState();

    const target = memoryStore();
    const b = makeClient({ store: target }).client;
    await b.completeSection(LESSON, 'middle');
    await b.completeSection(LESSON, 'end');
    b.importState(json);

    expect((await b.getLessonProgress(LESSON)).completedSectionIds).toEqual(['intro']);
  });

  it('rejects junk, foreign files and files from a newer schema', async () => {
    const { client } = makeClient();
    expect(() => client.importState('not json')).toThrowError(/valid JSON/);
    expect(() => client.importState('{"app":"something-else"}')).toThrowError(/progress file/);
    expect(() =>
      client.importState(JSON.stringify({ app: 'itmc', kind: 'local-state', schemaVersion: 99, data: {} })),
    ).toThrowError(/newer version/);
  });

  it('is announced as an itmc file with a schema version', async () => {
    const { client } = makeClient();
    const parsed = JSON.parse(client.exportState()) as Record<string, unknown>;
    expect(parsed['app']).toBe('itmc');
    expect(parsed['kind']).toBe('local-state');
    expect(parsed['schemaVersion']).toBe(1);
  });
});

describe('hostile storage', () => {
  let client: ReturnType<typeof makeClient>['client'];

  beforeEach(() => {
    // A private window: every access throws. The app must still work for the session.
    const throwing: KeyValueStore = {
      get() {
        throw new Error('SecurityError');
      },
      set() {
        throw new Error('QuotaExceededError');
      },
      remove() {
        throw new Error('SecurityError');
      },
      keys() {
        throw new Error('SecurityError');
      },
    };
    client = makeClient({ store: throwing }).client;
  });

  it('does not throw, and keeps state in memory for the session', async () => {
    expect(await client.getUserSettings()).toEqual({
      defaultLevel: 'rusty',
      defaultMode: 'manager',
      dailyGoalMinutes: 20,
    });
    const done = await client.completeSection(LESSON, 'intro');
    expect(done.completedSectionIds).toEqual(['intro']);
    expect((await client.getLessonProgress(LESSON)).completedSectionIds).toEqual(['intro']);
    expect(client.storageDegraded).toBe(true);
  });
});
