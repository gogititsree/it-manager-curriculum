import { activityEvents } from '@itmc/db';
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TOPIC_ID, USER_ID, authHeaders, makeApp, type TestApp } from './helpers.js';

let app: TestApp;

beforeAll(async () => {
  app = await makeApp();
});
afterAll(async () => {
  await app.close();
});

const eventsOfType = (type: 'level_changed' | 'mode_changed') =>
  app.db
    .select()
    .from(activityEvents)
    .where(and(eq(activityEvents.userId, USER_ID), eq(activityEvents.type, type)))
    .all();

describe('GET/PUT /api/settings', () => {
  it('returns the seeded defaults', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/settings', headers: authHeaders });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ defaultLevel: 'rusty', defaultMode: 'manager', dailyGoalMinutes: 20 });
  });

  it('upserts and replays safely', async () => {
    const body = { defaultLevel: 'beginner', defaultMode: 'engineer', dailyGoalMinutes: 45 };
    const put = await app.inject({ method: 'PUT', url: '/api/settings', headers: authHeaders, payload: body });
    expect(put.statusCode).toBe(200);
    expect(put.json()).toEqual(body);

    const again = await app.inject({ method: 'PUT', url: '/api/settings', headers: authHeaders, payload: body });
    expect(again.json()).toEqual(body);

    const get = await app.inject({ method: 'GET', url: '/api/settings', headers: authHeaders });
    expect(get.json()).toEqual(body);

    // restore, so later tests see the rusty/manager defaults
    await app.inject({
      method: 'PUT',
      url: '/api/settings',
      headers: authHeaders,
      payload: { defaultLevel: 'rusty', defaultMode: 'manager', dailyGoalMinutes: 20 },
    });
  });

  it('rejects an invalid body with 400', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/api/settings',
      headers: authHeaders,
      payload: { defaultLevel: 'wizard', defaultMode: 'manager', dailyGoalMinutes: 20 },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('/api/settings/topics', () => {
  it('starts empty', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/settings/topics', headers: authHeaders });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual([]);
  });

  it('404s for an unknown topic', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: `/api/settings/topics/${encodeURIComponent('java/nope')}`,
      headers: authHeaders,
      payload: { topicId: 'java/nope', level: 'rusty', mode: 'manager' },
    });
    expect(res.statusCode).toBe(404);
  });

  it('upserts a topic setting and logs level/mode changes only when they change', async () => {
    const url = `/api/settings/topics/${encodeURIComponent(TOPIC_ID)}`;

    // rusty/manager == the user defaults, so nothing changed effectively.
    const same = await app.inject({
      method: 'PUT',
      url,
      headers: authHeaders,
      payload: { topicId: TOPIC_ID, level: 'rusty', mode: 'manager' },
    });
    expect(same.statusCode).toBe(200);
    expect(same.json()).toEqual({ topicId: TOPIC_ID, level: 'rusty', mode: 'manager' });
    expect(await eventsOfType('level_changed')).toHaveLength(0);
    expect(await eventsOfType('mode_changed')).toHaveLength(0);

    // Changing the level writes exactly one level_changed event.
    const changed = await app.inject({
      method: 'PUT',
      url,
      headers: authHeaders,
      payload: { topicId: TOPIC_ID, level: 'beginner', mode: 'manager' },
    });
    expect(changed.json().level).toBe('beginner');
    const levelEvents = await eventsOfType('level_changed');
    expect(levelEvents).toHaveLength(1);
    expect(levelEvents[0]?.refId).toBe(TOPIC_ID);
    expect(levelEvents[0]?.payload).toMatchObject({ from: 'rusty', to: 'beginner' });
    expect(await eventsOfType('mode_changed')).toHaveLength(0);

    // Replaying the same value writes nothing more (upsert, not append).
    await app.inject({
      method: 'PUT',
      url,
      headers: authHeaders,
      payload: { topicId: TOPIC_ID, level: 'beginner', mode: 'manager' },
    });
    expect(await eventsOfType('level_changed')).toHaveLength(1);

    // Changing the mode writes mode_changed only.
    await app.inject({
      method: 'PUT',
      url,
      headers: authHeaders,
      payload: { topicId: TOPIC_ID, level: 'beginner', mode: 'engineer' },
    });
    expect(await eventsOfType('level_changed')).toHaveLength(1);
    expect(await eventsOfType('mode_changed')).toHaveLength(1);

    const list = await app.inject({ method: 'GET', url: '/api/settings/topics', headers: authHeaders });
    expect(list.json()).toEqual([{ topicId: TOPIC_ID, level: 'beginner', mode: 'engineer' }]);
  });
});
