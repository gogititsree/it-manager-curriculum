---
title: "PostgreSQL Essentials"
estimatedMinutes: 35
objectives:
  - "Explain tables, keys and constraints, and why normalisation is a tool, not a religion"
  - "State what a transaction guarantees and why that matters for correctness"
  - "Read a basic index and a basic EXPLAIN output, and know when to reach for one"
status: ready
---

PostgreSQL ("Postgres") is a relational database: rows in tables, related by keys, queried with SQL,
with strong correctness guarantees built into the engine rather than bolted on by application code. It
is free, open source, and it is the default recommendation in most new architecture discussions today
for good reason — this lesson builds the vocabulary for why, starting from nothing.

## Why this exists

A spreadsheet can hold rows of data. What it cannot do is guarantee that a customer ID in one sheet
always refers to a real row in another, that two people editing at once do not silently overwrite each
other's changes, or that a half-finished update never gets seen by anyone else. A relational database
exists to make those guarantees automatic and enforced by software, not by discipline and hope.

:::manager
The cost of *not* having these guarantees does not show up on day one. It shows up eighteen months
later as a reconciliation break, a duplicate payment, or a report that does not add up, and by then it
is a production incident and an audit finding rather than a design decision.
:::

## Tables, rows and keys

A **table** holds rows of the same shape: fixed columns, each with a type. Every table should have a
**primary key** — a column or combination that uniquely identifies each row, usually an auto-generated
ID. A **foreign key** in one table points at the primary key of another and the database refuses to
let it point at nothing: you cannot insert a payment for a customer that does not exist, and by
default you cannot delete a customer who still has payments.

:::engineer
```sql
CREATE TABLE customers (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name TEXT NOT NULL
);

CREATE TABLE payments (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    customer_id BIGINT NOT NULL REFERENCES customers(id),
    amount_cents BIGINT NOT NULL CHECK (amount_cents > 0),
    booked_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```
`REFERENCES` is the foreign key. `CHECK` enforces a business rule (no zero or negative payments) at
the database layer, so it holds no matter which application or script writes to the table.
:::

:::manager
In a review, a table with no primary key or a foreign key column with no `REFERENCES` constraint is
a specific, nameable risk: the database is not enforcing a rule the business relies on, and every
future bug in every future piece of code that writes to that table can violate it silently.
:::

## Pragmatic normalisation

**Normalisation** means structuring tables so each fact is stored once: a customer's name lives in
the `customers` table, not copied into every row of `payments`. This avoids the class of bug where an
update to one copy leaves the others stale. Taken to an extreme, over-normalising splits data into so
many small tables that every query needs many joins and becomes hard to write and slow to run.

The pragmatic rule: normalise the data that must stay consistent and gets updated (a customer's
address), and accept a deliberate, documented copy of data that is effectively immutable once written
(the amount and currency on a historical payment record, even if the customer's default currency
later changes). This is a judgement call, not a formula, and it is one of the most consequential
decisions in a schema design.

:::manager
Ask, in review: "which of these columns is duplicated data, and was that a decision or an accident?"
A deliberate, documented duplication for performance or historical accuracy is fine. An accidental one
that nobody planned to keep in sync is a future data-quality incident.
:::

## Transactions and ACID, the basics

A **transaction** is a group of one or more statements that either all happen or none happen —
`BEGIN`, your statements, then `COMMIT` or `ROLLBACK`. This is what ACID means in practice:

- **Atomicity** — all-or-nothing; a crash mid-transaction leaves no partial change.
- **Consistency** — the database's declared rules (constraints, foreign keys) always hold after a
  commit.
- **Isolation** — concurrent transactions do not see each other's half-finished work (the exact
  strength of this guarantee is tunable — see the Intermediate lesson).
- **Durability** — once committed, a change survives a crash.

:::engineer
```sql
BEGIN;
UPDATE accounts SET balance_cents = balance_cents - 500 WHERE id = 1;
UPDATE accounts SET balance_cents = balance_cents + 500 WHERE id = 2;
COMMIT;
```
If the process crashes between the two `UPDATE` statements, Postgres guarantees neither happened —
there is no state where the money left one account and did not arrive in the other.
:::

:::manager
"Is this wrapped in a transaction?" is the single highest-value question to ask about any code that
changes more than one row that must stay consistent — a transfer, an order plus its inventory
decrement, a status change plus its audit record.
:::

## Indexes, briefly

Without help, Postgres finds rows by scanning the whole table. An **index** is a separate, ordered
structure the database maintains alongside a table so it can find matching rows without scanning
everything — the same idea as a book's index. The tradeoff: every index speeds up reads that use it
and slows down writes to that table slightly, because the index has to be updated too, and it takes
disk space.

:::engineer
```sql
CREATE INDEX idx_payments_customer_id ON payments(customer_id);

EXPLAIN SELECT * FROM payments WHERE customer_id = 42;
-- Index Scan using idx_payments_customer_id on payments
--   Index Cond: (customer_id = 42)
```
`EXPLAIN` shows the plan Postgres will use without running the query. "Index Scan" means it used the
index; "Seq Scan" on a large table for a selective query is usually a sign a useful index is missing.
:::

:::manager
The primary key is indexed automatically. Foreign key columns are **not** indexed automatically in
Postgres — a common surprise. If a table is frequently queried or joined by a foreign key column and
nobody added an index for it, that is worth a direct question in review.
:::

## Common mistakes

- **No primary key, or a primary key with no real meaning enforced.** Every table should have one.
- **Missing indexes on foreign keys**, discovered only when a join or a cascading delete gets slow at
  real data volume.
- **Doing multi-step updates outside a transaction**, "because it usually works." It works until a
  crash or a concurrent request lands in the gap.
- **Storing computed or duplicated data without deciding to.** Fine as a deliberate performance
  choice; a silent trap otherwise.
- **Treating `NULL` casually.** `NULL` means "unknown," not zero or empty, and behaves surprisingly in
  comparisons and aggregates until you have been bitten by it once.

:::callout{kind=bank-context}
Foreign keys and `CHECK` constraints are not just correctness features — they are evidence. When an
auditor asks "how do you know a payment can never reference a non-existent account," the honest answer
should be "the database will not allow it to exist," not "our code is supposed to check that."
:::

## Putting it together

::::exercise{id=ex-design-schema type=design title="Design a small schema"}
Design tables for a simple loan system: a customer can have several loans; each loan has a principal
amount, an interest rate, an opening date, and a status that starts `PENDING` and moves to `ACTIVE` or
`REJECTED`. Decide the primary and foreign keys, which columns need a `NOT NULL` or `CHECK`
constraint, and which columns (if any) you would deliberately duplicate rather than normalise fully.
:::solution
```sql
CREATE TABLE customers (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name TEXT NOT NULL
);

CREATE TABLE loans (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    customer_id BIGINT NOT NULL REFERENCES customers(id),
    principal_cents BIGINT NOT NULL CHECK (principal_cents > 0),
    interest_rate_bps INT NOT NULL CHECK (interest_rate_bps >= 0),
    opened_at DATE NOT NULL DEFAULT current_date,
    status TEXT NOT NULL DEFAULT 'PENDING'
        CHECK (status IN ('PENDING', 'ACTIVE', 'REJECTED'))
);
CREATE INDEX idx_loans_customer_id ON loans(customer_id);
```
The `status` `CHECK` constraint stops an invalid status from ever being stored, though it does not
enforce the *transition* rule (never backwards) — that belongs in application logic or a trigger, the
same "where does the invariant live" question from the OOP lesson. A deliberate duplication worth
considering: copying the interest rate onto each repayment record as it is calculated, so a later
change to a customer's terms never rewrites history.
:::
::::
