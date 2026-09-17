---
title: "Architecture Decision Frameworks — refresher"
estimatedMinutes: 15
objectives:
  - "Re-anchor ADRs, options tables and tradeoff thinking in ten minutes"
  - "Know how decision documentation practice has shifted toward docs-as-code and async review"
  - "Spot the gotchas that still cause good frameworks to produce bad decisions"
status: ready
---

You've written design documents and sat through architecture review boards for years. The
underlying discipline — write down the problem, the options, the decision, the consequences — has
not changed. Where decisions get written, how input gets gathered, and how much ceremony surrounds
them has shifted toward something lighter and faster.

## What you probably remember

| Concept | One-line anchor |
| --- | --- |
| ADR | Title, status, context, decision, consequences — one page, versioned next to the code. |
| Options table | Real alternatives, scored against explicit criteria, with genuine tension — not a table justifying a foregone conclusion. |
| Quality attributes | Availability, latency, consistency, cost, auditability — name which ones matter before arguing technology. |
| Reversible vs one-way door | Cheap-to-undo decisions get a fast, single-owner call; expensive-to-undo ones get real process. |
| RFC | A written proposal circulated for comment with a named decider and a deadline, not a meeting for every decision. |
| Disagree and commit | Genuine input heard, decision made, everyone executes it — objection recorded, not silenced. |

## What changed since

:::callout{kind=changed-since title="Decisions live in the repo, not the wiki (docs-as-code)"}
ADRs and RFCs increasingly live as markdown files in the same version-control repository as the
code they affect — reviewed via the same pull-request process, searchable with the same tools,
never orphaned in a wiki that outlives its links. Lightweight CLI and static-site tools (adr-tools,
log4brains, and similar) generate an index and a small browsable site straight from the markdown
files. If your organisation's decisions still live only in a wiki or a slide deck, that is the gap
worth closing first — not the template format.
:::

:::callout{kind=changed-since title="The RFC-as-pull-request pattern"}
Rather than a separate document plus a separate discussion thread, many teams now write the RFC as a
markdown file in a pull request; review comments happen inline on specific lines of the proposal,
and merging the PR *is* approving the decision — one artefact, one thread, one audit trail. This
mirrors how the Rust language project has run its RFC process for years and has spread well beyond
it.
:::

:::callout{kind=changed-since title="Async-first decision-making, accelerated by remote/hybrid work"}
The heavyweight architecture review board meeting — everyone in a room, presenter walks slides,
verdict given on the spot — has become less central. The pattern that replaced it: write the
proposal well enough to stand alone, circulate for asynchronous comment, reserve a live meeting only
for resolving genuine disagreement that text isn't converging on. This produces a better written
record almost as a side effect, since the document has to work without a live presenter.
:::

:::callout{kind=changed-since title="One-pagers and PR/FAQ-style documents for bigger bets"}
For larger decisions, some organisations use a narrative one-pager or a "press release plus FAQ"
document (an approach publicly associated with Amazon) instead of slides: write the decision as if
explaining it to a customer or a future team member, then answer the hard questions it raises. The
constraint of full sentences, not bullet fragments, tends to surface gaps that a slide deck hides.
:::

:::engineer
```
adr-repo/
  0001-use-postgres-for-core-ledger.md
  0002-adopt-kafka-for-settlement-events.md
  0003-supersede-0001-migrate-to-partitioned-postgres.md   # supersession, not silent edit
```
Superseding an old ADR with a new numbered file, rather than editing the original, keeps the history
intact — you can see both what was decided originally and what changed later, and why.
:::

:::manager
None of this changes what makes a decision good; it changes friction. Docs-as-code and async review
mean the record is more likely to exist, more likely to be found later, and more likely to have
genuine input rather than rubber-stamp silence in a meeting. If your team still treats "decision
documentation" as an occasional heavyweight event rather than routine practice next to the code,
that's the practical gap, not a knowledge gap.
:::

## Gotchas that still bite

- **Options tables built to justify, not inform.** Still the most common failure. If one option
  wins on every row, someone built the table after deciding, not before.
- **Consequences sections that list only upside.** A real decision has a real cost; omitting it
  doesn't make the cost disappear, it just means nobody planned for it.
- **Treating every decision as one-way-door out of caution.** Slows teams down on things that cost
  nothing to reverse, and trains people to skip the process for things that actually need it because
  "the process is always slow."
- **RFC review by silence, at scale.** A broadcast comment period with no named required reviewers
  produces the appearance of consensus with none of the substance — this hasn't gone away just
  because the tooling got lighter.
- **Superseding by silent edit.** Editing an old ADR in place instead of writing a new one that
  supersedes it destroys the history of why the original choice was made, which is often exactly what
  the next person needs.

:::callout{kind=bank-context}
A docs-as-code decision trail — commits, PR reviews, timestamps, named approvers, all in version
control — is often a stronger audit artefact than a curated wiki page, because it can't be quietly
rewritten after the fact without leaving a trace. Worth pointing your risk and audit contacts at the
repository history directly rather than a summarised report.
:::

## Ten-minute drill

::::exercise{id=ex-supersede-adr type=code title="Supersede an outdated ADR correctly"}
ADR-0001 ("Use a single shared database for all microservices, 2019") is now actively wrong — the
team has since split into per-service databases for independent scaling. A new engineer wants to
just edit ADR-0001 to reflect current reality. What do you tell them to do instead, and why?
:::solution
Write a new ADR (e.g. ADR-0031: "Supersede ADR-0001: move to per-service databases") that references
ADR-0001 by number, states the new decision and its context (why the shared database stopped
working — probably contention, deployment coupling, or blast radius), and update ADR-0001's status
field to "Superseded by ADR-0031," leaving its original content untouched.

Why: editing ADR-0001 in place erases the record of what was decided in 2019 and why it seemed right
then — information a future team will want when they hit the next scaling problem and wonder "didn't
we consider a shared database once, and why did we move away from it?" The supersession chain is the
whole value of numbered, append-only ADRs; editing history away defeats the purpose the format
exists for.
:::
::::
