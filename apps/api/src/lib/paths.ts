/**
 * Path resolution.
 *
 * Relative paths in the environment (DATABASE_PATH, CONTENT_DIST, WEB_DIST) are written relative to
 * the REPO ROOT, because that is where they are meaningful and where `.env` lives. But the API runs
 * with different working directories depending on how it was started:
 *
 *   pnpm dev                        cwd = apps/api        (pnpm runs the script in the package dir)
 *   pnpm start / node dist/main.js  cwd = the repo root
 *   docker                          cwd = /app, and the paths are absolute anyway
 *
 * Resolving against `process.cwd()` therefore breaks development. Resolve against the repo root,
 * derived from this module's own location, and leave absolute paths untouched.
 */
import { isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));

/** apps/api/{src,dist}/lib -> the repo root, in both the tsx and the built layout. */
export const REPO_ROOT = resolve(here, '../../../..');

/** Resolve a configured path against the repo root. Absolute paths pass through unchanged. */
export function fromRepoRoot(p: string): string {
  return isAbsolute(p) ? p : resolve(REPO_ROOT, p);
}
