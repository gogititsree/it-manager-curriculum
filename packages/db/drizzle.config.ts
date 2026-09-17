import { defineConfig } from 'drizzle-kit';

// Only `generate` is used from drizzle-kit (no DB connection needed); migrations are applied by
// src/migrate.ts. The url is here so `drizzle-kit studio` works against the local file.
export default defineConfig({
  dialect: 'sqlite',
  schema: './src/schema.ts',
  out: './drizzle',
  dbCredentials: { url: process.env.DATABASE_PATH ?? 'file:../../data/itmc.db' },
});
