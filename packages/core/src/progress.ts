/**
 * Progress maths. Progress is DERIVED, never stored as a percentage (ADR-007):
 * the DB stores which section IDs were completed; everything else is computed here so web, mobile
 * and API agree by construction.
 */
import { LEVELS, type Level, type LessonSummary, type ModuleMeta, type TopicMeta } from './content.js';
import { lessonId } from './ids.js';

export type LessonStatus = 'not_started' | 'in_progress' | 'completed';

/** Mirrors the lesson_progress table, decoded. */
export interface LessonProgressRow {
  lessonId: string;
  status: LessonStatus;
  completedSectionIds: string[];
  lastViewedAt?: string;
  completedAt?: string;
}

export interface TopicProgress {
  topicId: string;
  level: Level;
  lessonId: string;
  status: LessonStatus;
  /** 0..1, fraction of sections completed. */
  completion: number;
  sectionsDone: number;
  sectionsTotal: number;
  /** Best quiz accuracy 0..1 at this level, if any session finished. */
  quizBest?: number;
  cardsDue: number;
  /** False when the lesson at this level is still a stub. */
  authored: boolean;
}

export interface LevelProgress {
  level: Level;
  topicsTotal: number;
  topicsAuthored: number;
  topicsCompleted: number;
  topicsStarted: number;
  /** Mean completion across authored topics at this level, 0..1. */
  completion: number;
}

export interface ModuleProgress {
  moduleId: string;
  perLevel: Record<Level, LevelProgress>;
  /** Progress along the chosen path: each topic counted at the level the user selected for it. */
  selectedPath: { completion: number; topicsCompleted: number; topicsTotal: number };
}

export interface ProgressInputs {
  /** keyed by lessonId */
  lessonRows: ReadonlyMap<string, LessonProgressRow>;
  /** keyed by lessonId -> best accuracy 0..1 */
  quizBestByLesson?: ReadonlyMap<string, number>;
  /** keyed by topicId -> number of flashcards due now */
  cardsDueByTopic?: ReadonlyMap<string, number>;
  /** keyed by topicId -> level the user selected; absent means defaultLevel */
  selectedLevelByTopic: ReadonlyMap<string, Level>;
  defaultLevel: Level;
}

export function lessonCompletion(summary: LessonSummary | undefined, row: LessonProgressRow | undefined): number {
  if (!summary || summary.sectionCount === 0) return 0;
  if (!row) return 0;
  if (row.status === 'completed') return 1;
  const valid = new Set(summary.sectionIds);
  const done = row.completedSectionIds.filter((s) => valid.has(s)).length;
  return Math.min(1, done / summary.sectionCount);
}

export function topicProgress(topic: TopicMeta, level: Level, inputs: ProgressInputs): TopicProgress {
  const id = lessonId(topic.id, level);
  const summary: LessonSummary | undefined = topic.lessons[level];
  const row = inputs.lessonRows.get(id);
  const completion = lessonCompletion(summary, row);
  const status: LessonStatus = row?.status ?? (completion > 0 ? 'in_progress' : 'not_started');
  return {
    topicId: topic.id,
    level,
    lessonId: id,
    status: completion >= 1 ? 'completed' : status,
    completion,
    sectionsDone: Math.round(completion * (summary?.sectionCount ?? 0)),
    sectionsTotal: summary?.sectionCount ?? 0,
    quizBest: inputs.quizBestByLesson?.get(id),
    cardsDue: inputs.cardsDueByTopic?.get(topic.id) ?? 0,
    authored: !!summary && summary.status !== 'stub',
  };
}

export function moduleProgress(mod: ModuleMeta, inputs: ProgressInputs): ModuleProgress {
  const perLevel = {} as Record<Level, LevelProgress>;
  for (const level of LEVELS) {
    const tps = mod.topics.map((t) => topicProgress(t, level, inputs));
    const authored = tps.filter((t) => t.authored);
    perLevel[level] = {
      level,
      topicsTotal: tps.length,
      topicsAuthored: authored.length,
      topicsCompleted: authored.filter((t) => t.status === 'completed').length,
      topicsStarted: authored.filter((t) => t.status === 'in_progress').length,
      completion: authored.length ? authored.reduce((a, t) => a + t.completion, 0) / authored.length : 0,
    };
  }
  const path = mod.topics.map((t) =>
    topicProgress(t, inputs.selectedLevelByTopic.get(t.id) ?? inputs.defaultLevel, inputs),
  );
  const authoredPath = path.filter((t) => t.authored);
  return {
    moduleId: mod.id,
    perLevel,
    selectedPath: {
      topicsTotal: authoredPath.length,
      topicsCompleted: authoredPath.filter((t) => t.status === 'completed').length,
      completion: authoredPath.length
        ? authoredPath.reduce((a, t) => a + t.completion, 0) / authoredPath.length
        : 0,
    },
  };
}

/** Pure state transition used by the API when a section is marked complete. */
export function applySectionCompleted(
  row: LessonProgressRow | undefined,
  id: string,
  sectionId: string,
  summary: LessonSummary,
  now: string,
): LessonProgressRow {
  const set = new Set(row?.completedSectionIds ?? []);
  set.add(sectionId);
  const all = summary.sectionIds.every((s) => set.has(s));
  return {
    lessonId: id,
    completedSectionIds: [...set],
    status: all ? 'completed' : 'in_progress',
    lastViewedAt: now,
    completedAt: all ? (row?.completedAt ?? now) : undefined,
  };
}
