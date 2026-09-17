/**
 * The storage port and a defensive wrapper around it.
 *
 * `KeyValueStore` is the ONLY way this package touches persistence, so the package stays
 * platform-agnostic (no localStorage, no fs, no process). The web app injects a localStorage-backed
 * implementation; a test injects a Map; React Native could inject AsyncStorage's sync mirror.
 *
 * Browser storage fails in ways that must never crash a reading app: a private window can throw on
 * access, a full origin throws QuotaExceededError on write, an extension can block it entirely.
 * `SafeStore` therefore keeps an in-memory mirror that is always authoritative for this tab: writes
 * land in memory first and are then *attempted* against the real store. If the real store is
 * unavailable the session still works end to end; it just does not survive a reload.
 */

export interface KeyValueStore {
  get(key: string): string | null;
  set(key: string, value: string): void;
  remove(key: string): void;
  keys(): string[];
}

/** Everything this package writes lives under this prefix, with the schema version baked in. */
export const NAMESPACE = 'itmc.v1.';
export const SCHEMA_VERSION = 1;

export const K = {
  meta: `${NAMESPACE}meta`,
  settings: `${NAMESPACE}settings`,
  topicSettings: `${NAMESPACE}topicSettings`,
  events: `${NAMESPACE}events`,
  exercises: `${NAMESPACE}exercises`,
  progressPrefix: `${NAMESPACE}progress.`,
  quizPrefix: `${NAMESPACE}quiz.`,
  cardPrefix: `${NAMESPACE}card.`,
  progress: (lessonId: string): string => `${NAMESPACE}progress.${lessonId}`,
  quiz: (sessionId: string): string => `${NAMESPACE}quiz.${sessionId}`,
  card: (cardId: string): string => `${NAMESPACE}card.${cardId}`,
} as const;

/** An in-memory KeyValueStore. Used as the fallback mirror, and by tests. */
export function memoryStore(seed?: Record<string, string>): KeyValueStore {
  const m = new Map<string, string>(Object.entries(seed ?? {}));
  return {
    get: (k) => (m.has(k) ? (m.get(k) as string) : null),
    set: (k, v) => void m.set(k, v),
    remove: (k) => void m.delete(k),
    keys: () => [...m.keys()],
  };
}

export class SafeStore {
  private readonly mirror = new Map<string, string>();
  /** True once a real read or write has failed; surfaced so the UI can warn if it ever wants to. */
  public degraded = false;

  constructor(private readonly inner: KeyValueStore) {
    // Warm the mirror so a store that starts working and later throws keeps serving what it had.
    try {
      for (const k of this.inner.keys()) {
        if (!k.startsWith(NAMESPACE)) continue;
        const v = this.inner.get(k);
        if (v !== null) this.mirror.set(k, v);
      }
    } catch {
      this.degraded = true;
    }
  }

  get(key: string): string | null {
    if (this.mirror.has(key)) return this.mirror.get(key) as string;
    try {
      const v = this.inner.get(key);
      if (v !== null) this.mirror.set(key, v);
      return v;
    } catch {
      this.degraded = true;
      return null;
    }
  }

  set(key: string, value: string): void {
    this.mirror.set(key, value);
    try {
      this.inner.set(key, value);
    } catch {
      this.degraded = true;
    }
  }

  remove(key: string): void {
    this.mirror.delete(key);
    try {
      this.inner.remove(key);
    } catch {
      this.degraded = true;
    }
  }

  /** Namespaced keys only, from the mirror and the real store, deduped. */
  keys(): string[] {
    const out = new Set<string>();
    for (const k of this.mirror.keys()) if (k.startsWith(NAMESPACE)) out.add(k);
    try {
      for (const k of this.inner.keys()) if (k.startsWith(NAMESPACE)) out.add(k);
    } catch {
      this.degraded = true;
    }
    return [...out];
  }

  keysWithPrefix(prefix: string): string[] {
    return this.keys().filter((k) => k.startsWith(prefix));
  }

  getJson<T>(key: string, fallback: T): T {
    const raw = this.get(key);
    if (raw === null) return fallback;
    try {
      const parsed: unknown = JSON.parse(raw);
      return parsed === null || parsed === undefined ? fallback : (parsed as T);
    } catch {
      // Corrupt value: treat as absent rather than throwing into a render.
      return fallback;
    }
  }

  setJson(key: string, value: unknown): void {
    try {
      this.set(key, JSON.stringify(value));
    } catch {
      this.degraded = true;
    }
  }

  /** Stamp the schema version so a future migration can tell old data from new. */
  ensureSchema(): void {
    const meta = this.getJson<{ schemaVersion?: number }>(K.meta, {});
    if (meta.schemaVersion !== SCHEMA_VERSION) {
      this.setJson(K.meta, { ...meta, schemaVersion: SCHEMA_VERSION });
    }
  }

  clearNamespace(): void {
    for (const k of this.keys()) this.remove(k);
  }
}
