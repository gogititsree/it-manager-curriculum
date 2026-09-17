/**
 * The localStorage adapter for @itmc/local-client.
 *
 * It lives here, not in the package, because the package must stay platform-agnostic
 * (docs/ARCHITECTURE.md §3): `local-client` knows only the `KeyValueStore` port, and the platform
 * supplies the implementation. A React Native build would pass a different one.
 *
 * This adapter does not swallow errors — `SafeStore` inside the package does that, and it needs to
 * see the failure in order to mark itself degraded.
 */
import type { KeyValueStore } from '@itmc/local-client';

export function browserKeyValueStore(): KeyValueStore {
  return {
    get: (key) => localStorage.getItem(key),
    set: (key, value) => localStorage.setItem(key, value),
    remove: (key) => localStorage.removeItem(key),
    keys: () => {
      const out: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k !== null) out.push(k);
      }
      return out;
    },
  };
}
