/**
 * The small shared vocabulary: panels, buttons, labels, progress rails and the loading / empty /
 * error states. Kept in one file so the visual language stays consistent; anything that grows a
 * real behaviour of its own moves out into its own component.
 *
 * Copy rules (docs/ARCHITECTURE.md §8): errors say what happened and what to do, never apologise;
 * an empty screen is an invitation to act, not a mood.
 */
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { isStaticMode } from '../lib/api';
import { httpStatusOf } from '../lib/errors';

// ---------------------------------------------------------------- surfaces

export function Panel({
  children,
  className = '',
  as: As = 'div',
}: {
  children: ReactNode;
  className?: string;
  as?: 'div' | 'section' | 'li' | 'article';
}) {
  return <As className={`border border-rule bg-surface ${className}`}>{children}</As>;
}

export function SectionHeading({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="mb-3 flex items-baseline justify-between gap-4 border-b border-rule pb-2">
      <h2 className="label">{children}</h2>
      {aside ? <div className="label">{aside}</div> : null}
    </div>
  );
}

// ---------------------------------------------------------------- controls

type ButtonProps = {
  children: ReactNode;
  onClick?: () => void;
  type?: 'button' | 'submit';
  disabled?: boolean;
  variant?: 'solid' | 'outline' | 'quiet';
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  'aria-label'?: string;
};

const SIZE: Record<NonNullable<ButtonProps['size']>, string> = {
  sm: 'px-2.5 py-1 text-[0.8125rem]',
  md: 'px-3.5 py-2 text-sm',
  lg: 'px-5 py-3 text-base',
};

export function Button({
  children,
  onClick,
  type = 'button',
  disabled,
  variant = 'outline',
  size = 'md',
  className = '',
  ...rest
}: ButtonProps) {
  const look =
    variant === 'solid'
      ? 'bg-accent text-accent-ink border-accent hover:opacity-90'
      : variant === 'quiet'
        ? 'bg-transparent text-ink-2 border-transparent hover:text-ink hover:border-rule'
        : 'bg-surface text-ink border-rule-strong hover:border-ink-3';
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center justify-center gap-2 border font-ui font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-45 ${SIZE[size]} ${look} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}

export function Field({
  label,
  hint,
  htmlFor,
  children,
}: {
  label: string;
  hint?: string;
  htmlFor?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label className="label block" htmlFor={htmlFor}>
        {label}
      </label>
      {children}
      {hint ? <p className="text-[0.8125rem] leading-snug text-ink-3">{hint}</p> : null}
    </div>
  );
}

export const inputClass =
  'w-full border border-rule-strong bg-surface px-3 py-2 font-ui text-sm text-ink placeholder:text-ink-3';

// ---------------------------------------------------------------- data marks

export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'quiet' | 'accent' }) {
  const look =
    tone === 'accent'
      ? 'border-accent text-accent bg-accent-soft'
      : tone === 'quiet'
        ? 'border-rule text-ink-3'
        : 'border-rule-strong text-ink-2';
  return <span className={`label inline-block border px-1.5 py-0.5 ${look}`}>{children}</span>;
}

/** A filled rule. Progress arrives already computed by @itmc/core; this only draws it. */
export function Meter({ value, label, className = '' }: { value: number; label: string; className?: string }) {
  const w = `${Math.max(0, Math.min(1, value)) * 100}%`;
  return (
    <div
      className={`h-[3px] w-full bg-rule ${className}`}
      role="img"
      aria-label={label}
      title={label}
    >
      <div className="h-full bg-accent" style={{ width: w }} />
    </div>
  );
}

/** Three stacked hairlines, one per level: the shape of a topic's coverage at a glance. */
export function LevelMeter({ values, className = '' }: { values: { label: string; value: number }[]; className?: string }) {
  return (
    <div className={`flex flex-col gap-[3px] ${className}`}>
      {values.map((v) => (
        <div key={v.label} className="flex items-center gap-2">
          <span className="label w-[4.5rem] shrink-0 text-[0.625rem]">{v.label}</span>
          <Meter value={v.value} label={`${v.label}: ${Math.round(v.value * 100)}%`} />
        </div>
      ))}
    </div>
  );
}

export function Tick({ done, className = '' }: { done: boolean; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
        done ? 'border-accent bg-accent text-accent-ink' : 'border-rule-strong'
      } ${className}`}
    >
      {done ? (
        <svg viewBox="0 0 12 12" className="h-2.5 w-2.5" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M2.5 6.2 4.8 8.5 9.5 3.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ) : null}
    </span>
  );
}

// ---------------------------------------------------------------- states

export function Loading({ what = 'Loading' }: { what?: string }) {
  return (
    <p className="label py-10 text-center" role="status" aria-live="polite">
      {what}…
    </p>
  );
}

/** Skeleton rules rather than shimmering boxes: the page already looks like ruled paper. */
export function LoadingLines({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-3 py-6" role="status" aria-live="polite" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="h-3 bg-rule" style={{ width: `${[92, 78, 88, 64, 84][i % 5]}%` }} />
      ))}
    </div>
  );
}

export function Empty({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <Panel className="p-6">
      <h3 className="font-read text-lg">{title}</h3>
      {children ? <div className="mt-2 max-w-prose text-sm leading-relaxed text-ink-2">{children}</div> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </Panel>
  );
}

function describe(error: unknown): { title: string; detail: string; action?: ReactNode } {
  const status = httpStatusOf(error);
  if (status !== undefined) {
    if (status === 401)
      return {
        title: 'The API rejected this token',
        detail: 'The token in this browser does not match AUTH_TOKEN on the server. Enter the current one to continue.',
        action: (
          <Link to="/settings" className="label border border-rule-strong px-2.5 py-1.5 text-ink hover:border-ink-3">
            Open settings
          </Link>
        ),
      };
    if (status === 404)
      return { title: 'Not found', detail: 'There is no content under that id. It may have been renamed in a later build.' };
    if (status === 501)
      return {
        title: 'This part of the API is not built yet',
        detail: 'The route answered 501. Reading lessons works; anything that records progress will start working once the server route lands.',
      };
    return {
      title: `Request failed (${status})`,
      detail: error instanceof Error ? error.message : 'The request did not succeed.',
    };
  }
  if (isStaticMode) {
    return {
      title: 'The curriculum could not be loaded',
      detail:
        'This build reads its content from a file served next to the app. Reload the page; if it keeps failing the deployment is missing content/bundle.json.',
    };
  }
  return {
    title: 'No answer from the API',
    detail: 'Nothing is listening on /api. Start the server with `pnpm dev` (or `pnpm --filter @itmc/api dev`) and reload.',
  };
}

export function ErrorState({ error, retry }: { error: unknown; retry?: () => void }) {
  const { title, detail, action } = describe(error);
  return (
    <Panel className="border-l-2 border-l-[color:var(--c-gotcha)] p-5">
      <p className="label text-[color:var(--c-gotcha)]">Problem</p>
      <h3 className="mt-1.5 font-read text-lg">{title}</h3>
      <p className="mt-1.5 max-w-prose text-sm leading-relaxed text-ink-2">{detail}</p>
      {(action || retry) && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {action}
          {retry ? (
            <Button size="sm" onClick={retry}>
              Try again
            </Button>
          ) : null}
        </div>
      )}
    </Panel>
  );
}

/** For things the page can live without: progress, streaks, due counts. */
export function InlineNotice({ children, tone = 'quiet' }: { children: ReactNode; tone?: 'quiet' | 'warn' }) {
  const color = tone === 'warn' ? 'var(--c-warning)' : 'var(--rule-strong)';
  return (
    <p
      className="border-l-2 py-1 pl-3 text-[0.8125rem] leading-relaxed text-ink-2"
      style={{ borderColor: color }}
    >
      {children}
    </p>
  );
}
