# HANDOFF

The application is **complete and running**. This file records what was built, how it was verified,
the rules that keep the architecture intact, and what is deliberately left for later.

Built across two sessions: an architecture session that set the contracts, then a build session in
which nine agents worked in parallel (one per module area for content, one for the API, one for the
web client) against those contracts.

## Status

| Area | State |
| --- | --- |
| Architecture, ADRs, docs | Complete. `docs/*.md` |
| `packages/core` — schemas, IDs, progress maths, spaced repetition | Complete. 5 unit tests passing |
| `packages/db` — schema, migration, migrate/seed | Complete. Migration generated and applied |
| `packages/api-client` | Complete. A method per route |
| `tools/content-build` — compiler, validator, scaffolder | Complete. Supports `--only <module>` for parallel authoring |
| `apps/api` — all routes, repositories, auth, static serving, config guard | Complete. 50 tests passing |
| `apps/web` — all pages, lesson renderer, review runners, design system | Complete |
| `content/` — 6 modules, 26 topics | Complete. 78 of 78 lessons `ready`, 282 quiz questions, 401 flashcards |
| Production packaging — Docker, CI, service setup, backup, tokens | Complete and verified. See `docs/OPERATIONS.md` |
| `apps/mobile` | Not started, by design. See "Future work" |

## Verified

Run on Windows 11, Node 24, pnpm 11 on 2026-09-16. Every command below was executed and passed.

| Check | Result |
| --- | --- |
| `pnpm -r typecheck` | Clean across all 7 workspace projects |
| `pnpm -r test` | 55 passing (5 core, 50 API) |
| `pnpm content:validate` | 78 lessons, 282 questions, 401 flashcards, zero errors |
| `pnpm build` | Packages, content bundle, API and web client all build |
| `pnpm db:migrate` | Applies cleanly and is idempotent on re-run |
| End-to-end against the built server | **32 of 32 checks passed** |
| `pnpm dev` (API on :4000, Vite on :5173, proxying `/api`) | Both start; proxy reaches the API |
| Production config guard | Refuses to start with a placeholder token when `NODE_ENV=production` |
| `node scripts/backup.mjs` | Produces a consistent snapshot |
| `node scripts/new-token.mjs` / `revoke-token.mjs` | Issue and revoke work |
| `docker compose build` | Image builds (510 MB) |
| End-to-end against the **container** | **33 of 33 checks passed** |
| Graceful shutdown on SIGTERM | Handler runs, exit code 0, stops in under a second |
| Volume persistence across restart | Progress, settings and tokens all survive |
| Migration idempotency in the container | Ran twice on restart, no errors |

The end-to-end run covered: public health, token rejection, content fetch, settings read/write,
per-topic level and mode changes, marking sections done (including replay), exercise submission, the
dashboard aggregate, a full quiz session (creation, answer scoring, idempotent finish, and
confirmation that answers are withheld from the client), a flashcard review advancing the spaced
repetition schedule, and the web client being served by the API including deep links.

**One bug found and fixed during integration.** Relative paths in the environment
(`DATABASE_PATH`, `CONTENT_DIST`, `WEB_DIST`) were resolved against the working directory, which
differs between `pnpm dev` (cwd is `apps/api`) and `pnpm start` (cwd is the repo root). Development
mode could not open the database. They now resolve against the repo root via
`apps/api/src/lib/paths.ts`, and `.env` is loaded from there too. Both modes verified since.

**Everything is now verified.** The two items previously outstanding — the Docker build and
signal-based graceful shutdown — were both confirmed once Docker was working. SIGTERM could not be
tested natively because Windows does not deliver POSIX signals to a detached Node process; sending it
to the container's PID 1 proved the handler works.

### Docker status on this machine

Working and verified. Docker Desktop 4.91.0, CLI and engine 29.8.0 (linux/amd64), WSL 2.7.14 with
kernel 6.18.33.2. Getting there needed `VirtualMachinePlatform` and
`Microsoft-Windows-Subsystem-Linux` enabled, the WSL2 kernel installed, and a reboot before the
hypervisor loaded. `scripts/enable-docker-prereqs.ps1` does the first part and is idempotent.

```bash
docker compose build      # ~2 min cold, 510 MB image
docker compose up -d      # http://localhost:4000
docker compose logs -f
docker compose down       # add -v to also delete the data volume
```

**One bug the container build found.** `pnpm deploy` refuses to run from pnpm 10 onward unless the
workspace sets `inject-workspace-packages=true`, failing with
`ERR_PNPM_DEPLOY_NONINJECTED_WORKSPACE`. The Dockerfile now passes `--legacy`, which keeps the
classic behaviour of copying workspace dependencies into the deploy directory. This was only ever
going to surface in a real build.

**Worth knowing about compose and `.env`.** Docker Compose automatically reads `.env` from the
project directory, so `AUTH_TOKEN` there is what the container gets and the `${AUTH_TOKEN:?}` guard
in `docker-compose.yml` never fires. Put a real token in `.env` before `docker compose up`. If you
forget, the container's own startup check refuses to run rather than coming up unprotected, which is
the behaviour you want but looks like a crash loop until you read the logs.
## Architecture rules — still binding

1. **Do not change** `packages/core/src/content.ts`, `packages/db/src/schema.ts`, or the directive
   set in `tools/content-build/src/markdown.ts` without adding an ADR to `docs/DESIGN-DECISIONS.md`.
2. **Dependency rule** (`docs/ARCHITECTURE.md` section 3): web and mobile depend only on
   `api-client` and `core`. `core` performs no I/O, so it can run offline on a phone.
3. **Business rules live in `core`**, not in routes or components. Computing a percentage or a due
   date in a route means calling the wrong thing.
4. **Content sessions touch only `content/`.** Never edit `content/dist/`.
5. **IDs are permanent.** Never rename a topic folder, a lesson file, an H2 in a `ready` lesson, or
   a question or card id: progress rows reference them.
6. **The database driver is `@libsql/client` and its API is async.** `better-sqlite3` was rejected
   because it needs a C++ toolchain that is not present on Node 24 + Windows. Await every Drizzle call.
7. **pnpm 11 blocks postinstall scripts** unless listed under `allowBuilds` in `pnpm-workspace.yaml`.

## Adding content

The workflow is unchanged and is the main way this app grows:

```bash
pnpm content:new-topic <moduleId> <slug> "<Title>"   # scaffolds three stub lessons
# write the lessons per docs/CONTENT-AUTHORING.md
pnpm content:validate -- --only <moduleId>           # fast, scoped feedback
pnpm content:validate                                # whole tree, including prerequisites
```

Add the new slug to `content/modules/<moduleId>/module.yaml`. `docs/CONTENT-AUTHORING.md` is the
binding spec and `content/modules/java/oop-fundamentals/` is the reference example.

## Future work

None of this is required for the app to be useful. In rough order of value:

1. **Mobile client** (`apps/mobile`). The groundwork is done: the domain logic is platform-agnostic,
   content is JSON, and every write endpoint is an idempotent upsert or an append-only event except
   card reviews. See `docs/ARCHITECTURE.md` section 9. Build the review screen first.
2. **Fold the API's local DTOs into `packages/core/src/api-types.ts`.** `apps/api/src/lib/dto.ts`
   declares `QuizQuestionPublic` and the quiz/card response shapes locally because `api-types.ts`
   was frozen while agents worked in parallel. They are structurally identical to the client's.
3. **Content hot reload in development.** The API reads the bundle once at boot; a rebuild currently
   needs a restart.
4. **Web bundle splitting.** The main chunk is 527 kB (159 kB gzipped). Fine for a self-hosted app on
   a fast network, worth splitting before any mobile-web use.
5. **Typecheck the API's `test/` directory.** It is excluded because `tsconfig.json` sets
   `include: ["src"]` and widening it would break `rootDir` for the build. A separate
   `tsconfig.test.json` would fix it.
6. **Full-text search across lessons.** Reserve `/api/content/search`. Not needed at 26 topics.
