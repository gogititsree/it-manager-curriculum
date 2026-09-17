/**
 * Content compiler: content/modules/** (markdown + yaml) -> content/dist/{bundle.json,manifest.json}.
 *
 *   pnpm content:build            compile
 *   pnpm content:validate         validate only, exit 1 on any error
 *
 * Authoring rules are in docs/CONTENT-AUTHORING.md. This file is the executable spec of those rules.
 * OWNERSHIP: architecture-level. Adding a new directive or block type is an ADR-sized change.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';
import { z } from 'zod';
import {
  ContentBundleSchema,
  FlashcardSchema,
  LEVELS,
  LessonSchema,
  QuizQuestionSchema,
  lessonId as makeLessonId,
  type ContentBundle,
  type Flashcard,
  type Lesson,
  type LessonSummary,
  type Level,
  type ModuleMeta,
  type QuizQuestion,
  type TopicMeta,
} from '@itmc/core';
import { compileLessonMarkdown } from './markdown.js';

const ROOT = resolve(fileURLToPath(import.meta.url), '../../../..');
const SRC = join(ROOT, 'content', 'modules');
const OUT = join(ROOT, 'content', 'dist');
const validateOnly = process.argv.includes('--validate-only');
/** `--only <moduleId>` restricts validation to one module (for parallel content authoring). */
const onlyIdx = process.argv.indexOf('--only');
const onlyModule = onlyIdx >= 0 ? process.argv[onlyIdx + 1] : undefined;

// ---------- authoring-side schemas (yaml files) ----------

const CurriculumFile = z.object({ modules: z.array(z.string()) });
const ModuleFile = z.object({
  title: z.string(),
  tagline: z.string(),
  whyItMatters: z.string(),
  topics: z.array(z.string()),
});
const TopicFile = z.object({
  title: z.string(),
  summary: z.string(),
  prerequisites: z.array(z.string()).default([]),
  tags: z.array(z.string()).default([]),
});
const QuizFile = z.object({ questions: z.array(QuizQuestionSchema.omit({ topicId: true })) });
const CardsFile = z.object({ cards: z.array(FlashcardSchema.omit({ topicId: true })) });

// ---------- build ----------

const errors: string[] = [];
const fail = (where: string, msg: string) => errors.push(`${where}: ${msg}`);
const issues = (e: z.ZodError) => e.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');

function readYaml<T>(schema: z.ZodType<T, z.ZodTypeDef, unknown>, file: string): T | undefined {
  if (!existsSync(file)) return undefined;
  const r = schema.safeParse(parseYaml(readFileSync(file, 'utf8')));
  if (!r.success) {
    fail(file, issues(r.error));
    return undefined;
  }
  return r.data;
}

function build(): ContentBundle | undefined {
  const curriculum = readYaml(CurriculumFile, join(ROOT, 'content', 'curriculum.yaml'));
  if (!curriculum) return undefined;

  const modules: ModuleMeta[] = [];
  const lessons: Record<string, Lesson> = {};
  const questions: QuizQuestion[] = [];
  const flashcards: Flashcard[] = [];
  const seenIds = new Set<string>();
  const uniq = (id: string, where: string) => {
    if (seenIds.has(id)) fail(where, `duplicate id ${id}`);
    seenIds.add(id);
  };

  curriculum.modules.forEach((moduleId, mi) => {
    if (onlyModule && moduleId !== onlyModule) return;
    const mdir = join(SRC, moduleId);
    const mod = readYaml(ModuleFile, join(mdir, 'module.yaml'));
    if (!mod) return fail(mdir, 'missing or invalid module.yaml');
    const topics: TopicMeta[] = [];

    mod.topics.forEach((slug, ti) => {
      const tdir = join(mdir, slug);
      const topicId = `${moduleId}/${slug}`;
      const topic = readYaml(TopicFile, join(tdir, 'topic.yaml'));
      if (!topic) return fail(tdir, 'missing or invalid topic.yaml');

      const lessonSummaries: Partial<Record<Level, LessonSummary>> = {};
      for (const level of LEVELS) {
        const file = join(tdir, `${level}.md`);
        if (!existsSync(file)) {
          fail(file, `missing lesson for level ${level} (create a stub with status: stub)`);
          continue;
        }
        const id = makeLessonId(topicId, level);
        try {
          const lesson = compileLessonMarkdown(readFileSync(file, 'utf8'), { topicId, level, lessonId: id });
          const parsed = LessonSchema.safeParse(lesson);
          if (!parsed.success) {
            fail(file, issues(parsed.error));
            continue;
          }
          if (parsed.data.status === 'ready' && parsed.data.sections.length === 0) fail(file, 'status ready but no sections');
          uniq(id, file);
          lessons[id] = parsed.data;
          lessonSummaries[level] = {
            id,
            title: parsed.data.title,
            estimatedMinutes: parsed.data.estimatedMinutes,
            sectionCount: parsed.data.sections.length,
            sectionIds: parsed.data.sections.map((s) => s.id),
            exerciseCount: parsed.data.exercises.length,
            status: parsed.data.status,
          };
        } catch (e) {
          fail(file, (e as Error).message);
        }
      }

      const quiz = readYaml(QuizFile, join(tdir, 'quiz.yaml'));
      const qs: QuizQuestion[] = (quiz?.questions ?? []).map((q) => {
        const id = `${topicId}/${q.id}`;
        uniq(id, join(tdir, 'quiz.yaml'));
        if ((q.type === 'single' || q.type === 'truefalse') && q.answer.length !== 1) fail(id, 'single/truefalse needs exactly one answer');
        if (q.answer.some((a) => a >= q.options.length)) fail(id, 'answer index out of range');
        return { ...q, id, topicId };
      });
      questions.push(...qs);

      const cards = readYaml(CardsFile, join(tdir, 'flashcards.yaml'));
      const cs: Flashcard[] = (cards?.cards ?? []).map((c) => {
        const id = `${topicId}/${c.id}`;
        uniq(id, join(tdir, 'flashcards.yaml'));
        return { ...c, id, topicId };
      });
      flashcards.push(...cs);

      topics.push({
        id: topicId,
        moduleId,
        slug,
        order: ti,
        title: topic.title,
        summary: topic.summary,
        prerequisites: topic.prerequisites,
        tags: topic.tags,
        lessons: lessonSummaries as Record<Level, LessonSummary>,
        questionCount: qs.length,
        cardCount: cs.length,
      });
    });

    modules.push({ id: moduleId, order: mi, title: mod.title, tagline: mod.tagline, whyItMatters: mod.whyItMatters, topics });
  });

  // cross-reference checks (skipped under --only, since prerequisites may point at other modules)
  if (!onlyModule) {
    const topicIds = new Set(modules.flatMap((m) => m.topics.map((t) => t.id)));
    for (const m of modules)
      for (const t of m.topics) for (const p of t.prerequisites) if (!topicIds.has(p)) fail(t.id, `unknown prerequisite ${p}`);
  }

  const now = new Date();
  const bundle: ContentBundle = {
    manifest: { version: now.toISOString().replace(/\D/g, '').slice(0, 14), builtAt: now.toISOString(), modules },
    lessons,
    questions,
    flashcards,
  };
  const check = ContentBundleSchema.safeParse(bundle);
  if (!check.success) fail('bundle', issues(check.error));
  return bundle;
}

const bundle = build();
if (errors.length) {
  console.error(`\n${errors.length} content error(s):`);
  for (const e of errors) console.error('  - ' + e);
  process.exit(1);
}
if (!bundle) process.exit(1);

const stats = {
  modules: bundle.manifest.modules.length,
  topics: bundle.manifest.modules.reduce((a, m) => a + m.topics.length, 0),
  lessons: Object.keys(bundle.lessons).length,
  ready: Object.values(bundle.lessons).filter((l) => l.status === 'ready').length,
  draft: Object.values(bundle.lessons).filter((l) => l.status === 'draft').length,
  questions: bundle.questions.length,
  flashcards: bundle.flashcards.length,
};
console.log('content ok', stats);

if (!validateOnly && !onlyModule) {
  mkdirSync(OUT, { recursive: true });
  writeFileSync(join(OUT, 'bundle.json'), JSON.stringify(bundle));
  writeFileSync(join(OUT, 'manifest.json'), JSON.stringify(bundle.manifest, null, 2));
  console.log(`wrote ${OUT}`);
}
