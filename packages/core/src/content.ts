/**
 * Content schemas. These describe the COMPILED content the API serves (content/dist), which is what
 * web and mobile consume. The authoring format (markdown + yaml under content/modules) is documented
 * in docs/CONTENT-AUTHORING.md and compiled by tools/content-build into these shapes.
 *
 * Design intent (ADR-003, ADR-004): prose stays as markdown strings inside coarse "blocks";
 * structure is only imposed where the app needs to act on it — sections (progress tracking),
 * audience (manager-mode filtering), code (syntax highlighting), callouts, exercises.
 */
import { z } from 'zod';

// ---------- Enumerations ----------

export const LEVELS = ['beginner', 'intermediate', 'rusty'] as const;
export const LevelSchema = z.enum(LEVELS);
export type Level = z.infer<typeof LevelSchema>;

export const MODES = ['manager', 'engineer'] as const;
export const ModeSchema = z.enum(MODES);
export type Mode = z.infer<typeof ModeSchema>;

/** Who a block is for. 'all' is always shown; 'manager'/'engineer' are shown or collapsed by mode. */
export const AudienceSchema = z.enum(['all', 'manager', 'engineer']);
export type Audience = z.infer<typeof AudienceSchema>;

export const CalloutKindSchema = z.enum([
  'tip',
  'warning',
  'gotcha',
  'manager-lens', // what a manager should take from this
  'bank-context', // regulated / financial-services angle
  'changed-since', // Rusty level: what changed since you last used this
  'decision', // a tradeoff framed as a decision
]);
export type CalloutKind = z.infer<typeof CalloutKindSchema>;

export const ContentStatusSchema = z.enum(['stub', 'draft', 'ready']);
export type ContentStatus = z.infer<typeof ContentStatusSchema>;

// ---------- Lesson body ----------

export const ExerciseSchema = z.object({
  /** `${lessonId}/${slug}` e.g. "java/oop-fundamentals@beginner/ex-shapes" */
  id: z.string().min(1),
  type: z.enum(['code', 'design', 'reflect', 'scenario']),
  title: z.string().min(1),
  audience: AudienceSchema.default('all'),
  /** Prompt body, markdown. */
  md: z.string(),
  /** Model answer / discussion, markdown. Revealed on demand. */
  solutionMd: z.string().optional(),
});
export type Exercise = z.infer<typeof ExerciseSchema>;

const audience = AudienceSchema.default('all');

export const BlockSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('markdown'), audience, md: z.string() }),
  z.object({
    type: z.literal('code'),
    audience,
    lang: z.string().optional(),
    code: z.string(),
    caption: z.string().optional(),
  }),
  z.object({
    type: z.literal('callout'),
    audience,
    kind: CalloutKindSchema,
    title: z.string().optional(),
    md: z.string(),
  }),
  /** Reference to an exercise in Lesson.exercises (kept separate so the review UI can list them). */
  z.object({ type: z.literal('exercise'), audience, exerciseId: z.string() }),
]);
export type Block = z.infer<typeof BlockSchema>;

/** One H2 in the source markdown. The unit of progress tracking. */
export const SectionSchema = z.object({
  /** Slug of the title, unique within the lesson. Stored in lesson_progress.completed_sections. */
  id: z.string().min(1),
  title: z.string().min(1),
  blocks: z.array(BlockSchema),
});
export type Section = z.infer<typeof SectionSchema>;

export const LessonSchema = z.object({
  /** `${topicId}@${level}` e.g. "java/oop-fundamentals@rusty" */
  id: z.string().min(1),
  topicId: z.string().min(1),
  level: LevelSchema,
  title: z.string().min(1),
  estimatedMinutes: z.number().int().positive(),
  objectives: z.array(z.string()).default([]),
  status: ContentStatusSchema.default('draft'),
  sections: z.array(SectionSchema),
  exercises: z.array(ExerciseSchema).default([]),
});
export type Lesson = z.infer<typeof LessonSchema>;

// ---------- Review material ----------

export const QuizQuestionSchema = z.object({
  /** `${topicId}/q-${nnn}` */
  id: z.string().min(1),
  topicId: z.string().min(1),
  /** Which levels this question is appropriate for. */
  levels: z.array(LevelSchema).min(1),
  audience: AudienceSchema.default('all'),
  type: z.enum(['single', 'multi', 'truefalse']),
  prompt: z.string().min(1),
  options: z.array(z.string()).min(2),
  /** Indices into options. Exactly one for 'single' / 'truefalse'. */
  answer: z.array(z.number().int().nonnegative()).min(1),
  explanation: z.string().min(1),
  tags: z.array(z.string()).default([]),
});
export type QuizQuestion = z.infer<typeof QuizQuestionSchema>;

export const FlashcardSchema = z.object({
  /** `${topicId}/c-${nnn}` */
  id: z.string().min(1),
  topicId: z.string().min(1),
  levels: z.array(LevelSchema).min(1),
  audience: AudienceSchema.default('all'),
  front: z.string().min(1),
  back: z.string().min(1),
  tags: z.array(z.string()).default([]),
});
export type Flashcard = z.infer<typeof FlashcardSchema>;

// ---------- Manifest (structure without bodies; what the dashboard needs) ----------

export const LessonSummarySchema = z.object({
  id: z.string(),
  title: z.string(),
  estimatedMinutes: z.number().int(),
  sectionCount: z.number().int(),
  sectionIds: z.array(z.string()),
  exerciseCount: z.number().int(),
  status: ContentStatusSchema,
});
export type LessonSummary = z.infer<typeof LessonSummarySchema>;

export const TopicMetaSchema = z.object({
  /** `${moduleId}/${slug}` e.g. "java/oop-fundamentals" */
  id: z.string().min(1),
  moduleId: z.string().min(1),
  slug: z.string().min(1),
  order: z.number().int(),
  title: z.string().min(1),
  summary: z.string().min(1),
  /** Other topic IDs. Informational; nothing is locked. */
  prerequisites: z.array(z.string()).default([]),
  tags: z.array(z.string()).default([]),
  /** One entry per level. The build guarantees all three exist (stubs allowed). */
  lessons: z.record(LevelSchema, LessonSummarySchema),
  questionCount: z.number().int(),
  cardCount: z.number().int(),
});
export type TopicMeta = z.infer<typeof TopicMetaSchema>;

export const ModuleMetaSchema = z.object({
  id: z.string().min(1),
  order: z.number().int(),
  title: z.string().min(1),
  tagline: z.string().min(1),
  /** Short paragraph shown on the module page: why a manager cares. */
  whyItMatters: z.string().min(1),
  topics: z.array(TopicMetaSchema),
});
export type ModuleMeta = z.infer<typeof ModuleMetaSchema>;

export const ContentManifestSchema = z.object({
  /** Bumped by the build; clients cache lessons keyed on (lessonId, version). */
  version: z.string(),
  builtAt: z.string(),
  modules: z.array(ModuleMetaSchema),
});
export type ContentManifest = z.infer<typeof ContentManifestSchema>;

/** The full compiled output of tools/content-build. The API loads this once at boot. */
export const ContentBundleSchema = z.object({
  manifest: ContentManifestSchema,
  lessons: z.record(z.string(), LessonSchema),
  questions: z.array(QuizQuestionSchema),
  flashcards: z.array(FlashcardSchema),
});
export type ContentBundle = z.infer<typeof ContentBundleSchema>;

// ---------- Mode filtering (shared by web + mobile renderers) ----------

/** True if a block / exercise / question should be shown at full prominence in the given mode. */
export function isPrimaryForMode(aud: Audience, mode: Mode): boolean {
  return aud === 'all' || aud === mode;
}
