/**
 * A small but schema-valid content bundle, plus a fake fetch, so the tests exercise the real
 * ContentBundleSchema validation path rather than a hand-stubbed content store.
 */
import type { ContentBundle } from '@itmc/core';

const sections = (ids: string[]) =>
  ids.map((id) => ({ id, title: id, blocks: [{ type: 'markdown' as const, audience: 'all' as const, md: `# ${id}` }] }));

const summary = (id: string, sectionIds: string[], estimatedMinutes = 12) => ({
  id,
  title: `Lesson ${id}`,
  estimatedMinutes,
  sectionCount: sectionIds.length,
  sectionIds,
  exerciseCount: 0,
  status: 'ready' as const,
});

export const TOPIC = 'java/oop';
export const LESSON = 'java/oop@rusty';
export const SECTIONS = ['intro', 'middle', 'end'];

export function makeBundle(): ContentBundle {
  const lessonIds = {
    beginner: 'java/oop@beginner',
    intermediate: 'java/oop@intermediate',
    rusty: 'java/oop@rusty',
  };

  return {
    manifest: {
      version: 'test-1',
      builtAt: '2026-01-01T00:00:00.000Z',
      modules: [
        {
          id: 'java',
          order: 1,
          title: 'Java',
          tagline: 'The language',
          whyItMatters: 'Because the bank runs on it.',
          topics: [
            {
              id: TOPIC,
              moduleId: 'java',
              slug: 'oop',
              order: 1,
              title: 'OOP fundamentals',
              summary: 'Objects, briefly.',
              prerequisites: [],
              tags: [],
              lessons: {
                beginner: summary(lessonIds.beginner, ['intro', 'middle']),
                intermediate: summary(lessonIds.intermediate, ['intro']),
                rusty: summary(lessonIds.rusty, SECTIONS, 12),
              },
              questionCount: 3,
              cardCount: 2,
            },
          ],
        },
      ],
    },
    lessons: {
      [lessonIds.beginner]: {
        id: lessonIds.beginner,
        topicId: TOPIC,
        level: 'beginner',
        title: 'OOP (beginner)',
        estimatedMinutes: 12,
        objectives: [],
        status: 'ready',
        sections: sections(['intro', 'middle']),
        exercises: [],
      },
      [lessonIds.intermediate]: {
        id: lessonIds.intermediate,
        topicId: TOPIC,
        level: 'intermediate',
        title: 'OOP (intermediate)',
        estimatedMinutes: 12,
        objectives: [],
        status: 'ready',
        sections: sections(['intro']),
        exercises: [],
      },
      [lessonIds.rusty]: {
        id: lessonIds.rusty,
        topicId: TOPIC,
        level: 'rusty',
        title: 'OOP (rusty)',
        estimatedMinutes: 12,
        objectives: [],
        status: 'ready',
        sections: sections(SECTIONS),
        exercises: [
          {
            id: `${lessonIds.rusty}/ex-one`,
            type: 'reflect',
            title: 'Think about it',
            audience: 'all',
            md: 'Do the thing.',
          },
        ],
      },
    },
    questions: [
      {
        id: `${TOPIC}/q-001`,
        topicId: TOPIC,
        levels: ['rusty'],
        audience: 'all',
        type: 'single',
        prompt: 'Which one?',
        options: ['a', 'b', 'c'],
        answer: [1],
        explanation: 'Because b.',
        tags: [],
      },
      {
        id: `${TOPIC}/q-002`,
        topicId: TOPIC,
        levels: ['rusty'],
        audience: 'all',
        type: 'multi',
        prompt: 'Which two?',
        options: ['a', 'b', 'c'],
        answer: [0, 2],
        explanation: 'Because a and c.',
        tags: [],
      },
      {
        id: `${TOPIC}/q-003`,
        topicId: TOPIC,
        levels: ['beginner'],
        audience: 'engineer',
        type: 'truefalse',
        prompt: 'True?',
        options: ['true', 'false'],
        answer: [0],
        explanation: 'Yes.',
        tags: [],
      },
    ],
    flashcards: [
      {
        id: `${TOPIC}/c-001`,
        topicId: TOPIC,
        levels: ['rusty'],
        audience: 'all',
        front: 'Front one',
        back: 'Back one',
        tags: [],
      },
      {
        id: `${TOPIC}/c-002`,
        topicId: TOPIC,
        levels: ['rusty'],
        audience: 'all',
        front: 'Front two',
        back: 'Back two',
        tags: [],
      },
    ],
  };
}

/** A fetch that serves the bundle and counts calls, so the "fetched once" contract is testable. */
export function fakeFetch(bundle: ContentBundle = makeBundle()) {
  let calls = 0;
  const impl = (async () => {
    calls += 1;
    return {
      ok: true,
      status: 200,
      json: async () => JSON.parse(JSON.stringify(bundle)) as unknown,
    } as Response;
  }) as unknown as typeof fetch;
  return { impl, calls: () => calls };
}
