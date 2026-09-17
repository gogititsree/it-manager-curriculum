/**
 * SettingsPage.
 * Default level, default mode, daily goal, theme — and, first, whatever this build's data story is.
 *
 * Three groups, in the order they matter on a fresh install: where the data lives, the defaults that
 * decide what a new topic opens as, and the appearance. Saving is explicit — these are preferences
 * the user sets once, not a control surface, so an auto-save would only make it feel unpredictable.
 *
 * The first group is the only part of the app that knows the build mode exists:
 *   server mode — the API token (stored in localStorage 'itmc.token').
 *   static mode — there is no token and no server, so instead: a plain statement that progress lives
 *                 in this browser only, and the download / restore controls that make that safe.
 */
import { LEVELS, MODES, type Level, type Mode, type UserSettings } from '@itmc/core';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { Segmented } from '../components/Segmented';
import { Button, ErrorState, Field, InlineNotice, Panel, SectionHeading, inputClass } from '../components/ui';
import { isStaticMode, localState } from '../lib/api';
import { LEVEL_LABEL, MODE_LABEL } from '../lib/format';
import { usePutUserSettings, useUserSettings } from '../lib/hooks';
import { readLocalUserSettings } from '../lib/local-settings';
import { THEMES, setThemePref, useThemePref, type ThemePref } from '../lib/theme';
import { clearToken, setToken, useToken } from '../lib/token';

const THEME_LABEL: Record<ThemePref, string> = { system: 'System', light: 'Light', dark: 'Dark' };

export function SettingsPage() {
  const query = useUserSettings();
  const put = usePutUserSettings();
  const theme = useThemePref();

  const [draft, setDraft] = useState<UserSettings>(() => readLocalUserSettings());
  const [dirty, setDirty] = useState(false);

  // Adopt server values until the user starts editing; after that their draft wins.
  useEffect(() => {
    if (query.data && !dirty) setDraft(query.data);
  }, [query.data, dirty]);

  function edit(patch: Partial<UserSettings>) {
    setDirty(true);
    setDraft((d) => ({ ...d, ...patch }));
  }

  return (
    <div className="measure">
      <header>
        <p className="label">Settings</p>
        <h1 className="mt-2 font-read text-[2rem] font-bold leading-tight tracking-[-0.01em]">Preferences</h1>
      </header>

      {/* ---- Where the data lives: the token in server mode, the browser's own store in static ---- */}
      {isStaticMode ? <LocalDataSection /> : <ConnectionSection />}

      {/* ---- Defaults ---- */}
      <section className="mt-10" aria-labelledby="defaults">
        <SectionHeading>
          <span id="defaults">Defaults for new topics</span>
        </SectionHeading>

        {query.isError ? (
          <div className="mb-4">
            <InlineNotice tone="warn">
              These are this browser's values — <code className="font-mono">/api/settings</code> did not answer, so
              saving will not reach the server yet.
            </InlineNotice>
          </div>
        ) : null}

        <Panel className="space-y-6 p-5">
          <Field label="Level" hint="What a topic opens at until you choose differently for that topic.">
            <div>
              <Segmented
                label="Default level"
                value={draft.defaultLevel}
                onChange={(defaultLevel: Level) => edit({ defaultLevel })}
                options={LEVELS.map((l) => ({ value: l, label: LEVEL_LABEL[l] }))}
              />
            </div>
          </Field>

          <Field label="Lens" hint="Manager leads with tradeoffs; engineer leads with mechanics. Nothing is ever hidden.">
            <div>
              <Segmented
                label="Default mode"
                value={draft.defaultMode}
                onChange={(defaultMode: Mode) => edit({ defaultMode })}
                options={MODES.map((m) => ({ value: m, label: MODE_LABEL[m] }))}
              />
            </div>
          </Field>

          <Field label="Daily goal" htmlFor="goal" hint="Minutes a day. Used for the bar on the dashboard, nothing else.">
            <input
              id="goal"
              type="number"
              min={1}
              max={240}
              value={draft.dailyGoalMinutes}
              onChange={(e) => edit({ dailyGoalMinutes: clamp(Number(e.target.value)) })}
              className={`${inputClass} num max-w-[8rem]`}
            />
          </Field>

          <div className="flex flex-wrap items-center gap-3 border-t border-rule pt-4">
            <Button
              variant="solid"
              disabled={put.isPending || !dirty}
              onClick={() =>
                put.mutate(draft, {
                  onSuccess: () => setDirty(false),
                  onError: () => setDirty(false),
                })
              }
            >
              {put.isPending ? 'Saving…' : 'Save preferences'}
            </Button>
            {!dirty && put.isSuccess ? <span className="label text-[color:var(--c-tip)]">Saved</span> : null}
            {dirty ? <span className="label">Unsaved changes</span> : null}
          </div>

          {put.isError ? <ErrorState error={put.error} retry={() => put.reset()} /> : null}
        </Panel>
      </section>

      {/* ---- Appearance ---- */}
      <section className="mt-10" aria-labelledby="appearance">
        <SectionHeading>
          <span id="appearance">Appearance</span>
        </SectionHeading>
        <Panel className="p-5">
          <Field label="Theme" hint="Stored in this browser. System follows your operating system setting.">
            <div>
              <Segmented
                label="Theme"
                value={theme}
                onChange={setThemePref}
                options={THEMES.map((t) => ({ value: t, label: THEME_LABEL[t] }))}
              />
            </div>
          </Field>
        </Panel>
      </section>
    </div>
  );
}

/** Server mode: the single bearer token this install is protected by. */
function ConnectionSection() {
  const token = useToken();
  const [tokenDraft, setTokenDraft] = useState('');

  return (
    <section className="mt-10" aria-labelledby="connection">
      <SectionHeading aside={token ? 'Token stored' : 'No token'}>
        <span id="connection">Connection</span>
      </SectionHeading>

      <Panel className="p-5">
        <Field
          label="API token"
          htmlFor="token"
          hint={`Sent as a bearer token with every request. It is the AUTH_TOKEN value in the server's .env file. Stored in this browser only.`}
        >
          <input
            id="token"
            type="password"
            autoComplete="off"
            spellCheck={false}
            value={tokenDraft}
            onChange={(e) => setTokenDraft(e.target.value)}
            placeholder={token ? '••••••••  (stored)' : 'change-me'}
            className={`${inputClass} font-mono`}
          />
        </Field>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Button
            variant="solid"
            disabled={!tokenDraft.trim()}
            onClick={() => {
              setToken(tokenDraft.trim());
              setTokenDraft('');
            }}
          >
            Save token
          </Button>
          {token ? (
            <Button variant="quiet" onClick={() => clearToken()}>
              Forget token
            </Button>
          ) : null}
        </div>
      </Panel>
    </section>
  );
}

/**
 * Static mode's replacement for the connection panel.
 *
 * Browser storage is genuinely easy to lose — clearing site data, a new machine, a private window —
 * so this says so plainly and then gives the two controls that make it survivable. Restoring
 * REPLACES rather than merges: two divergent spaced-repetition schedules have no correct merge, and
 * "restore my backup" is the request being made. So it is a deliberate two step, file then confirm.
 */
function LocalDataSection() {
  const qc = useQueryClient();
  const fileInput = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<{ name: string; json: string } | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [restored, setRestored] = useState(false);

  const store = localState;
  if (!store) return null;

  function download() {
    if (!store) return;
    const blob = new Blob([store.exportState()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `itmc-progress-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  async function choose(file: File | undefined) {
    setProblem(null);
    setRestored(false);
    if (!file) return;
    try {
      setPending({ name: file.name, json: await file.text() });
    } catch {
      setPending(null);
      setProblem('That file could not be read.');
    }
  }

  function apply() {
    if (!store || !pending) return;
    try {
      store.importState(pending.json);
      setPending(null);
      setProblem(null);
      setRestored(true);
      // Every cached query now describes the state this file just replaced, so drop the cache.
      qc.clear();
    } catch (e) {
      setProblem(e instanceof Error ? e.message : 'That file could not be restored.');
    }
  }

  return (
    <section className="mt-10" aria-labelledby="data">
      <SectionHeading aside="This browser only">
        <span id="data">Your progress</span>
      </SectionHeading>

      <Panel className="space-y-5 p-5">
        <p className="max-w-prose text-sm leading-relaxed text-ink-2">
          This build has no server and no account. Everything you do — sections marked done, quiz scores, flashcard
          schedules, the level and lens you chose per topic — is stored{' '}
          <strong className="font-medium text-ink">in this browser only</strong>. It does not reach another device, and
          clearing this site's data erases it. Download a copy now and again.
        </p>

        <div className="flex flex-wrap items-center gap-2 border-t border-rule pt-4">
          <Button variant="solid" onClick={download}>
            Download my progress
          </Button>
          <Button variant="quiet" onClick={() => fileInput.current?.click()}>
            Restore from a file…
          </Button>
          <input
            ref={fileInput}
            type="file"
            accept="application/json,.json"
            className="sr-only"
            onChange={(e) => {
              void choose(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
        </div>

        {pending ? (
          <div className="border border-rule-strong p-4">
            <p className="text-sm leading-relaxed text-ink">
              Restore from <span className="font-mono">{pending.name}</span>?
            </p>
            <p className="mt-1.5 max-w-prose text-[0.8125rem] leading-relaxed text-ink-3">
              This replaces everything stored in this browser and cannot be undone. Download your current progress
              first if you want to keep it.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button variant="solid" size="sm" onClick={apply}>
                Replace my progress
              </Button>
              <Button variant="quiet" size="sm" onClick={() => setPending(null)}>
                Cancel
              </Button>
            </div>
          </div>
        ) : null}

        {restored ? <InlineNotice>Progress restored from that file.</InlineNotice> : null}
        {problem ? <InlineNotice tone="warn">{problem}</InlineNotice> : null}
      </Panel>
    </section>
  );
}

function clamp(n: number): number {
  if (!Number.isFinite(n)) return 1;
  return Math.min(240, Math.max(1, Math.round(n)));
}
