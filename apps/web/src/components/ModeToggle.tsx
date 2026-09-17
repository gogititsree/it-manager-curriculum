/**
 * Manager mode toggle. manager = tradeoffs and concepts primary, engineer blocks collapsed;
 * engineer = the reverse.
 *
 * It is a two-state switch, and it says which state it is in rather than asking a yes/no question:
 * the reader is choosing a lens, not enabling a feature. Rendered as a real switch for assistive
 * technology (role="switch", aria-checked), operable with Space/Enter like any button.
 */
import { MODES, type Mode } from '@itmc/core';

const LABEL: Record<Mode, string> = { manager: 'Manager', engineer: 'Engineer' };

export function ModeToggle({ value, onChange }: { value: Mode; onChange: (m: Mode) => void }) {
  const other: Mode = value === 'manager' ? 'engineer' : 'manager';
  return (
    <button
      type="button"
      role="switch"
      aria-checked={value === 'manager'}
      aria-label={`Reading as ${LABEL[value]}. Switch to ${LABEL[other]}.`}
      title={
        value === 'manager'
          ? 'Manager: tradeoffs and framing lead; code is one click away.'
          : 'Engineer: code and mechanics lead; the management framing is one click away.'
      }
      onClick={() => onChange(other)}
      className="inline-flex select-none items-stretch border border-rule-strong bg-surface font-ui text-[0.8125rem] font-medium"
    >
      {MODES.map((m) => (
        <span
          key={m}
          className={`px-3 py-1.5 transition-colors ${
            m === value ? 'bg-accent text-accent-ink' : 'text-ink-3'
          } ${m === 'engineer' ? 'border-l border-rule-strong' : ''}`}
        >
          {LABEL[m]}
        </span>
      ))}
    </button>
  );
}
