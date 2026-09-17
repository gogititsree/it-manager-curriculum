/**
 * Ids for the event-shaped records (attempts, quiz sessions, activity events).
 *
 * The API uses ULIDs; here the only requirements are uniqueness within one browser and lexical
 * sortability by creation time, so a base36 timestamp plus randomness is enough — and it avoids a
 * dependency in a package that must stay tiny and platform-agnostic.
 */
export function newId(): string {
  const t = Date.now().toString(36).padStart(9, '0');
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (c && typeof c.randomUUID === 'function') return `${t}${c.randomUUID().replace(/-/g, '').slice(0, 16)}`;
  const rand = (): string => Math.random().toString(36).slice(2, 10);
  return `${t}${rand()}${rand()}`;
}
