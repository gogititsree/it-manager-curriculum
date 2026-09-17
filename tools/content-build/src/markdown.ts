/**
 * Markdown -> Lesson compiler. Understands:
 *   ---yaml frontmatter---                     title, estimatedMinutes, objectives[], status
 *   ## Heading                                 starts a Section (id = slug of heading)
 *   :::manager / :::engineer                   container: children get audience = manager|engineer
 *   :::callout{kind=tip title="..."}           container -> callout block
 *   :::exercise{id=ex-x type=code title="..."} container -> exercise; may contain :::solution
 *   ```lang  fenced code                       -> code block (fence meta string becomes caption)
 *   everything else                            -> markdown block (re-serialised)
 * Content before the first H2 goes into an implicit "Overview" section.
 */
import type { Root, RootContent } from 'mdast';
import { directiveToMarkdown, type ContainerDirective } from 'mdast-util-directive';
import { frontmatterToMarkdown } from 'mdast-util-frontmatter';
import { toMarkdown } from 'mdast-util-to-markdown';
import remarkDirective from 'remark-directive';
import remarkFrontmatter from 'remark-frontmatter';
import remarkParse from 'remark-parse';
import { unified } from 'unified';
import { parse as parseYaml } from 'yaml';
import { z } from 'zod';
import {
  CalloutKindSchema,
  ContentStatusSchema,
  slugify,
  type Audience,
  type Block,
  type Exercise,
  type Lesson,
  type Level,
  type Section,
} from '@itmc/core';

const Frontmatter = z.object({
  title: z.string(),
  estimatedMinutes: z.number().int().positive(),
  objectives: z.array(z.string()).default([]),
  status: ContentStatusSchema.default('draft'),
});

interface Ctx {
  topicId: string;
  level: Level;
  lessonId: string;
}

const processor = unified().use(remarkParse).use(remarkFrontmatter, ['yaml']).use(remarkDirective);

const serialize = (nodes: RootContent[]): string =>
  toMarkdown({ type: 'root', children: nodes }, { extensions: [directiveToMarkdown(), frontmatterToMarkdown(['yaml'])] }).trim();

export function compileLessonMarkdown(src: string, ctx: Ctx): Lesson {
  const tree = processor.parse(src) as Root;
  const fmNode = tree.children.find((n) => n.type === 'yaml');
  if (!fmNode || fmNode.type !== 'yaml') throw new Error('missing yaml frontmatter');
  const fm = Frontmatter.parse(parseYaml(fmNode.value));

  const sections: Section[] = [];
  const exercises: Exercise[] = [];
  let current: { id: string; title: string; nodes: RootContent[] } = { id: 'overview', title: 'Overview', nodes: [] };
  const sectionIds = new Set<string>();

  // Nodes are collected per section and converted in one pass so adjacent prose merges into a
  // single markdown block.
  const pushSection = () => {
    const blocks = toBlocks(current.nodes, 'all', ctx, exercises);
    if (blocks.length === 0 && current.id === 'overview') return;
    if (sectionIds.has(current.id)) throw new Error(`duplicate section id "${current.id}"`);
    sectionIds.add(current.id);
    sections.push({ id: current.id, title: current.title, blocks });
  };

  for (const node of tree.children) {
    if (node.type === 'yaml') continue;
    if (node.type === 'heading' && node.depth === 2) {
      pushSection();
      const title = serialize([node]).replace(/^#+\s*/, '');
      current = { id: slugify(title), title, nodes: [] };
      continue;
    }
    if (node.type === 'heading' && node.depth === 1) throw new Error('H1 not allowed; title comes from frontmatter');
    current.nodes.push(node);
  }
  pushSection();

  return {
    id: ctx.lessonId,
    topicId: ctx.topicId,
    level: ctx.level,
    title: fm.title,
    estimatedMinutes: fm.estimatedMinutes,
    objectives: fm.objectives,
    status: fm.status,
    sections,
    exercises,
  };
}

function toBlocks(nodes: RootContent[], audience: Audience, ctx: Ctx, exercises: Exercise[]): Block[] {
  const out: Block[] = [];
  let buffer: RootContent[] = [];
  const flush = () => {
    if (buffer.length) out.push({ type: 'markdown', audience, md: serialize(buffer) });
    buffer = [];
  };

  for (const node of nodes) {
    if (node.type === 'code') {
      flush();
      out.push({ type: 'code', audience, lang: node.lang ?? undefined, code: node.value, caption: node.meta ?? undefined });
    } else if (node.type === 'containerDirective') {
      flush();
      out.push(...directiveToBlocks(node, audience, ctx, exercises));
    } else if (node.type === 'heading' && node.depth === 2) {
      throw new Error('H2 inside a directive container is not allowed (sections must be top-level)');
    } else if (node.type === 'html' && node.value.trim().startsWith('<!--')) {
      // authoring comments (e.g. HANDOFF markers) are dropped from output
    } else {
      buffer.push(node);
    }
  }
  flush();
  return out;
}

function directiveToBlocks(node: ContainerDirective, audience: Audience, ctx: Ctx, exercises: Exercise[]): Block[] {
  const attrs = (node.attributes ?? {}) as Record<string, string | undefined>;
  const kids = node.children as RootContent[];
  switch (node.name) {
    case 'manager':
    case 'engineer':
      if (audience !== 'all' && audience !== node.name) throw new Error(`nested :::${node.name} inside :::${audience}`);
      return toBlocks(kids, node.name, ctx, exercises);
    case 'callout': {
      const kind = CalloutKindSchema.parse(attrs.kind ?? 'tip');
      return [{ type: 'callout', audience, kind, title: attrs.title, md: serialize(kids) }];
    }
    case 'exercise': {
      if (!attrs.id) throw new Error('exercise directive needs id');
      const solution = kids.find((k): k is ContainerDirective => k.type === 'containerDirective' && k.name === 'solution');
      const body = kids.filter((k) => k !== solution);
      const ex: Exercise = {
        id: `${ctx.lessonId}/${attrs.id}`,
        type: z.enum(['code', 'design', 'reflect', 'scenario']).parse(attrs.type ?? 'reflect'),
        title: attrs.title ?? attrs.id,
        audience,
        md: serialize(body),
        solutionMd: solution ? serialize(solution.children as RootContent[]) : undefined,
      };
      exercises.push(ex);
      return [{ type: 'exercise', audience, exerciseId: ex.id }];
    }
    default:
      throw new Error(`unknown directive :::${node.name}`);
  }
}
