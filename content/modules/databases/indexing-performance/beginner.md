---
title: "MongoDB Indexing & Performance"
estimatedMinutes: 35
objectives:
  - "Explain what an index does and why a query without one degrades as a collection grows"
  - "Read a basic explain() output and identify a collection scan versus an index scan"
  - "Describe what the working set is and why it determines whether performance feels fine or falls off a cliff"
status: ready
---

A query against a collection with no relevant index reads every document to find the ones that
match — a **collection scan**. That is fine on a thousand documents and a serious production incident
on a hundred million. An index is a separate, ordered data structure that lets MongoDB jump straight
to the matching documents instead of reading all of them. This lesson covers what an index actually
is, how to tell whether one is being used, and the memory concept that explains why a system can be
fast for months and then suddenly is not.

## Why this exists

Imagine looking up a name in a phone book with no alphabetical order — the only way is to read every
page. An index is the alphabetical order: a separate structure, built and maintained by the database,
that maps a field's values to the documents that have them, kept sorted so a lookup or range query
can jump directly to the relevant section.

```javascript
db.transactions.find({ accountId: "acc-771" });
```

Without an index on `accountId`, this reads every document in the collection. With one, it reads a
small number of index entries to find exactly which documents to fetch.

:::manager
The one-line version for a status report: **the query is not the expensive part; scanning documents
the query didn't need is.** A slow query is almost always a missing or wrong index, not a database
that "can't keep up" — and it is one of the cheapest production fixes available, because adding an
index does not require a code deploy.
:::

## Index types

**Single-field** — one field, ascending or descending order. Covers equality and range queries on
that field, and sorts on it in either direction.

**Compound** — multiple fields in one index, in a defined order. Covers queries and sorts that follow
that order (the ESR rule, covered in the intermediate lesson, governs the order to choose).

**Multikey** — automatically created when you index a field that holds an array; MongoDB indexes each
array element.

**Unique** — enforces that no two documents share the same value for the indexed field(s), same idea
as a relational unique constraint.

**Text** — supports free-text search across string fields. A specialised tool for search, not a
general-purpose performance fix.

:::engineer
```javascript
db.transactions.createIndex({ accountId: 1 });                 // single-field, ascending
db.transactions.createIndex({ accountId: 1, postedAt: -1 });   // compound
db.customers.createIndex({ nationalId: 1 }, { unique: true }); // unique constraint
```
`_id` always has an index automatically; MongoDB creates it on every collection and it cannot be
dropped.
:::

:::manager
Every index speeds up matching reads and slows down every write to that collection, because the
index has to be updated too. "Just add an index" is not free — a collection with a dozen indexes on
it pays that cost on every insert and update. Ask what query an index is for before approving it, and
whether an existing index already covers it.
:::

## Reading explain()

`explain()` shows what MongoDB actually did to answer a query — whether it used an index, which one,
and how many documents it examined versus how many it returned. This is the single most useful
diagnostic tool for a slow query.

:::engineer
```javascript
db.transactions.find({ accountId: "acc-771" }).explain("executionStats");
```
Two fields matter most on a first read:
- `stage`: `COLLSCAN` means a full collection scan (no usable index); `IXSCAN` means an index was
  used.
- `totalDocsExamined` versus `nReturned`: if `totalDocsExamined` is much larger than `nReturned`, the
  query is doing far more work than the result size justifies — usually a missing or wrong index.
:::

:::callout{kind=gotcha title="COLLSCAN is not always wrong"}
A query that legitimately needs most of the collection (a report with no selective filter) will
still show `COLLSCAN`, and that can be the correct plan — an index lookup for most of the collection
is often slower than just scanning it. The diagnostic question is not "does this say COLLSCAN", it is
"does totalDocsExamined roughly match how many documents this query should reasonably need to read".
:::

## Working set and RAM

MongoDB is fastest when the data and indexes actively being used — the **working set** — fit in
memory. Read that data once, and subsequent reads come from memory instead of disk. When the working
set grows past available RAM, performance does not degrade gently; it falls off sharply once the
database starts going to disk for data that used to be cached, because disk reads are orders of
magnitude slower than memory reads.

:::manager
This is the answer to "it was fine for a year and now it's slow" without any code change: data
volume grew past the point where the working set fits in RAM. It is a capacity conversation
(more memory, or a smaller working set via TTL/archiving old data), not a code review finding.
:::

:::engineer
```javascript
db.serverStatus().wiredTiger.cache;   // shows cache size and current usage
```
A cache that is consistently near its configured maximum, alongside rising query latency, is the
signature of a working set that has outgrown available memory.
:::

:::callout{kind=tip title="Check existing indexes before adding one"}
```javascript
db.transactions.getIndexes();
```
A surprising number of "add an index" requests are answered by an index that already exists in a
slightly different form. Run this before proposing a new one — it takes seconds and avoids paying the
write cost of a redundant index.
:::

## Common mistakes

- **No index on a field used in every query's filter.** The most common and most fixable performance
  problem.
- **Reading COLLSCAN in `explain()` output as automatically bad**, without checking whether the query
  is meant to touch most of the collection anyway.
- **Adding an index without checking whether one already covers the query**, leaving redundant
  indexes that cost write performance for nothing.
- **Sizing hardware for data volume alone**, ignoring whether the working set (the actively-queried
  slice) fits in memory.
- **Never running `explain()` until a query is already slow in production.** Cheap to check before
  shipping, expensive to diagnose after.

:::callout{kind=bank-context}
A regulatory report that reads a full year of transaction history is, by nature, going to touch data
well outside the normal working set — that is not a bug, but it does mean scheduling it (off-peak,
with awareness it may evict other data from cache) rather than treating it as just another query.
:::

## Putting it together

::::exercise{id=ex-read-explain type=code title="Diagnose a slow query from explain() output"}
A query `db.transactions.find({ status: "pending", accountId: "acc-771" })` is running slowly. Its
`explain("executionStats")` shows:

```
stage: COLLSCAN
totalDocsExamined: 4,200,000
nReturned: 3
executionTimeMillis: 1840
```

What does this tell you, and what would you check or do next?
:::solution
`COLLSCAN` with 4.2 million documents examined to return 3 means there is no usable index for this
filter, and the query is scanning the entire collection to find three matching documents — a clear
case where an index should help enormously, since the query is highly selective (3 out of 4.2
million). Next step: check existing indexes (`db.transactions.getIndexes()`) to confirm nothing
already covers `accountId` and `status` together, then create a compound index — the order matters
and is covered in the next lesson's ESR rule, but as a first pass, `{ accountId: 1, status: 1 }` would
let MongoDB jump straight to this account's documents and filter status from a small set instead of
scanning everything. Re-run `explain()` afterward to confirm the stage changes to `IXSCAN` and
`totalDocsExamined` drops close to `nReturned`.
:::
::::
