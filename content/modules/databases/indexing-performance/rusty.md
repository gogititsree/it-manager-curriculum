---
title: "Indexing & Performance — refresher"
estimatedMinutes: 15
objectives:
  - "Re-anchor index types, ESR ordering and explain() reading in ten minutes"
  - "Know what changed in explain() output and index tooling since you last tuned MongoDB"
  - "Spot the sizing and sharding mistakes that still get past experienced reviewers"
status: ready
---

You have designed indexes and read query plans before. The core ideas — index types, ESR ordering,
working set — have not changed. What has: `explain()` output got richer, a couple of index types
matured, and the tooling for spotting problems before they hit production got noticeably better.

## What you probably remember

| Concept | One-line anchor |
| --- | --- |
| Index purpose | Ordered structure that lets a query jump to matching documents instead of scanning all of them. |
| COLLSCAN vs IXSCAN | Full collection scan vs index-assisted lookup; check via explain(). |
| Compound index / ESR | Equality fields first, then Sort fields, then Range fields, in that index order. |
| Covered query | Every needed field is in the index; no document fetch; totalDocsExamined: 0. |
| Working set | The actively-used data + indexes; performance falls off sharply once it exceeds RAM. |
| Sharding | Distributes data/load across servers via a shard key; near-permanent choice; solves size/throughput ceilings, not bad queries. |
| Write cost of indexes | Every index speeds reads and slows writes to that collection; not free. |

## What changed since

:::callout{kind=changed-since title="explain() output restructured (3.0 era onward; queryPlanner/executionStats/allPlansExecution)"}
If your mental model of `explain()` is a flatter, single-shape output, current versions give you
three tiers: `queryPlanner` (the chosen plan, no execution), `executionStats` (the chosen plan plus
actual document/key counts — what you want for diagnosis), and `allPlansExecution` (every candidate
plan the optimiser considered, useful when you suspect the wrong plan was chosen). Always call with
`"executionStats"` for performance diagnosis; the bare `explain()` only shows the plan, not what it
cost.
:::

:::callout{kind=changed-since title="Wildcard indexes (4.2, 2019)"}
`{ "$**": 1 }` indexes all fields (or all fields under a subdocument) without naming them, useful for
highly variable or user-defined document shapes where you cannot predict which field will be
queried. It is not a substitute for a properly ESR-ordered compound index on a known hot query — it
is wider and less efficient per field, and exists for the genuinely unpredictable case.
:::

:::callout{kind=changed-since title="Hidden indexes (4.4, 2020)"}
An index can be hidden from the query planner without dropping it (`db.coll.hideIndex(name)`). Lets
you test the impact of removing an index — does anything get slower or fall back to COLLSCAN? — with
an instant, reversible toggle, instead of dropping and rebuilding an index (expensive on a large
collection) to find out.
:::

:::engineer
```javascript
db.transactions.hideIndex({ accountId: 1, status: 1 });
// run representative queries, check explain() output for regressions
db.transactions.unhideIndex({ accountId: 1, status: 1 });   // or dropIndex() once confirmed unused
```
:::

:::callout{kind=changed-since title="Index build impact reduced (4.2+ optimised builds; still plan around it)"}
Index builds on existing large collections used to hold a significant lock and noticeably affect
foreground operations. Current versions build indexes with substantially less blocking impact than
older ones. This does not mean building a large new index on a production collection is free — still
plan and monitor it, but the "always build indexes in a maintenance window on a replica first" advice
from older MongoDB deployments is less absolute than it used to be. Check current behaviour for your
deployed version rather than assuming either the old or new default.
:::

## Gotchas that still bite

- **ESR order still gets reversed under pressure.** "The query has range then sort in the code, so
  I'll index it that way" is still the most common compound index mistake, years later.
- **explain() without "executionStats"**, reading only the chosen plan and not the actual document
  counts — tells you what MongoDB decided to do, not whether it worked well.
- **Sharding reached for before checking explain() on the slow query.** Still the first thing to rule
  out; sharding does not fix a bad query plan.
- **Assuming index build impact is now zero.** It is reduced, not eliminated. A large index build on
  a live production collection still deserves a monitored, planned rollout.
- **Wildcard indexes used as a general substitute for a designed compound index.** They cover the
  unpredictable case; they are not free performance for a known, hot, well-understood query.

:::callout{kind=bank-context}
Hidden indexes are a useful, low-risk tool for an index cleanup exercise on a regulated production
system: confirm an index is safe to remove, without an irreversible drop-and-rebuild, before it goes
through change control as a deletion.
:::

## Ten-minute drill

::::exercise{id=ex-diagnose-and-fix type=scenario title="A dashboard query got slow after a schema change"}
A dashboard query that used to be fast now shows `COLLSCAN` in `explain()`. Nothing in the index
definitions changed. What do you check first, and what MongoDB feature would let you test a fix
without committing to it?

:::solution
Check first whether a recent schema or query change altered the shape of the filter in a way that no
longer matches an existing compound index's leading (equality) fields — a common cause is a field
being renamed, restructured, or a new equality clause being added ahead of what used to be the
leading field, which can silently stop the existing index from being eligible. Confirm with
`explain("executionStats")` on both the old and new query shapes if possible. To test a fix
(a new or reordered compound index) without committing: build the candidate index alongside the
existing one, hide the old one with `hideIndex()`, and compare `explain()` results before actually
dropping anything — reversible until you are confident, rather than a drop-and-rebuild gamble on a
production collection.
:::
::::
