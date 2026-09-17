/**
 * Theme preference. Three states: 'system' (default), 'light', 'dark'. Only this module writes the
 * data-theme attribute that index.css keys off; everything else reads tokens.
 */
import { useSyncExternalStore } from 'react';

export const THEME_KEY = 'itmc.theme';
export const THEMES = ['system', 'light', 'dark'] as const;
export type ThemePref = (typeof THEMES)[number];

const listeners = new Set<() => void>();

function read(): ThemePref {
  try {
    const v = localStorage.getItem(THEME_KEY);
    return (THEMES as readonly string[]).includes(v ?? '') ? (v as ThemePref) : 'system';
  } catch {
    return 'system';
  }
}

let snapshot: ThemePref = read();

const media = typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : undefined;

/** Resolves 'system' against the OS and stamps the root element. */
export function applyTheme(pref: ThemePref = snapshot) {
  const dark = pref === 'dark' || (pref === 'system' && !!media?.matches);
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
}

export function setThemePref(pref: ThemePref) {
  try {
    localStorage.setItem(THEME_KEY, pref);
  } catch {
    /* ignore */
  }
  snapshot = pref;
  applyTheme(pref);
  for (const l of listeners) l();
}

/** Call once at boot, before first paint where possible. */
export function initTheme() {
  applyTheme();
  media?.addEventListener('change', () => {
    if (snapshot === 'system') applyTheme();
  });
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => void listeners.delete(cb);
}

export function useThemePref(): ThemePref {
  return useSyncExternalStore(subscribe, () => snapshot, () => snapshot);
}
