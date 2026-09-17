#!/usr/bin/env node
/**
 * Generates a strong API token, stores its hash in the database, and prints the raw token once.
 *
 *   node scripts/new-token.mjs "phone"
 *
 * The raw token is never stored; only its SHA-256 hash goes in api_tokens. If you lose it,
 * generate another and delete the old row. Use one token per device so you can revoke
 * individually (scripts/revoke-token.mjs).
 */
import { createHash, randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const label = process.argv[2] ?? 'device';

// Load .env without a dependency.
const envPath = resolve(root, '.env');
if (existsSync(envPath)) {
  const { readFileSync } = await import('node:fs');
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const dbPath = resolve(root, process.env.DATABASE_PATH ?? './data/itmc.db');
if (!existsSync(dbPath)) {
  console.error(`No database at ${dbPath}. Run: pnpm db:migrate`);
  process.exit(1);
}

const { createClient } = await import('@libsql/client');

const raw = randomBytes(32).toString('base64url');
const hash = createHash('sha256').update(raw).digest('hex');
const client = createClient({ url: `file:${dbPath}` });

const user = await client.execute('SELECT id FROM users ORDER BY created_at LIMIT 1');
if (user.rows.length === 0) {
  console.error('No user row found. Run: pnpm db:migrate');
  process.exit(1);
}

await client.execute({
  sql: 'INSERT INTO api_tokens (token_hash, user_id, label, created_at) VALUES (?, ?, ?, ?)',
  args: [hash, user.rows[0].id, label, new Date().toISOString()],
});

console.log(`\nToken created for "${label}". Copy it now; it is not recoverable.\n`);
console.log(`  ${raw}\n`);
console.log('Paste it into the app on first run, or set AUTH_TOKEN in .env for the seeded token.\n');
