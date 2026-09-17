# Content authoring guide

**Audience:** a Claude session (Opus for the heavier topics, Sonnet for the rest) writing lessons,
quizzes and flashcards. You edit files under `content/modules/**` only. You never touch TypeScript.
Your definition of done is `pnpm content:validate` passing plus the checklist at the end.

The golden example is `content/modules/java/oop-fundamentals/`. Copy its shape.

## 1. The learner

A 53-year-old solution/system architect at a bank, moving into IT management. Deep experience,
some of it dated. Time-poor. Reads on a laptop at a desk and, later, on a phone between meetings.
Assume intelligence; never assume familiarity with tooling released in the last five years.
Financial-services context (regulation, audit, change control, vendor risk) is relevant and welcome
in `bank-context` callouts, but keep it short and factual.

## 2. Files per topic

```
content/modules/<module>/<slug>/
  topic.yaml        title, summary, prerequisites (topic IDs), tags
  beginner.md       lesson at level Beginner
  intermediate.md   lesson at level Intermediate
  rusty.md          lesson at level Rusty
  quiz.yaml         questions, each tagged with the levels it suits
  flashcards.yaml   cards, each tagged with levels
```

Slugs are permanent IDs. Never rename a folder, a file, or the text of an H2 in a `ready` lesson
without an explicit instruction, because progress rows reference them.

## 3. Lesson file format

```markdown
---
title: "OOP Fundamentals"
estimatedMinutes: 25
objectives:
  - "Explain encapsulation, inheritance and polymorphism in one sentence each"
  - "Decide when composition beats inheritance"
status: ready        # stub | draft | ready
---

Intro paragraph(s) before the first H2 go into an implicit "Overview" section.

## First section title          <- every H2 is a trackable section; no H1 anywhere

Prose in normal markdown. Lists, tables, bold, links all fine.

:::manager
This block is primary in Manager mode and collapsed in Engineer mode.
:::

:::engineer
This block is primary in Engineer mode and collapsed in Manager mode.
:::

```java
// fenced code becomes a code block; the language matters for highlighting
```

:::callout{kind=manager-lens title="What to ask your team"}
Callout kinds: tip, warning, gotcha, manager-lens, bank-context, changed-since, decision
:::

::::exercise{id=ex-shapes type=design title="Model a payment"}
The prompt, in markdown. Types: code | design | reflect | scenario.
:::solution
Optional model answer, revealed on demand.
:::
::::
```

Rules the compiler enforces:

- Frontmatter is required; `status` defaults to `draft`.
- `## ` headings only at the top level (not inside a `:::` container). No `# ` headings.
- Section IDs are the slug of the H2 text and must be unique in the file.
- **Nesting containers:** the outer container must use more colons than the inner one
  (`::::exercise` around `:::solution`; `::::manager` around a `:::callout`).
- `:::manager` inside `:::engineer` (or vice versa) is an error.
- Unknown directive names are an error.
- HTML comments (`<!-- -->`) are dropped from the output; use them for author notes.

## 4. Level shapes

Write each level as its own document. Do not write one lesson and thin it out.

### Beginner (25–40 min)
Build the mental model from nothing. Suggested sections:
1. **Why this exists** — the problem it solves, with a concrete example.
2. Core concepts, one section each (3–5 sections). Each: plain explanation, one small code or
   diagram-in-words, a `manager-lens` callout on what it means for reviews/hiring/risk.
3. **Common mistakes** — 3–5 bullets.
4. **Putting it together** — one exercise (`design` or `code`).

### Intermediate (30–45 min)
Assume the Beginner content. Go for patterns, failure modes and production reality:
1. **Where the basics break down** — what the naive approach gets wrong at scale.
2. 3–5 pattern/practice sections with real code and the tradeoffs (`decision` callouts).
3. **What good looks like** — a review checklist a manager could actually use.
4. One or two exercises (`scenario` is good here: "the team proposes X; what do you ask?").

### Rusty (10–20 min)
The reader knew this well once. Be fast, dense and respectful. Required sections in this order:
1. **What you probably remember** — a recap in a table or tight bullets; no explanation of basics.
2. **What changed since** — `changed-since` callouts, dated where possible (language versions,
   deprecated tools, renamed concepts). This is the most valuable section.
3. **Gotchas that still bite** — the mistakes experienced people make.
4. **Ten-minute drill** — one `code` or `scenario` exercise with a solution.

## 5. Manager vs engineer blocks

- `all` (untagged) prose carries the argument. Both modes must read coherently with the other
  audience's blocks collapsed. Test this by reading the file twice, skipping each tag in turn.
- `:::manager` — decisions, tradeoffs, cost, risk, what to ask in a review, how to spot trouble in
  a PR or a status report, what "good" looks like in a team.
- `:::engineer` — syntax, APIs, configuration, exact commands, deeper mechanics.
- Aim for at least one of each per section in Beginner/Intermediate. Rusty may be mostly `all`.

## 6. quiz.yaml

```yaml
questions:
  - id: q-001                         # q-nnn, permanent
    levels: [beginner, rusty]         # who should see it
    audience: all                     # all | manager | engineer
    type: single                      # single | multi | truefalse
    prompt: "Which statement about interfaces is true?"
    options:
      - "..."
      - "..."
      - "..."
      - "..."
    answer: [1]                       # indices; exactly one for single/truefalse
    explanation: "Why, in two or three sentences, including why the distractors are wrong."
    tags: [interfaces]
```

Guidelines: 8–15 questions per topic across levels; `manager`-audience questions are about
decisions ("the team proposes…; the best response is…"), `engineer` ones about mechanics. Distractors
must be plausible. `truefalse` options are exactly `["True", "False"]`.

## 7. flashcards.yaml

```yaml
cards:
  - id: c-001                         # c-nnn, permanent
    levels: [beginner, intermediate, rusty]
    audience: all
    front: "Composition vs inheritance: default choice?"
    back: "Composition. Inheritance only for a true is-a with stable base behaviour."
    tags: [design]
```

Guidelines: 10–20 per topic; one fact per card; the back fits on a phone screen (≤ 40 words).
Definitions, contrasts ("X vs Y"), numbers worth knowing, and the one-line answer to a common
review question all make good cards.

## 8. Voice and length

- Direct, concrete, second person. No motivational filler, no "in this lesson we will".
- Prefer a specific example over an abstract statement.
- Code samples: minimal, compilable in spirit, annotated with comments where the point is.
- Cite versions and years when saying something changed. Do not invent dates; if unsure, say
  "recent versions".
- Sections: 150–400 words each. Lessons: Beginner/Intermediate 1,500–3,000 words; Rusty 600–1,200.

## 9. Checklist before you report done

- [ ] `pnpm content:validate` passes.
- [ ] `status: ready` set on every lesson you finished; `draft` on partials.
- [ ] Each Beginner/Intermediate section has at least one `manager` and one `engineer` block.
- [ ] Rusty has the four required sections in order.
- [ ] Every lesson has at least one exercise; every exercise has a solution unless `reflect`.
- [ ] quiz.yaml: 8+ questions, all three levels represented, explanations written.
- [ ] flashcards.yaml: 10+ cards.
- [ ] topic.yaml `prerequisites` point at real topic IDs (validator checks).
- [ ] You read the lesson once in each mode and it made sense with the other audience collapsed.
