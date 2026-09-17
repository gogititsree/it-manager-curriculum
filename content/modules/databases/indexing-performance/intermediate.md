---
title: "Compound Indexes, Covered Queries and Sizing"
estimatedMinutes: 45
objectives:
  - "Apply the ESR rule to design a compound index for a real query"
  - "Recognise and design a covered query, and know when it's worth the effort"
  - "Reason about sizing and know when sharding is the right answer versus a premature one"
status: ready
---

A single-field index is easy to get right. A compound index — one index across several fields — has
a field order that determines which queries it can actually help, and getting that order wrong is
one of the most common indexing mistakes in production MongoDB. This lesson covers the rule that
fixes it, the technique that avoids touching documents at all, and how to reason about scale before
reaching for the most disruptive fix available.

## Where the basics break down

A single-field index on `accountId` helps `find({ accountId })`. It does nothing extra for
`find({ accountId, status: "pending" }).sort({ postedAt: -1 })` beyond narrowing to the account —
MongoDB still has to filter and sort the result in memory. A compound index across all three fields
can serve the whole query directly, but only if the fields are ordered correctly. Ordered wrong, a
compound index can silently fail to help a sort or a range filter while still looking, on the
surface, like "we have an index for this."

## The ESR rule

For a compound index, order fields: **Equality, Sort, Range.**

1. **Equality** fields first — fields the query filters on with an exact match (`accountId: "acc-771"`).
2. **Sort** fields next — fields the query sorts by.
3. **Range** fields last — fields filtered with `$gt`, `$lt`, `$gte`, `$lte`, `$ne`, `$in` on a
   range.

The reasoning: an index is a sorted structure. Equality fields let MongoDB jump to an exact point.
From there, if the next index field matches the sort, MongoDB can walk the index in order and avoid
an in-memory sort entirely. A range field, if placed before the sort field, breaks the index's
ability to serve the sort in order — so range always goes last.

:::engineer
```javascript
// Query: pending transactions for one account, most recent first
db.transactions.find({
  accountId: "acc-771",
  status: "pending"
}).sort({ postedAt: -1 });

// ESR-ordered compound index: Equality (accountId, status), Sort (postedAt)
db.transactions.createIndex({ accountId: 1, status: 1, postedAt: -1 });
```
```javascript
// Query: transactions for an account in a date range, most recent first
db.transactions.find({
  accountId: "acc-771",
  postedAt: { $gte: ISODate("2024-11-01"), $lt: ISODate("2024-12-01") }
}).sort({ postedAt: -1 });

// Here postedAt is both the sort field and the range field. ESR still applies:
// Equality (accountId), then postedAt covers both sort and range in this case.
db.transactions.createIndex({ accountId: 1, postedAt: -1 });
```
:::

:::callout{kind=decision title="Getting ESR order wrong: what actually happens"}
Putting a range field before a sort field in a compound index does not make the query fail — it
still returns correct results — but MongoDB can no longer use the index to serve the sort in order,
so it falls back to an in-memory sort of whatever the index narrowed down to. For a large result set
that either hits the sort memory limit or is simply much slower than it needed to be. This is the
most common "we have an index but it's still slow" pattern.
:::

:::manager
ESR is worth knowing by name because it turns "the index seems wrong somehow" into a specific,
checkable review question: does this compound index put equality fields first, sort fields next, and
range fields last? A team that can answer that has actually designed the index; a team that added
fields "in the order the query has them" usually has not.
:::

## Covered queries

A query is **covered** when every field it needs — both the filter and the returned fields — exists
in the index itself, so MongoDB never has to fetch the actual document. This is meaningfully faster
than an index scan followed by document fetches, because it skips the fetch step entirely.

:::engineer
```javascript
db.transactions.createIndex({ accountId: 1, postedAt: -1, amount: 1 });

// Covered: every field referenced (filter + sort + projected fields) is in the index
db.transactions.find(
  { accountId: "acc-771" },
  { _id: 0, postedAt: 1, amount: 1 }
).sort({ postedAt: -1 });
```
Excluding `_id` in the projection matters — `_id` is returned by default and is not part of this
index, which would break coverage. Confirm with `explain("executionStats")`: a covered query shows
`totalDocsExamined: 0`.
:::

:::callout{kind=tip title="Covered queries are a targeted optimisation, not a default goal"}
Designing every index to cover every query bloats indexes (more fields, more write cost) for
marginal gain on queries that are not actually hot. Reserve the effort for high-frequency queries
where the fetch step is a measurable cost — a dashboard query run thousands of times a minute, not an
ad-hoc admin lookup.
:::

## Sizing: working set, indexes and RAM

Total index size matters as much as document data size for the working-set question from the
beginner lesson: indexes need to fit in memory too, or lookups against them start hitting disk. A
collection with several large compound indexes can have an index footprint larger than the data
itself.

:::engineer
```javascript
db.transactions.stats().indexSizes;   // per-index size, in bytes
db.transactions.totalIndexSize;
```
:::

:::manager
When capacity planning for a new collection, ask for an estimate of total index size, not just
document size — especially once several compound and multikey indexes are in play. "We sized memory
for the data" is an incomplete plan if the indexes alone approach or exceed it.
:::

## Sharding: overview and when it's premature

**Sharding** distributes a collection's data across multiple servers (shards), each holding a subset
determined by a **shard key**. It solves two problems a single server eventually cannot: dataset size
beyond what one server can hold in memory or on disk, and write throughput beyond what one server can
sustain.

:::engineer
```javascript
sh.shardCollection("bank.transactions", { accountId: 1 });
```
The shard key choice is close to permanent in practice — changing it later means reorganising the
entire dataset. A good shard key distributes both data and load evenly (avoiding a "hot shard") and
lines up with how the application actually queries, so most queries can be routed to one shard
instead of scattering across all of them.
:::

:::callout{kind=decision title="Sharding: needed now, or premature?"}
Sharding solves a genuine capacity or throughput ceiling. It is premature when the actual problem is
a missing index, an oversized working set that a bigger single instance would fix more simply, or a
schema that embeds data it should reference. Reach for indexing, schema fixes, and vertical scaling
first; reach for sharding when a single, well-indexed, well-modelled deployment still cannot hold the
working set in memory or sustain the required write rate — and be honest that sharding materially
increases operational complexity (shard key choice, balancing, query routing, backup strategy) before
choosing it.
:::

:::callout{kind=bank-context}
A wrongly chosen shard key on a core banking collection is one of the more expensive mistakes
available in this stack — correcting it is closer to a migration than a configuration change.
Treat the shard key decision with the same rigour as a schema decision that cannot be easily reversed,
because it effectively is one.
:::

## What good looks like

A performance review for a new or changed query should show:

- The query shape and its `explain("executionStats")` output against representative data volume, not
  a small fixture.
- The compound index proposed for it, with the ESR ordering stated explicitly.
- Whether the query is hot enough to justify designing for coverage.
- An estimate of total index size added, and its effect on the working set.
- If sharding is proposed: what ceiling (size, throughput) it is solving, and confirmation that
  indexing and schema fixes were considered and ruled out first.

## Putting it together

::::exercise{id=ex-design-compound-index type=code title="Design a compound index with ESR"}
Design the compound index for this query, and state the ESR reasoning:

```javascript
db.transactions.find({
  branch: "Leeds",
  status: "posted",
  amount: { $gt: 1000 }
}).sort({ postedAt: -1 });
```
:::solution
Equality fields: `branch`, `status` (both exact-match). Sort field: `postedAt`. Range field:
`amount` (`$gt`).

```javascript
db.transactions.createIndex({ branch: 1, status: 1, postedAt: -1, amount: 1 });
```
Equality fields come first in either order relative to each other (`branch`/`status` order between
themselves doesn't affect ESR correctness, though putting the more selective one first is a minor
secondary optimisation). `postedAt` next lets the sort use the index directly. `amount` goes last
because it is a range condition — placed earlier, it would prevent the index from serving the sort in
order, forcing an in-memory sort of a large result set.
:::
::::

::::exercise{id=ex-sharding-scenario type=scenario title="The team proposes sharding the transactions collection"}
A team proposes sharding the `transactions` collection because "reports are getting slow." The
collection is 200 GB, the server has 32 GB of RAM, and no one has run `explain()` on the slow reports.
What do you ask before approving?
:::solution
Ask for `explain("executionStats")` on the slow reports first — "slow" with no diagnosis is exactly
as likely to be a missing or badly ordered index as a genuine capacity ceiling, and sharding will not
fix a bad query plan. Ask whether the working set (not the full 200 GB, but the data actually touched
by regular queries) fits in the 32 GB of RAM available — if reports scan a full year of history
routinely, that may be the actual problem, solvable by proper indexing plus possibly more RAM, well
short of sharding. Only after ruling those out does sharding become the right conversation — and at
that point, the shard key choice deserves the same scrutiny as a one-way schema decision, because
correcting a bad one later is a migration, not a config change.
:::
::::
