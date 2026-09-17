/**
 * Scaffolds a topic folder with stub lessons so content:validate passes immediately.
 *   pnpm content:new-topic <moduleId> <slug> "<Title>"
 * Remember to add the slug to content/modules/<moduleId>/module.yaml.
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const [moduleId, slug, title] = process.argv.slice(2);
if (!moduleId || !slug || !title) {
  console.error('usage: new-topic <moduleId> <slug> "<Title>"');
  process.exit(1);
}
const dir = resolve(fileURLToPath(import.meta.url), '../../../../content/modules', moduleId, slug);
if (existsSync(dir)) {
  console.error(`exists: ${dir}`);
  process.exit(1);
}
mkdirSync(dir, { recursive: true });
writeFileSync(join(dir, 'topic.yaml'), `title: ${JSON.stringify(title)}\nsummary: "TODO one sentence"\nprerequisites: []\ntags: []\n`);
for (const level of ['beginner', 'intermediate', 'rusty']) {
  writeFileSync(
    join(dir, `${level}.md`),
    `---\ntitle: ${JSON.stringify(title)}\nestimatedMinutes: 20\nobjectives: []\nstatus: stub\n---\n\n<!-- HANDOFF(content): write this lesson. Read docs/CONTENT-AUTHORING.md first. level = ${level} -->\n`,
  );
}
writeFileSync(join(dir, 'quiz.yaml'), 'questions: []\n');
writeFileSync(join(dir, 'flashcards.yaml'), 'cards: []\n');
console.log(`created ${dir}`);
