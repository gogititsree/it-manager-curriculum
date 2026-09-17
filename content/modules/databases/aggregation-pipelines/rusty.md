---
title: "Aggregation Pipelines — refresher"
estimatedMinutes: 15
objectives:
  - "Re-anchor the core stages and the filter-early rule in ten minutes"
  - "Know which newer stages and operators replace patterns you used to hand-code"
  - "Spot the pipeline-order mistakes that still get past experienced reviewers"
status: ready
---

You have written `$match`/`$group`/`$project` pipelines before. The stage model has not changed. What
has changed: a handful of newer stages and operators replace things you used to bolt on with
`$project` expressions or a second query, and window functions finally give you running totals
in-pipeline. This refresher assumes you can read an aggregation pipeline and spends its time on the
delta.

## What you probably remember

| Concept | One-line anchor |
| --- | --- |
| Pipeline model | An array of stages; each stage's output is exactly the next stage's input. |
| $match | Filters documents; identical operators to find(). Push it as early as possible. |
| $group | Collapses documents by `_id`; every other field is built with an accumulator ($sum, $avg, $push...). |
| $project | Reshapes: include/exclude/rename/compute fields. |
| $lookup | Left outer join against another collection; pair with $unwind to flatten a single match. |
| $facet | Multiple sub-pipelines over the same input, returned side by side; buffers in memory. |
| Filter-early rule | $match/$limit before $lookup/$group whenever the logic allows; indexes only help a leading $match. |

## What changed since

:::callout{kind=changed-since title="Window functions: $setWindowFields (5.0, 2021)"}
Running totals, rankings and moving averages used to require awkward `$group`-then-`$unwind`
gymnastics or client-side post-processing. `$setWindowFields` computes a value per document over a
defined window (partitioned and/or sorted) without collapsing the documents, which is what
`$group` does. If you ever hand-rolled a running balance by processing grouped results in
application code, this stage now does it inside the pipeline.
:::

:::engineer
```javascript
db.transactions.aggregate([
  { $match: { accountId: "acc-771" } },
  { $sort: { postedAt: 1 } },
  { $setWindowFields: {
      partitionBy: "$accountId",
      sortBy: { postedAt: 1 },
      output: { runningBalance: { $sum: "$amount", window: { documents: ["unbounded", "current"] } } }
  }}
]);
// each transaction document now carries a runningBalance computed over all prior transactions
// for the same account, without collapsing them into a single grouped document
```
:::

:::callout{kind=changed-since title="$merge replacing $out for incremental writes (4.2, 2019)"}
`$out` replaces an entire collection with the pipeline's output. `$merge` can insert, update, or
merge into an existing collection based on a key — the shape you need for incremental materialised
views (e.g. a daily rollup collection updated each night) instead of a full rebuild every run.
:::

:::callout{kind=changed-since title="$lookup with a sub-pipeline and multiple join keys (3.6, 2017)"}
Early `$lookup` only supported a single equality between `localField`/`foreignField`. The
`let`/`pipeline` form supports arbitrary match conditions, multiple keys, and — critically —
filtering the *foreign* side before the join happens, which is the fix for the "$lookup before
$match" performance trap covered in the intermediate lesson.
:::

:::callout{kind=changed-since title="Smaller things you will see in modern pipelines"}
- `$dateTrunc`, `$dateAdd`, `$dateDiff` — date arithmetic operators that replace hand-written date
  math in `$project`/`$group` expressions.
- `allowDiskUse: true` as an aggregate option, for stages (mainly `$group`, `$sort`) that exceed the
  in-memory limit — a fix for an error, not a performance improvement.
- `$unionWith` — combine results from two collections in one pipeline, without a client-side merge.
:::

## Gotchas that still bite

- **$lookup before $match**, still the single most common production slowdown, now with a fix
  (pipeline-form `$lookup`) that has existed since 2017 and is still routinely unused.
- **Treating $facet as parallelism.** It saves round trips, not compute; an expensive sub-pipeline
  inside it is still expensive.
- **allowDiskUse as a default reflex.** It silences the memory-limit error but does not address why a
  `$group` or `$sort` is holding more data than expected — check whether an earlier `$match` should
  have narrowed the input instead.
- **Forgetting a field was dropped two stages back.** Still the most common correctness bug; still
  fixed by tracing the pipeline stage by stage, as in the beginner lesson.
- **$setWindowFields without a partition or sort when one is needed.** A running total over the whole
  collection instead of per account, because `partitionBy` was omitted, produces a number that looks
  plausible and is wrong.

:::callout{kind=bank-context}
`$merge` into a nightly rollup collection is a common shape for regulatory and MI reporting — cheaper
than a full `$out` rebuild every run. Confirm the merge key genuinely uniquely identifies the rollup
row (account + date, say); a wrong merge key silently overwrites rows that were not supposed to
collide, which is a data-integrity issue that will not throw an error.
:::

## Ten-minute drill

::::exercise{id=ex-running-balance type=code title="Add a running balance without $group"}
Given `transactions: { accountId, amount, postedAt }`, write a pipeline that returns every
transaction for `acc-771`, in date order, each annotated with a running balance as of that
transaction — without collapsing the transactions into a single grouped document.

:::solution
```javascript
db.transactions.aggregate([
  { $match: { accountId: "acc-771" } },
  { $sort: { postedAt: 1 } },
  { $setWindowFields: {
      sortBy: { postedAt: 1 },
      output: {
        runningBalance: {
          $sum: "$amount",
          window: { documents: ["unbounded", "current"] }
        }
      }
  }}
]);
```
`partitionBy` is unnecessary here since the leading `$match` already narrows to one account; add it
back (`partitionBy: "$accountId"`) if the `$match` is removed to compute running balances for many
accounts in one pass. This is the modern replacement for a `$group`-and-reprocess or client-side loop
to get a running total.
:::
::::
