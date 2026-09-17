/// <reference types="vite/client" />

/**
 * The only two build-time values the app reads. VITE_APP_MODE is pinned by `define` in
 * vite.config.ts; BASE_URL is Vite's own, derived from `base`.
 */
interface ImportMetaEnv {
  readonly VITE_APP_MODE?: 'server' | 'static';
  readonly BASE_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
