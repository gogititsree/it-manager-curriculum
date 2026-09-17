/** Read-only content routes. Implemented; nothing to hand off here. */
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';

export const contentRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get('/manifest', async () => app.content.manifest);

  app.get('/lessons/:lessonId', { schema: { params: z.object({ lessonId: z.string() }) } }, async (req, reply) => {
    const lesson = app.content.lesson(req.params.lessonId);
    if (!lesson) return reply.code(404).send({ error: 'lesson not found' });
    return lesson;
  });

  app.get('/topics/:topicId/questions', { schema: { params: z.object({ topicId: z.string() }) } }, async (req) =>
    app.content.questionsFor(req.params.topicId),
  );

  app.get('/topics/:topicId/flashcards', { schema: { params: z.object({ topicId: z.string() }) } }, async (req) =>
    app.content.flashcardsFor(req.params.topicId),
  );
};
