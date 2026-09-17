/**
 * SettingsPage.
 * API token input (stored in localStorage 'itmc.token'), default level, default mode, daily goal.
 * Uses getUserSettings / putUserSettings.
 *
 * Three groups, in the order they matter on a fresh install: the connection, the defaults that
 * decide what a new topic opens as, and the appearance. Saving is explicit — these are preferences
 * the user sets once, not a control surface, so an auto-save would only make it feel unpredictable.
 */
import { LEVELS, MODES, type Level, type Mode, type UserSettings } from '@itmc/core';
import { useEffect, useState } from 'react';
import { Segmented } from '../components/Segmented';
import { Button, ErrorState, Field, InlineNotice, Panel, SectionHeading, inputClass } from '../components/ui';
import { LEVEL_LABEL, MODE_LABEL } from '../lib/format';
import { usePutUserSettings, useUserSettings } from '../lib/hooks';
import { readLocalUserSettings } from '../lib/local-settings';
import { THEMES, setThemePref, useThemePref, type ThemePref } from '../lib/theme';
import { clearToken, setToken, useToken } from '../lib/token';

const THEME_LABEL: Record<ThemePref, string> = { system: 'System', light: 'Light', dark: 'Dark' };

export function SettingsPage() {
  const token = useToken();
  const query = useUserSettings();
  const put = usePutUserSettings();
  const theme = useThemePref();

  const [tokenDraft, setTokenDraft] = useState('');
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

      {/* ---- Connection ---- */}
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

function clamp(n: number): number {
  if (!Number.isFinite(n)) return 1;
  return Math.min(240, Math.max(1, Math.round(n)));
}
