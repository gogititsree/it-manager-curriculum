/**
 * HTTP API. Thin layer: validate (zod) -> repository -> DTO. Business rules that could ever be needed
 * offline on mobile live in @itmc/core, not here.
 *
 * Route map (see docs/ARCHITECTURE.md, "API" section):
 *   GET  /api/health                                    public, no token
 *   GET  /api/content/manifest                          implemented
 *   GET  /api/content/lessons/:lessonId                 implemented
 *   GET  /api/content/topics/:topicId/questions         implemented
 *   GET  /api/content/topics/:topicId/flashcards        implemented
 *   GET/PUT /api/settings, /api/settings/topics[/:id]   implemented
 *   /api/progress/**                                    implemented
 *   /api/review/**                                      implemented
 *
 * When apps/web has been built, its dist/ is served at "/" with an SPA fallback, so the whole app
 * is one process. If the directory is absent (dev, or API-only deploys) the server still boots.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import Fastify from 'fastify';
import { serializerCompiler, validatorCompiler, type ZodTypeProvider } from 'fastify-type-provider-zod';
import type { HealthResponse } from './lib/dto.js';
import { REPO_ROOT, fromRepoRoot } from './lib/paths.js';
import { authPlugin } from './plugins/auth.js';
import { contentPlugin } from './plugins/content.js';
import { dbPlugin } from './plugins/db.js';
import { contentRoutes } from './routes/content.js';
import { progressRoutes } from './routes/progress.js';
import { reviewRoutes } from './routes/review.js';
import { settingsRoutes } from './routes/settings.js';

/**
 * Relative paths here are resolved against the REPO ROOT, not the working directory, so the server
 * behaves identically under `pnpm dev` (cwd = apps/api) and `pnpm start` (cwd = repo root).
 * See lib/paths.ts.
 */
export interface ServerOptions {
  databasePath?: string;
  contentDist?: string;
  corsOrigin?: string;
  logger?: boolean;
  /** Built web app to serve at "/". Defaults to apps/web/dist; `false` disables static serving. */
  webDist?: string | false;
}

const DEFAULT_WEB_DIST = resolve(REPO_ROOT, 'apps/web/dist');

export async function buildServer(opts: ServerOptions = {}) {
  const app = Fastify({ logger: opts.logger ?? true }).withTypeProvider<ZodTypeProvider>();
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  // Errors are { error: string } with 400 (validation), 401 (auth), 404 (unknown content id).
  app.setErrorHandler((error: unknown, req, reply) => {
    const err = error as { statusCode?: number; message?: string };
    const status = typeof err.statusCode === 'number' ? err.statusCode : 500;
    if (status >= 500) req.log.error(error);
    reply.code(status).send({ error: err.message ?? 'internal error' });
  });

  // The api-client always sends `content-type: application/json`, including for the bodyless POSTs
  // (`.../viewed`, `.../finish`). Fastify's built-in parser rejects an empty body with 400, so
  // accept it as "no body" instead; routes that declare a body schema still 400 via zod.
  app.removeContentTypeParser('application/json');
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (_req, body, done) => {
    const text = typeof body === 'string' ? body.trim() : '';
    if (text === '') return done(null, undefined);
    try {
      done(null, JSON.parse(text));
    } catch {
      const err = Object.assign(new Error('invalid JSON body'), { statusCode: 400 });
      done(err, undefined);
    }
  });

  const corsOrigin = opts.corsOrigin ?? process.env.CORS_ORIGIN;
  await app.register(cors, { origin: corsOrigin ? corsOrigin.split(',') : true });
  // `:memory:` is a libsql URL, not a path, so it must not be resolved.
  const dbPath = opts.databasePath ?? process.env.DATABASE_PATH ?? './data/itmc.db';
  await app.register(dbPlugin, { path: dbPath === ':memory:' ? dbPath : fromRepoRoot(dbPath) });
  await app.register(contentPlugin, {
    distDir: fromRepoRoot(opts.contentDist ?? process.env.CONTENT_DIST ?? './content/dist'),
  });
  await app.register(authPlugin);

  const startedAt = Date.now();
  app.get('/api/health', async (): Promise<HealthResponse> => ({
    ok: true,
    contentVersion: app.content.manifest.version,
    uptime: Math.round((Date.now() - startedAt) / 1000),
  }));

  await app.register(contentRoutes, { prefix: '/api/content' });
  await app.register(settingsRoutes, { prefix: '/api/settings' });
  await app.register(progressRoutes, { prefix: '/api/progress' });
  await app.register(reviewRoutes, { prefix: '/api/review' });

  await registerWebApp(app, opts);
  return app;
}

type App = Awaited<ReturnType<typeof buildServer>>;

/** Serve apps/web/dist at "/" with an SPA fallback, but only when the build actually exists. */
async function registerWebApp(app: App, opts: ServerOptions): Promise<void> {
  const configured = opts.webDist ?? process.env.WEB_DIST ?? DEFAULT_WEB_DIST;
  if (configured === false) return;
  const root = fromRepoRoot(configured);
  const indexPath = join(root, 'index.html');
  if (!existsSync(indexPath)) {
    app.log.info(`no web build at ${root}; serving the API only`);
    return;
  }

  await app.register(fastifyStatic, { root, prefix: '/', index: ['index.html'] });

  // Read once: the bundle is immutable per deploy.
  const indexHtml = readFileSync(indexPath);
  app.setNotFoundHandler((req, reply) => {
    if (req.url.startsWith('/api/')) {
      return reply.code(404).send({ error: 'not found' });
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      return reply.code(404).send({ error: 'not found' });
    }
    return reply.code(200).type('text/html; charset=utf-8').send(indexHtml);
  });
}
