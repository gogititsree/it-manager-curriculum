/**
 * Opens the SQLite database through libsql (ADR-002, amended): prebuilt binaries on every
 * platform, no local C++ toolchain needed. API is async; every query must be awaited.
 *
 * `path` may be a filesystem path, `:memory:`, or a full `file:` URL.
 */
import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import * as schema from './schema.js';

export * as schema from './schema.js';
export * from './schema.js';

export type Db = Awaited<ReturnType<typeof openDb>>;

export async function openDb(path: string) {
  const url = path === ':memory:' ? 'file::memory:' : path.startsWith('file:') ? path : `file:${path}`;
  const client = createClient({ url });
  await client.execute('PRAGMA foreign_keys = ON');
  if (!url.includes(':memory:')) await client.execute('PRAGMA journal_mode = WAL');
  return drizzle(client, { schema });
}
