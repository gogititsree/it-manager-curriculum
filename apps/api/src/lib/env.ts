/**
 * Startup environment checks. Called from main.ts before the server is built, so a misconfigured
 * production install fails immediately and loudly rather than coming up unauthenticated-by-default.
 *
 * Documented in docs/OPERATIONS.md section 4.
 */

/** Tokens that must never protect a production install. */
const WEAK_TOKENS = new Set(['change-me', 'changeme', 'password', 'secret', 'token', 'test']);
const MIN_TOKEN_LENGTH = 16;

export interface EnvCheckResult {
  errors: string[];
  warnings: string[];
}

export function checkEnv(env: NodeJS.ProcessEnv = process.env): EnvCheckResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const isProduction = env.NODE_ENV === 'production';
  const token = env.AUTH_TOKEN?.trim() ?? '';

  if (!token) {
    const msg = 'AUTH_TOKEN is not set. Generate one with: node scripts/new-token.mjs "<device>"';
    isProduction ? errors.push(msg) : warnings.push(`${msg} (allowed outside production)`);
  } else if (WEAK_TOKENS.has(token.toLowerCase())) {
    const msg = `AUTH_TOKEN is the placeholder value "${token}". Replace it before exposing this install.`;
    isProduction ? errors.push(msg) : warnings.push(`${msg} (allowed outside production)`);
  } else if (token.length < MIN_TOKEN_LENGTH) {
    const msg = `AUTH_TOKEN is only ${token.length} characters; use at least ${MIN_TOKEN_LENGTH}.`;
    isProduction ? errors.push(msg) : warnings.push(msg);
  }

  // Wide-open CORS is fine on a laptop and wrong on anything reachable by other machines.
  if (isProduction && !env.CORS_ORIGIN) {
    warnings.push(
      'CORS_ORIGIN is not set, so any origin may call the API. Leave it unset only when the API also serves the web client.',
    );
  }

  const port = Number(env.PORT ?? 4000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    errors.push(`PORT is not a valid port number: ${env.PORT}`);
  }

  return { errors, warnings };
}

/** Prints warnings; throws on any error. */
export function assertEnv(env: NodeJS.ProcessEnv = process.env): void {
  const { errors, warnings } = checkEnv(env);
  for (const w of warnings) console.warn(`[config] ${w}`);
  if (errors.length > 0) {
    console.error('\nRefusing to start. Fix the configuration:\n');
    for (const e of errors) console.error(`  - ${e}`);
    console.error('\nSee docs/OPERATIONS.md section 4.\n');
    throw new Error(`invalid configuration: ${errors.length} error(s)`);
  }
}
