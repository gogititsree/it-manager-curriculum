---
title: "When NOT to Use MongoDB"
estimatedMinutes: 35
objectives:
  - "List MongoDB's genuine limits: joins, transactions, ad-hoc reporting and audit trails"
  - "Explain why each limit exists, not just that it exists"
  - "Recognise the warning signs that a project chose MongoDB for the wrong reason"
status: ready
---

Every database is a set of tradeoffs, and MongoDB's are real, not marketing footnotes. This is the
most important lesson in the module, because the cost of getting this decision wrong is not a slow
query you fix next sprint — it is a data platform the bank is committed to for years. The goal here
is not to talk you out of MongoDB. It is to give you the honest list of what it is genuinely bad at,
so the choice to use it — or not — is made with eyes open.

## Joins

MongoDB has `$lookup`, covered in the aggregation-pipelines topic, and it works. It is not a
relational join: it is an explicit, per-query operation you write, it is not automatically indexed
the way a foreign-key relationship's index often is, and it does not enforce referential integrity —
nothing stops a `transactions` document from referencing an `accountId` that no longer exists.
Relational databases were built around joins as a first-class, engine-optimised operation; MongoDB
added them later, as one stage among many, for a database whose whole design philosophy is "avoid
needing them by shaping the data differently."

:::manager
If a team's design leans on `$lookup` across several collections in most of its hot-path queries,
that is worth a direct question: was the schema modelled to fit access patterns (the point of the
document-modeling topic), or is this a relational schema that happens to be stored in MongoDB? The
latter gets you the worst of both: none of the query optimiser maturity of a relational engine, none
of the locality benefit of a document schema.
:::

## Transactions

Multi-document transactions exist (see the document-modeling refresher) and they work. They are not
free: a transaction in MongoDB carries a real performance cost relative to a single-document write,
noticeably more than the equivalent in a database designed around transactions from the start. A
system that needs transactions across many documents on most writes — the profile of a lot of core
banking logic, where debit-one-account-credit-another must be atomic — is fighting the grain of the
tool, not using a feature of it.

:::engineer
```javascript
const session = client.startSession();
session.startTransaction();
try {
  await accounts.updateOne({ _id: "acc-1" }, { $inc: { balance: -100 } }, { session });
  await accounts.updateOne({ _id: "acc-2" }, { $inc: { balance: 100 } }, { session });
  await session.commitTransaction();
} catch (e) {
  await session.abortTransaction();
  throw e;
}
```
This works, and this exact shape — moving money between two account documents — is precisely the
kind of operation where you should ask whether the *volume* of such operations, at bank scale,
belongs on a database whose fast path is the single-document write.
:::

## Ad-hoc reporting and BI tooling

The relational ecosystem's business-intelligence tooling — ad-hoc SQL, spreadsheet connectors, most
BI dashboard products — assumes tables and joins. Getting the same analysts asking the same
questions against MongoDB usually means either an aggregation pipeline written by an engineer for
every new question, or an ETL pipeline copying data into a relational or columnar store where the
existing BI tooling actually works. Neither is "MongoDB can't do reporting" — it can, with the
aggregation framework — but it is a genuinely different operating model from "give the analyst a SQL
client."

:::manager
If the finance or risk team routinely needs ad-hoc slicing of data that lives in MongoDB, budget for
either an ETL pipeline into a reporting store, or a standing engineering function that writes
aggregation pipelines on request. Neither is free, and "we'll figure out reporting later" on a system
of record is a cost you are deferring, not avoiding.
:::

## Regulatory audit trails and immutability

An audit trail needs to answer "what did the record say, and who changed it, at every point in
time" — reliably, and ideally in a way that is hard to quietly alter after the fact. MongoDB documents
are mutable by default: an `updateOne()` overwrites the previous value with nothing kept unless your
application explicitly wrote history somewhere. There is no built-in, engine-enforced append-only or
temporal-table mechanism equivalent to what some relational systems offer out of the box. You can
build an audit trail on MongoDB — an append-only events collection, change streams feeding an
immutable log — but it is something your application must build and maintain correctly, not a
guarantee the database gives you by default.

:::callout{kind=bank-context}
"Can you reconstruct exactly what this record said on the date of the transaction, and prove it
hasn't been altered since" is a question a regulator can and does ask. If the honest current answer is
"we'd have to check the application logs and hope," that is a finding, not a hypothetical. This
applies whichever database is underneath — but MongoDB gives you less for free here than some
alternatives, which changes the amount of deliberate engineering required to close the gap.
:::

## Common mistakes

- **Choosing MongoDB because it was the newest tool the team knew**, without checking whether the
  workload's shape (heavy joins, heavy multi-row transactions, ad-hoc reporting, strict audit)
  actually fits it.
- **Assuming "NoSQL" means "no schema discipline required."** It means schema enforcement is opt-in
  and mostly your responsibility, which is a different thing.
- **Treating $lookup and transactions as drop-in replacements for what a relational database does
  natively**, without accounting for the cost difference.
- **Building an audit trail after going live**, instead of designing the immutable record as part of
  the initial schema.
- **Not asking who owns reporting** until finance asks for a number nobody can produce without an
  engineer writing a bespoke pipeline.

## Putting it together

::::exercise{id=ex-flag-the-fit type=reflect title="Where would you flag a fit problem?"}
Think of a system you know at the bank — core ledger, payments, customer data, risk reporting,
anything. For each of the four limits above (joins, transactions, ad-hoc reporting, audit trails),
would that system's real requirements be a stretch for MongoDB, a non-issue, or somewhere in between?
There is no single correct answer here — the point is to practise applying the four questions to a
system you actually know, before the intermediate lesson gives you a fuller decision framework.
:::
::::
