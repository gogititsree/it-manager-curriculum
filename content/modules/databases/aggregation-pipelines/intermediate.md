---
title: "Aggregation Pipelines: Joins, Facets and Performance"
estimatedMinutes: 45
objectives:
  - "Use $lookup to join collections and $facet to produce multiple summaries in one pass"
  - "Push $match and $limit as early as possible in a pipeline and explain why it matters"
  - "Review a real pipeline for correctness and performance the way a senior engineer would"
status: ready
---

The five core stages get you a long way. Production pipelines add two more capabilities — joining
across collections and producing several summaries in one query — and expose a habit that separates
a pipeline that runs in milliseconds from one that times out under load: where you put `$match`.

## Where the basics break down

A beginner pipeline against a small, single collection runs fast regardless of stage order. The same
pipeline against a 200-million-row transaction collection, or one that starts with a `$lookup`
against another large collection before filtering, can be a hundred times slower — not because the
logic is wrong, but because it forces MongoDB to process far more documents than the final answer
needs. Production aggregation work is as much about *where* you put each stage as *which* stages you
use.

## $lookup: joining across collections

`$lookup` performs a left outer join against another collection, attaching matching documents as an
array field.

:::engineer
```javascript
db.transactions.aggregate([
  { $match: { postedAt: { $gte: ISODate("2024-11-01") } } },
  { $lookup: {
      from: "accounts",
      localField: "accountId",
      foreignField: "_id",
      as: "account"
  }},
  { $unwind: "$account" },   // account is a one-element array; flatten it to an object
  { $match: { "account.branch": "Leeds" } },
  { $project: { amount: 1, postedAt: 1, "account.branch": 1 } }
]);
```
`$unwind` turns the one-element `account` array `$lookup` produces into a plain object field, which
is almost always what you want immediately after a single-match `$lookup`.
:::

:::callout{kind=decision title="$lookup vs embedding: this is the same decision as document modeling, at query time"}
A `$lookup`-heavy pipeline is a sign the schema referenced data that is frequently read together. That
is sometimes correct (see the document-modeling topic for the criteria) and sometimes a signal the
schema should have embedded that data instead. If the same `$lookup` appears in every report against
a collection, ask whether the underlying schema is fighting the access pattern.
:::

:::manager
`$lookup` is where "MongoDB doesn't do joins" stops being quite true and becomes "MongoDB's joins are
explicit, per-query, and unindexed by default unless you index the foreign field" — worth knowing
before a team promises relational-style reporting flexibility on a document schema designed for
something else.
:::

## $facet: several summaries in one pass

`$facet` runs multiple independent sub-pipelines against the same input documents and returns their
results side by side. Useful for a dashboard that needs several breakdowns of the same underlying
data without re-querying the collection for each one.

:::engineer
```javascript
db.transactions.aggregate([
  { $match: { postedAt: { $gte: ISODate("2024-11-01") } } },
  { $facet: {
      byCategory: [
        { $group: { _id: "$category", total: { $sum: "$amount" } } }
      ],
      byDay: [
        { $group: { _id: { $dateTrunc: { date: "$postedAt", unit: "day" } }, total: { $sum: "$amount" } } },
        { $sort: { _id: 1 } }
      ],
      overall: [
        { $group: { _id: null, total: { $sum: "$amount" }, count: { $sum: 1 } } }
      ]
  }}
]);
```
The `$match` runs once; all three sub-pipelines reuse its output. Without `$facet` this would be
three separate round trips, each re-scanning the matched documents.
:::

:::callout{kind=warning title="$facet does not parallelise stages, and buffers in memory"}
Each sub-pipeline inside `$facet` runs to completion and its results are held in memory before the
stage returns. It saves round trips and repeated `$match` scans, but it is not a way to make a slow
pipeline fast — an expensive sub-pipeline is still expensive. Keep the input to `$facet` filtered down
first.
:::

## Pushing $match early

MongoDB's aggregation engine will move some filters earlier automatically and can use an index for a
`$match` that is the very first stage, exactly like a `find()` query. It cannot use an index for a
`$match` placed after a `$group`, `$project` that drops the indexed field, or `$lookup` — those stages
produce new documents that have no relationship to the original collection's indexes. The rule that
matters in practice:

:::callout{kind=decision title="Stage order for performance"}
1. `$match` as early as possible, on indexed fields, before anything that reshapes the documents.
2. `$limit`/`$sort` early too, if the logic allows it — sorting fewer documents is cheaper, and a
   `$sort` immediately after an indexed `$match` can sometimes use the index instead of an in-memory
   sort.
3. `$lookup` and `$group` after filtering, never before, unless the filter genuinely depends on the
   joined or grouped data (in which case there is often a way to pre-filter one side of the `$lookup`
   with a pipeline inside it — see `let`/`pipeline` in `$lookup`'s advanced form).
4. `$project` to drop unneeded fields early *after* the fields are no longer needed for a later
   stage, to reduce the data volume moving through the rest of the pipeline.
:::

:::engineer
```javascript
// Slower: $lookup joins the full collection before filtering
db.transactions.aggregate([
  { $lookup: { from: "accounts", localField: "accountId", foreignField: "_id", as: "account" } },
  { $unwind: "$account" },
  { $match: { postedAt: { $gte: ISODate("2024-11-01") }, "account.branch": "Leeds" } }
]);

// Faster: filter transactions first, using an index on postedAt, before the join
db.transactions.aggregate([
  { $match: { postedAt: { $gte: ISODate("2024-11-01") } } },
  { $lookup: { from: "accounts", localField: "accountId", foreignField: "_id", as: "account" } },
  { $unwind: "$account" },
  { $match: { "account.branch": "Leeds" } }
]);
```
Both pipelines produce the same result. The second joins a far smaller set of documents, because the
date filter ran before the join instead of after it.
:::

## Performance traps

- **$lookup before $match**, joining the full collection before narrowing it — the single most
  common production slowdown in reporting pipelines.
- **$sort without an index and without an earlier $limit**, forcing an in-memory sort of the full
  result set. MongoDB caps in-memory sort at a fixed memory budget and will error rather than spill
  silently, unless `allowDiskUse: true` is set — which fixes the error but not the underlying cost.
- **$group on an unindexed, high-cardinality field** across a huge collection, with no `$match`
  narrowing the input first.
- **Rehydrating too much with $lookup** — fetching entire joined documents when only one or two
  fields are needed. Use the pipeline form of `$lookup` to project down inside the join itself.
- **A $facet whose sub-pipelines each redo an expensive $group** the outer pipeline could have done
  once before branching.

:::callout{kind=bank-context}
A monthly regulatory report that reads the full transaction collection is exactly the pipeline shape
where "filter first" matters most: a poorly ordered pipeline that works fine in testing on a small
data set can fail to complete an overnight batch window once run against a year of production volume.
Ask for the expected input row count and the expected pipeline runtime together, not runtime alone.
:::

## What good looks like

A reviewable aggregation pipeline:

- Has a `$match` as its first stage whenever the source data can be filtered before anything else,
  ideally on an indexed field.
- Names, in a comment or the PR description, roughly how many documents each stage is expected to
  see — a number that is wildly off from reality in testing is an early warning.
- Uses `$project` to drop fields the rest of the pipeline does not need, once they're no longer
  required.
- Avoids `$lookup` against a large collection without a narrowing `$match` beforehand.
- Has been tested with `explain()` on the real (or a representative) data volume, not just a small
  local fixture — see the indexing-performance topic for reading `explain()` output in full.

## Putting it together

::::exercise{id=ex-review-pipeline type=scenario title="Review a monthly settlement report pipeline"}
A colleague submits this pipeline for a monthly settlement report and asks for a review before it
runs against production data (approximately 40 million transactions per month):

```javascript
db.transactions.aggregate([
  { $lookup: { from: "accounts", localField: "accountId", foreignField: "_id", as: "account" } },
  { $unwind: "$account" },
  { $match: {
      postedAt: { $gte: ISODate("2024-11-01"), $lt: ISODate("2024-12-01") },
      "account.type": "settlement"
  }},
  { $group: { _id: "$accountId", total: { $sum: "$amount" }, count: { $sum: 1 } } },
  { $sort: { total: -1 } }
]);
```
What do you flag, and what would the improved pipeline look like?
:::solution
Flag: the `$lookup` joins the *entire* transaction collection against `accounts` before any
filtering happens — for 40 million documents a month, that is 40 million join lookups before the date
filter or the account-type filter ever runs. The date filter (`postedAt`) does not depend on the
joined data at all and should move to a `$match` before the `$lookup`. The account-type filter does
depend on the joined `account` field, so it has two reasonable fixes: keep it as a `$match` after the
`$lookup` but after also moving the date filter earlier (still cuts the join input by roughly a
month's worth of filtering), or better, pre-filter the `accounts` side using the pipeline form of
`$lookup` so only settlement accounts are ever joined against.

Improved pipeline:
```javascript
db.transactions.aggregate([
  { $match: { postedAt: { $gte: ISODate("2024-11-01"), $lt: ISODate("2024-12-01") } } },
  { $lookup: {
      from: "accounts",
      let: { acctId: "$accountId" },
      pipeline: [
        { $match: { $expr: { $eq: ["$_id", "$$acctId"] }, type: "settlement" } }
      ],
      as: "account"
  }},
  { $match: { account: { $ne: [] } } },   // drop transactions whose account didn't match
  { $unwind: "$account" },
  { $group: { _id: "$accountId", total: { $sum: "$amount" }, count: { $sum: 1 } } },
  { $sort: { total: -1 } }
]);
```
Also ask: is `postedAt` indexed? Is this expected to run within a batch window, and has it been
tested against a realistic monthly volume rather than a small local sample?
:::
::::
