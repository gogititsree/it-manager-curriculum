/**
 * Spaced repetition for flashcards — an SM-2 variant tuned for "refresher between meetings" use
 * (ADR-008). Pure functions so web (offline-capable later) and API compute identical schedules.
 *
 * Ratings: 1 = again (blanked), 2 = hard, 3 = good, 4 = easy.
 */
export type Rating = 1 | 2 | 3 | 4;

export interface CardState {
  ease: number; // SM-2 ease factor, >= 1.3
  intervalDays: number; // 0 means "same session, re-ask in ~10 minutes"
  reps: number; // consecutive successful reviews
  lapses: number;
  dueAt: string; // ISO timestamp
  lastReviewedAt?: string;
  lastRating?: Rating;
}

const MIN_EASE = 1.3;
const MAX_INTERVAL_DAYS = 180; // a refresher app should never let something go quiet for a year
const RELEARN_MINUTES = 10;

export function initialCardState(now: Date = new Date()): CardState {
  return { ease: 2.5, intervalDays: 0, reps: 0, lapses: 0, dueAt: now.toISOString() };
}

export function scheduleReview(prev: CardState, rating: Rating, now: Date = new Date()): CardState {
  let { ease, intervalDays, reps, lapses } = prev;

  if (rating === 1) {
    lapses += 1;
    reps = 0;
    ease = Math.max(MIN_EASE, ease - 0.2);
    intervalDays = 0;
  } else if (rating === 2) {
    ease = Math.max(MIN_EASE, ease - 0.15);
    intervalDays = reps === 0 ? 1 : Math.max(1, Math.round(intervalDays * 1.2));
    reps += 1;
  } else if (rating === 3) {
    intervalDays = reps === 0 ? 1 : reps === 1 ? 3 : Math.round(intervalDays * ease);
    reps += 1;
  } else {
    ease += 0.15;
    intervalDays = reps === 0 ? 3 : Math.round(Math.max(intervalDays * ease * 1.3, 4));
    reps += 1;
  }

  intervalDays = Math.min(intervalDays, MAX_INTERVAL_DAYS);
  const due = new Date(now);
  if (intervalDays === 0) due.setMinutes(due.getMinutes() + RELEARN_MINUTES);
  else due.setDate(due.getDate() + intervalDays);

  return {
    ease: round2(ease),
    intervalDays,
    reps,
    lapses,
    dueAt: due.toISOString(),
    lastReviewedAt: now.toISOString(),
    lastRating: rating,
  };
}

export const isDue = (s: CardState, now: Date = new Date()): boolean => new Date(s.dueAt) <= now;

/**
 * Pick cards for a quick session: due cards first (oldest due first), then unseen cards, capped.
 * Generic over the wrapper so the API can pass DB rows and a client can pass cached ones.
 */
export function selectSessionCards<T extends { cardId: string; state?: CardState }>(
  candidates: T[],
  limit: number,
  now: Date = new Date(),
): T[] {
  const due = candidates
    .filter((c) => c.state && isDue(c.state, now))
    .sort((a, b) => a.state!.dueAt.localeCompare(b.state!.dueAt));
  const unseen = candidates.filter((c) => !c.state);
  return [...due, ...unseen].slice(0, limit);
}

const round2 = (n: number) => Math.round(n * 100) / 100;
