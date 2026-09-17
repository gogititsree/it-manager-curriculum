---
title: "Architecture Decision Frameworks"
estimatedMinutes: 30
objectives:
  - "Write an Architecture Decision Record that a stranger could act on in two years"
  - "Build an honest options table instead of a table that just justifies a decision already made"
  - "Fit a real decision onto one page without losing the reasoning"
status: ready
---

An architecture decision is any choice that is expensive to reverse: which database, which
messaging technology, whether to build or buy, how two systems will talk to each other. The decision
itself matters less, long-term, than whether anyone can reconstruct *why* it was made once the
people in the room have moved on. This lesson is about writing that reasoning down in a form people
will actually read.

## Why write decisions down

Six months from now, someone will ask "why did we choose this?" and the honest answer is often "I
don't remember" or "the person who decided left the company." An undocumented decision has to be
re-litigated from scratch every time someone questions it, which wastes time and, worse, sometimes
gets reversed by people who don't know why it was made the first time — reintroducing a problem the
original decision solved.

:::manager
Documentation of a decision is not bureaucracy for its own sake; it is a **cheap insurance policy
against re-litigating the same argument every eighteen months**, and it is what you hand an auditor
or a new hire instead of your own memory. The cost of writing one page is trivial next to the cost of
a team re-deriving a decision from scratch, or worse, silently reversing a good one.
:::

:::engineer
An Architecture Decision Record (ADR) is usually a short markdown file, numbered and stored in the
repository it affects (or a shared decisions repository), so it's versioned, searchable, and sits
next to the code it explains — not in a wiki page nobody finds.
:::

## Anatomy of an ADR

The format that has become the de facto standard (credited to Michael Nygard, who proposed it in
2011) has four parts:

- **Title and status** — a short, specific title, and a status: proposed, accepted, superseded (with
  a link to what superseded it).
- **Context** — the situation and constraints that make this decision necessary. What problem forced
  a choice?
- **Decision** — the choice itself, stated plainly: "We will use X."
- **Consequences** — what becomes easier, what becomes harder, and what you're now committed to.
  This is the section people skip writing and the one that matters most.

:::engineer
```markdown
# ADR-014: Use Kafka for interbank settlement event distribution

## Status
Accepted

## Context
Three downstream systems need near-real-time notification when a settlement completes. A direct
API call from the settlement service to each consumer couples them tightly and means adding a new
consumer requires a change to the settlement service.

## Decision
We will publish settlement events to a Kafka topic; consumers subscribe independently.

## Consequences
Easier: new consumers can be added without changing the settlement service; consumers can replay
events after an outage. Harder: we now operate a Kafka cluster (or depend on a managed one) and
need to design for at-least-once delivery and consumer idempotency, which the direct-call approach
didn't require.
```
:::

:::manager
When reviewing an ADR, read the Consequences section first. A decision with no listed downsides was
either trivial or under-examined — every real architecture decision trades something for something
else, and a document that hides the "harder" side is a red flag, not a clean decision.
:::

## Options tables: comparing choices honestly

An options table lists the choices that were genuinely considered, side by side, against the
criteria that matter for this decision — not a table built after the fact to justify a choice
someone already made.

| Option | Cost | Time to build | Fits existing skills | Vendor risk |
| --- | --- | --- | --- | --- |
| Build in-house | High (engineering time) | 6+ months | Yes | Low |
| Buy: Vendor A | Medium (licence) | 4 weeks | No, needs training | Medium |
| Buy: Vendor B (existing bank relationship) | Medium (licence) | 6 weeks | Partial | Low |

:::manager
The tell for a table built to justify rather than inform: only one option scores well across every
row, or the "losing" options are obviously weak strawmen. A genuinely useful table has real tension —
the option you end up choosing should be visibly worse on at least one criterion, with the document
explaining why that tradeoff was accepted.
:::

:::engineer
Keep the criteria consistent across every option you compare and specific enough to score, not vague
adjectives. "Fits existing skills: yes/no/partial" is checkable; "modern" is not.
:::

## The one-page decision

A decision document that runs to eight pages will not be read by the people who need to act on it
later. The discipline of fitting a real decision onto one page forces you to separate the reasoning
that matters from the exploration that got you there (which can live in an appendix or a linked
document, but doesn't belong in the record itself).

:::callout{kind=tip title="A one-page template that works"}
Problem (2–3 sentences) → Options considered (a table) → Decision (1 sentence) → Why (3–5 bullets) →
Consequences, both good and bad (bullets) → Who signed off and when.
:::

:::engineer
```markdown
## Problem
Reconciliation jobs read directly from the OLTP database, and slow queries are now affecting
transaction latency during nightly batch windows.

## Options considered
| Option | Cost | Time | Risk |
...

## Decision
Stand up a read replica for reconciliation queries.

## Why
- Reconciliation queries are read-only and tolerate seconds of replication lag.
- No application code changes beyond a connection string.

## Consequences
Easier: batch queries no longer contend with live transactions. Harder: replica lag must be
monitored; reconciliation results are technically a few seconds stale.

## Sign-off
Approved by J. Okafor (Platform Lead), 2026-03-04.
```
Fitting all six parts on one page usually means each bullet is a genuine sentence, not a paragraph —
that discipline is the point, not a formatting nuisance.
:::

:::manager
If you can't fit a decision on one page, that's often a sign the decision is actually several
decisions bundled together. Splitting "which database" from "how we migrate the existing data" into
two ADRs usually makes both easier to write and easier for someone else to act on later.
:::

## Common mistakes

- **Writing the ADR after the decision is irreversible**, as a formality, instead of while options
  are still genuinely open.
- **Skipping the Consequences section** or writing only positive consequences.
- **An options table with a foregone conclusion** — comparing the chosen option against strawmen.
- **No status or supersession trail** — an old ADR still marked "accepted" that nobody actually
  follows any more, misleading anyone who finds it later.
- **Storing decisions somewhere nobody looks** — a chat thread or a slide deck instead of a
  searchable, versioned location next to the code.

:::callout{kind=bank-context}
For a regulated system, an ADR is often the cleanest artefact you can hand to an audit or a
regulatory review to answer "why was this control/architecture chosen?" A decision trail with dates
and named approvers is worth more than a polished retrospective explanation invented after the fact.
:::

## Putting it together

::::exercise{id=ex-write-adr type=design title="Write a one-page ADR"}
Your team must decide whether to build a custom internal reporting dashboard or buy an off-the-shelf
BI tool (e.g. Tableau, Power BI) for regulatory reporting. Write a one-page ADR: context, at least
two options in a table, the decision you'd make (pick one, with reasoning), and consequences —
including at least one genuine downside of your chosen option.
:::solution
A reasonable shape:

**Context**: Regulatory reporting currently requires manual spreadsheet work; three teams need
self-service access to the same underlying data with an audit trail of who viewed what.

**Options**:

| Option | Cost | Time | Audit trail | Vendor risk |
| --- | --- | --- | --- | --- |
| Build custom dashboard | High (ongoing engineering) | 4–6 months | Full control | Low |
| Buy: Power BI (bank already has Microsoft licensing) | Low incremental (licensing already owned) | 3–4 weeks | Built-in, needs configuration | Low (existing vendor) |

**Decision**: Buy Power BI, configured against the existing data warehouse.

**Why**: Licensing is already owned, deployment is weeks not months, and it satisfies the audit-trail
requirement out of the box.

**Consequences**: Easier — fast delivery, no new engineering maintenance burden. Harder — the team
is now dependent on Power BI's access-control model rather than one they fully control, and any
future reporting need that Power BI genuinely can't express will require a workaround or a second
tool, which is the real tradeoff of buying over building.

A manager reviewing this should specifically check that a genuine downside is listed — "no downside"
is the sign of an under-examined decision.
:::
::::
