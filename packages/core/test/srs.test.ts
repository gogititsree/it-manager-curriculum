import { describe, expect, it } from 'vitest';
import { initialCardState, scheduleReview } from '../src/srs.js';

describe('scheduleReview', () => {
  const now = new Date('2026-09-15T09:00:00Z');
  it('good on a new card schedules 1 day', () => {
    const s = scheduleReview(initialCardState(now), 3, now);
    expect(s.intervalDays).toBe(1);
    expect(s.reps).toBe(1);
  });
  it('again resets reps and drops ease but never below 1.3', () => {
    let s = initialCardState(now);
    for (let i = 0; i < 10; i++) s = scheduleReview(s, 1, now);
    expect(s.ease).toBe(1.3);
    expect(s.reps).toBe(0);
    expect(s.lapses).toBe(10);
  });
  it('intervals are capped at 180 days', () => {
    let s = initialCardState(now);
    for (let i = 0; i < 20; i++) s = scheduleReview(s, 4, now);
    expect(s.intervalDays).toBeLessThanOrEqual(180);
  });
});
