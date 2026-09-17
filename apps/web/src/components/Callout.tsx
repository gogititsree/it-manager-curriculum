/**
 * A callout: a left-bordered aside, coloured by kind (docs/ARCHITECTURE.md §8).
 *
 * All seven kinds share one value and saturation so a page of them still reads as one document;
 * only the hue changes. Colour is never the only signal — every callout carries its kind as a
 * written label, which is also what makes it work for a colour-blind reader and in print.
 */
import type { CalloutKind } from '@itmc/core';
import { Markdown } from './Markdown';

/** The label is the kind said plainly, in the reader's terms rather than the schema's. */
const LABEL: Record<CalloutKind, string> = {
  tip: 'Tip',
  warning: 'Warning',
  gotcha: 'Gotcha',
  'manager-lens': 'Manager lens',
  'bank-context': 'In a bank',
  'changed-since': 'Changed since',
  decision: 'Decision',
};

export function Callout({ kind, title, md }: { kind: CalloutKind; title?: string; md: string }) {
  const hue = `var(--c-${kind})`;
  return (
    <aside
      className="my-5 border-l-2 py-3 pl-4 pr-3"
      style={{ borderColor: hue, backgroundColor: `var(--c-${kind}-bg)` }}
    >
      <p className="label" style={{ color: hue }}>
        {LABEL[kind]}
      </p>
      {title ? <p className="mt-1 font-read text-[1.02rem] font-bold leading-snug">{title}</p> : null}
      <Markdown md={md} className="prose-tight mt-1.5" />
    </aside>
  );
}
