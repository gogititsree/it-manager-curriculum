/**
 * Applies drizzle migrations and seeds the single-user install. Idempotent: safe to run on every
 * boot, which is what the container entrypoint and the systemd unit both do.
 *
 *   pnpm db:migrate                      (from the repo root)
 *   node dist/migrate.js                 (in a deployed install)
 *
 * Environment:
 *   DATABASE_PATH   absolute, or relative to the repo root. Default ./data/itmc.db
 *   MIGRATIONS_DIR  absolute path to the generated SQL. Default: ../drizzle next to this file.
 *   AUTH_TOKEN      seeds one API token on first run. Required in production (see docs/OPERATIONS.md).
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { migrate } from 'drizzle-orm/libsql/migrator';
import { openDb, schema } from './index.js';

const here = fileURLToPath(new URL('.', import.meta.url));
const repoRoot = resolve(here, '../../..');

// Minimal .env loader so `pnpm db:migrate` behaves like the API, without adding a dependency to
// this package. Real environment variables always win.
const envFile = resolve(repoRoot, '.env');
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, 'utf8').split('\n')) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (m?.[1] && process.env[m[1]] === undefined) process.env[m[1]] = m[2]!.replace(/^["']|["']$/g, '');
  }
}

const rawPath = process.env.DATABASE_PATH ?? './data/itmc.db';
const dbPath = isAbsolute(rawPath) ? rawPath : resolve(repoRoot, rawPath);
const migrationsFolder = process.env.MIGRATIONS_DIR ?? resolve(here, '../drizzle');

mkdirSync(dirname(dbPath), { recursive: true });

const db = await openDb(dbPath);
await migrate(db, { migrationsFolder });

// Seed the default user and, on a first run, one API token from AUTH_TOKEN.
const now = new Date().toISOString();
const userId = 'usr_default';
await db.insert(schema.users).values({ id: userId, displayName: 'Me', createdAt: now }).onConflictDoNothing();
await db
  .insert(schema.userSettings)
  .values({ userId, defaultLevel: 'rusty', defaultMode: 'manager', dailyGoalMinutes: 20, updatedAt: now })
  .onConflictDoNothing();

const raw = process.env.AUTH_TOKEN;
if (raw) {
  await db
    .insert(schema.apiTokens)
    .values({
      tokenHash: createHash('sha256').update(raw).digest('hex'),
      userId,
      label: 'env AUTH_TOKEN',
      createdAt: now,
    })
    .onConflictDoNothing();
} else {
  console.warn('AUTH_TOKEN not set: no token seeded. Create one with: node scripts/new-token.mjs');
}

console.log(`migrated ${dbPath}`);
