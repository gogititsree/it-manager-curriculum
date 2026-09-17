---
title: "Document Modeling — refresher"
estimatedMinutes: 15
objectives:
  - "Re-anchor embed-vs-reference and the naming of the standard schema patterns in ten minutes"
  - "Know what changed since MongoDB was schemaless-and-single-document-only"
  - "Spot the modeling mistakes that still get past experienced reviewers"
status: ready
---

You have designed MongoDB schemas before. The core call — embed or reference — has not changed.
Three things around it have: transactions make multi-document consistency a real option, validation
makes an implicit schema an enforced one, and time series collections handle a shape you used to hand-
roll yourself. This refresher is dense on purpose.

## What you probably remember

| Concept | One-line anchor |
| --- | --- |
| Document vs row | Self-contained BSON object; nesting replaces joins for bounded, co-read data. |
| Embed | Nest related data in the parent. Fast reads, grows with the parent, bounded data only. |
| Reference | Store an id, keep data in its own collection. Unbounded or independently-queried data. |
| Bucket pattern | Group time-boxed events into one document instead of one document per event. |
| Outlier pattern | Flag and special-case the rare oversized document instead of redesigning for it. |
| Subset pattern | Embed only the slice most reads need; keep the full set referenced. |
| Computed pattern | Store a precomputed value (balance, count) instead of recalculating on every read. |
| 16 MB document limit | The hard ceiling that unbounded embedding eventually hits. |

## What changed since

:::callout{kind=changed-since title="Multi-document ACID transactions (4.0, 2018; distributed/sharded, 4.2, 2019)"}
Before this, MongoDB gave you atomicity on a single document only, which is why so much modeling
advice was "embed it, so the one thing you need atomically is the one document you write." That
constraint is now relaxed: you can wrap a multi-document, multi-collection write in a session
transaction. This does not mean stop embedding — embedding is still better for read performance and
locality — but the *reason* you had to embed to get atomicity is gone. Reference more freely when the
access pattern calls for it, and reach for a transaction when a write genuinely spans documents (for
example, debit one account document and credit another in the same operation). Transactions carry a
real performance cost versus a single-document write; do not use them as a substitute for good
schema design.
:::

:::callout{kind=changed-since title="$jsonSchema validation (introduced 3.6, 2017; steadily extended since)"}
Collection-level schema validation, enforced server-side, is mature now — required fields, types,
enums, patterns. If your mental model is "MongoDB has no schema enforcement, full stop", that is out
of date. It is still opt-in and off by default, unlike a relational `NOT NULL` constraint, so "is
validation turned on for this collection" is now a legitimate, answerable review question rather than
a rhetorical one.
:::

:::callout{kind=changed-since title="Time series collections (5.0, 2021)"}
A dedicated collection type for time-stamped measurements (metadata + timestamp + measurement),
storage-optimised and with automatic bucketing under the hood. Before this, you hand-rolled the
bucket pattern yourself for anything time-series-shaped (rate feeds, balance snapshots, tick data).
For genuinely time-series data, prefer the built-in type over a hand-rolled bucket schema now; use
the manual bucket pattern for cases that do not fit the time-series shape (e.g. bucketed but not
purely measurement data, like a day's transaction list with mixed fields).
:::

:::engineer
```javascript
// Time series collection: MongoDB buckets writes internally
db.createCollection("fxRates", {
  timeseries: { timeField: "ts", metaField: "pair", granularity: "seconds" }
});
db.fxRates.insertOne({ ts: new Date(), pair: "GBPUSD", rate: 1.2731 });
```
:::

## Gotchas that still bite

- **Reaching for a transaction to paper over a bad schema.** If every write needs a multi-document
  transaction, the modeling is probably wrong, not the tooling. Transactions are for genuine
  cross-document invariants, not a default.
- **Embedding an unbounded array because "it used to be fine".** Data volumes grow; a shape that was
  safely bounded at initial design can become an outlier candidate years later. Revisit growth
  assumptions on schemas older than a couple of years.
- **Assuming validation exists because the application enforces it.** Validation moved server-side;
  application-level checks are still routinely the only enforcement in older collections. Check, do
  not assume.
- **Migrating history in place.** "Migrate on touch" is right for operational documents and wrong for
  anything that must reconstruct a past state for audit — see the bank-context note in the
  intermediate lesson.

## Ten-minute drill

::::exercise{id=ex-modernise-ledger type=code title="Modernise a hand-rolled bucket schema"}
An older schema hand-rolls daily buckets for FX rate ticks:

```json
{ "pair": "GBPUSD", "date": "2024-11-02", "ticks": [{ "ts": "...", "rate": 1.2731 }, ...] }
```

Say what you would change given what is now available, and what you would check before switching.

:::solution
Move to a native time series collection (`timeField: "ts", metaField: "pair"`) instead of the
hand-rolled daily bucket — it gets you the same locality benefit with less code and better storage
efficiency, and MongoDB manages bucket boundaries instead of your application logic. Before switching:
confirm the write pattern is genuinely time-series (append-mostly, rarely updated after insert);
check that any code reading the old `ticks` array shape is migrated, since the query shape changes
from array-scan to a normal time-range query; and check retention requirements, since time series
collections support automatic expiry that a hand-rolled bucket schema had to implement manually — a
useful feature, but confirm it matches the regulatory retention period rather than a convenient
default.
:::
::::
