import { describe, expect, it } from 'vitest';
import { applySectionCompleted, lessonCompletion } from '../src/progress.js';
import type { LessonSummary } from '../src/content.js';

const summary: LessonSummary = {
  id: 'java/oop-fundamentals@beginner',
  title: 'x',
  estimatedMinutes: 10,
  sectionCount: 2,
  sectionIds: ['a', 'b'],
  exerciseCount: 0,
  status: 'ready',
};

describe('progress', () => {
  it('ignores section ids that no longer exist in content', () => {
    const row = { lessonId: summary.id, status: 'in_progress' as const, completedSectionIds: ['a', 'zzz'] };
    expect(lessonCompletion(summary, row)).toBe(0.5);
  });
  it('completes the lesson when the last section is done', () => {
    const r1 = applySectionCompleted(undefined, summary.id, 'a', summary, 't1');
    expect(r1.status).toBe('in_progress');
    const r2 = applySectionCompleted(r1, summary.id, 'b', summary, 't2');
    expect(r2.status).toBe('completed');
    expect(r2.completedAt).toBe('t2');
  });
});
