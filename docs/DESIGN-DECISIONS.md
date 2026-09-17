# Design decisions (ADRs)

Format: context → decision → consequences. Add new ADRs at the bottom; never edit an accepted one,
supersede it. Any change to `packages/core/src/content.ts`, `packages/db/src/schema.ts` or the
directive set in `tools/content-build` requires a new ADR here.

---

## ADR-001 TypeScript monorepo with pnpm workspaces

**Context.** Backend, web, future mobile and a content compiler. Follow-up implementation will be
done by different Claude sessions with limited shared context.

**Decision.** One language (TypeScript) and one repo, split into `apps/*`, `packages/*`, `tools/*`.
Shared types flow from `packages/core` outward; no duplication of shapes.

**Consequences.** A session working on the API and a session working on the web client are both
constrained by the same zod schemas; type errors, not runtime surprises, catch drift. The cost is
some boilerplate (per-package tsconfig / package.json), already paid here.

## ADR-002 SQLite via Drizzle; the API is the only database client

**Context.** Self-hosted by one person on a laptop or NAS. Zero operational overhead is a hard
requirement; Postgres would be the first thing to break on a personal machine.

**Decision.** SQLite with Drizzle ORM and generated migrations. Only `apps/api` opens the DB.
ISO-8601 text timestamps, JSON-as-text columns, no SQLite-specific SQL.

**Amendment (same session).** The driver is `@libsql/client` (`drizzle-orm/libsql`), not
`better-sqlite3`. The latter needs a C++ toolchain when no prebuilt binary matches the Node version,
and that failed on the first install (Node 24, Windows, no Visual Studio). libsql ships prebuilt
binaries for every platform. Consequence: the DB API is async (`await db.select()...`), which also
matches how a Postgres driver behaves, so repositories written now port cleanly.

**Consequences.** One file to back up. A later move to Postgres is a driver swap plus migration
regeneration.

## ADR-003 Content is code: markdown + yaml compiled at build time; no runtime LLM

**Context.** Content will be written by Opus/Sonnet sessions. It must be reviewable in a diff,
validated mechanically, versioned with the app, and never require touching TypeScript. Generating
lessons at runtime would make quality unreviewable and add an external dependency to a self-hosted
tool.

**Decision.** `content/modules/<module>/<topic>/{topic.yaml, beginner.md, intermediate.md, rusty.md,
quiz.yaml, flashcards.yaml}`. `tools/content-build` validates against the core zod schemas and emits
one `bundle.json`. The API loads it at boot. There is no admin UI and no content in the database.

**Consequences.** Adding a lesson is a PR. Content sessions have a tight loop:
edit → `pnpm content:validate`. Content and app are deployed together, which is right for one user.

## ADR-004 Block model rather than HTML or a full AST

**Context.** Mobile must render the same lessons. HTML would force a WebView; a full mdast AST is a
lot of surface for two renderers to agree on.

**Decision.** Compile to coarse blocks: `markdown` (prose kept as a markdown string), `code`,
`callout`, `exercise`, grouped into `sections`. Impose structure only where the app *acts* on it:
sections for progress, audience for mode, code for highlighting, callouts for visual kinds,
exercises for attempts.

**Consequences.** Web uses react-markdown for prose; mobile uses a RN markdown view. Both render the
same four block types. A new block type is an ADR because every renderer must learn it.

## ADR-005 Levels are separate lesson files; Rusty is its own content shape

**Context.** Beginner, Intermediate and Rusty are not the same text with different depth. Rusty in
particular is "you knew this; here is a recap, what changed, and the gotchas", which is a different
document, not a filtered one.

**Decision.** One markdown file per level per topic. Each has a recommended structure
(CONTENT-AUTHORING.md). Level is selected per topic and stored in `topic_settings`. Progress is per
`topicId@level`.

**Consequences.** Three times the authoring effort per topic; that is the point, and it is the work
being handed to content sessions. Stubs are allowed (`status: stub`) so the app runs with partial
content and the UI shows what is not authored yet.

## ADR-006 Manager mode is an audience filter inside a lesson, collapsed not hidden

**Context.** The same reader wants the tradeoff framing in a meeting and the syntax at the weekend.
Two full copies of every lesson would double authoring again and drift.

**Decision.** Blocks are tagged `all | manager | engineer` with `:::manager` / `:::engineer`
containers. Mode decides which are primary; the others render collapsed with a label. The audience
rule lives in core (`isPrimaryForMode`) so all renderers agree.

**Consequences.** Authors write one lesson with two lenses interleaved. Manager mode on a lesson
with no `:::manager` blocks still works (it just shows everything), so content can be improved
incrementally.

## ADR-007 Progress is derived from completed section IDs

**Context.** Stored percentages rot when content changes.

**Decision.** `lesson_progress.completed_sections` holds section IDs; completion is computed against
the manifest's current `sectionIds` in `core/progress.ts`. Module progress is reported both
per level and along the user's selected path.

**Consequences.** Editing a lesson can lower a completion figure; this is honest. All progress
maths is one pure module, unit-tested, shared by API and future offline clients.

## ADR-008 Spaced repetition: SM-2 variant, capped at 180 days, pure function in core

**Context.** Flashcards are for refreshers between meetings, not exam cramming. Very long intervals
defeat the purpose for a working manager.

**Decision.** Four ratings (again / hard / good / easy), SM-2 ease dynamics, relearn in 10 minutes
after a lapse, interval cap 180 days. `scheduleReview()` and `selectSessionCards()` in
`core/srs.ts`. State per (user, card) in `card_reviews`.

**Consequences.** Simple to reason about; adjustable in one place; runs offline on mobile.
Quiz questions are *not* scheduled by SRS; they are selected by scope, level, mode and recent
wrong answers (see `routes/review.ts`).

## ADR-009 Bearer tokens, hashed, seeded from env; no OAuth

**Context.** Single user, self-hosted, but mobile needs a way in and the web app should not be
special. Anything more than a token is ceremony here.

**Decision.** `api_tokens` table with SHA-256 hashes; `pnpm db:migrate` seeds one from `AUTH_TOKEN`.
Web keeps the token in localStorage; mobile in secure storage. Every `/api/*` route except health
requires it.

**Consequences.** Adding a second device is inserting a row. Adding real login later is a new
plugin that mints rows in the same table; no route changes.

## ADR-010 API-first; core and api-client are platform-agnostic

**Context.** "Design it so in future it can also be a mobile app."

**Decision.** The web app has no privileged path; it uses `@itmc/api-client` like mobile will.
`core` has no I/O. Content is JSON. All write endpoints are idempotent upserts or append-only
events except card reviews (noted in DATA-MODEL.md).

**Consequences.** Mobile is a new client, not a new backend. The dependency rule in
ARCHITECTURE.md §3 is what keeps this true.

## ADR-011 Level is chosen per topic, with a user-level default

**Context.** The user is Rusty on Java OOP but Beginner on OpenTelemetry. A module-wide level would
be wrong most of the time.

**Decision.** `topic_settings(user, topic) -> level, mode`; `user_settings.default_level` (default
`rusty`) applies otherwise.

**Consequences.** The dashboard has to explain progress along a *path* (each topic at its own level),
which `moduleProgress().selectedPath` provides.

## ADR-012 Fastify + zod type provider; React + Vite + TanStack Query + Tailwind

**Context.** Needs to be boring, well-documented, and familiar to the models doing follow-up work.

**Decision.** Fastify 5 with `fastify-type-provider-zod` so the same zod schema validates and types
a route. React 19 + Vite, TanStack Query for server state, react-router, Tailwind for styling,
react-markdown + shiki for lesson rendering.

**Consequences.** No SSR, no Next.js: the app is behind auth and has one user, so SEO and SSR bring
nothing. Rejected alternatives: Next.js (couples web and API, hurts the mobile story), tRPC (fine,
but a plain REST surface is easier for a RN client and for curl).

## ADR-013 Append-only activity log for streaks, minutes and resume

**Context.** Streak and "minutes today" need time-series data; storing counters invites drift.

**Decision.** `activity_events` is written by every mutating route; aggregates are computed from it.
Minutes are an estimate from event types (rule in DATA-MODEL.md §4), shown as approximate.

**Consequences.** Slightly more writes; trivially rebuildable aggregates; a free audit trail.

## ADR-014 Static mode: a second client, not a second app

**Context.** The app should also be readable with no server at all — published to GitHub Pages, or
opened from a folder — without forking the UI or duplicating the progress and spaced-repetition
rules that `packages/core` already owns.

**Decision.** Add `packages/local-client`: a browser-only implementation of the same method surface
as `@itmc/api-client`, reusing `core` for every rule and persisting through an injected
`KeyValueStore` port (the web app supplies a localStorage adapter). `apps/web/src/lib/api.ts` picks
the client at build time from `VITE_APP_MODE`; everything downstream of it is unchanged. A
compile-time assertion in `local-client` requires its return type to be assignable to `ApiClient`,
so the two cannot drift silently.

The package depends on `@itmc/api-client` for **types only**, which is why it throws its own
`LocalClientError` rather than `ApiError`; `apps/web/src/lib/errors.ts` reads `status` off either.

Static mode also means state lives only in one browser, so the local client adds two methods beyond
the ApiClient surface — `exportState()` and `importState()` — surfaced on the settings page.

**Consequences.** One UI, two transports. No page, hook or component knows which mode it is in, and
the server build is byte-for-byte what it was (the unused client constant-folds away). The costs are
honest ones: the compiled bundle ships to the browser, so quiz answers are present in it and are
only withheld per session rather than truly secret; progress does not sync between devices; and
every future route must be implemented twice — once in `apps/api`, once here — with the route's
header comment as the shared spec.

## Considered and rejected

- **Content in the database with an admin editor.** Unreviewable, no diffs, another UI to build.
- **MDX.** Ties content to React; mobile could not render it.
- **LLM-generated lessons at runtime.** Unreviewable quality, external dependency, cost, and the
  whole point of a curriculum is that it is curated.
- **One lesson file with `:::beginner` / `:::rusty` blocks.** Rusty is a different document shape;
  filtering does not produce it.
- **Flutter / Kotlin Multiplatform for mobile.** Would fork the domain logic out of TypeScript.
- **Full-text search now.** Nice later; not needed for ~26 topics. Reserve `/api/content/search`.
