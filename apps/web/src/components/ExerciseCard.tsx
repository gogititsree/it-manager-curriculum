/**
 * An exercise inside a lesson: prompt, a place to answer, an honest self-rating, and the model
 * answer behind a disclosure.
 *
 * The solution is a <details> the reader opens deliberately, and it is only offered when the
 * exercise actually has one. The self-rating (1 struggled .. 5 confident, per ExerciseAttemptBody)
 * is what later tells the dashboard where the shaky ground is, so it is required before submitting.
 */
import type { Exercise } from '@itmc/core';
import { useState } from 'react';
import { useSubmitExercise } from '../lib/hooks';
import { Markdown } from './Markdown';
import { Segmented } from './Segmented';
import { Button, ErrorState } from './ui';

const TYPE_LABEL: Record<Exercise['type'], string> = {
  code: 'Write code',
  design: 'Design it',
  reflect: 'Reflect',
  scenario: 'Scenario',
};

const RATINGS = [
  { value: '1', label: '1', hint: 'Struggled' },
  { value: '2', label: '2', hint: 'Shaky' },
  { value: '3', label: '3', hint: 'Got there' },
  { value: '4', label: '4', hint: 'Comfortable' },
  { value: '5', label: '5', hint: 'Confident' },
];

export function ExerciseCard({ exercise }: { exercise: Exercise }) {
  const [submission, setSubmission] = useState('');
  const [rating, setRating] = useState<string>('');
  const submit = useSubmitExercise();
  const fieldId = `ex-${exercise.id.replace(/[^\w-]/g, '-')}`;

  const done = submit.isSuccess;

  return (
    <section className="my-6 border border-rule-strong bg-surface" aria-labelledby={`${fieldId}-title`}>
      <header className="flex items-baseline justify-between gap-3 border-b border-rule px-4 py-2.5">
        <p className="label">Exercise · {TYPE_LABEL[exercise.type]}</p>
      </header>

      <div className="px-4 py-4">
        <h3 id={`${fieldId}-title`} className="font-read text-[1.15rem] font-bold leading-snug">
          {exercise.title}
        </h3>
        <Markdown md={exercise.md} className="prose-tight mt-2" />

        <form
          className="mt-5 space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            const n = Number(rating);
            if (!n) return;
            submit.mutate({
              exerciseId: exercise.id,
              submission: submission.trim() || undefined,
              selfRating: n as 1 | 2 | 3 | 4 | 5,
            });
          }}
        >
          <div className="space-y-1.5">
            <label className="label block" htmlFor={`${fieldId}-answer`}>
              Your answer
            </label>
            <textarea
              id={`${fieldId}-answer`}
              value={submission}
              onChange={(e) => setSubmission(e.target.value)}
              rows={7}
              spellCheck={false}
              placeholder="Sketch it here. Prose is fine — the point is to commit to an answer before you read the model one."
              className="w-full resize-y border border-rule-strong bg-surface-2 px-3 py-2.5 font-mono text-[0.8125rem] leading-relaxed text-ink placeholder:text-ink-3"
            />
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <div className="space-y-1.5">
              <span className="label block" id={`${fieldId}-rating-label`}>
                How did that go?
              </span>
              <Segmented
                label="Self rating, 1 struggled to 5 confident"
                value={rating}
                options={RATINGS}
                onChange={setRating}
              />
            </div>
            <div className="ml-auto flex items-center gap-3 self-end">
              {done ? <span className="label text-[color:var(--c-tip)]">Recorded</span> : null}
              <Button type="submit" variant="solid" disabled={!rating || submit.isPending}>
                {submit.isPending ? 'Recording…' : done ? 'Record again' : 'Record attempt'}
              </Button>
            </div>
          </div>

          {submit.isError ? <ErrorState error={submit.error} retry={() => submit.reset()} /> : null}
        </form>

        {exercise.solutionMd ? (
          <details className="group mt-5 border-t border-rule pt-3">
            <summary className="label inline-flex cursor-pointer list-none items-center gap-2 text-ink-2 hover:text-ink">
              <Chevron />
              Reveal solution
            </summary>
            <Markdown md={exercise.solutionMd} className="prose-tight mt-3" />
          </details>
        ) : (
          <p className="mt-5 border-t border-rule pt-3 text-[0.8125rem] text-ink-3">
            This exercise has no model answer. Compare notes with someone who has done the work.
          </p>
        )}
      </div>
    </section>
  );
}

function Chevron() {
  return (
    <svg
      viewBox="0 0 12 12"
      className="h-3 w-3 transition-transform group-open:rotate-90"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      aria-hidden="true"
    >
      <path d="M4 2.5 8 6l-4 3.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
