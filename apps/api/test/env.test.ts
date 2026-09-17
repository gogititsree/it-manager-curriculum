import { describe, expect, it } from 'vitest';
import { checkEnv } from '../src/lib/env.js';

const base = { NODE_ENV: 'production', AUTH_TOKEN: 'a'.repeat(32), CORS_ORIGIN: 'https://x' };

describe('checkEnv', () => {
  it('accepts a well-configured production install', () => {
    expect(checkEnv(base as NodeJS.ProcessEnv).errors).toEqual([]);
  });

  it('rejects a missing token in production', () => {
    const { errors } = checkEnv({ NODE_ENV: 'production' } as NodeJS.ProcessEnv);
    expect(errors.some((e) => e.includes('AUTH_TOKEN is not set'))).toBe(true);
  });

  it('rejects the placeholder token in production', () => {
    const { errors } = checkEnv({ ...base, AUTH_TOKEN: 'change-me' } as NodeJS.ProcessEnv);
    expect(errors.some((e) => e.includes('placeholder'))).toBe(true);
  });

  it('rejects a short token in production', () => {
    const { errors } = checkEnv({ ...base, AUTH_TOKEN: 'short' } as NodeJS.ProcessEnv);
    expect(errors).toHaveLength(1);
  });

  it('only warns about the same problems in development', () => {
    const { errors, warnings } = checkEnv({ AUTH_TOKEN: 'change-me' } as NodeJS.ProcessEnv);
    expect(errors).toEqual([]);
    expect(warnings.length).toBeGreaterThan(0);
  });

  it('rejects an invalid port', () => {
    const { errors } = checkEnv({ ...base, PORT: 'not-a-port' } as NodeJS.ProcessEnv);
    expect(errors.some((e) => e.includes('PORT'))).toBe(true);
  });

  it('warns when production leaves CORS open', () => {
    const { warnings } = checkEnv({ NODE_ENV: 'production', AUTH_TOKEN: 'a'.repeat(32) } as NodeJS.ProcessEnv);
    expect(warnings.some((w) => w.includes('CORS_ORIGIN'))).toBe(true);
  });
});
