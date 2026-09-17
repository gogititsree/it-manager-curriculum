#!/usr/bin/env node
/**
 * Consistent backup of the progress database.
 *
 *   node scripts/backup.mjs [targetDir]        default: ./backups
 *
 * Uses SQLite's VACUUM INTO, which produces a single consistent file even while the API is running
 * (unlike copying the .db while WAL files exist). Keeps the 30 most recent backups.
 *
 * The content bundle is NOT backed up: it is rebuilt from content/ in the repo. This file is the
 * only irreplaceable state in the system.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, unlinkSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const envPath = resolve(root, '.env');
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const KEEP = 30;
const dbPath = resolve(root, process.env.DATABASE_PATH ?? './data/itmc.db');
const outDir = resolve(root, process.argv[2] ?? './backups');

if (!existsSync(dbPath)) {
  console.error(`No database at ${dbPath}`);
  process.exit(1);
}
mkdirSync(outDir, { recursive: true });

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const target = join(outDir, `itmc-${stamp}.db`);

const { createClient } = await import('@libsql/client');
const client = createClient({ url: `file:${dbPath}` });
await client.execute({ sql: `VACUUM INTO ?`, args: [target] });

const size = (statSync(target).size / 1024).toFixed(0);
console.log(`Backup written: ${target} (${size} KB)`);

const old = readdirSync(outDir)
  .filter((f) => f.startsWith('itmc-') && f.endsWith('.db'))
  .sort()
  .slice(0, -KEEP);
for (const f of old) {
  unlinkSync(join(outDir, f));
  console.log(`Pruned old backup: ${f}`);
}
