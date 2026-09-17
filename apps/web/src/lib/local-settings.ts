/**
 * A local mirror of the settings the API owns.
 *
 * Level and mode decide what you are even reading, so the reading screen cannot be allowed to fail
 * just because /api/settings is unavailable. Every successful read from the API overwrites this
 * mirror; every change writes it before the request goes out. When the API answers, it wins.
 * When it does not, the app still opens at the level and mode the user last chose.
 */
import type { Level, Mode, TopicSettings, UserSettings } from '@itmc/core';

const USER_KEY = 'itmc.settings.user';
const TOPICS_KEY = 'itmc.settings.topics';

export const DEFAULT_USER_SETTINGS: UserSettings = {
  defaultLevel: 'beginner',
  defaultMode: 'manager',
  dailyGoalMinutes: 20,
};

const LEVELS = new Set<string>(['beginner', 'intermediate', 'rusty']);
const MODES = new Set<string>(['manager', 'engineer']);

function parse<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore */
  }
}

export function readLocalUserSettings(): UserSettings {
  const v = parse<Partial<UserSettings>>(USER_KEY, {});
  return {
    defaultLevel: LEVELS.has(v.defaultLevel ?? '') ? (v.defaultLevel as Level) : DEFAULT_USER_SETTINGS.defaultLevel,
    defaultMode: MODES.has(v.defaultMode ?? '') ? (v.defaultMode as Mode) : DEFAULT_USER_SETTINGS.defaultMode,
    dailyGoalMinutes:
      typeof v.dailyGoalMinutes === 'number' && v.dailyGoalMinutes > 0
        ? v.dailyGoalMinutes
        : DEFAULT_USER_SETTINGS.dailyGoalMinutes,
  };
}

export const writeLocalUserSettings = (s: UserSettings) => write(USER_KEY, s);

export function readLocalTopicSettings(): TopicSettings[] {
  const v = parse<TopicSettings[]>(TOPICS_KEY, []);
  return Array.isArray(v)
    ? v.filter((t) => t && typeof t.topicId === 'string' && LEVELS.has(t.level) && MODES.has(t.mode))
    : [];
}

export const writeLocalTopicSettings = (list: TopicSettings[]) => write(TOPICS_KEY, list);

export function mergeLocalTopicSetting(next: TopicSettings): TopicSettings[] {
  const list = readLocalTopicSettings().filter((t) => t.topicId !== next.topicId);
  list.push(next);
  writeLocalTopicSettings(list);
  return list;
}
