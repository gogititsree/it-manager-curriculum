/**
 * TopicPage — the core reading screen.
 * Data: manifest topic, resolveTopicView() for level/mode, useLesson(lessonId(topic.id, level)),
 * useLessonProgress(lessonId).
 * Layout: sticky toolbar [LevelSelector | ModeToggle | est. minutes | completion], then
 * LessonRenderer. Changing level calls putTopicSettings and swaps the lesson (progress is per level,
 * so the completion indicator changes too). Fire markLessonViewed on mount.
 * Footer: "Quiz me on this topic" -> startQuiz({scopeType:'topic', scopeId, level, mode}).
 *
 * The toolbar is the feature (docs/ARCHITECTURE.md §8): it sits under the app bar at every width and
 * never scrolls away, because level and mode are the two things the reader changes mid-lesson.
 */
import { LEVELS, lessonCompletion, type Level, type LessonSummary, type TopicMeta } from '@itmc/core';
import { useMemo } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { LessonRenderer } from '../components/LessonRenderer';
import { LevelSelector } from '../components/LevelSelector';
import { ModeToggle } from '../components/ModeToggle';
import { Button, Empty, ErrorState, InlineNotice, LoadingLines, Meter, Panel } from '../components/ui';
import { LEVEL_LABEL, minutes, pct } from '../lib/format';
import { useCompleteSection, useLessonView, useManifest, useStartQuiz, useTopicView } from '../lib/hooks';

export function TopicPage() {
  const { moduleId, slug } = useParams();
  const topicId = `${moduleId}/${slug}`;
  const manifest = useManifest();

  const topic = useMemo(() => {
    const mod = manifest.data?.modules.find((m) => m.id === moduleId);
    return mod?.topics.find((t) => t.id === topicId);
  }, [manifest.data, moduleId, topicId]);

  const view = useTopicView(topicId);

  if (manifest.isPending) return <LoadingLines rows={6} />;
  if (manifest.isError) return <ErrorState error={manifest.error} retry={() => void manifest.refetch()} />;
  if (!topic)
    return (
      <Empty title="No such topic" action={<Link className="label text-accent underline" to="/">Back to the curriculum</Link>}>
        Nothing in this build of the content is called <code className="font-mono">{topicId}</code>.
      </Empty>
    );

  return <TopicView topic={topic} view={view} key={topic.id} />;
}

function TopicView({ topic, view }: { topic: TopicMeta; view: ReturnType<typeof useTopicView> }) {
  const navigate = useNavigate();
  const { level, mode } = view;
  const summary: LessonSummary | undefined = topic.lessons[level];
  const { lessonId: id, lesson, progress } = useLessonView(topic.id, level);
  const complete = useCompleteSection(id ?? '');
  const quiz = useStartQuiz();

  const completedIds = useMemo(() => new Set(progress.data?.completedSectionIds ?? []), [progress.data]);
  const completion = lessonCompletion(summary, progress.data ?? undefined);
  const available = LEVELS.filter((l) => !!topic.lessons[l]);
  const authoredElsewhere = LEVELS.filter((l) => l !== level && topic.lessons[l] && topic.lessons[l]!.status !== 'stub');

  return (
    <div>
      {/* ---- Identity: which topic, in which module ---- */}
      <nav aria-label="Breadcrumb" className="label flex flex-wrap items-center gap-2">
        <Link to="/" className="hover:text-ink">
          Curriculum
        </Link>
        <span aria-hidden="true">/</span>
        <Link to={`/modules/${topic.moduleId}`} className="hover:text-ink">
          {topic.moduleId}
        </Link>
        <span aria-hidden="true">/</span>
        <span className="text-ink">{topic.title}</span>
      </nav>

      {/* ---- The toolbar ---- */}
      <div className="sticky top-12 z-30 -mx-4 mt-4 border-y border-rule bg-paper/95 px-4 py-2.5 backdrop-blur-[2px] sm:-mx-6 sm:px-6">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <LevelSelector value={level} onChange={view.setLevel} available={available} />
          <ModeToggle value={mode} onChange={view.setMode} />
          <div className="ml-auto flex min-w-[8rem] flex-1 items-center gap-3 sm:flex-none">
            <span className="label num whitespace-nowrap">
              {summary ? minutes(summary.estimatedMinutes) : '—'}
            </span>
            <span aria-hidden="true" className="h-3 w-px bg-rule" />
            <span className="label num whitespace-nowrap">
              {summary && summary.sectionCount > 0
                ? `${Math.round(completion * summary.sectionCount)}/${summary.sectionCount} done`
                : 'no sections'}
            </span>
            <Meter value={completion} label={`Lesson ${pct(completion)} complete`} className="min-w-[3rem] flex-1" />
          </div>
        </div>
        {view.saveFailed ? (
          <p className="label mt-2 text-[color:var(--c-warning)]">
            Level and mode are set for this browser only — the settings API did not answer.
          </p>
        ) : null}
      </div>

      {/* ---- The lesson ---- */}
      <div className="mt-8">
        {lesson.isPending ? (
          <LoadingLines rows={8} />
        ) : lesson.isError ? (
          <ErrorState error={lesson.error} retry={() => void lesson.refetch()} />
        ) : !lesson.data || lesson.data.status === 'stub' || lesson.data.sections.length === 0 ? (
          <NotWrittenYet
            title={summary?.title ?? topic.title}
            level={level}
            topicTitle={topic.title}
            summary={topic.summary}
            alternatives={authoredElsewhere}
            onPick={view.setLevel}
          />
        ) : (
          <>
            {lesson.data.status === 'draft' ? (
              <div className="measure mb-8">
                <InlineNotice tone="warn">
                  Draft. This lesson is written but not reviewed, so expect rough edges.
                </InlineNotice>
              </div>
            ) : null}

            {progress.isError ? (
              <div className="measure mb-8">
                <InlineNotice tone="warn">
                  Progress is not being recorded — <code className="font-mono">/api/progress</code> did not answer.
                  You can still read; ticks will not stick.
                </InlineNotice>
              </div>
            ) : null}

            {complete.isError ? (
              <div className="measure mb-8">
                <ErrorState error={complete.error} retry={() => complete.reset()} />
              </div>
            ) : null}

            <LessonRenderer
              lesson={lesson.data}
              mode={mode}
              completed={completedIds}
              onSectionDone={(sectionId) => complete.mutate(sectionId)}
            />

            {/* ---- Footer: what to do when the reading is done ---- */}
            <footer className="measure mt-16 border-t border-rule pt-6">
              <h2 className="label">Next</h2>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <Button
                  variant="solid"
                  disabled={topic.questionCount === 0 || quiz.isPending}
                  onClick={() =>
                    quiz.mutate(
                      { scopeType: 'topic', scopeId: topic.id, level, mode, count: 10 },
                      {
                        onSuccess: (session) =>
                          navigate(`/review/quiz/${session.sessionId}`, {
                            state: { questions: session.questions, scopeLabel: topic.title },
                          }),
                      },
                    )
                  }
                >
                  {quiz.isPending ? 'Starting…' : 'Quiz me on this topic'}
                </Button>
                {topic.cardCount > 0 ? (
                  <Link
                    to={`/review/cards?topicId=${encodeURIComponent(topic.id)}`}
                    className="inline-flex items-center border border-rule-strong bg-surface px-3.5 py-2 font-ui text-sm font-medium text-ink hover:border-ink-3"
                  >
                    Flashcards ({topic.cardCount})
                  </Link>
                ) : null}
                <Link to={`/modules/${topic.moduleId}`} className="label text-ink-3 hover:text-ink">
                  Back to {topic.moduleId}
                </Link>
              </div>
              {topic.questionCount === 0 ? (
                <p className="mt-3 text-[0.8125rem] text-ink-3">No quiz questions have been written for this topic yet.</p>
              ) : null}
              {quiz.isError ? (
                <div className="mt-4">
                  <ErrorState error={quiz.error} retry={() => quiz.reset()} />
                </div>
              ) : null}
            </footer>
          </>
        )}
      </div>
    </div>
  );
}

/**
 * The common path while the curriculum is being written: this level exists in the plan but has no
 * body yet. It must read as a deliberate state, not as a failure or an empty lesson.
 */
function NotWrittenYet({
  title,
  level,
  topicTitle,
  summary,
  alternatives,
  onPick,
}: {
  title: string;
  level: Level;
  topicTitle: string;
  summary: string;
  alternatives: Level[];
  onPick: (l: Level) => void;
}) {
  return (
    <Panel className="measure border-l-2 border-l-rule-strong p-6 sm:p-8">
      <p className="label">{LEVEL_LABEL[level]} · Not written yet</p>
      <h1 className="mt-3 font-read text-[1.7rem] font-bold leading-tight">{title}</h1>
      <p className="mt-3 font-read text-[1.0625rem] leading-relaxed text-ink-2">{summary}</p>
      <p className="mt-4 text-sm leading-relaxed text-ink-2">
        The {LEVEL_LABEL[level].toLowerCase()} lesson for {topicTitle} is planned but has no body yet. It is a
        placeholder in the content build, which is why it has no sections to tick off.
      </p>

      {alternatives.length > 0 ? (
        <div className="mt-6 border-t border-rule pt-4">
          <h2 className="label">Written at another level</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {alternatives.map((l) => (
              <Button key={l} onClick={() => onPick(l)} size="sm">
                Read the {LEVEL_LABEL[l].toLowerCase()} lesson
              </Button>
            ))}
          </div>
        </div>
      ) : (
        <p className="mt-6 border-t border-rule pt-4 text-sm text-ink-2">
          No level of this topic has been written yet. Its quiz questions and flashcards, if any, still work.
        </p>
      )}
    </Panel>
  );
}
