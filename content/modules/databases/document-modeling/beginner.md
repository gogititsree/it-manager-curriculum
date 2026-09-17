---
title: "MongoDB Document Modeling"
estimatedMinutes: 35
objectives:
  - "Explain the difference between a document and a relational row, and why it changes how you design"
  - "Decide, for a given relationship, whether to embed or reference — and say why"
  - "Read a document schema and identify what queries it was designed for"
status: ready
---

A relational schema starts from the data: normalise it, draw the foreign keys, let the queries
follow. A MongoDB schema starts from the *access pattern*: what will the application read and write,
how often, and together. Get this backwards — model MongoDB like a normalised relational schema — and
you get the worst of both worlds: no joins to reassemble the data, and no locality to make reads
fast. This lesson builds the vocabulary to get it right the first time, because in a bank, "we'll fix
the schema later" usually means a migration project with its own budget line.

## Why this exists

Picture a customer profile: a name, an address, and a list of linked bank accounts. In a relational
database that is three or four tables joined at read time. In MongoDB it can be one document:

```json
{
  "_id": "cust-10293",
  "name": "A. N. Other",
  "address": { "line1": "12 High St", "city": "Leeds", "postcode": "LS1 4AB" },
  "accounts": [
    { "accountId": "acc-771", "type": "current", "openedOn": "2019-03-11" },
    { "accountId": "acc-902", "type": "savings", "openedOn": "2021-07-02" }
  ]
}
```

Fetching a customer's profile page is one read, not a join across three tables. The tradeoff: the
document now has a shape, and that shape encodes a bet about how the data will be read and written.
Change the access pattern later and you may need to change the shape.

:::manager
The one-sentence version for a steering committee: **relational databases separate storage shape
from access pattern; MongoDB couples them.** That is not a flaw, it is the design. It means schema
design is a performance and cost decision made early, not something you can defer to "whoever writes
the query" the way you sometimes can with SQL.
:::

## Documents vs rows

A **document** is a self-contained JSON-like object (BSON on disk — binary JSON, with extra types
like dates and decimals). A **collection** is a set of documents, roughly analogous to a table, but
with no enforced schema by default: two documents in the same collection can have different fields.
Documents can nest — objects inside objects, arrays of objects — which is the feature that makes
embedding possible.

:::engineer
```
Relational                          MongoDB
----------------------------------  ----------------------------------
table                                collection
row                                  document
column                               field
JOIN at query time                   embed at write time, or $lookup
primary key                          _id (default: ObjectId)
schema enforced by the engine        schema optional; enforce with
                                      $jsonSchema validation if you want it
```
:::

The lack of an enforced schema is a tool, not a licence. "Schemaless" databases still have a schema —
it is just enforced by your application code (or not enforced at all, which is how you end up with
three different shapes of `address` in production). Treat the document shape as a contract you are
choosing to write down, even before you turn on validation.

:::manager
Ask a team "where is the schema?" If the honest answer is "in the Mongoose models" or "nowhere, we
just trust the API layer", that is a real risk to flag — not because MongoDB is unsafe, but because
nobody has made the implicit contract explicit. Section 3 of this lesson covers making it explicit.
:::

## Embedding vs referencing: the central decision

This is the one decision that shapes everything else about a MongoDB schema. For every relationship
between two kinds of data, you choose one of two shapes.

**Embed** — nest the related data inside the parent document, as the `accounts` array did above.
- Read the parent and get everything in one query. No joins, no round trips.
- The embedded data moves and is deleted with the parent.
- Bad fit when the embedded list is unbounded (a customer's ten years of transactions would make the
  customer document grow without limit) or when the embedded data is also read independently at
  scale (you rarely fetch "all addresses" across all customers, but you very often fetch "all
  transactions for account X" without needing the customer).

**Reference** — store an identifier and keep the related data in its own collection, and look it up
separately (or with `$lookup`, covered in the aggregation-pipelines topic).
- Unbounded or independently-queried data stays in its own collection.
- Costs an extra query (or an aggregation stage) to reassemble the full picture.
- The referenced document can be updated without touching the parent.

:::engineer
```json
// Embedded: bounded, always read together with the parent
{
  "_id": "acc-771",
  "type": "current",
  "currentAddress": { "line1": "12 High St", "city": "Leeds" }
}

// Referenced: unbounded, usually queried on its own
{ "_id": "txn-88213", "accountId": "acc-771", "amount": -42.50, "postedAt": "2024-11-02T09:14:00Z" }
```
A transaction ledger is the textbook case for referencing: an active current account can accumulate
tens of thousands of transactions, and the far more common query is "the last 50 transactions for
this account", not "this account and every transaction it has ever had, in one document".
:::

:::callout{kind=decision title="Embed or reference? Ask these in order"}
1. Is the child data unbounded or fast-growing (a list that has no natural cap)? If yes → reference.
2. Is the child data read or written independently of the parent, at meaningful volume? If yes →
   reference.
3. Do you always read the child together with the parent, and is the list bounded (a handful to a
   few hundred items)? If yes → embed.
4. Otherwise, embed for read performance, reference for write independence and flexibility. There is
   no universally correct answer — only the one that matches your actual access pattern.
:::

:::manager
This is the review question worth remembering: **"How does this get queried, and how big does this
grow?"** A schema proposal that cannot answer both has not actually been designed yet, it has been
guessed. A document that embeds an unbounded array is the single most common MongoDB modeling mistake
you will see in a review, and it usually surfaces months later as a performance incident, not at
design time.
:::

## Modelling for the queries you will actually run

The discipline that makes all of this work: **write down the top five to ten queries the application
needs before you write the schema**, not after. "Get a customer and their accounts", "get the last 50
transactions for an account", "get all accounts opened in a date range for a branch report". Each
query has an implied shape. A schema that serves the real query list will look almost nothing like a
normalised relational schema of the same domain, and that is by design.

:::engineer
```javascript
// Query: "get the last 50 transactions for an account" — this is what the referenced,
// separately-collected transaction shape above exists to serve.
db.transactions
  .find({ accountId: "acc-771" })
  .sort({ postedAt: -1 })
  .limit(50);
```
:::

:::callout{kind=bank-context}
For core banking data, the query list should include the regulatory ones, not just the product
ones: "produce every transaction for account X between two dates for a subject access request",
"reconstruct the balance history for an audit". If those queries are not in the list at design time,
the schema will fight you when compliance asks for them.
:::

## Common mistakes

- **Embedding an unbounded array.** A customer document with every transaction embedded will hit the
  16 MB document size limit eventually, and will be slow to load long before that.
- **Modeling like a relational schema out of habit.** Splitting every relationship into its own
  collection and joining everything with `$lookup` throws away the main benefit of a document
  database and adds query complexity for no return.
- **No schema at all.** "Flexible" becomes "undocumented and inconsistent" within a few sprints
  without validation or a clear contract (see the intermediate lesson on schema validation).
- **Designing from the entity diagram instead of the query list.** The entities are the same in both
  databases; the shape that serves them is not.
- **Ignoring document growth.** An array that grows on every update (e.g. appending audit events to
  the parent) causes expensive document rewrites as it outgrows its allocated space.

## Putting it together

::::exercise{id=ex-model-account type=design title="Model a current account and its statements"}
A current account has: an account number, a customer id, a status (`active`, `dormant`, `closed`),
and monthly statements. Each statement has a period, an opening and closing balance, and a list of
transaction summaries for that month (typically 20-80 lines). The application's main queries are:
"show the account summary", "show a specific month's statement", and "list all transactions for a
statement". Sketch the document shape(s). What do you embed, what do you reference, and why?

:::solution
- `accounts` collection: one document per account with `accountNumber`, `customerId`, `status`. Small
  and stable — this is what "show the account summary" reads.
- `statements` collection, referencing the account: `{ accountId, period, openingBalance,
  closingBalance }`. One statement per account per month is bounded and predictable, but a five-year
  history is still tens of statements — fine to keep as its own collection referenced by
  `accountId`, rather than embedded in the account, because the account is read far more often than
  any single statement.
- Transaction summary lines: embed inside the statement document. They are bounded (20-80 per
  month), always read together with their statement ("list all transactions for a statement" is
  exactly "read this one statement document"), and never queried independently of their statement in
  the stated access pattern.
- If a later requirement appears — "find every transaction over £10,000 across all accounts" — that
  is a new, independent query against the transaction lines, and would argue for pulling transaction
  lines into their own collection referenced by `statementId`. The schema should change when the
  query list changes, not stay fixed on principle.
:::
::::
