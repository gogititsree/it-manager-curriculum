/**
 * Two builds come out of this file.
 *
 *   default (`vite build`)         server mode. base '/', the API serves this dist via @fastify/static.
 *                                  Unchanged from before static mode existed.
 *   `vite build --mode static`     browser-only mode for GitHub Pages: no API, no token. Values come
 *                                  from apps/web/.env.static; a real VITE_BASE in the environment
 *                                  overrides it, so a fork under a different repo name needs no edit.
 *
 * VITE_APP_MODE is pinned through `define` rather than left to .env so Rollup sees a string literal
 * and drops the client that is not in use (apps/web/src/lib/api.ts is written as one ternary on it).
 */
import react from '@vitejs/plugin-react';
import { copyFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv, type Plugin } from 'vite';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../..');

/** GitHub Pages serves from /<repo>/. Vite wants exactly one leading and one trailing slash. */
function normaliseBase(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed === '' || trimmed === '/') return '/';
  return `/${trimmed.replace(/^\/+|\/+$/g, '')}/`;
}

/**
 * Everything the static output needs that Rollup does not produce by itself:
 *
 *  - content/bundle.json — the compiled curriculum. In server mode the API reads this from
 *    content/dist; with no API it has to ship inside the site, addressed through `base`.
 *  - 404.html — GitHub Pages has no SPA fallback, so a deep link like /topics/java/oop-fundamentals
 *    is a hard 404. Pages serves 404.html for any unmatched path; making it a byte copy of
 *    index.html boots the same app, and the router resolves the URL client-side.
 *  - .nojekyll — without it Pages runs Jekyll, which refuses to serve paths beginning with an
 *    underscore. Vite does not emit any today, but this is one line against a silent 404.
 */
function staticSitePlugin(): Plugin {
  let outDir = resolve(here, 'dist');
  return {
    name: 'itmc-static-site',
    apply: 'build',
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir);
    },
    closeBundle() {
      const bundle = resolve(repoRoot, 'content/dist/bundle.json');
      if (!existsSync(bundle)) {
        throw new Error(
          `Static build needs a compiled curriculum at ${bundle}. Run \`pnpm content:build\` first (or use \`pnpm build:static\`, which does).`,
        );
      }
      mkdirSync(resolve(outDir, 'content'), { recursive: true });
      copyFileSync(bundle, resolve(outDir, 'content/bundle.json'));

      const index = resolve(outDir, 'index.html');
      if (existsSync(index)) copyFileSync(index, resolve(outDir, '404.html'));

      writeFileSync(resolve(outDir, '.nojekyll'), '');
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, here, '');
  const appMode = (process.env['VITE_APP_MODE'] ?? env['VITE_APP_MODE']) === 'static' ? 'static' : 'server';
  const base = normaliseBase(process.env['VITE_BASE'] ?? env['VITE_BASE'] ?? '/');

  return {
    base,
    plugins: [react(), ...(appMode === 'static' ? [staticSitePlugin()] : [])],
    define: {
      // A literal, so the unused client tree-shakes out instead of shipping.
      'import.meta.env.VITE_APP_MODE': JSON.stringify(appMode),
    },
    server: { port: 5173, proxy: { '/api': 'http://localhost:4000' } },
  };
});
