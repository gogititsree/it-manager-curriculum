/**
 * Resolves what to show for a topic: the per-topic level and mode, falling back to user defaults.
 * Platform-agnostic; move into @itmc/core when mobile needs it.
 */
import type { Level, Mode, TopicSettings, UserSettings } from '@itmc/core';

export function resolveTopicView(topicId: string, user: UserSettings, topics: TopicSettings[]): { level: Level; mode: Mode } {
  const t = topics.find((x) => x.topicId === topicId);
  return { level: t?.level ?? user.defaultLevel, mode: t?.mode ?? user.defaultMode };
}
