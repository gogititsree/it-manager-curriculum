/**
 * Process entry point. Loads .env from the repo root (not the working directory, which differs
 * between `pnpm dev` and `pnpm start` — see lib/paths.ts), validates the configuration, then serves.
 */
import { resolve } from 'node:path';
import dotenv from 'dotenv';
import { assertEnv } from './lib/env.js';
import { REPO_ROOT } from './lib/paths.js';

dotenv.config({ path: resolve(REPO_ROOT, '.env') });

const { buildServer } = await import('./server.js');

// Fail fast on a misconfigured production install rather than booting with a placeholder token.
assertEnv();

const app = await buildServer();
await app.listen({ port: Number(process.env.PORT ?? 4000), host: '0.0.0.0' });

let shuttingDown = false;
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    if (shuttingDown) return;
    shuttingDown = true;
    app.log.info(`${signal} received, closing`);
    app
      .close()
      .then(() => process.exit(0))
      .catch((err) => {
        app.log.error(err, 'error during shutdown');
        process.exit(1);
      });
  });
}
