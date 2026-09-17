# apps/mobile (future)

Planned: Expo (React Native) app. Not started. When it starts:

- Depend on `@itmc/core` and `@itmc/api-client` only; never import from `apps/web`.
- Store the bearer token in `expo-secure-store`; pass it via `getToken`.
- Implement a `LessonRenderer` over the same block model (markdown / code / callout / exercise) using
  a React Native markdown renderer. Section-done, level selector and mode toggle behave identically
  to the web versions.
- Offline: cache the manifest and visited lessons keyed on `manifest.version`; queue progress and
  card-review writes for replay. Both are idempotent upserts (see docs/DATA-MODEL.md).
- The primary mobile use case is review mode (flashcards / quiz). Build that screen first.
