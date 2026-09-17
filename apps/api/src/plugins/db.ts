import { openDb, type Db } from '@itmc/db';
import fp from 'fastify-plugin';

declare module 'fastify' {
  interface FastifyInstance {
    db: Db;
  }
}

export const dbPlugin = fp<{ path: string }>(async (app, opts) => {
  const db = await openDb(opts.path);
  app.decorate('db', db);
  app.addHook('onClose', async () => {
    try {
      (db as unknown as { $client?: { close?: () => void } }).$client?.close?.();
    } catch {
      /* the process is going away anyway */
    }
  });
});
