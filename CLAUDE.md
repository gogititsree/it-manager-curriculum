# IT Manager Curriculum — instructions for Claude sessions

Read these first, in order:
1. `HANDOFF.md` — what is done, what is yours to do, and the rules for changing shared code.
2. `docs/ARCHITECTURE.md` — system shape, packages, request and content flows.
3. `docs/DATA-MODEL.md` — tables, IDs, how progress is derived.
4. `docs/CONTENT-AUTHORING.md` — required reading before writing anything under `content/`.

Hard rules:
- Do not change `packages/core/src/content.ts` or `packages/db/src/schema.ts` without adding an ADR to `docs/DESIGN-DECISIONS.md`.
- Content lives only in `content/modules/**`. Never hand-edit `content/dist/`.
- Every lesson must pass `pnpm content:validate` before you report it finished.
- Web and mobile share `packages/core` and `packages/api-client`; keep platform-specific code out of both.
