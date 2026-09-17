import { LEVELS, type Level } from './content.js';

export const lessonId = (topicId: string, level: Level): string => `${topicId}@${level}`;

export function parseLessonId(id: string): { topicId: string; level: Level } {
  const at = id.lastIndexOf('@');
  if (at < 0) throw new Error(`Invalid lesson id: ${id}`);
  const topicId = id.slice(0, at);
  const level = id.slice(at + 1) as Level;
  if (!(LEVELS as readonly string[]).includes(level)) throw new Error(`Invalid level in lesson id: ${id}`);
  return { topicId, level };
}

export const moduleIdOf = (topicId: string): string => topicId.split('/')[0] ?? topicId;

export function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
