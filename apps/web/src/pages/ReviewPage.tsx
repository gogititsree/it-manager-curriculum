/**
 * ReviewPage — "five minutes between meetings".
 * Landing: two big buttons: "Flashcards (N due)" and "Quick quiz", plus scope pickers
 * (all / module / topic) and a level chip defaulting to the user default.
 * /review/cards: FlashcardRunner — front, tap to flip, four rating buttons (Again/Hard/Good/Easy)
 *   calling reviewCard; keyboard 1-4; shows remaining count; ends with a summary.
 * /review/quiz/:sessionId: QuizRunner — one question at a time, submit, immediate feedback with
 *   explanation, then finishQuiz and a score screen with "review wrong answers".
 *
 * Both runners are built thumb-first and keyboard-first at the same time: one card fills the screen,
 * the actions sit in a fixed block at the bottom within thumb reach at ~400px, and every action has a
 * number key. This is the layout the mobile app inherits, so nothing here depends on a wide viewport
 * or on hover.
 */
import type { Flashcard, Level, Mode } from '@itmc/core';
import { LEVELS } from '@itmc/core';
import type { QuizQuestionPublic } from '@itmc/api-client';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, Route, Routes, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Segmented } from '../components/Segmented';
import { Button, Empty, ErrorState, InlineNotice, LoadingLines, Meter, Panel, SectionHeading } from '../components/ui';
import { LEVEL_LABEL, MODE_LABEL } from '../lib/format';
import {
  useAnswerQuiz,
  useDashboard,
  useDueCards,
  useFinishQuiz,
  useManifest,
  useReviewCard,
  useSettingsView,
  useStartQuiz,
} from '../lib/hooks';

export function ReviewPage() {
  return (
    <Routes>
      <Route index element={<ReviewLanding />} />
      <Route path="cards" element={<FlashcardRunner />} />
      <Route path="quiz/:sessionId" element={<QuizRunner />} />
      <Route path="*" element={<ReviewLanding />} />
    </Routes>
  );
}

// ================================================================= landing

type ScopeType = 'all' | 'module' | 'topic';

function ReviewLanding() {
  const navigate = useNavigate();
  const manifest = useManifest();
  const dashboard = useDashboard();
  const settings = useSettingsView();
  const startQuiz = useStartQuiz();

  const [scopeType, setScopeType] = useState<ScopeType>('all');
  const [scopeId, setScopeId] = useState<string>('');
  const [level, setLevel] = useState<Level | ''>('');
  const chosenLevel: Level = level || settings.user.defaultLevel;
  const mode: Mode = settings.user.defaultMode;

  const modules = manifest.data?.modules ?? [];
  const topics = useMemo(() => modules.flatMap((m) => m.topics), [modules]);

  const scopeTopicId = scopeType === 'topic' ? scopeId : undefined;
  const cardsDue = dashboard.data?.cardsDue;

  const ready = scopeType === 'all' || !!scopeId;

  return (
    <div className="measure">
      <header>
        <p className="label">Review</p>
        <h1 className="mt-2 font-read text-[2rem] font-bold leading-tight tracking-[-0.01em]">
          Five minutes, whatever is closest to falling out.
        </h1>
        <p className="mt-3 font-read text-[1.0625rem] leading-relaxed text-ink-2">
          Flashcards bring back the cards that are due. A quick quiz asks ten questions and tells you why
          each answer is what it is.
        </p>
      </header>

      <section className="mt-9" aria-labelledby="scope">
        <SectionHeading>
          <span id="scope">Scope</span>
        </SectionHeading>

        {manifest.isPending ? (
          <LoadingLines rows={2} />
        ) : manifest.isError ? (
          <ErrorState error={manifest.error} retry={() => void manifest.refetch()} />
        ) : (
          <div className="flex flex-col gap-4">
            <Segmented
              label="Scope"
              value={scopeType}
              onChange={(v) => {
                setScopeType(v);
                setScopeId('');
              }}
              options={[
                { value: 'all', label: 'Everything' },
                { value: 'module', label: 'One module' },
                { value: 'topic', label: 'One topic' },
              ]}
              className="self-start"
            />

            {scopeType !== 'all' && (
              <div className="space-y-1.5">
                <label className="label block" htmlFor="scope-id">
                  {scopeType === 'module' ? 'Module' : 'Topic'}
                </label>
                <select
                  id="scope-id"
                  value={scopeId}
                  onChange={(e) => setScopeId(e.target.value)}
                  className="w-full border border-rule-strong bg-surface px-3 py-2 font-ui text-sm text-ink"
                >
                  <option value="">Choose one…</option>
                  {scopeType === 'module'
                    ? modules.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.title}
                        </option>
                      ))
                    : topics.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.moduleId} · {t.title}
                        </option>
                      ))}
                </select>
              </div>
            )}

            <div className="space-y-1.5">
              <span className="label block">Level</span>
              <Segmented
                label="Level"
                value={chosenLevel}
                onChange={(l) => setLevel(l)}
                options={LEVELS.map((l) => ({ value: l, label: LEVEL_LABEL[l] }))}
                className="self-start"
              />
              <p className="text-[0.8125rem] text-ink-3">
                Defaults to your {LEVEL_LABEL[settings.user.defaultLevel].toLowerCase()} setting. Questions are
                picked for the {MODE_LABEL[mode].toLowerCase()} lens.
              </p>
            </div>
          </div>
        )}
      </section>

      <section className="mt-9" aria-labelledby="start">
        <SectionHeading>
          <span id="start">Start</span>
        </SectionHeading>

        <div className="grid gap-px bg-rule sm:grid-cols-2">
          <button
            type="button"
            onClick={() =>
              navigate(`/review/cards${scopeTopicId ? `?topicId=${encodeURIComponent(scopeTopicId)}` : ''}`)
            }
            disabled={!ready}
            className="bg-surface p-6 text-left transition-colors hover:bg-accent-soft disabled:cursor-not-allowed disabled:opacity-50"
          >
            <p className="label">Spaced repetition</p>
            <p className="mt-2 font-read text-[1.5rem] font-bold leading-tight">
              Flashcards
              {typeof cardsDue === 'number' ? <span className="num text-ink-3"> · {cardsDue} due</span> : null}
            </p>
            <p className="mt-2 text-[0.9375rem] leading-relaxed text-ink-2">
              Due cards first, then ones you have not seen. Rate each one and it comes back when it should.
            </p>
          </button>

          <button
            type="button"
            disabled={!ready || startQuiz.isPending}
            onClick={() =>
              startQuiz.mutate(
                {
                  scopeType,
                  ...(scopeType === 'all' ? {} : { scopeId }),
                  level: chosenLevel,
                  mode,
                  count: 10,
                },
                {
                  onSuccess: (s) =>
                    navigate(`/review/quiz/${s.sessionId}`, {
                      state: { questions: s.questions, scopeLabel: scopeLabel(scopeType, scopeId, topics, modules) },
                    }),
                },
              )
            }
            className="bg-surface p-6 text-left transition-colors hover:bg-accent-soft disabled:cursor-not-allowed disabled:opacity-50"
          >
            <p className="label">Ten questions</p>
            <p className="mt-2 font-read text-[1.5rem] font-bold leading-tight">
              {startQuiz.isPending ? 'Starting…' : 'Quick quiz'}
            </p>
            <p className="mt-2 text-[0.9375rem] leading-relaxed text-ink-2">
              Weighted towards what you got wrong last time. Explanation after every answer.
            </p>
          </button>
        </div>

        {!ready ? (
          <p className="mt-3 text-[0.8125rem] text-ink-3">Choose a {scopeType} above to continue.</p>
        ) : null}
        {startQuiz.isError ? (
          <div className="mt-4">
            <ErrorState error={startQuiz.error} retry={() => startQuiz.reset()} />
          </div>
        ) : null}
      </section>
    </div>
  );
}

function scopeLabel(
  type: ScopeType,
  id: string,
  topics: { id: string; title: string }[],
  modules: { id: string; title: string }[],
): string {
  if (type === 'all') return 'Everything';
  const list = type === 'module' ? modules : topics;
  return list.find((x) => x.id === id)?.title ?? id;
}

// ================================================================= flashcards

const RATINGS = [
  { rating: 1 as const, label: 'Again', hint: 'Blanked' },
  { rating: 2 as const, label: 'Hard', hint: 'Dragged it up' },
  { rating: 3 as const, label: 'Good', hint: 'Knew it' },
  { rating: 4 as const, label: 'Easy', hint: 'Instant' },
];

function FlashcardRunner() {
  const [params] = useSearchParams();
  const topicId = params.get('topicId') ?? undefined;
  const due = useDueCards(20, topicId);
  const review = useReviewCard();

  // Snapshot the deck once: rating a card invalidates the due query, and the deck must not shuffle
  // under the reader mid-session.
  const [deck, setDeck] = useState<Flashcard[] | null>(null);
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [tally, setTally] = useState<Record<number, number>>({});

  useEffect(() => {
    if (due.data && !deck) setDeck(due.data);
  }, [due.data, deck]);

  const card = deck?.[index];

  const rate = useCallback(
    (rating: 1 | 2 | 3 | 4) => {
      if (!card || !flipped) return;
      review.mutate({ cardId: card.id, rating });
      setTally((t) => ({ ...t, [rating]: (t[rating] ?? 0) + 1 }));
      setFlipped(false);
      setIndex((i) => i + 1);
    },
    [card, flipped, review],
  );

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        setFlipped((f) => !f);
      } else if (['1', '2', '3', '4'].includes(e.key)) {
        e.preventDefault();
        rate(Number(e.key) as 1 | 2 | 3 | 4);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [rate]);

  if (due.isPending && !deck) return <LoadingLines rows={5} />;
  if (due.isError && !deck)
    return (
      <RunnerFrame title="Flashcards">
        <ErrorState error={due.error} retry={() => void due.refetch()} />
      </RunnerFrame>
    );

  if (deck && deck.length === 0)
    return (
      <RunnerFrame title="Flashcards">
        <Empty
          title="Nothing is due"
          action={
            <Link to="/review" className="label border border-rule-strong px-2.5 py-1.5 text-ink hover:border-ink-3">
              Back to review
            </Link>
          }
        >
          Every card in {topicId ? 'this topic' : 'the deck'} is scheduled for later. Read a lesson and new cards
          will appear here.
        </Empty>
      </RunnerFrame>
    );

  if (deck && !card) {
    const reviewed = Object.values(tally).reduce((a, b) => a + b, 0);
    return (
      <RunnerFrame title="Flashcards">
        <Panel className="p-6">
          <p className="label">Session done</p>
          <h2 className="mt-2 font-read text-2xl font-bold">
            <span className="num">{reviewed}</span> {reviewed === 1 ? 'card' : 'cards'} reviewed
          </h2>
          <dl className="mt-5 grid grid-cols-4 gap-px border border-rule bg-rule">
            {RATINGS.map((r) => (
              <div key={r.rating} className="bg-surface p-3 text-center">
                <dt className="label">{r.label}</dt>
                <dd className="mt-1 font-read text-xl font-bold num">{tally[r.rating] ?? 0}</dd>
              </div>
            ))}
          </dl>
          <div className="mt-6 flex flex-wrap gap-3">
            <Button
              variant="solid"
              onClick={() => {
                setDeck(null);
                setIndex(0);
                setTally({});
                void due.refetch();
              }}
            >
              Another round
            </Button>
            <Link to="/review" className="label self-center text-ink-3 hover:text-ink">
              Back to review
            </Link>
          </div>
        </Panel>
      </RunnerFrame>
    );
  }

  if (!card || !deck) return <LoadingLines rows={5} />;

  return (
    <RunnerFrame
      title="Flashcards"
      progress={{ done: index, total: deck.length }}
      right={`${deck.length - index} left`}
    >
      <div className="flex min-h-[46vh] flex-col">
        <button
          type="button"
          onClick={() => setFlipped((f) => !f)}
          aria-expanded={flipped}
          className="flex flex-1 flex-col justify-center border border-rule bg-surface p-6 text-left sm:p-10"
        >
          <p className="font-read text-[1.4rem] font-bold leading-snug sm:text-[1.7rem]">{card.front}</p>
          {flipped ? (
            <p className="mt-6 border-t border-rule pt-5 font-read text-[1.0625rem] leading-relaxed text-ink-2">
              {card.back}
            </p>
          ) : (
            <p className="label mt-8">
              <Key>Space</Key> or tap to flip
            </p>
          )}
        </button>

        {review.isError ? (
          <div className="mt-3">
            <InlineNotice tone="warn">
              That rating was not saved — the review API did not answer. The card will be due again.
            </InlineNotice>
          </div>
        ) : null}

        <div className="mt-4 grid grid-cols-2 gap-px bg-rule sm:grid-cols-4">
          {RATINGS.map((r) => (
            <button
              key={r.rating}
              type="button"
              disabled={!flipped}
              onClick={() => rate(r.rating)}
              className="bg-surface px-3 py-4 text-center transition-colors hover:bg-accent-soft disabled:cursor-not-allowed disabled:opacity-40"
            >
              <span className="label block">
                <Key>{r.rating}</Key>
              </span>
              <span className="mt-1.5 block font-ui text-sm font-semibold text-ink">{r.label}</span>
              <span className="mt-0.5 block text-[0.75rem] text-ink-3">{r.hint}</span>
            </button>
          ))}
        </div>
        {!flipped ? <p className="label mt-3 text-center">Flip before you rate.</p> : null}
      </div>
    </RunnerFrame>
  );
}

// ================================================================= quiz

interface QuizState {
  questions?: QuizQuestionPublic[];
  scopeLabel?: string;
}

interface Feedback {
  correct: boolean;
  answer: number[];
  explanation: string;
}

function QuizRunner() {
  const { sessionId = '' } = useParams();
  const location = useLocation();
  const state = (location.state ?? {}) as QuizState;
  const questions = state.questions ?? [];

  const answer = useAnswerQuiz(sessionId);
  const finish = useFinishQuiz(sessionId);

  const [index, setIndex] = useState(0);
  const [chosen, setChosen] = useState<number[]>([]);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [wrong, setWrong] = useState<QuizQuestionPublic[]>([]);
  const [score, setScore] = useState<{ correctCount: number; totalCount: number } | null>(null);

  const q = questions[index];
  const multi = q?.type === 'multi';

  const submit = useCallback(() => {
    if (!q || chosen.length === 0 || feedback) return;
    answer.mutate(
      { questionId: q.id, chosen: [...chosen].sort((a, b) => a - b) },
      {
        onSuccess: (r) => {
          setFeedback(r);
          if (!r.correct) setWrong((w) => [...w, q]);
        },
      },
    );
  }, [answer, chosen, feedback, q]);

  const next = useCallback(() => {
    setFeedback(null);
    setChosen([]);
    if (index + 1 < questions.length) setIndex((i) => i + 1);
    else finish.mutate(undefined, { onSuccess: setScore });
  }, [finish, index, questions.length]);

  const toggle = useCallback(
    (i: number) => {
      if (feedback) return;
      setChosen((c) => (multi ? (c.includes(i) ? c.filter((x) => x !== i) : [...c, i]) : [i]));
    },
    [feedback, multi],
  );

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        if (feedback) next();
        else submit();
      } else if (/^[1-9]$/.test(e.key)) {
        e.preventDefault();
        toggle(Number(e.key) - 1);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [feedback, next, submit, toggle]);

  if (questions.length === 0)
    return (
      <RunnerFrame title="Quick quiz">
        <Empty
          title="This quiz is not in this browser any more"
          action={
            <Link to="/review" className="label border border-rule-strong px-2.5 py-1.5 text-ink hover:border-ink-3">
              Start a new quiz
            </Link>
          }
        >
          A quiz session lives in the page you started it from, so a reload or a pasted link loses it. Starting a
          fresh one takes a second.
        </Empty>
      </RunnerFrame>
    );

  if (score)
    return (
      <RunnerFrame title="Quick quiz">
        <Panel className="p-6">
          <p className="label">{state.scopeLabel ?? 'Result'}</p>
          <h2 className="mt-2 font-read text-[2rem] font-bold leading-none">
            <span className="num">{score.correctCount}</span>
            <span className="text-ink-3"> / {score.totalCount}</span>
          </h2>
          <Meter
            value={score.totalCount ? score.correctCount / score.totalCount : 0}
            label={`${score.correctCount} of ${score.totalCount} correct`}
            className="mt-4"
          />
          {wrong.length > 0 ? (
            <div className="mt-6 border-t border-rule pt-4">
              <h3 className="label">Worth another look</h3>
              <ul className="mt-3 space-y-3">
                {wrong.map((w) => (
                  <li key={w.id} className="border-l-2 border-l-[color:var(--c-gotcha)] pl-3">
                    <p className="font-read text-[1rem] leading-snug">{w.prompt}</p>
                    <Link to={`/topics/${w.topicId}`} className="label mt-1 inline-block text-accent hover:underline">
                      Read {w.topicId}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="mt-5 text-sm text-ink-2">Everything correct. Nothing to revisit.</p>
          )}
          <div className="mt-6">
            <Link
              to="/review"
              className="inline-flex border border-accent bg-accent px-4 py-2.5 font-ui text-sm font-medium text-accent-ink hover:opacity-90"
            >
              Back to review
            </Link>
          </div>
        </Panel>
      </RunnerFrame>
    );

  if (finish.isPending) return <LoadingLines rows={4} />;
  if (!q) return <LoadingLines rows={4} />;

  return (
    <RunnerFrame
      title="Quick quiz"
      progress={{ done: index, total: questions.length }}
      right={`${index + 1} of ${questions.length}`}
    >
      <div>
        <fieldset className="border border-rule bg-surface p-5 sm:p-7">
          <legend className="sr-only">Question {index + 1}</legend>
          <p className="label">{multi ? 'Choose all that apply' : 'Choose one'}</p>
          <p className="mt-2.5 font-read text-[1.25rem] font-bold leading-snug sm:text-[1.4rem]">{q.prompt}</p>

          <ul className="mt-5 space-y-px bg-rule">
            {q.options.map((opt, i) => {
              const picked = chosen.includes(i);
              const isAnswer = feedback?.answer.includes(i) ?? false;
              const tone = !feedback
                ? picked
                  ? 'bg-accent-soft'
                  : 'bg-surface hover:bg-accent-soft'
                : isAnswer
                  ? 'bg-[color:var(--c-tip-bg)]'
                  : picked
                    ? 'bg-[color:var(--c-gotcha-bg)]'
                    : 'bg-surface';
              return (
                <li key={i}>
                  <button
                    type="button"
                    onClick={() => toggle(i)}
                    disabled={!!feedback}
                    aria-pressed={picked}
                    className={`flex w-full items-start gap-3 p-3.5 text-left transition-colors disabled:cursor-default ${tone}`}
                  >
                    <span className="label mt-[3px] shrink-0">
                      <Key>{i + 1}</Key>
                    </span>
                    <span className="font-ui text-[0.9375rem] leading-relaxed text-ink">{opt}</span>
                    {feedback && isAnswer ? (
                      <span className="label ml-auto shrink-0 text-[color:var(--c-tip)]">Correct</span>
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>
        </fieldset>

        {feedback ? (
          <div
            className="mt-4 border-l-2 py-3 pl-4 pr-3"
            style={{
              borderColor: feedback.correct ? 'var(--c-tip)' : 'var(--c-gotcha)',
              backgroundColor: feedback.correct ? 'var(--c-tip-bg)' : 'var(--c-gotcha-bg)',
            }}
          >
            <p className="label" style={{ color: feedback.correct ? 'var(--c-tip)' : 'var(--c-gotcha)' }}>
              {feedback.correct ? 'Correct' : 'Not quite'}
            </p>
            <p className="mt-1.5 font-read text-[1rem] leading-relaxed">{feedback.explanation}</p>
          </div>
        ) : null}

        {answer.isError ? (
          <div className="mt-4">
            <ErrorState error={answer.error} retry={() => answer.reset()} />
          </div>
        ) : null}
        {finish.isError ? (
          <div className="mt-4">
            <ErrorState error={finish.error} retry={() => finish.reset()} />
          </div>
        ) : null}

        <div className="mt-5 flex items-center gap-3">
          {feedback ? (
            <Button variant="solid" size="lg" onClick={next} className="flex-1 sm:flex-none">
              {index + 1 < questions.length ? 'Next question' : 'See the score'}
            </Button>
          ) : (
            <Button
              variant="solid"
              size="lg"
              onClick={submit}
              disabled={chosen.length === 0 || answer.isPending}
              className="flex-1 sm:flex-none"
            >
              {answer.isPending ? 'Checking…' : 'Submit answer'}
            </Button>
          )}
          <span className="label hidden sm:inline">
            <Key>1</Key>–<Key>{Math.min(9, q.options.length)}</Key> to choose · <Key>Enter</Key> to{' '}
            {feedback ? 'continue' : 'submit'}
          </span>
        </div>
      </div>
    </RunnerFrame>
  );
}

// ================================================================= shared runner chrome

function RunnerFrame({
  title,
  progress,
  right,
  children,
}: {
  title: string;
  progress?: { done: number; total: number };
  right?: string;
  children: ReactNode;
}) {
  return (
    <div className="measure">
      <div className="flex items-baseline justify-between gap-4 border-b border-rule pb-2">
        <Link to="/review" className="label hover:text-ink">
          ← {title}
        </Link>
        {right ? <span className="label num">{right}</span> : null}
      </div>
      {progress && progress.total > 0 ? (
        <Meter
          value={progress.done / progress.total}
          label={`${progress.done} of ${progress.total} done`}
          className="mt-0"
        />
      ) : null}
      <div className="mt-5">{children}</div>
    </div>
  );
}

function Key({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-block min-w-[1.4em] border border-rule-strong bg-surface-2 px-1 text-center font-mono text-[0.6875rem] font-medium not-italic text-ink-2">
      {children}
    </kbd>
  );
}
