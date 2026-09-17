/**
 * Browser-side content store. The static build ships the same `bundle.json` the API loads at boot,
 * so this is the fetch-shaped twin of apps/api/src/plugins/content.ts: fetch once, validate with
 * ContentBundleSchema, index, keep in memory for the life of the page.
 *
 * The fetch is memoised on the promise, not the result, so ten hooks mounting at once produce one
 * request. A failed load is not memoised, so a reload-less retry can still succeed.
 */
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
import { LocalClientError } from './errors.js';

export interface ContentStore {
  manifest: ContentBundle['manifest'];
  lesson(id: string): Lesson | undefined;
  topic(id: string): TopicMeta | undefined;
  module(moduleId: string): ModuleMeta | undefined;
  questionsFor(topicId: string): QuizQuestion[];
  flashcardsFor(topicId: string): Flashcard[];
  allQuestions(): QuizQuestion[];
  allFlashcards(): Flashcard[];
  lessonSummary(lessonId: string): LessonSummary | undefined;
  question(questionId: string): QuizQuestion | undefined;
  flashcard(cardId: string): Flashcard | undefined;
  exercise(exerciseId: string): { exercise: Exercise; lessonId: string } | undefined;
}

export function indexBundle(bundle: ContentBundle): ContentStore {
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
    module: (id) => modules.get(id),
    questionsFor: (t) => qByTopic.get(t) ?? [],
    flashcardsFor: (t) => cByTopic.get(t) ?? [],
    allQuestions: () => bundle.questions,
    allFlashcards: () => bundle.flashcards,
    lessonSummary: (id) => summaries.get(id),
    question: (id) => qById.get(id),
    flashcard: (id) => cById.get(id),
    exercise: (id) => exercises.get(id),
  };
}

export function createContentLoader(bundleUrl: string, fetchImpl?: typeof fetch): () => Promise<ContentStore> {
  let cached: ContentStore | undefined;
  let inFlight: Promise<ContentStore> | undefined;

  return function load(): Promise<ContentStore> {
    if (cached) return Promise.resolve(cached);
    if (inFlight) return inFlight;

    const f = fetchImpl ?? (globalThis.fetch as typeof fetch | undefined);
    if (!f) {
      return Promise.reject(new LocalClientError(500, 'no fetch implementation available'));
    }

    inFlight = (async () => {
      const res = await f(bundleUrl, { credentials: 'omit' });
      if (!res.ok) {
        throw new LocalClientError(res.status, `content bundle ${bundleUrl} -> ${res.status}`);
      }
      const json: unknown = await res.json();
      const parsed = ContentBundleSchema.safeParse(json);
      if (!parsed.success) {
        throw new LocalClientError(500, `content bundle at ${bundleUrl} is not a valid ContentBundle`, parsed.error.issues);
      }
      const store = indexBundle(parsed.data);
      cached = store;
      return store;
    })().finally(() => {
      inFlight = undefined;
    });

    return inFlight;
  };
}

function groupBy<T>(xs: T[], key: (x: T) => string): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const x of xs) {
    const k = key(x);
    const list = m.get(k);
    if (list) list.push(x);
    else m.set(k, [x]);
  }
  return m;
}
