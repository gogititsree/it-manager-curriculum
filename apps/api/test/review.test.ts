import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TOPIC_ID, authHeaders, makeApp, type TestApp } from './helpers.js';

let app: TestApp;

beforeAll(async () => {
  app = await makeApp();
});
afterAll(async () => {
  await app.close();
});

const startQuiz = async (payload: Record<string, unknown>) =>
  app.inject({ method: 'POST', url: '/api/review/quiz', headers: authHeaders, payload });

describe('quiz', () => {
  it('404s for an unknown topic scope', async () => {
    const res = await startQuiz({ scopeType: 'topic', scopeId: 'java/nope', level: 'rusty', mode: 'manager' });
    expect(res.statusCode).toBe(404);
  });

  it('returns questions without the answer or explanation', async () => {
    const res = await startQuiz({ scopeType: 'topic', scopeId: TOPIC_ID, level: 'rusty', mode: 'manager', count: 5 });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(typeof body.sessionId).toBe('string');
    expect(body.questions.length).toBeGreaterThan(0);
    for (const q of body.questions) {
      expect(q.answer).toBeUndefined();
      expect(q.explanation).toBeUndefined();
      expect(q.options.length).toBeGreaterThan(1);
      expect(q.levels).toContain('rusty');
    }
  });

  it('prefers the current mode audience while the pool allows it', async () => {
    const res = await startQuiz({ scopeType: 'topic', scopeId: TOPIC_ID, level: 'rusty', mode: 'manager', count: 2 });
    for (const q of res.json().questions) expect(['all', 'manager']).toContain(q.audience);
  });

  it('scores answers, dedupes replays and finishes idempotently', async () => {
    const start = await startQuiz({
      scopeType: 'topic',
      scopeId: TOPIC_ID,
      level: 'rusty',
      mode: 'manager',
      count: 10,
    });
    const { sessionId, questions } = start.json() as { sessionId: string; questions: { id: string }[] };
    expect(questions.length).toBeGreaterThanOrEqual(2);

    const answersUrl = `/api/review/quiz/${encodeURIComponent(sessionId)}/answers`;
    const first = questions[0]!;
    const truth = app.content.question(first.id)!;

    const right = await app.inject({
      method: 'POST',
      url: answersUrl,
      headers: authHeaders,
      payload: { questionId: first.id, chosen: truth.answer },
    });
    expect(right.statusCode).toBe(200);
    expect(right.json()).toEqual({ correct: true, answer: truth.answer, explanation: truth.explanation });

    // A replay of the same question in the same session must not create a second row and must
    // return the stored result, even when the client sends a different (wrong) choice.
    const replay = await app.inject({
      method: 'POST',
      url: answersUrl,
      headers: authHeaders,
      payload: { questionId: first.id, chosen: [99] },
    });
    expect(replay.json().correct).toBe(true);

    const second = questions[1]!;
    const secondTruth = app.content.question(second.id)!;
    const wrongChoice = [...Array(secondTruth.options.length).keys()].find(
      (i) => !secondTruth.answer.includes(i),
    )!;
    const wrong = await app.inject({
      method: 'POST',
      url: answersUrl,
      headers: authHeaders,
      payload: { questionId: second.id, chosen: [wrongChoice] },
    });
    expect(wrong.json().correct).toBe(false);

    const notInSession = await app.inject({
      method: 'POST',
      url: answersUrl,
      headers: authHeaders,
      payload: { questionId: 'java/oop-fundamentals/q-999', chosen: [0] },
    });
    expect(notInSession.statusCode).toBe(404);

    const finishUrl = `/api/review/quiz/${encodeURIComponent(sessionId)}/finish`;
    // The api-client sends content-type: application/json with no body for the bodyless POSTs.
    const finish = await app.inject({
      method: 'POST',
      url: finishUrl,
      headers: { ...authHeaders, 'content-type': 'application/json' },
    });
    expect(finish.statusCode).toBe(200);
    expect(finish.json()).toEqual({ correctCount: 1, totalCount: questions.length });

    const again = await app.inject({ method: 'POST', url: finishUrl, headers: authHeaders });
    expect(again.json()).toEqual({ correctCount: 1, totalCount: questions.length });
  });

  it('404s for an unknown session', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/review/quiz/nope/finish',
      headers: authHeaders,
    });
    expect(res.statusCode).toBe(404);
  });
});

describe('flashcards', () => {
  it('returns cards for the resolved level, capped by limit', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/review/cards/due?limit=3&topicId=${encodeURIComponent(TOPIC_ID)}`,
      headers: authHeaders,
    });
    expect(res.statusCode).toBe(200);
    const cards = res.json() as { id: string; levels: string[]; front: string; back: string }[];
    expect(cards).toHaveLength(3);
    for (const c of cards) {
      expect(c.levels).toContain('rusty'); // user default level
      expect(c.back).toBeTruthy();
    }
  });

  it('404s for an unknown topic', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/review/cards/due?topicId=java%2Fnope',
      headers: authHeaders,
    });
    expect(res.statusCode).toBe(404);
  });

  it('404s when reviewing a card that does not exist', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/review/cards',
      headers: authHeaders,
      payload: { cardId: 'java/oop-fundamentals/c-999', rating: 3 },
    });
    expect(res.statusCode).toBe(404);
  });

  it('schedules a card and advances it further on a second review', async () => {
    const cardId = `${TOPIC_ID}/c-001`;
    const before = Date.now();

    const one = await app.inject({
      method: 'POST',
      url: '/api/review/cards',
      headers: authHeaders,
      payload: { cardId, rating: 3 },
    });
    expect(one.statusCode).toBe(200);
    const firstDue = new Date(one.json().dueAt).getTime();
    expect(firstDue).toBeGreaterThan(before);

    const two = await app.inject({
      method: 'POST',
      url: '/api/review/cards',
      headers: authHeaders,
      payload: { cardId, rating: 3 },
    });
    const secondDue = new Date(two.json().dueAt).getTime();
    expect(secondDue).toBeGreaterThan(firstDue);

    // and the state persisted, rather than starting over each time
    const state = await app.inject({
      method: 'GET',
      url: `/api/review/cards/due?limit=50&topicId=${encodeURIComponent(TOPIC_ID)}`,
      headers: authHeaders,
    });
    const ids = (state.json() as { id: string }[]).map((c) => c.id);
    expect(ids).not.toContain(cardId); // now scheduled into the future, so not due
  });
});
