#!/usr/bin/env node
/**
 * Lists or revokes API tokens.
 *   node scripts/revoke-token.mjs                 list tokens (label, created, last used)
 *   node scripts/revoke-token.mjs <label>         revoke every token with that label
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const envPath = resolve(root, '.env');
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const dbPath = resolve(root, process.env.DATABASE_PATH ?? './data/itmc.db');
if (!existsSync(dbPath)) {
  console.error(`No database at ${dbPath}.`);
  process.exit(1);
}

const { createClient } = await import('@libsql/client');
const client = createClient({ url: `file:${dbPath}` });
const label = process.argv[2];

if (!label) {
  const rows = await client.execute('SELECT label, created_at, last_used_at FROM api_tokens ORDER BY created_at');
  if (rows.rows.length === 0) console.log('No tokens.');
  for (const r of rows.rows) {
    console.log(`${String(r.label).padEnd(24)} created ${r.created_at}  last used ${r.last_used_at ?? 'never'}`);
  }
  process.exit(0);
}

const res = await client.execute({ sql: 'DELETE FROM api_tokens WHERE label = ?', args: [label] });
console.log(`Revoked ${res.rowsAffected} token(s) labelled "${label}".`);
if (res.rowsAffected > 0) console.log('Any device using them must be given a new token.');
