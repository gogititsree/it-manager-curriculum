/**
 * ModulePage.
 * Data: useManifest() (find module), getDashboard().modules[moduleId], getTopicSettings().
 * Shows: whyItMatters, then the topic list in order. Each row: title, summary, the level currently
 * selected for it, completion at that level, "stub" badge where lessons are not authored yet.
 *
 * The topic list is a ruled index, not a grid of cards: it is read down the left edge, and the
 * selected level and completion sit in a fixed right-hand column so they line up row to row.
 */
import { lessonCompletion, LEVELS, lessonId, type Level, type TopicMeta } from '@itmc/core';
import { Link, useParams } from 'react-router-dom';
import { Badge, Empty, ErrorState, InlineNotice, LoadingLines, Meter, SectionHeading } from '../components/ui';
import { LEVEL_LABEL, minutes, pct } from '../lib/format';
import { useDashboard, useLessonProgress, useManifest, useSettingsView } from '../lib/hooks';
import { resolveTopicView } from '../lib/view-model';

export function ModulePage() {
  const { moduleId } = useParams();
  const manifest = useManifest();
  const dashboard = useDashboard();
  const settings = useSettingsView();

  if (manifest.isPending) return <LoadingLines rows={6} />;
  if (manifest.isError) return <ErrorState error={manifest.error} retry={() => void manifest.refetch()} />;

  const mod = manifest.data?.modules.find((m) => m.id === moduleId);
  if (!mod)
    return (
      <Empty title="No such module" action={<Link className="label text-accent underline" to="/">Back to the curriculum</Link>}>
        This build of the content has no module called <code className="font-mono">{moduleId}</code>.
      </Empty>
    );

  const topics = [...mod.topics].sort((a, b) => a.order - b.order);

  return (
    <div>
      <nav aria-label="Breadcrumb" className="label flex items-center gap-2">
        <Link to="/" className="hover:text-ink">
          Curriculum
        </Link>
        <span aria-hidden="true">/</span>
        <span className="text-ink">{mod.title}</span>
      </nav>

      <header className="measure mt-4">
        <h1 className="font-read text-[2rem] font-bold leading-tight tracking-[-0.01em] md:text-[2.3rem]">{mod.title}</h1>
        <p className="mt-2 font-read text-[1.0625rem] italic leading-relaxed text-ink-2">{mod.tagline}</p>
        <div className="mt-6 border-l-2 border-accent bg-surface py-3 pl-4 pr-3">
          <p className="label">Why it matters</p>
          <p className="mt-1.5 font-read text-[1rem] leading-relaxed">{mod.whyItMatters}</p>
        </div>
      </header>

      <section className="mt-10" aria-labelledby="topics">
        <SectionHeading aside={`${topics.length} topics`}>
          <span id="topics">Topics</span>
        </SectionHeading>

        {dashboard.isError ? (
          <div className="mb-4">
            <InlineNotice tone="warn">
              Completion is unavailable — <code className="font-mono">/api/progress/dashboard</code> did not answer.
            </InlineNotice>
          </div>
        ) : null}

        <ul className="space-y-px bg-rule">
          {topics.map((topic) => (
            <TopicRow
              key={topic.id}
              topic={topic}
              level={resolveTopicView(topic.id, settings.user, settings.topics).level}
            />
          ))}
        </ul>
      </section>
    </div>
  );
}

function TopicRow({ topic, level }: { topic: TopicMeta; level: Level }) {
  const summary = topic.lessons[level];
  const id = lessonId(topic.id, level);
  const isStub = !summary || summary.status === 'stub';
  // The dashboard DTO carries module rollups, not per-topic rows, so the row is read directly.
  // Skipped for stubs: there is nothing to have completed.
  const progress = useLessonProgress(isStub ? undefined : id);
  const completion = lessonCompletion(summary, progress.data ?? undefined);
  const authoredLevels = LEVELS.filter((l) => topic.lessons[l] && topic.lessons[l]!.status !== 'stub');

  return (
    <li className="bg-surface">
      <Link
        to={`/topics/${topic.moduleId}/${topic.slug}`}
        className="grid gap-x-6 gap-y-3 p-5 transition-colors hover:bg-accent-soft sm:grid-cols-[minmax(0,1fr)_11rem]"
      >
        <div className="min-w-0">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h3 className="font-read text-[1.2rem] font-bold leading-snug">{topic.title}</h3>
            {isStub ? <Badge tone="quiet">Not written yet</Badge> : null}
            {summary?.status === 'draft' ? <Badge tone="quiet">Draft</Badge> : null}
          </div>
          <p className="mt-1.5 max-w-prose text-[0.9375rem] leading-relaxed text-ink-2">{topic.summary}</p>
          <p className="label mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1">
            {summary ? <span className="num">{minutes(summary.estimatedMinutes)}</span> : null}
            {topic.questionCount > 0 ? <span className="num">{topic.questionCount} questions</span> : null}
            {topic.cardCount > 0 ? <span className="num">{topic.cardCount} cards</span> : null}
            {authoredLevels.length > 0 && authoredLevels.length < 3 ? (
              <span>written: {authoredLevels.map((l) => LEVEL_LABEL[l].toLowerCase()).join(', ')}</span>
            ) : null}
          </p>
        </div>

        <div className="sm:text-right">
          <p className="label">{LEVEL_LABEL[level]}</p>
          {isStub ? (
            <p className="mt-1.5 text-[0.8125rem] text-ink-3">no lesson at this level</p>
          ) : (
            <>
              <p className="mt-1.5 font-read text-[1.25rem] font-bold leading-none num">{pct(completion)}</p>
              <Meter value={completion} label={`${topic.title}: ${pct(completion)} complete`} className="mt-2" />
            </>
          )}
        </div>
      </Link>
    </li>
  );
}
