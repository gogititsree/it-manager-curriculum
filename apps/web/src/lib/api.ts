/**
 * The one place that decides where data comes from.
 *
 * Two deployments, one app:
 *   server mode (default)  — talks to apps/api over HTTP with a bearer token.
 *   static mode            — no backend at all: @itmc/local-client serves content from the compiled
 *                            bundle shipped beside the app and keeps state in this browser. This is
 *                            what GitHub Pages gets.
 *
 * The mode is fixed at BUILD time by VITE_APP_MODE (see apps/web/vite.config.ts and .env.static), so
 * the unused client is constant-folded away by Rollup rather than shipped. Both clients satisfy
 * `ApiClient`, so `api` has one type and NO page or hook knows which mode it is running in — that
 * property is the whole design; anything that needs to branch does it here or reads `isStaticMode`.
 */
import { createApiClient, type ApiClient } from '@itmc/api-client';
import { createLocalClient, type LocalClient } from '@itmc/local-client';
import { browserKeyValueStore } from './local-store';

export type AppMode = 'server' | 'static';

export const APP_MODE: AppMode = import.meta.env.VITE_APP_MODE === 'static' ? 'static' : 'server';
export const isStaticMode = APP_MODE === 'static';

/**
 * The bundle sits next to index.html, so it must be addressed through Vite's BASE_URL: on GitHub
 * Pages the app is served from /<repo>/, not from /.
 */
const bundleUrl = `${import.meta.env.BASE_URL}content/bundle.json`;

const local: LocalClient | null = isStaticMode
  ? createLocalClient({ bundleUrl, store: browserKeyValueStore() })
  : null;

export const api: ApiClient =
  local ??
  createApiClient({
    baseUrl: '',
    // Token lives in localStorage for the self-hosted single-user case; the settings page sets it.
    getToken: () => localStorage.getItem('itmc.token') ?? undefined,
  });

/**
 * Export / import of browser-held progress. `null` in server mode, where the database is the
 * durable copy and `scripts/backup.mjs` is the backup story. The settings page uses this to decide
 * which panel to show.
 */
export const localState: Pick<LocalClient, 'exportState' | 'importState'> | null = local
  ? { exportState: () => local.exportState(), importState: (json: string) => local.importState(json) }
  : null;
