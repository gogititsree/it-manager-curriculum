/** user_settings + topic_settings. No business rules here; the routes decide what changed. */
import type { Level, TopicSettings, UserSettings } from '@itmc/core';
import type { Db } from '@itmc/db';
import { topicSettings, userSettings } from '@itmc/db';
import { and, eq } from 'drizzle-orm';

/** Mirrors the column defaults in packages/db/src/schema.ts. */
export const DEFAULT_USER_SETTINGS: UserSettings = {
  defaultLevel: 'rusty',
  defaultMode: 'manager',
  dailyGoalMinutes: 20,
};

export async function getUserSettings(db: Db, userId: string): Promise<UserSettings> {
  const row = await db.select().from(userSettings).where(eq(userSettings.userId, userId)).get();
  if (!row) return { ...DEFAULT_USER_SETTINGS };
  return {
    defaultLevel: row.defaultLevel,
    defaultMode: row.defaultMode,
    dailyGoalMinutes: row.dailyGoalMinutes,
  };
}

export async function putUserSettings(
  db: Db,
  userId: string,
  next: UserSettings,
  now: string,
): Promise<UserSettings> {
  const values = {
    userId,
    defaultLevel: next.defaultLevel,
    defaultMode: next.defaultMode,
    dailyGoalMinutes: next.dailyGoalMinutes,
    updatedAt: now,
  };
  await db
    .insert(userSettings)
    .values(values)
    .onConflictDoUpdate({
      target: userSettings.userId,
      set: {
        defaultLevel: values.defaultLevel,
        defaultMode: values.defaultMode,
        dailyGoalMinutes: values.dailyGoalMinutes,
        updatedAt: now,
      },
    })
    .run();
  return { ...next };
}

export async function listTopicSettings(db: Db, userId: string): Promise<TopicSettings[]> {
  const rows = await db
    .select({ topicId: topicSettings.topicId, level: topicSettings.level, mode: topicSettings.mode })
    .from(topicSettings)
    .where(eq(topicSettings.userId, userId))
    .all();
  return rows.map((r) => ({ topicId: r.topicId, level: r.level, mode: r.mode }));
}

export async function getTopicSetting(
  db: Db,
  userId: string,
  topicId: string,
): Promise<TopicSettings | undefined> {
  const row = await db
    .select({ topicId: topicSettings.topicId, level: topicSettings.level, mode: topicSettings.mode })
    .from(topicSettings)
    .where(and(eq(topicSettings.userId, userId), eq(topicSettings.topicId, topicId)))
    .get();
  return row ? { topicId: row.topicId, level: row.level, mode: row.mode } : undefined;
}

export async function upsertTopicSetting(
  db: Db,
  userId: string,
  next: TopicSettings,
  now: string,
): Promise<TopicSettings> {
  await db
    .insert(topicSettings)
    .values({ userId, topicId: next.topicId, level: next.level, mode: next.mode, updatedAt: now })
    .onConflictDoUpdate({
      target: [topicSettings.userId, topicSettings.topicId],
      set: { level: next.level, mode: next.mode, updatedAt: now },
    })
    .run();
  return { ...next };
}

/** topicId -> the level the user chose for it. Topics without a row fall back to defaultLevel. */
export async function selectedLevelByTopic(db: Db, userId: string): Promise<Map<string, Level>> {
  const rows = await listTopicSettings(db, userId);
  return new Map(rows.map((r) => [r.topicId, r.level] as const));
}
