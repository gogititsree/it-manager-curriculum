/**
 * Loads content/dist/bundle.json once at boot and exposes indexed lookups.
 * Content is immutable per deploy, so this is read once. Restart the process to pick up a rebuild.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  ContentBundleSchema,
  type ContentBundle,
  type Exercise,
  type Flashcard,
  type Lesson,
  type LessonSummary,
  type ModuleMeta,
  type QuizQuestion,
  type TopicMeta,
} from '@itmc/core';
import fp from 'fastify-plugin';

export interface ContentStore {
  manifest: ContentBundle['manifest'];
  lesson(id: string): Lesson | undefined;
  topic(id: string): TopicMeta | undefined;
  questionsFor(topicId: string): QuizQuestion[];
  flashcardsFor(topicId: string): Flashcard[];
  allQuestions(): QuizQuestion[];
  allFlashcards(): Flashcard[];
  // ---- additive indexes used by the settings/progress/review routes ----
  /** Manifest summary for a lessonId (sectionIds, sectionCount, estimatedMinutes, title). */
  lessonSummary(lessonId: string): LessonSummary | undefined;
  module(moduleId: string): ModuleMeta | undefined;
  question(questionId: string): QuizQuestion | undefined;
  flashcard(cardId: string): Flashcard | undefined;
  /** `${lessonId}/${slug}` -> the exercise and the lesson that owns it. */
  exercise(exerciseId: string): { exercise: Exercise; lessonId: string } | undefined;
}

declare module 'fastify' {
  interface FastifyInstance {
    content: ContentStore;
  }
}

export function loadContent(distDir: string): ContentStore {
  const bundle = ContentBundleSchema.parse(JSON.parse(readFileSync(join(distDir, 'bundle.json'), 'utf8')));
  const topics = new Map(bundle.manifest.modules.flatMap((m) => m.topics.map((t) => [t.id, t] as const)));
  const modules = new Map(bundle.manifest.modules.map((m) => [m.id, m] as const));
  const qByTopic = groupBy(bundle.questions, (q) => q.topicId);
  const cByTopic = groupBy(bundle.flashcards, (c) => c.topicId);
  const qById = new Map(bundle.questions.map((q) => [q.id, q] as const));
  const cById = new Map(bundle.flashcards.map((c) => [c.id, c] as const));

  const summaries = new Map<string, LessonSummary>();
  for (const t of topics.values()) {
    for (const s of Object.values(t.lessons)) if (s) summaries.set(s.id, s);
  }
  const exercises = new Map<string, { exercise: Exercise; lessonId: string }>();
  for (const [lessonId, lesson] of Object.entries(bundle.lessons)) {
    for (const ex of lesson.exercises) exercises.set(ex.id, { exercise: ex, lessonId });
  }

  return {
    manifest: bundle.manifest,
    lesson: (id) => bundle.lessons[id],
    topic: (id) => topics.get(id),
    questionsFor: (t) => qByTopic.get(t) ?? [],
    flashcardsFor: (t) => cByTopic.get(t) ?? [],
    allQuestions: () => bundle.questions,
    allFlashcards: () => bundle.flashcards,
    lessonSummary: (id) => summaries.get(id),
    module: (id) => modules.get(id),
    question: (id) => qById.get(id),
    flashcard: (id) => cById.get(id),
    exercise: (id) => exercises.get(id),
  };
}

export const contentPlugin = fp<{ distDir: string }>(async (app, opts) => {
  app.decorate('content', loadContent(opts.distDir));
});

function groupBy<T>(xs: T[], key: (x: T) => string): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const x of xs) {
    const k = key(x);
    m.set(k, [...(m.get(k) ?? []), x]);
  }
  return m;
}
