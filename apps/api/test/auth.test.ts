import { apiTokens } from '@itmc/db';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { authHeaders, makeApp, type TestApp } from './helpers.js';

let app: TestApp;

beforeAll(async () => {
  app = await makeApp();
});
afterAll(async () => {
  await app.close();
});

describe('auth', () => {
  it('serves /api/health without a token', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/health' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.ok).toBe(true);
    expect(typeof body.contentVersion).toBe('string');
    expect(typeof body.uptime).toBe('number');
  });

  it('rejects an /api request with no token', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/settings' });
    expect(res.statusCode).toBe(401);
    expect(res.json().error).toMatch(/token/);
  });

  it('rejects an unknown token', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/settings',
      headers: { authorization: 'Bearer nope' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('accepts a seeded token', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/settings', headers: authHeaders });
    expect(res.statusCode).toBe(200);
  });

  it('writes last_used_at at most once per throttle window', async () => {
    await app.inject({ method: 'GET', url: '/api/settings', headers: authHeaders });
    const first = await app.db.select().from(apiTokens).limit(1).get();
    expect(first?.lastUsedAt).toBeTruthy();

    // Backdate the column; a second request inside the window must not rewrite it.
    await app.db
      .update(apiTokens)
      .set({ lastUsedAt: '1999-01-01T00:00:00.000Z' })
      .where(eq(apiTokens.userId, first!.userId))
      .run();
    await app.inject({ method: 'GET', url: '/api/settings', headers: authHeaders });
    const second = await app.db.select().from(apiTokens).limit(1).get();
    expect(second?.lastUsedAt).toBe('1999-01-01T00:00:00.000Z');
  });
});

describe('static web app', () => {
  it('serves index.html for non-/api routes and JSON 404 for unknown /api routes', async () => {
    const withWeb = await makeApp({ webDist: undefined });
    try {
      const spa = await withWeb.inject({ method: 'GET', url: '/topics/java/oop-fundamentals' });
      const api404 = await withWeb.inject({ method: 'GET', url: '/api/nope', headers: authHeaders });
      expect(api404.statusCode).toBe(404);
      expect(api404.json().error).toBeTruthy();
      // The web build may be absent on a fresh clone; only assert the SPA fallback when it exists.
      if (spa.statusCode === 200) {
        expect(spa.headers['content-type']).toMatch(/text\/html/);
      } else {
        expect(spa.statusCode).toBe(404);
      }
      const health = await withWeb.inject({ method: 'GET', url: '/api/health' });
      expect(health.statusCode).toBe(200);
    } finally {
      await withWeb.close();
    }
  });
});
