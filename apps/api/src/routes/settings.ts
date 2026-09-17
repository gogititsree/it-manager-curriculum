/**
 * User + per-topic settings.
 *
 * GET  /             -> UserSettings (from user_settings; the row is guaranteed by the migrate seed)
 * PUT  /             body UserSettingsSchema -> upsert, return row
 * GET  /topics       -> TopicSettings[] for req.userId
 * PUT  /topics/:topicId   body TopicSettingsSchema -> upsert topic_settings; append activity_events
 *                    'level_changed' / 'mode_changed' only when the value actually changed.
 *
 * "Actually changed" is measured against the topic's previous *effective* value: the topic_settings
 * row if there is one, otherwise the user's defaults (an absent row means "use defaults").
 */
import { TopicSettingsSchema, UserSettingsSchema, type TopicSettings, type UserSettings } from '@itmc/core';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { recordEvent } from '../lib/repos/events.js';
import {
  getTopicSetting,
  getUserSettings,
  listTopicSettings,
  putUserSettings,
  upsertTopicSetting,
} from '../lib/repos/settings.js';

export const settingsRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get('/', async (req): Promise<UserSettings> => getUserSettings(app.db, req.userId));

  app.put('/', { schema: { body: UserSettingsSchema } }, async (req): Promise<UserSettings> => {
    return putUserSettings(app.db, req.userId, req.body, new Date().toISOString());
  });

  app.get('/topics', async (req): Promise<TopicSettings[]> => listTopicSettings(app.db, req.userId));

  app.put(
    '/topics/:topicId',
    { schema: { params: z.object({ topicId: z.string() }), body: TopicSettingsSchema } },
    async (req, reply) => {
      const { topicId } = req.params;
      if (!app.content.topic(topicId)) return reply.code(404).send({ error: 'topic not found' });

      const now = new Date().toISOString();
      const previous = await getTopicSetting(app.db, req.userId, topicId);
      const defaults = previous ? undefined : await getUserSettings(app.db, req.userId);
      const prevLevel = previous?.level ?? defaults?.defaultLevel;
      const prevMode = previous?.mode ?? defaults?.defaultMode;

      const next: TopicSettings = { topicId, level: req.body.level, mode: req.body.mode };
      const saved = await upsertTopicSetting(app.db, req.userId, next, now);

      if (prevLevel !== saved.level) {
        await recordEvent(app.db, req.userId, 'level_changed', topicId, { from: prevLevel, to: saved.level }, now);
      }
      if (prevMode !== saved.mode) {
        await recordEvent(app.db, req.userId, 'mode_changed', topicId, { from: prevMode, to: saved.mode }, now);
      }
      return saved;
    },
  );
};
