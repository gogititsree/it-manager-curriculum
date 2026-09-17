/**
 * @itmc/core — platform-agnostic domain layer.
 *
 * Everything here must run unchanged in Node (API), the browser (web) and React Native (mobile):
 * no fs, no DOM, no fetch. Pure types, schemas and functions only.
 *
 * OWNERSHIP: architecture-level. Changes to content.ts require an ADR (see HANDOFF.md).
 */
export * from './content.js';
export * from './ids.js';
export * from './progress.js';
export * from './srs.js';
export * from './api-types.js';
