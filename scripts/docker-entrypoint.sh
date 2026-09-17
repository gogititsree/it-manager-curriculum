#!/bin/sh
# Container entrypoint: apply migrations, then start the API.
# Migrations are idempotent, so this is safe on every restart.
set -e

echo "itmc: applying migrations to ${DATABASE_PATH}"
MIGRATIONS_DIR=/app/drizzle node node_modules/@itmc/db/dist/migrate.js

echo "itmc: starting api on port ${PORT}"
exec node dist/main.js
