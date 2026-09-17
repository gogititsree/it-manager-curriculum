/**
 * Test harness: a real Fastify app over an in-memory libsql database.
 *
 * The in-memory DB belongs to the connection the app itself opened, so migrations have to run
 * against `app.db` (a second `openDb(':memory:')` would be a different database).
 */
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { apiTokens, userSettings, users } from '@itmc/db';
import { migrate } from 'drizzle-orm/libsql/migrator';
import { buildServer, type ServerOptions } from '../src/server.js';

const here = fileURLToPath(new URL('.', import.meta.url));
export const REPO_ROOT = resolve(here, '../../..');
export const CONTENT_DIST = resolve(REPO_ROOT, 'content/dist');
export const MIGRATIONS_DIR = resolve(REPO_ROOT, 'packages/db/drizzle');

export const TOKEN = 'test-token';
export const USER_ID = 'usr_test';
export const authHeaders = { authorization: `Bearer ${TOKEN}` };

/** The only authored topic in content/ today; every fixture hangs off it. */
export const TOPIC_ID = 'java/oop-fundamentals';
export const RUSTY_LESSON = `${TOPIC_ID}@rusty`;
export const RUSTY_SECTIONS = [
  'overview',
  'what-you-probably-remember',
  'what-changed-since',
  'gotchas-that-still-bite',
  'ten-minute-drill',
];

export type TestApp = Awaited<ReturnType<typeof buildServer>>;

export async function makeApp(opts: Partial<ServerOptions> = {}): Promise<TestApp> {
  const app = await buildServer({
    databasePath: ':memory:',
    contentDist: CONTENT_DIST,
    logger: false,
    webDist: false,
    ...opts,
  });
  await migrate(app.db, { migrationsFolder: MIGRATIONS_DIR });

  const now = new Date().toISOString();
  await app.db.insert(users).values({ id: USER_ID, displayName: 'Test', createdAt: now }).run();
  await app.db
    .insert(userSettings)
    .values({
      userId: USER_ID,
      defaultLevel: 'rusty',
      defaultMode: 'manager',
      dailyGoalMinutes: 20,
      updatedAt: now,
    })
    .run();
  await app.db
    .insert(apiTokens)
    .values({
      tokenHash: createHash('sha256').update(TOKEN).digest('hex'),
      userId: USER_ID,
      label: 'test',
      createdAt: now,
    })
    .run();
  return app;
}
