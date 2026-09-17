# IT Manager Curriculum

A self-hosted learning app for an experienced architect moving into IT management.

Six modules, 26 topics, each available at three levels — **Beginner**, **Intermediate** and
**Rusty** (a fast refresher for someone who knew it well once) — with a **Manager mode** toggle that
swaps implementation detail for concepts and tradeoffs. Progress is tracked per topic and per level.
A review mode with spaced-repetition flashcards and quizzes covers the five minutes between
meetings.

```
Java · Python · Full stack · MongoDB & databases · Observability · IT management extras
```

## Quick start

```bash
pnpm install
cp .env.example .env          # then set a real AUTH_TOKEN
pnpm build                    # packages, content bundle, API, web client
pnpm db:migrate               # creates data/itmc.db and seeds your token
pnpm start                    # http://localhost:4000
```

For development with hot reload, `pnpm dev` runs the API on :4000 and Vite on :5173.

Generate a strong token instead of using the default:

```bash
node scripts/new-token.mjs "laptop"
```

## Read it without a server

The same app also builds as a plain static site — no API, no database, no token — for GitHub Pages
or any file host:

```bash
pnpm build:static             # apps/web/dist, ready to publish
```

Progress then lives in that browser's `localStorage` instead of SQLite, and the settings page gains
a download / restore pair so it can be backed up and moved. Set `VITE_BASE` to wherever the site is
served from (`apps/web/.env.static` defaults to `/it-manager-curriculum/`); `.github/workflows/pages.yml`
does this for you and is run manually. Details in [HANDOFF.md](HANDOFF.md) and ADR-014.

Note that a static deployment ships the compiled curriculum to the browser, so the quiz answers are
in it. The client still withholds them until you answer, but they are not secret.

## How it works

Content is **markdown and YAML in this repo**, compiled at build time into a single JSON bundle the
API serves. There is no CMS, no database of lessons, and no runtime LLM call. Adding a lesson is a
pull request, and `pnpm content:validate` is the gate.

State is a **single SQLite file** at `data/itmc.db` holding your settings, progress, quiz history
and flashcard schedule. It references content by stable ID, so editing a lesson never orphans your
progress. That one file is the only thing you need to back up.

The API is one Node process that serves both `/api` and the built web client, so a deployment is
one command and one port.

## Layout

```
apps/api            Fastify HTTP API. The only thing that touches the database.
apps/web            React + Vite web client.
apps/mobile         Placeholder for a future Expo client (shares core + api-client).
packages/core       Platform-agnostic domain: content schemas, progress maths, spaced repetition.
packages/db         Drizzle schema + migrations.
packages/api-client Typed client used by web now and mobile later.
packages/local-client Same surface, no server: content from a JSON file, state in localStorage.
tools/content-build Compiles content/ into the JSON bundle the API serves.
content/            The curriculum itself.
scripts/            Token management, backup.
docs/               Architecture, data model, design decisions, authoring guide, operations.
```

## Documentation

| Document | For |
| --- | --- |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | How the system fits together |
| [docs/DATA-MODEL.md](docs/DATA-MODEL.md) | Tables, IDs, and how progress is derived |
| [docs/DESIGN-DECISIONS.md](docs/DESIGN-DECISIONS.md) | ADRs: why it is built this way |
| [docs/CONTENT-AUTHORING.md](docs/CONTENT-AUTHORING.md) | Required reading before writing a lesson |
| [docs/CURRICULUM.md](docs/CURRICULUM.md) | The full topic map and suggested paths |
| [docs/OPERATIONS.md](docs/OPERATIONS.md) | Running it: service setup, security, backup, upgrades |
| [HANDOFF.md](HANDOFF.md) | Current state and remaining work packages |

## Commands

| Command | Does |
| --- | --- |
| `pnpm dev` | API + web with hot reload |
| `pnpm build` | Everything, production output |
| `pnpm build:static` | Browser-only build for GitHub Pages (overwrites `apps/web/dist`) |
| `pnpm start` | Run the built API (serves the UI too) |
| `pnpm verify` | Typecheck, validate content, run tests |
| `pnpm content:validate` | Schema-check every lesson, quiz and flashcard |
| `pnpm content:new-topic <module> <slug> "<Title>"` | Scaffold a new topic |
| `pnpm db:migrate` | Apply migrations, seed the token |
| `pnpm backup` | Consistent snapshot of the progress database |
| `pnpm token:new "<label>"` | Issue a device token |

## Licence

Private, personal project. No licence granted.
