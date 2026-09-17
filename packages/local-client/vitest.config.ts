import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

/**
 * Tests run against @itmc/core's SOURCE, not its dist, so `pnpm -r test` does not depend on a
 * prior `pnpm build`.
 */
export default defineConfig({
  resolve: {
    alias: {
      '@itmc/core': fileURLToPath(new URL('../core/src/index.ts', import.meta.url)),
    },
  },
});
