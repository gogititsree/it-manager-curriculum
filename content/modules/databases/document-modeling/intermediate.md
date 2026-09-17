---
title: "Document Modeling: Patterns and Validation"
estimatedMinutes: 40
objectives:
  - "Apply the bucket, outlier, subset and computed patterns to real schema problems"
  - "Use $jsonSchema validation to make an implicit contract explicit and enforced"
  - "Design a document versioning strategy that survives a live migration"
status: ready
---

You can already answer "embed or reference" for a clean textbook case. Production schemas are rarely
clean: growth is uneven, one customer has ten times the data of the median one, and the schema has to
change under a system that cannot go down for the change. This lesson is about the patterns that
handle those cases, and about the two disciplines — validation and versioning — that keep a flexible
schema from turning into an undocumented one.

## Where the basics break down

"Embed the bounded, reasonable-sized list" works until the list is not reasonably sized for
everyone. A retail current account has tens of transactions a month; a high-volume merchant
settlement account can have thousands a day. A schema that embeds transactions per statement for the
median customer will blow past sensible document size for the outlier. Similarly, "reference
everything unbounded" works until you need one field — say, the customer's current tier — on every
row of a report, and a `$lookup` per row becomes the slowest part of the pipeline. The patterns below
are the named answers to these specific, recurring shapes of problem.

## The bucket pattern

Instead of one document per event (one transaction = one document) or one document per parent with
an unbounded embedded array, group events into time-boxed "buckets": one document per account per
day (or hour, for high-volume accounts), each holding an array of that period's events plus
precomputed aggregates.

:::engineer
```json
{
  "accountId": "acc-771",
  "date": "2024-11-02",
  "count": 47,
  "totalDebits": -1820.44,
  "totalCredits": 3000.00,
  "transactions": [
    { "ts": "09:14:00Z", "amount": -42.50, "desc": "..." },
    { "ts": "09:41:12Z", "amount": -12.00, "desc": "..." }
  ]
}
```
Reading "today's activity for this account" is one document read instead of a range scan over
thousands. Writes append to the array of the current bucket instead of inserting a new document per
event, which is cheaper at high write volume.
:::

:::callout{kind=decision title="Bucket size: fixed count or fixed time window?"}
Fixed time window (one bucket per day) is simpler to reason about and query by date range, but
uneven for bursty accounts. Fixed event count (close the bucket at, say, 200 events) keeps document
size predictable but makes "give me today's activity" a scan across a variable number of buckets.
Most banking use cases favour the time window because regulatory and statement queries are date-based
anyway.
:::

## The outlier pattern

Most schemas have a small number of documents that are wildly larger than the rest — a handful of
corporate accounts with a hundred times the transaction volume of a retail account. Rather than
design the whole schema around the outlier (over-referencing, adding lookup cost to the 99% of normal
documents), embed for the common case and add a flag plus an overflow collection for the rare one.

:::engineer
```json
// Normal document: fully embedded, no overflow
{ "_id": "acc-771", "recentTransactions": [ /* up to ~200 */ ] }

// Outlier: flag it, and cap what's embedded
{ "_id": "acc-merchant-9001", "hasOverflow": true, "recentTransactions": [ /* most recent 200 */ ] }
// older/overflow items live in a separate `transactionOverflow` collection keyed by accountId
```
:::

:::manager
The outlier pattern is a cost-control decision as much as a design one: it keeps the schema simple
and fast for the 99% of accounts instead of paying a `$lookup` tax on every read to accommodate the
1% of accounts that are exceptional. When a team proposes redesigning a whole collection because of
one class of large customer, ask whether an outlier flag would solve it more cheaply.
:::

## The subset pattern

When a document would embed a large array but the application usually only needs the first few items
(the ten most recent transactions on an account summary screen, not all of them), embed only the
subset actually needed for the common read, and keep the full set in a referenced collection.

:::engineer
```json
{
  "_id": "acc-771",
  "recentTransactions": [ /* most recent 10 only, embedded for the summary screen */ ]
}
// full history lives in the referenced `transactions` collection, queried on demand
```
This is the outlier pattern's sibling: outlier handles a minority of *documents* that are too big;
subset handles a majority of *reads* that only need a small slice of a document that could otherwise
be large for everyone.
:::

## The computed pattern

Store a precomputed value (a running balance, a monthly total, a count) alongside the raw data
instead of recalculating it on every read. Update it at write time, in the same operation, or via a
scheduled job for values that tolerate slight staleness.

:::engineer
```javascript
// Update the running balance in the same write that inserts the transaction
db.accounts.updateOne(
  { _id: "acc-771" },
  { $inc: { balance: -42.50 }, $push: { recentTransactions: { amount: -42.50, ts: new Date() } } }
);
```
:::

:::callout{kind=decision title="Computed values: keep them exactly right, or accept eventual consistency?"}
An account balance shown to a customer must be exactly right after every write — compute it in the
same operation, inside a transaction if more than one document is touched. A "top 10 accounts by
volume this month" dashboard tile can be a batch job that runs every 15 minutes. Match the
consistency mechanism to what the number is used for, not to what is easiest to build.
:::

## Schema validation

MongoDB has no schema by default, which is a feature until an application bug writes a document
missing a required field, or with `amount` as a string in one service and a number in another.
`$jsonSchema` validation, set on the collection, rejects writes that do not match — enforced by the
server, not by whichever application happens to be writing that day.

:::engineer
```javascript
db.createCollection("transactions", {
  validator: {
    $jsonSchema: {
      bsonType: "object",
      required: ["accountId", "amount", "postedAt"],
      properties: {
        accountId: { bsonType: "string" },
        amount:    { bsonType: "decimal" },
        postedAt:  { bsonType: "date" },
        status:    { enum: ["pending", "posted", "reversed"] }
      }
    }
  },
  validationLevel: "strict",   // moderate = only check documents that already matched the schema
  validationAction: "error"    // warn = log but allow; useful during a rollout
});
```
`validationAction: "warn"` lets you turn on validation against an existing collection, watch the log
for violations, and fix the writers, before switching to `"error"` and actually rejecting bad data.
:::

:::manager
Schema validation is the closest thing MongoDB has to "the database enforces the contract", which is
what a reviewer coming from a relational background will instinctively look for. Ask whether
validation exists for any collection holding regulated data, and if not, ask where the equivalent
guarantee lives instead (a shared library? nothing?). "Nothing" is a finding, not a detail.
:::

## Document versioning

Schemas change. The document shape written a year ago is still sitting in the collection next to
documents written yesterday, because MongoDB does not migrate existing documents when you change what
new writes look like. Two disciplines make this survivable:

1. **A `schemaVersion` field on every document**, incremented whenever the shape changes materially.
   Application code branches on it at read time and, ideally, migrates the document to the current
   shape on next write ("migrate on touch").
2. **Additive changes preferred over destructive ones.** Add a new field with a default assumed for
   its absence, rather than renaming or restructuring a field in place, whenever the change can be
   expressed that way.

:::engineer
```javascript
function normalizeAccount(doc) {
  if (doc.schemaVersion === undefined) {
    // v0 -> v1: address was a flat string; split it, and stamp the version
    doc.address = { line1: doc.addressLine, city: doc.city };
    delete doc.addressLine;
    delete doc.city;
    doc.schemaVersion = 1;
  }
  return doc;
}
```
:::

:::callout{kind=bank-context}
For anything in scope of an audit trail, "migrate on touch" that mutates history in place is the
wrong instinct: you want the *current* shape for operational reads, but you must not silently rewrite
what a document looked like when a transaction actually happened. Keep versioned reads for
operational data; keep an immutable, append-only record (or a proper event log) for anything that
has to reconstruct "what did we believe, when".
:::

## What good looks like

A document schema proposal a manager can actually approve should show, in writing:

- The top 5-10 queries it is designed to serve, with expected frequency and volume.
- For every one-to-many or many-to-many relationship: embed or reference, and why, referencing the
  decision criteria above.
- Expected document growth rate and a worst-case document size, with a plan (bucket/outlier/subset)
  for anything that could approach the 16 MB limit.
- Whether `$jsonSchema` validation is turned on, and at what `validationAction`.
- A `schemaVersion` field and a stated policy for handling old-shape documents.

## Putting it together

::::exercise{id=ex-review-loyalty type=scenario title="The team proposes a loyalty-points schema"}
A team proposes one document per customer, with an embedded array of every loyalty-points
transaction (earn and redeem events) going back to account opening, "so the whole history is in one
place." The product has been live three years and active customers earn points on most transactions.
What do you ask, and what would you actually approve?

:::solution
Ask first: how big does the array get for a three-year-old active customer, and what is the actual
read pattern — do screens need full history, or the current balance plus recent activity? If the
answer is "balance plus last 20" for the common case and "full history" only for a rare statement
export, this is a subset-pattern candidate: embed a capped recent list and a running balance
(computed pattern) on the customer document, and move the full ledger to its own collection
referenced by customer id. Also ask about document growth: an ever-appending array causes expensive
document moves as it grows past its allocated space, which is itself a reason to cap it. Approve the
capped-embed-plus-referenced-ledger version; push back on the unbounded embed regardless of how
convenient "everything in one place" sounds in the standup.
:::
::::

::::exercise{id=ex-design-validation type=code title="Write a validator for a payment instruction"}
A `payments` collection needs: `debtorAccount` and `creditorAccount` (strings), `amountMinor` (a
non-negative integer, minor units), `currency` (a three-letter code), and `status` restricted to
`PENDING`, `SENT`, `REJECTED`. Write the `$jsonSchema` validator. Choose and justify a
`validationAction`.

:::solution
```javascript
db.createCollection("payments", {
  validator: {
    $jsonSchema: {
      bsonType: "object",
      required: ["debtorAccount", "creditorAccount", "amountMinor", "currency", "status"],
      properties: {
        debtorAccount:   { bsonType: "string" },
        creditorAccount: { bsonType: "string" },
        amountMinor:     { bsonType: "long", minimum: 0 },
        currency:        { bsonType: "string", pattern: "^[A-Z]{3}$" },
        status:          { enum: ["PENDING", "SENT", "REJECTED"] }
      }
    }
  },
  validationAction: "error"
});
```
`error` is justified here because this is a payments collection: an invalid document is worse than a
rejected write the caller must handle. `warn` would only make sense as a temporary step while
migrating an existing, unvalidated collection to this schema.
:::
::::
