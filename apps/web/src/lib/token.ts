/**
 * The API token, and a tiny subscribable store around it so the auth gate and the settings page
 * agree without a context provider. Self-hosted single-user install: one bearer token in
 * localStorage (docs/DESIGN-DECISIONS.md ADR-009). lib/api.ts reads the same key.
 */
import { useSyncExternalStore } from 'react';

export const TOKEN_KEY = 'itmc.token';

const listeners = new Set<() => void>();

function read(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

let snapshot: string | null = read();

function emit() {
  snapshot = read();
  for (const l of listeners) l();
}

export function getToken(): string | null {
  return snapshot;
}

export function setToken(value: string) {
  try {
    localStorage.setItem(TOKEN_KEY, value.trim());
  } catch {
    /* private mode: the session still works, it just will not survive a reload */
  }
  emit();
}

export function clearToken() {
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* ignore */
  }
  emit();
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  const onStorage = (e: StorageEvent) => {
    if (e.key === TOKEN_KEY || e.key === null) emit();
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(cb);
    window.removeEventListener('storage', onStorage);
  };
}

export function useToken(): string | null {
  return useSyncExternalStore(subscribe, () => snapshot, () => snapshot);
}
