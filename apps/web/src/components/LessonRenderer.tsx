/**
 * Renders a compiled Lesson. This is THE component that interprets the block model, so it must stay
 * faithful to @itmc/core content.ts:
 *   - one <section> per Section, with a "Mark done" control calling onSectionDone(section.id)
 *   - blocks whose audience is neither 'all' nor the current mode render collapsed (<details>) with a
 *     label ("Engineer detail" / "Manager lens"). Never hidden entirely: the user can always peek.
 *   - markdown -> react-markdown; code -> shiki; callout -> styled aside by kind;
 *     exercise -> ExerciseCard (prompt, textarea, self-rating 1..5, reveal solution, submitExercise)
 *
 * Two decisions worth knowing:
 *
 * 1. A *run* of consecutive non-primary blocks with the same audience collapses into ONE disclosure.
 *    A code sample and the sentence explaining it are one aside, not two, and expanding once gives
 *    the reader the whole thought. The audience rule itself is untouched — every block is still
 *    classified individually by isPrimaryForMode.
 * 2. Sections are numbered on a margin rail. They are a real sequence: you read them in order and
 *    tick them off, and the rail is where that state lives.
 *
 * Mobile gets a sibling renderer over the same block model; keep the props as declared.
 */
import { isPrimaryForMode, type Audience, type Block, type Exercise, type Lesson, type Mode } from '@itmc/core';
import { useState } from 'react';
import { Callout } from './Callout';
import { CodeBlock } from './CodeBlock';
import { ExerciseCard } from './ExerciseCard';
import { Markdown } from './Markdown';
import { Tick } from './ui';

/** The quiet label on a collapsed run. Says whose detail it is, not that it was filtered. */
const ASIDE_LABEL: Record<Exclude<Audience, 'all'>, string> = {
  engineer: 'Engineer detail',
  manager: 'Manager lens',
};

export function LessonRenderer({
  lesson,
  mode,
  completed,
  onSectionDone,
}: {
  lesson: Lesson;
  mode: Mode;
  completed: Set<string>;
  onSectionDone: (sectionId: string) => void;
}) {
  // Local echo so the control responds on the click, not on the round trip. `completed` remains the
  // source of truth: once the write lands, the id arrives there and this is only a transient label.
  const [pending, setPending] = useState<Set<string>>(new Set());
  const byId = new Map(lesson.exercises.map((e) => [e.id, e]));

  return (
    <article>
      <header className="measure">
        <h1 className="font-read text-[1.85rem] font-bold leading-[1.18] tracking-[-0.01em] md:text-[2.25rem]">
          {lesson.title}
        </h1>
        {lesson.objectives.length > 0 && (
          <div className="mt-5 border-t border-rule pt-4">
            <h2 className="label">By the end of this you can</h2>
            <ul className="mt-2 space-y-1.5">
              {lesson.objectives.map((o) => (
                <li key={o} className="flex gap-2.5 text-[0.9375rem] leading-relaxed text-ink-2">
                  <span aria-hidden="true" className="mt-[0.7em] h-px w-3 shrink-0 bg-rule-strong" />
                  <span>{o}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </header>

      <div className="mt-10 space-y-12">
        {lesson.sections.map((section, i) => {
          const done = completed.has(section.id);
          const saving = pending.has(section.id) && !done;
          return (
            <section key={section.id} id={section.id} className="rail scroll-mt-32" aria-labelledby={`h-${section.id}`}>
              <div className="rail-mark">
                <span className="label num text-ink-3">{String(i + 1).padStart(2, '0')}</span>
                <Tick done={done} />
              </div>

              <h2
                id={`h-${section.id}`}
                className="measure font-read text-[1.4rem] font-bold leading-snug md:text-[1.55rem]"
              >
                {section.title}
              </h2>

              <div className="measure mt-4">
                {groupRuns(section.blocks, mode).map((run, ri) =>
                  run.primary ? (
                    <div key={ri}>
                      {run.blocks.map((b, bi) => (
                        <BlockView key={bi} block={b} exercises={byId} />
                      ))}
                    </div>
                  ) : (
                    <details key={ri} className="group my-5 border-l-2 border-rule-strong pl-4">
                      <summary className="label inline-flex cursor-pointer list-none items-center gap-2 py-0.5 hover:text-ink">
                        <Chevron />
                        {ASIDE_LABEL[run.audience]}
                        <span className="font-normal normal-case tracking-normal text-ink-3">
                          ({run.blocks.length} {run.blocks.length === 1 ? 'block' : 'blocks'})
                        </span>
                      </summary>
                      <div className="mt-2">
                        {run.blocks.map((b, bi) => (
                          <BlockView key={bi} block={b} exercises={byId} />
                        ))}
                      </div>
                    </details>
                  ),
                )}
              </div>

              <footer className="measure mt-6 flex items-center gap-3 border-t border-rule pt-3">
                <button
                  type="button"
                  disabled={done}
                  onClick={() => {
                    setPending((p) => new Set(p).add(section.id));
                    onSectionDone(section.id);
                  }}
                  className="inline-flex items-center gap-2 border border-rule-strong bg-surface px-3 py-1.5 font-ui text-[0.8125rem] font-medium text-ink transition-colors hover:border-ink-3 disabled:cursor-default disabled:border-rule disabled:bg-transparent disabled:text-ink-3"
                >
                  <Tick done={done} />
                  {done ? 'Section done' : saving ? 'Marking…' : 'Mark section done'}
                </button>
                <span className="label">
                  {i + 1} of {lesson.sections.length}
                </span>
              </footer>
            </section>
          );
        })}
      </div>
    </article>
  );
}

// ---------------------------------------------------------------- blocks

function BlockView({ block, exercises }: { block: Block; exercises: Map<string, Exercise> }) {
  switch (block.type) {
    case 'markdown':
      return <Markdown md={block.md} />;
    case 'code':
      return <CodeBlock code={block.code} lang={block.lang} caption={block.caption} />;
    case 'callout':
      return <Callout kind={block.kind} title={block.title} md={block.md} />;
    case 'exercise': {
      const ex = exercises.get(block.exerciseId);
      // The compiler guarantees the reference resolves; if a hand-edited bundle ever breaks that,
      // say which id is missing rather than rendering nothing.
      return ex ? (
        <ExerciseCard exercise={ex} />
      ) : (
        <p className="my-5 border-l-2 border-l-[color:var(--c-gotcha)] py-2 pl-3 text-sm text-ink-2">
          Exercise <code className="font-mono text-[0.8125rem]">{block.exerciseId}</code> is referenced here but is
          missing from this lesson.
        </p>
      );
    }
  }
}

interface Run {
  primary: boolean;
  audience: Exclude<Audience, 'all'>;
  blocks: Block[];
}

/**
 * Split a section's blocks into runs. Primary blocks flow inline; consecutive non-primary blocks
 * sharing an audience become one collapsed run. Order is always preserved.
 */
function groupRuns(blocks: Block[], mode: Mode): Run[] {
  const runs: Run[] = [];
  for (const block of blocks) {
    const primary = isPrimaryForMode(block.audience, mode);
    const audience = (block.audience === 'all' ? mode : block.audience) as Exclude<Audience, 'all'>;
    const last = runs[runs.length - 1];
    if (last && last.primary === primary && (primary || last.audience === audience)) last.blocks.push(block);
    else runs.push({ primary, audience, blocks: [block] });
  }
  return runs;
}

function Chevron() {
  return (
    <svg
      viewBox="0 0 12 12"
      className="h-3 w-3 shrink-0 transition-transform group-open:rotate-90"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      aria-hidden="true"
    >
      <path d="M4 2.5 8 6l-4 3.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
