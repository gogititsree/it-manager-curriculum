---
title: "MongoDB Aggregation Pipelines"
estimatedMinutes: 35
objectives:
  - "Explain what an aggregation pipeline is and how stages pass data to each other"
  - "Read and write basic $match, $group and $project stages"
  - "Trace how a document is transformed as it moves through a short pipeline"
status: ready
---

`find()` filters and shapes documents one collection at a time. The moment you need to summarise,
regroup, or combine data from more than one collection, you need the **aggregation pipeline**: a
sequence of stages, each one taking the output of the previous stage as its input, like a Unix pipe
for documents. This lesson builds the mental model and the three stages you will use constantly.

## Why this exists

A branch manager asks: "total value of transactions per account, this month, for accounts over
£1,000." That is not a filter on one document — it is a filter, then a grouping, then a filter on the
grouped result. `find()` cannot express this. An aggregation pipeline can, as a sequence of small,
composable steps:

```javascript
db.transactions.aggregate([
  { $match: { postedAt: { $gte: ISODate("2024-11-01"), $lt: ISODate("2024-12-01") } } },
  { $group: { _id: "$accountId", total: { $sum: "$amount" } } },
  { $match: { total: { $gt: 1000 } } }
]);
```

Each `{ ... }` in the array is a **stage**. Documents flow through the array in order: `$match` first
narrows to November's transactions, `$group` collapses them into one document per account with a
summed total, and the second `$match` keeps only the accounts over the threshold. The output of one
stage is exactly the input to the next — nothing more, nothing hidden.

:::manager
The management-relevant fact: a pipeline is **read top to bottom, and each stage only sees what the
previous stage handed it.** When a report is wrong, the fix is almost always "which stage produced
the wrong shape", found by reading the pipeline in order, not by treating it as one opaque query.
This is also why pipeline order matters for performance, covered later in this lesson.
:::

## The core stages

Five stages cover the large majority of real pipelines. Learn these first.

**$match** — filters documents, exactly like the query part of `find()`. Uses the same operators
(`$eq`, `$gt`, `$in`, ...).

**$group** — collapses many documents into one per distinct value of `_id`. Every field besides `_id`
is built with an **accumulator**: `$sum`, `$avg`, `$min`, `$max`, `$push` (collect into an array),
`$first`/`$last`.

**$project** — reshapes each document: include, exclude, rename, or compute new fields.

**$sort** — orders documents, same syntax as `.sort()` on a cursor.

**$limit** / **$skip** — cap or page through results.

:::engineer
```javascript
db.transactions.aggregate([
  { $match: { accountId: "acc-771" } },
  { $group: {
      _id: "$accountId",
      transactionCount: { $sum: 1 },
      totalDebits: { $sum: { $cond: [{ $lt: ["$amount", 0] }, "$amount", 0] } },
      lastTransaction: { $max: "$postedAt" }
  }},
  { $project: {
      _id: 0,
      accountId: "$_id",
      transactionCount: 1,
      totalDebits: 1,
      lastTransaction: 1
  }}
]);
```
`$sum: 1` counts documents; `$sum: "$amount"` (or a field reference) sums a field. `$project` here
drops the default `_id` and renames it to `accountId` for a cleaner API response.
:::

:::manager
Ask a team demonstrating a new report: "which stage does the filtering, and does it run before or
after the grouping?" A correct answer that names a stage means someone actually designed the
pipeline. A vague answer ("the query gets the totals") is a sign nobody has looked at the stage order,
which is exactly where both correctness bugs and performance problems hide.
:::

## How data flows through stages

The critical habit: think of the pipeline as a series of intermediate collections, one per stage,
each one visible only to the next stage. `$match` before `$group` sees the original documents.
`$match` after `$group` sees the *grouped* documents — it can filter on `total`, but it can no longer
filter on the original per-transaction `amount`, because that field no longer exists in the output of
`$group`.

:::engineer
```
Input:      { accountId: "acc-771", amount: -42.50, postedAt: "2024-11-02" }
                      |
                 $match (Nov only)
                      |
                 $group by accountId, $sum amount -> { _id: "acc-771", total: -1820.44 }
                      |
                 $match (total > 1000)      <- "amount" no longer exists here; only "total" does
                      |
Output:     { _id: "acc-771", total: -1820.44 }   (if it passed the second $match)
```
:::

:::callout{kind=gotcha title="A field from an earlier stage is gone unless you kept it"}
`$group` and `$project` both reshape the document. If a later stage needs a field, it must survive
every stage in between, either passed through or recomputed. This is the single most common
beginner mistake when writing a multi-stage pipeline: reaching for a field that a `$group` two stages
back already discarded.
:::

## Reading a pipeline someone else wrote

You will read far more pipelines than you write once you are managing a team. The habit that works:
read the stage list top to bottom without the details first (just the stage names), form an
expectation of the shape at each point, then check each stage's fields against that expectation.

:::engineer
```javascript
db.transactions.aggregate([
  { $match: { status: "posted" } },              // 1: only posted transactions
  { $group: { _id: "$accountId", total: { $sum: "$amount" } } },  // 2: one row per account
  { $sort: { total: -1 } },                       // 3: biggest totals first
  { $limit: 10 }                                  // 4: top 10 accounts by total
]);
```
Stage names alone tell the story: filter, then summarise, then rank, then cap. This is "top 10
accounts by total posted transaction value" before reading a single operator in detail.
:::

:::callout{kind=tip title="Name intent, not mechanics"}
When a pipeline is more than two or three stages, add a short comment above each stage saying what
it's for in plain English ("narrow to this month", "one row per account"), not just what the operator
does. Six months later, the comment is what tells a reader the pipeline's *intent* — the operators
already say what it mechanically does.
:::

## Common mistakes

- **Filtering after grouping when you could filter before.** `$match` early, on raw fields, is
  usually cheaper — the performance angle is covered fully in the next lesson, but as a beginner
  habit: if you can write the filter before the `$group`, do.
- **Forgetting `_id` is required in `$group`.** Every `$group` stage must specify `_id` (use `null`
  to collapse everything into a single summary document).
- **Confusing `$project` field inclusion and exclusion.** You generally cannot mix `1` (include) and
  `0` (exclude) in the same `$project`, except for `_id`.
- **Expecting a field to survive a `$group` it wasn't included in.** See the gotcha above.
- **Writing one giant pipeline instead of testing stage by stage.** Run the pipeline with stages
  removed from the end, one at a time, to see the intermediate shape — this is the single most useful
  debugging technique for aggregations.

## Putting it together

::::exercise{id=ex-trace-pipeline type=code title="Trace a small pipeline"}
Given transactions like `{ accountId, amount, category, postedAt }`, trace this pipeline stage by
stage and describe the shape of the document after each stage:

```javascript
db.transactions.aggregate([
  { $match: { category: "fees" } },
  { $group: { _id: "$accountId", feeTotal: { $sum: "$amount" }, feeCount: { $sum: 1 } } },
  { $sort: { feeTotal: 1 } },
  { $limit: 5 }
]);
```
What does the final output represent in plain English?
:::solution
- After `$match`: only fee transactions, unchanged shape (`accountId`, `amount`, `category`,
  `postedAt`).
- After `$group`: one document per account, shape `{ _id: accountId, feeTotal, feeCount }`. The
  original `amount`, `category`, `postedAt` fields no longer exist on these documents.
- After `$sort`: same documents, ordered by `feeTotal` ascending (fee amounts are typically negative,
  so ascending puts the largest fee burden — the most negative total — first).
- After `$limit`: only the first 5 of that sorted list survive.
- Plain English: "the 5 accounts with the largest total fee charges." Note the sort direction is a
  common trap here — `1` is ascending, and with negative amounts that means "most negative first,"
  which is what's wanted, but it is worth double-checking against the actual sign convention in the
  data before trusting the result.
:::
::::
