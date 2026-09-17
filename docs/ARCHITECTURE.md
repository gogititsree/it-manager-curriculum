# Architecture

**Audience:** a Claude session (or a human) picking up implementation of one module of this app
without re-deriving the design. Read HANDOFF.md first for current state and the binding rules.

## 1. Goals and constraints

| Goal | Consequence |
| --- | --- |
| Self-hosted by one person, zero ops | SQLite, one Node process, no external services, no runtime LLM calls |
| Three levels per topic, chosen per topic | Level is a property of the *lesson*, not the module; progress is per (topic, level) |
| Manager mode toggle | Mode is a *rendering filter* over audience-tagged blocks, not separate content |
| Quick review between meetings | Review mode is a first-class surface with its own data (SRS state) and is the first mobile screen |
| Mobile app later | API-first; all domain logic in a platform-agnostic package; content served as JSON, not HTML |
| Content written by follow-up Claude sessions | Content is markdown + yaml in the repo with a validator, so a content session never touches code |
| Parallel implementation by several agents | Shared types and route specs are fixed up front, so work on content, API and UI never collides |

## 2. System shape

```mermaid
flowchart LR
  subgraph authoring["content/ (markdown + yaml)"]
    MD[lessons .md] --> CB
    YML[topic/quiz/flashcards .yaml] --> CB
  end
  CB[tools/content-build] --> DIST[content/dist/bundle.json]
  DIST --> API
  subgraph server["apps/api (Fastify, one process)"]
    API[routes] --> CORE[@itmc/core]
    API --> DB[(SQLite via @itmc/db)]
  end
  WEB[apps/web React] --> AC[@itmc/api-client] --> API
  MOB[apps/mobile Expo, future] --> AC
  WEB --> CORE
  MOB --> CORE
```

Two kinds of data, deliberately separated:

- **Content** (what to learn) is compiled from the repo at build time into a single JSON bundle that
  the API loads into memory. It is immutable per deploy and identified by string IDs.
- **State** (what the user did) lives in SQLite and references content only by those IDs. Nothing in
  the DB is needed to render a lesson; nothing in content is needed to compute a streak.

## 3. Packages and the dependency rule

```
packages/core        zod schemas for content + API DTOs, ID helpers, progress maths, spaced repetition
packages/db          Drizzle schema, migrations, openDb()
packages/api-client  fetch-based typed client (browser, React Native, Node)
tools/content-build  markdown/yaml -> bundle.json compiler + validator + topic scaffolder
apps/api             Fastify: auth, content store, routes
apps/web             React + Vite + TanStack Query + Tailwind
apps/mobile          not started; README describes the plan (Expo)
content/             the curriculum
docs/                this folder
```

Allowed imports (arrows point at what may be imported):

```
apps/web    -> api-client, core
apps/mobile -> api-client, core
apps/api    -> db, core
db          -> core
api-client  -> core
core        -> (zod only)
content-build -> core
```

Anything that violates this (e.g. web importing db, core importing fs) is a bug. `core` must contain
no I/O so that mobile can run progress and SRS logic offline.

## 4. Content model

Hierarchy: **Module → Topic → Lesson (one per level) → Section → Block**, plus per-topic
**Questions** and **Flashcards** tagged with the levels they apply to.

| Entity | ID format | Example |
| --- | --- | --- |
| Module | `moduleId` | `java` |
| Topic | `moduleId/slug` | `java/oop-fundamentals` |
| Lesson | `topicId@level` | `java/oop-fundamentals@rusty` |
| Section | slug of H2, unique within lesson | `encapsulation` |
| Exercise | `lessonId/slug` | `java/oop-fundamentals@beginner/ex-shapes` |
| Question | `topicId/q-nnn` | `java/oop-fundamentals/q-003` |
| Flashcard | `topicId/c-nnn` | `java/oop-fundamentals/c-001` |

IDs are stable strings by design: renaming a title must not orphan progress rows, so slugs are set
once and never changed (see CONTENT-AUTHORING.md).

A lesson body is a list of sections; each section a list of **blocks**:

- `markdown` — prose, rendered by react-markdown (web) or a RN markdown view (mobile)
- `code` — language + source, highlighted client-side
- `callout` — kinds: tip, warning, gotcha, manager-lens, bank-context, changed-since, decision
- `exercise` — pointer to an exercise (prompt, type, optional solution)

Every block carries an **audience**: `all`, `manager`, or `engineer`. This is the entire mechanism
behind manager mode.

## 5. The two dimensions: level and mode

**Level** (Beginner / Intermediate / Rusty) selects *which lesson file* is shown for a topic. The three
files are written independently with different shapes (see CONTENT-AUTHORING.md): Beginner builds the
mental model, Intermediate goes deeper on patterns and failure modes, Rusty is a fast recap + "what
changed since you last touched this" + gotchas + a drill. Quiz questions and flashcards declare which
levels they suit.

**Mode** (Manager / Engineer) selects *which blocks are primary* inside the chosen lesson.
`isPrimaryForMode(audience, mode)` in core decides. Non-primary blocks are rendered **collapsed**, not
removed: a manager can always expand the code; an engineer can always expand the tradeoff framing.

Both are stored per topic in `topic_settings`, with user-level defaults in `user_settings`. The
combination of a topic's level and mode is what `TopicPage` resolves via `resolveTopicView()`.

## 6. Runtime flows

### Reading a lesson
1. `GET /api/content/manifest` (cached forever per version) gives modules, topics, per-level lesson
   summaries including `sectionIds`.
2. Client resolves level/mode for the topic (`GET /api/settings/topics`), computes
   `lessonId = topicId@level`.
3. `GET /api/content/lessons/:id` returns the compiled lesson; `GET /api/progress/lessons/:id`
   returns completed section IDs. `POST .../viewed` records the visit.
4. User presses "Mark section done" → `POST /api/progress/lessons/:id/sections` → API runs
   `applySectionCompleted()` from core, persists, emits events. Lesson auto-completes when every
   `sectionId` in the manifest summary is present.

### Changing level
`PUT /api/settings/topics/:topicId` with the new level. The client swaps to a different `lessonId`;
progress for the previous level is untouched. Both appear in module progress (`perLevel`).

### Quiz
`POST /api/review/quiz` selects questions for a scope (topic / module / all) at a level, preferring the
current mode's audience and questions previously answered wrong. The client answers one at a time,
gets the explanation immediately, then `finish`. Best score per (topic, level) feeds the dashboard.

### Flashcards
`GET /api/review/cards/due` returns due cards first, then unseen, capped. `POST /api/review/cards`
with a rating 1..4 runs `scheduleReview()` (SM-2 variant) and upserts `card_reviews`. Everything here
is a pure function in core so mobile can run it offline and sync later.

## 7. API

Base path `/api`. Auth: `Authorization: Bearer <token>` on everything except `/api/health`.
Validation: zod schemas from `@itmc/core/api-types.ts` via `fastify-type-provider-zod`.

| Method | Path | Status |
| --- | --- | --- |
| GET | /health | done |
| GET | /content/manifest | done |
| GET | /content/lessons/:lessonId | done |
| GET | /content/topics/:topicId/questions | done |
| GET | /content/topics/:topicId/flashcards | done |
| GET, PUT | /settings | done |
| GET | /settings/topics | done |
| PUT | /settings/topics/:topicId | done |
| GET | /progress/dashboard | done |
| GET | /progress/lessons/:lessonId | done |
| POST | /progress/lessons/:lessonId/viewed | done |
| POST | /progress/lessons/:lessonId/sections | done |
| POST | /progress/exercises | done |
| POST | /review/quiz | done |
| POST | /review/quiz/:sessionId/answers | done |
| POST | /review/quiz/:sessionId/finish | done |
| GET | /review/cards/due | done |
| POST | /review/cards | done |

Every route is implemented. Behaviour for each is documented in the header comment of its route
file. Errors are `{ error: string }` with 400 (validation), 401 (auth) or 404 (unknown content id).

## 8. Web UI

Pages and what they show are documented in the header comment of each file under
`apps/web/src/pages`. Design direction for the UI session:

- **Reading-first.** One narrow column (max ~720px), generous line height, system font stack. The
  product is closer to a well-typeset book than to a dashboard.
- **The toolbar is the feature.** Level selector and mode toggle sit in a sticky bar above the lesson,
  always visible, with the estimated minutes and section progress beside them.
- **Collapsed, never hidden.** Non-primary blocks are `<details>` elements with a quiet label
  ("Engineer detail", "Manager lens"). Callouts are left-bordered asides, colour by kind.
- **Review mode is keyboard-driven** (1–4 to rate a card, Enter to flip / submit) and works one-handed
  on a phone-width viewport, since that is the mobile app in waiting.
- **No gamification beyond streak and minutes.** The user is a senior professional.

## 9. Mobile path

The web app is a client of the same API with no privileged access. To add mobile:

1. `apps/mobile` with Expo; dependencies `@itmc/core`, `@itmc/api-client`, secure token storage.
2. Reimplement `LessonRenderer` over the same block model (four block types, one audience rule).
3. Start with the review screen (flashcards/quiz), which is the highest-value mobile use case.
4. Offline: cache manifest + lessons keyed on `manifest.version`; queue the write endpoints, which
   are all idempotent upserts or append-only events.

Nothing in the API needs to change for this. If it ever does, that is an ADR.

## 10. Development workflow

```bash
pnpm install
cp .env.example .env
pnpm content:validate      # fast: errors only
pnpm content:build         # writes content/dist
pnpm db:generate           # after any schema.ts change
pnpm db:migrate            # applies migrations, seeds default user + AUTH_TOKEN
pnpm dev                   # api :4000 + web :5173 (vite proxies /api)
pnpm test                  # vitest: packages/core and apps/api
pnpm verify                # typecheck + validate content + test, in one command
```

Deployment target is one machine: `pnpm build`, then run `apps/api` under a process manager, and
the API serves `apps/web/dist` itself via `@fastify/static`, so a deployment is one process and
one port. See `docs/OPERATIONS.md`.
A Dockerfile and compose file are in the repo root for container deployments.
