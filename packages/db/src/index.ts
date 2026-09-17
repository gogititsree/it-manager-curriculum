/**
 * Opens the SQLite database through libsql (ADR-002, amended): prebuilt binaries on every
 * platform, no local C++ toolchain needed. The API is async; every query must be awaited.
 *
 * `path` may be a filesystem path (absolute or relative), the literal `:memory:`, or a `file:` URL.
 *
 * Filesystem paths are converted with `pathToFileURL` rather than string concatenation. On Windows a
 * path is not a URL: backslashes, and characters such as `#` or `?`, are URL-significant. Prefixing
 * `file:` to `C:\some#dir\itmc.db` produces a URL whose fragment starts at the `#`, and libsql
 * rejects it with URL_INVALID. Encoding the path properly avoids that for every legal Windows path.
 */
import { createClient } from '@libsql/client';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { drizzle } from 'drizzle-orm/libsql';
import * as schema from './schema.js';

export * as schema from './schema.js';
export * from './schema.js';

export type Db = Awaited<ReturnType<typeof openDb>>;

/** Turns a path, `:memory:`, or an existing `file:` URL into a libsql connection URL. */
export function toDatabaseUrl(path: string): string {
  if (path === ':memory:') return 'file::memory:';
  if (/^file:/i.test(path)) return path;
  return pathToFileURL(resolve(path)).href;
}

export async function openDb(path: string) {
  const url = toDatabaseUrl(path);
  const client = createClient({ url });
  await client.execute('PRAGMA foreign_keys = ON');
  // WAL is a no-op for an in-memory database and errors on some builds, so only set it on a file.
  if (!url.includes(':memory:')) await client.execute('PRAGMA journal_mode = WAL');
  return drizzle(client, { schema });
}
