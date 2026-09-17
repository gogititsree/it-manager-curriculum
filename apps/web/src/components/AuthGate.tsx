/**
 * First run. Every route except /api/health needs `Authorization: Bearer <token>`, so with no token
 * in localStorage the whole app would be a wall of 401s. Ask for the token once instead, on a page
 * that explains where to find it.
 *
 * This is a local check only — it does not validate the token against the server. A wrong token
 * surfaces as the "API rejected this token" state on whichever page the user lands on, with a link
 * back to settings.
 */
import { useState, type ReactNode } from 'react';
import { setToken, useToken } from '../lib/token';

export function AuthGate({ children }: { children: ReactNode }) {
  const token = useToken();
  const [value, setValue] = useState('');

  if (token) return <>{children}</>;

  return (
    <div className="min-h-screen bg-paper text-ink">
      <main className="mx-auto flex min-h-screen max-w-app items-center px-4 py-10 sm:px-6">
        <div className="w-full max-w-[34rem]">
          <p className="label flex items-center gap-2">
            <span aria-hidden="true" className="h-3 w-[2px] bg-accent" />
            IT Manager Curriculum
          </p>

          <h1 className="mt-6 font-read text-[2rem] font-bold leading-tight tracking-[-0.01em]">
            Connect to your curriculum
          </h1>
          <p className="mt-3 max-w-prose font-read text-[1.0625rem] leading-relaxed text-ink-2">
            This install is protected by a single bearer token. Paste it once and this browser will
            remember it.
          </p>

          <form
            className="mt-8 border-t border-rule pt-6"
            onSubmit={(e) => {
              e.preventDefault();
              const t = value.trim();
              if (t) setToken(t);
            }}
          >
            <label className="label block" htmlFor="token">
              API token
            </label>
            <input
              id="token"
              type="password"
              autoFocus
              autoComplete="off"
              spellCheck={false}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="change-me"
              className="mt-2 w-full border border-rule-strong bg-surface px-3 py-2.5 font-mono text-sm text-ink placeholder:text-ink-3"
            />
            <p className="mt-2 text-[0.8125rem] leading-relaxed text-ink-3">
              It is the value of <code className="font-mono text-ink-2">AUTH_TOKEN</code> in the{' '}
              <code className="font-mono text-ink-2">.env</code> file next to the server. A fresh checkout
              ships with <code className="font-mono text-ink-2">change-me</code>.
            </p>

            <button
              type="submit"
              disabled={!value.trim()}
              className="mt-6 w-full border border-accent bg-accent px-5 py-3 font-ui text-sm font-medium text-accent-ink transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40 sm:w-auto"
            >
              Start reading
            </button>
          </form>
        </div>
      </main>
    </div>
  );
}
