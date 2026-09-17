# apps/api/src/lib

Repositories, one file per aggregate (WP-2, done):

- `repos/settings.ts` — user_settings, topic_settings
- `repos/progress.ts` — lesson_progress, exercise_attempts, plus the dashboard aggregates
  (quiz best per lesson, cards due per topic, recently viewed)
- `repos/review.ts` — quiz_sessions, quiz_answers, card_reviews
- `repos/events.ts` — `recordEvent(...)` plus the streak / minutes-today queries
- `ids.ts` — `newId()` wrapping `ulid()`
- `dto.ts` — the few response shapes that are not in `@itmc/core` api-types.ts

Routes call repos; repos call Drizzle; nobody else touches `app.db`. No business rules in repos.
Those come from `@itmc/core` (`progress.ts`, `srs.ts`).

The DB driver is `@libsql/client` (async): every Drizzle call must be awaited, including the
terminal `.get()` / `.all()` / `.run()`.

Testing: see `apps/api/test/helpers.ts`. `buildServer({ databasePath: ':memory:', contentDist,
logger: false, webDist: false })` plus `app.inject()` gives an end-to-end test without a network.
Migrations must run against `app.db` itself — a second `openDb(':memory:')` would open a *different*
database — and the user + token rows have to be seeded by the test.
