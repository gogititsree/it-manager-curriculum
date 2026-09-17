/**
 * One accessible segmented radiogroup, used by the level selector, the self-rating control and the
 * settings defaults, so keyboard behaviour is identical everywhere:
 * a single tab stop on the group, arrow keys move and select, Home/End jump to the ends.
 */
import { useRef, type KeyboardEvent } from 'react';

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  /** Shown as the accessible description and the native tooltip. */
  hint?: string;
  disabled?: boolean;
}

export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
  size = 'md',
  className = '',
}: {
  label: string;
  value: T;
  options: SegmentedOption<T>[];
  onChange: (value: T) => void;
  size?: 'sm' | 'md';
  className?: string;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const enabled = options.filter((o) => !o.disabled);

  function move(delta: number) {
    if (enabled.length === 0) return;
    const at = enabled.findIndex((o) => o.value === value);
    const next = enabled[(at + delta + enabled.length) % enabled.length];
    if (!next) return;
    onChange(next.value);
    refs.current[options.indexOf(next)]?.focus();
  }

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    switch (e.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        e.preventDefault();
        move(1);
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
        e.preventDefault();
        move(-1);
        break;
      case 'Home': {
        e.preventDefault();
        const first = enabled[0];
        if (first) onChange(first.value);
        break;
      }
      case 'End': {
        e.preventDefault();
        const last = enabled[enabled.length - 1];
        if (last) onChange(last.value);
        break;
      }
    }
  }

  const pad = size === 'sm' ? 'px-2.5 py-1 text-[0.75rem]' : 'px-3 py-1.5 text-[0.8125rem]';

  return (
    <div
      role="radiogroup"
      aria-label={label}
      onKeyDown={onKeyDown}
      className={`inline-flex border border-rule-strong bg-surface ${className}`}
    >
      {options.map((o, i) => {
        const selected = o.value === value;
        return (
          <button
            key={o.value}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={o.hint ? `${o.label}. ${o.hint}` : o.label}
            title={o.hint}
            disabled={o.disabled}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(o.value)}
            className={`font-ui font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${pad} ${
              i > 0 ? 'border-l border-rule-strong' : ''
            } ${selected ? 'bg-accent text-accent-ink' : 'text-ink-2 hover:bg-accent-soft hover:text-ink'}`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
