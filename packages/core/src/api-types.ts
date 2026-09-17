/**
 * Request / response contracts for apps/api, shared with packages/api-client so web and mobile get
 * the same types. Zod schemas double as Fastify validators.
 *
 * Routes in apps/api import their schemas from here rather than redeclaring shapes inline.
 */
import { z } from 'zod';
import { LevelSchema, ModeSchema } from './content.js';
import type { LessonStatus, ModuleProgress } from './progress.js';

export const TopicSettingsSchema = z.object({
  topicId: z.string(),
  level: LevelSchema,
  mode: ModeSchema,
});
export type TopicSettings = z.infer<typeof TopicSettingsSchema>;

export const UserSettingsSchema = z.object({
  defaultLevel: LevelSchema,
  defaultMode: ModeSchema,
  dailyGoalMinutes: z.number().int().positive().max(240),
});
export type UserSettings = z.infer<typeof UserSettingsSchema>;

export const SectionCompleteBody = z.object({ sectionId: z.string() });
export type SectionCompleteInput = z.infer<typeof SectionCompleteBody>;

export const ExerciseAttemptBody = z.object({
  exerciseId: z.string(),
  submission: z.string().max(20_000).optional(),
  /** 1 = struggled, 5 = confident */
  selfRating: z.number().int().min(1).max(5),
  notes: z.string().max(5_000).optional(),
});
export type ExerciseAttemptInput = z.infer<typeof ExerciseAttemptBody>;

export const StartQuizBody = z.object({
  scopeType: z.enum(['topic', 'module', 'all']),
  scopeId: z.string().optional(),
  level: LevelSchema,
  mode: ModeSchema,
  count: z.number().int().min(1).max(50).default(10),
});
export type StartQuizInput = z.input<typeof StartQuizBody>;

export const AnswerQuizBody = z.object({
  questionId: z.string(),
  chosen: z.array(z.number().int().nonnegative()),
});
export type AnswerQuizInput = z.infer<typeof AnswerQuizBody>;

export const ReviewCardBody = z.object({
  cardId: z.string(),
  rating: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
});
export type ReviewCardInput = z.infer<typeof ReviewCardBody>;

export interface LessonProgressDTO {
  lessonId: string;
  status: LessonStatus;
  completedSectionIds: string[];
  lastViewedAt?: string;
  completedAt?: string;
}

export interface DashboardDTO {
  streakDays: number;
  minutesToday: number;
  cardsDue: number;
  /** moduleId -> ModuleProgress (from progress.ts) */
  modules: Record<string, ModuleProgress>;
  /** Resume points, most recent first. */
  recent: { lessonId: string; title: string; lastViewedAt: string; completion: number }[];
}
