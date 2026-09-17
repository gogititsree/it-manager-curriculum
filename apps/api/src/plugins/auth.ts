/**
 * Bearer-token auth (ADR-009). Every /api/* route except /api/health requires
 * `Authorization: Bearer <token>`; the sha256 of the token must exist in api_tokens.
 * Sets request.userId. Single-user today; the table already supports many users and devices.
 */
import { createHash } from 'node:crypto';
import { apiTokens } from '@itmc/db';
import { eq } from 'drizzle-orm';
import fp from 'fastify-plugin';

declare module 'fastify' {
  interface FastifyRequest {
    userId: string;
  }
}

/** last_used_at is a convenience column, not an audit trail: one write per token per window. */
const LAST_USED_THROTTLE_MS = 10 * 60 * 1000;

export const authPlugin = fp(async (app) => {
  app.decorateRequest('userId', '');
  /** tokenHash -> epoch ms of the last write. In-memory: a restart simply writes once more. */
  const lastUsedWrites = new Map<string, number>();

  app.addHook('onRequest', async (req, reply) => {
    if (!req.url.startsWith('/api/') || req.url.startsWith('/api/health')) return;
    const raw = req.headers.authorization?.replace(/^Bearer\s+/i, '');
    if (!raw) return reply.code(401).send({ error: 'missing bearer token' });
    const hash = createHash('sha256').update(raw).digest('hex');
    const row = await app.db.select().from(apiTokens).where(eq(apiTokens.tokenHash, hash)).get();
    if (!row || (row.expiresAt && row.expiresAt < new Date().toISOString())) {
      return reply.code(401).send({ error: 'invalid token' });
    }
    req.userId = row.userId;

    const nowMs = Date.now();
    const previous = lastUsedWrites.get(hash);
    if (previous === undefined || nowMs - previous >= LAST_USED_THROTTLE_MS) {
      lastUsedWrites.set(hash, nowMs);
      try {
        await app.db
          .update(apiTokens)
          .set({ lastUsedAt: new Date(nowMs).toISOString() })
          .where(eq(apiTokens.tokenHash, hash))
          .run();
      } catch (err) {
        lastUsedWrites.delete(hash);
        req.log.warn({ err }, 'failed to update api_tokens.last_used_at');
      }
    }
  });
});
