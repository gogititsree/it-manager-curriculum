/**
 * Dashboard.
 * Data: useManifest() + api.getDashboard().
 * Shows: "Resume" card (recent[0]), streak + minutes today vs daily goal, "N cards due" button that
 * links to /review/cards, then one card per module with selectedPath completion and a small
 * three-segment bar for per-level completion (beginner / intermediate / rusty).
 *
 * The manifest is the page. Progress decorates it. If /api/progress/dashboard is not up, the
 * curriculum still lists and every topic is still reachable — the numbers are simply absent, and one
 * line says why. No gamification beyond the streak and the minutes (docs/ARCHITECTURE.md §8).
 */
import { LEVELS, parseLessonId, type ModuleProgress } from '@itmc/core';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Badge, ErrorState, InlineNotice, LevelMeter, LoadingLines, Meter, Panel, SectionHeading } from '../components/ui';
import { LEVEL_LABEL, pct, relativeDay } from '../lib/format';
import { useDashboard, useManifest, useSettingsView } from '../lib/hooks';

export function Dashboard() {
  const manifest = useManifest();
  const dashboard = useDashboard();
  const settings = useSettingsView();
  const goal = settings.user.dailyGoalMinutes;

  if (manifest.isPending) return <LoadingLines rows={7} />;
  if (manifest.isError) return <ErrorState error={manifest.error} retry={() => void manifest.refetch()} />;

  const modules = [...(manifest.data?.modules ?? [])].sort((a, b) => a.order - b.order);
  const d = dashboard.data;
  const resume = d?.recent?.[0];

  return (
    <div>
      <header className="measure">
        <p className="label">The curriculum</p>
        <h1 className="mt-2 font-read text-[2rem] font-bold leading-tight tracking-[-0.01em] md:text-[2.4rem]">
          Six modules, three ways through each one.
        </h1>
        <p className="mt-3 font-read text-[1.0625rem] leading-relaxed text-ink-2">
          Pick a level per topic and a lens to read it through. Nothing is locked, and nothing expires.
        </p>
      </header>

      {/* ---- Today ---- */}
      <section className="mt-10" aria-labelledby="today">
        <SectionHeading>
          <span id="today">Today</span>
        </SectionHeading>

        {dashboard.isPending ? (
          <LoadingLines rows={2} />
        ) : dashboard.isError ? (
          <InlineNotice tone="warn">
            Streak, minutes and due counts are unavailable — <code className="font-mono">/api/progress/dashboard</code>{' '}
            did not answer. The curriculum below still works.
          </InlineNotice>
        ) : d ? (
          <div className="grid gap-px border border-rule bg-rule sm:grid-cols-3">
            <Stat label="Streak" value={`${d.streakDays}`} unit={d.streakDays === 1 ? 'day' : 'days'} />
            <Stat label="Minutes today" value={`${d.minutesToday}`} unit={`of ${goal}`}>
              <Meter value={goal > 0 ? Math.min(1, d.minutesToday / goal) : 0} label={`${d.minutesToday} of ${goal} minutes`} />
            </Stat>
            <Link
              to="/review/cards"
              className="block bg-surface p-4 transition-colors hover:bg-accent-soft"
              aria-label={`${d.cardsDue} cards due for review`}
            >
              <p className="label">Cards due</p>
              <p className="mt-1.5 font-read text-[1.75rem] font-bold leading-none num">{d.cardsDue}</p>
              <p className="mt-1.5 text-[0.8125rem] text-ink-3">
                {d.cardsDue > 0 ? 'Review them →' : 'Nothing waiting'}
              </p>
            </Link>
          </div>
        ) : null}

        {resume ? (
          <Link
            to={topicHref(resume.lessonId)}
            className="mt-4 block border border-rule border-l-2 border-l-accent bg-surface p-4 transition-colors hover:bg-accent-soft"
          >
            <p className="label">Resume · {relativeDay(resume.lastViewedAt)}</p>
            <p className="mt-1.5 font-read text-lg font-bold leading-snug">{resume.title}</p>
            <div className="mt-3 flex items-center gap-3">
              <Meter value={resume.completion} label={`${pct(resume.completion)} complete`} className="max-w-[12rem]" />
              <span className="label num">{pct(resume.completion)}</span>
            </div>
          </Link>
        ) : null}
      </section>

      {/* ---- Modules ---- */}
      <section className="mt-12" aria-labelledby="modules">
        <SectionHeading aside={`${modules.length} modules`}>
          <span id="modules">Modules</span>
        </SectionHeading>

        <ul className="space-y-px bg-rule">
          {modules.map((m) => {
            const mp: ModuleProgress | undefined = d?.modules?.[m.id];
            const authoredCount = m.topics.filter((t) => LEVELS.some((l) => t.lessons[l] && t.lessons[l]!.status !== 'stub')).length;
            return (
              <li key={m.id} className="bg-surface">
                <Link to={`/modules/${m.id}`} className="block p-5 transition-colors hover:bg-accent-soft">
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <h3 className="font-read text-[1.3rem] font-bold leading-snug">{m.title}</h3>
                    <span className="label">{m.topics.length} topics</span>
                    {authoredCount === 0 ? <Badge tone="quiet">Not written yet</Badge> : null}
                  </div>
                  <p className="mt-1.5 max-w-prose text-[0.9375rem] leading-relaxed text-ink-2">{m.tagline}</p>

                  {mp ? (
                    <div className="mt-4 grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,14rem)]">
                      <div>
                        <p className="label">
                          Your path · {mp.selectedPath.topicsCompleted}/{mp.selectedPath.topicsTotal} topics
                        </p>
                        <div className="mt-2 flex items-center gap-3">
                          <Meter value={mp.selectedPath.completion} label={`Selected path ${pct(mp.selectedPath.completion)}`} />
                          <span className="label num shrink-0">{pct(mp.selectedPath.completion)}</span>
                        </div>
                      </div>
                      <LevelMeter
                        values={LEVELS.map((l) => ({ label: LEVEL_LABEL[l], value: mp.perLevel[l].completion }))}
                      />
                    </div>
                  ) : null}
                </Link>
              </li>
            );
          })}
        </ul>
      </section>

      <p className="label mt-10 text-ink-3">
        Content build {manifest.data?.version} · {relativeDay(manifest.data?.builtAt) || 'unknown date'}
      </p>
    </div>
  );
}

function Stat({
  label,
  value,
  unit,
  children,
}: {
  label: string;
  value: string;
  unit?: string;
  children?: ReactNode;
}) {
  return (
    <div className="bg-surface p-4">
      <p className="label">{label}</p>
      <p className="mt-1.5 font-read text-[1.75rem] font-bold leading-none">
        <span className="num">{value}</span>
        {unit ? <span className="ml-1.5 font-ui text-[0.8125rem] font-medium text-ink-3">{unit}</span> : null}
      </p>
      {children ? <div className="mt-3">{children}</div> : null}
    </div>
  );
}

/** "java/oop-fundamentals@beginner" -> "/topics/java/oop-fundamentals". Ids are parsed by core only. */
function topicHref(lessonId: string): string {
  try {
    return `/topics/${parseLessonId(lessonId).topicId}`;
  } catch {
    return '/';
  }
}
