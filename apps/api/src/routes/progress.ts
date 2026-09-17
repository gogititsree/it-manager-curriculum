/**
 * Reading progress: the dashboard aggregate, per-lesson progress, and the two write endpoints
 * (mark viewed, mark a section done) plus exercise attempts.
 *
 * GET  /dashboard                      -> DashboardDTO
 *        modules: for each module in manifest, moduleProgress(mod, inputs) from @itmc/core.
 * GET  /lessons/:lessonId              -> LessonProgressDTO (a not_started default if no row; never 404
 *                                        for a lesson that exists in content)
 * POST /lessons/:lessonId/viewed       -> upsert row, bump last_viewed_at, event 'lesson_viewed'
 * POST /lessons/:lessonId/sections     body SectionCompleteBody -> applySectionCompleted() from core,
 *                                        events 'section_completed' (+ 'lesson_completed' on the
 *                                        transition). Replaying is a no-op.
 * POST /exercises                      body ExerciseAttemptBody -> insert exercise_attempts, event
 *
 * lessonId / sectionId / exerciseId are validated against app.content; 404 otherwise.
 */
import {
  ExerciseAttemptBody,
  SectionCompleteBody,
  applySectionCompleted,
  lessonCompletion,
  moduleProgress,
  type DashboardDTO,
  type LessonProgressDTO,
  type ModuleProgress,
  type ProgressInputs,
} from '@itmc/core';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { ExerciseAttemptResponse } from '../lib/dto.js';
import { minutesToday, recordEvent, streakDays } from '../lib/repos/events.js';
import {
  allLessonRows,
  cardsDueByTopic,
  getLessonRow,
  insertExerciseAttempt,
  markViewed,
  quizBestByLesson,
  recentLessonRows,
  saveLessonRow,
  toDto,
} from '../lib/repos/progress.js';
import { getUserSettings, selectedLevelByTopic } from '../lib/repos/settings.js';

const lessonParams = z.object({ lessonId: z.string() });

export const progressRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get('/dashboard', async (req): Promise<DashboardDTO> => {
    const now = new Date();
    const nowIso = now.toISOString();
    const userId = req.userId;

    const [settings, selectedLevel, lessonRows, quizBest, cardsDue, recent, streak, minutes] = await Promise.all([
      getUserSettings(app.db, userId),
      selectedLevelByTopic(app.db, userId),
      allLessonRows(app.db, userId),
      quizBestByLesson(app.db, userId),
      cardsDueByTopic(app.db, userId, nowIso),
      recentLessonRows(app.db, userId, 5),
      streakDays(app.db, userId, now),
      minutesToday(app.db, userId, app.content, now),
    ]);

    const inputs: ProgressInputs = {
      lessonRows,
      quizBestByLesson: quizBest,
      cardsDueByTopic: cardsDue,
      selectedLevelByTopic: selectedLevel,
      defaultLevel: settings.defaultLevel,
    };

    const modules: Record<string, ModuleProgress> = {};
    for (const mod of app.content.manifest.modules) modules[mod.id] = moduleProgress(mod, inputs);

    let cardsDueTotal = 0;
    for (const n of cardsDue.values()) cardsDueTotal += n;

    const recentDto = recent.flatMap((row) => {
      const summary = app.content.lessonSummary(row.lessonId);
      if (!summary || !row.lastViewedAt) return [];
      return [
        {
          lessonId: row.lessonId,
          title: summary.title,
          lastViewedAt: row.lastViewedAt,
          completion: lessonCompletion(summary, row),
        },
      ];
    });

    return {
      streakDays: streak,
      minutesToday: minutes,
      cardsDue: cardsDueTotal,
      modules,
      recent: recentDto,
    };
  });

  app.get('/lessons/:lessonId', { schema: { params: lessonParams } }, async (req, reply) => {
    const { lessonId } = req.params;
    if (!app.content.lessonSummary(lessonId) && !app.content.lesson(lessonId)) {
      return reply.code(404).send({ error: 'lesson not found' });
    }
    const row = await getLessonRow(app.db, req.userId, lessonId);
    const dto: LessonProgressDTO = row
      ? toDto(row)
      : { lessonId, status: 'not_started', completedSectionIds: [] };
    return dto;
  });

  app.post('/lessons/:lessonId/viewed', { schema: { params: lessonParams } }, async (req, reply) => {
    const { lessonId } = req.params;
    if (!app.content.lessonSummary(lessonId) && !app.content.lesson(lessonId)) {
      return reply.code(404).send({ error: 'lesson not found' });
    }
    const now = new Date().toISOString();
    const row = await markViewed(app.db, req.userId, lessonId, now);
    await recordEvent(app.db, req.userId, 'lesson_viewed', lessonId, null, now);
    return toDto(row);
  });

  app.post(
    '/lessons/:lessonId/sections',
    { schema: { params: lessonParams, body: SectionCompleteBody } },
    async (req, reply) => {
      const { lessonId } = req.params;
      const summary = app.content.lessonSummary(lessonId);
      if (!summary) return reply.code(404).send({ error: 'lesson not found' });
      const { sectionId } = req.body;
      if (!summary.sectionIds.includes(sectionId)) {
        return reply.code(404).send({ error: 'section not found' });
      }

      const now = new Date().toISOString();
      const before = await getLessonRow(app.db, req.userId, lessonId);
      const alreadyDone = before?.completedSectionIds.includes(sectionId) ?? false;
      const wasCompleted = before?.status === 'completed';

      const after = applySectionCompleted(before, lessonId, sectionId, summary, now);
      // applySectionCompleted drops completedAt when the lesson is no longer complete; keep a
      // previously recorded completion date if the row was already finished.
      if (wasCompleted && before?.completedAt && !after.completedAt) after.completedAt = before.completedAt;
      await saveLessonRow(app.db, req.userId, after, now);

      if (!alreadyDone) {
        await recordEvent(app.db, req.userId, 'section_completed', lessonId, { sectionId }, now);
      }
      if (after.status === 'completed' && !wasCompleted) {
        await recordEvent(app.db, req.userId, 'lesson_completed', lessonId, null, now);
      }
      return toDto(after);
    },
  );

  app.post('/exercises', { schema: { body: ExerciseAttemptBody } }, async (req, reply) => {
    const found = app.content.exercise(req.body.exerciseId);
    if (!found) return reply.code(404).send({ error: 'exercise not found' });

    const now = new Date().toISOString();
    const id = await insertExerciseAttempt(app.db, req.userId, found.lessonId, req.body, now);
    await recordEvent(
      app.db,
      req.userId,
      'exercise_attempted',
      req.body.exerciseId,
      { lessonId: found.lessonId, selfRating: req.body.selfRating },
      now,
    );
    const res: ExerciseAttemptResponse = { id };
    return res;
  });
};
