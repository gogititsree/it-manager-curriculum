/**
 * Presentation helpers only. No maths that belongs in @itmc/core: percentages arrive here already
 * computed by lessonCompletion / topicProgress / moduleProgress and are merely formatted.
 */
import type { ContentStatus, Level, Mode } from '@itmc/core';

export const LEVEL_LABEL: Record<Level, string> = {
  beginner: 'Beginner',
  intermediate: 'Intermediate',
  rusty: 'Rusty',
};

export const MODE_LABEL: Record<Mode, string> = { manager: 'Manager', engineer: 'Engineer' };

/** 0..1 -> "63%". Never computed here, only rendered. */
export const pct = (fraction: number): string => `${Math.round(fraction * 100)}%`;

export const minutes = (n: number): string => `${n} min`;

export function statusLabel(status: ContentStatus): string {
  return status === 'ready' ? 'Ready' : status === 'draft' ? 'Draft' : 'Not written yet';
}

export function relativeDay(iso: string | undefined): string {
  if (!iso) return '';
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return '';
  const days = Math.floor((Date.now() - then.getTime()) / 86_400_000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days} days ago`;
  if (days < 30) return `${Math.floor(days / 7)} weeks ago`;
  return then.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

/** "java/oop-fundamentals" -> ["java", "oop-fundamentals"] for breadcrumbs and route building. */
export function splitTopicId(topicId: string): { moduleId: string; slug: string } {
  const i = topicId.indexOf('/');
  return i < 0 ? { moduleId: topicId, slug: '' } : { moduleId: topicId.slice(0, i), slug: topicId.slice(i + 1) };
}

export const topicPath = (topicId: string): string => {
  const { moduleId, slug } = splitTopicId(topicId);
  return `/topics/${moduleId}/${slug}`;
};
