---
title: "PostgreSQL in Production: Isolation, JSONB, Scale and Operations"
estimatedMinutes: 50
objectives:
  - "Explain MVCC and choose an isolation level deliberately instead of accepting the default by habit"
  - "Read an EXPLAIN ANALYZE plan and design indexes that actually get used"
  - "Decide when JSONB, partitioning and connection pooling are the right tool and what each costs"
  - "Recognise vacuum and bloat as an operational responsibility, not a one-time setting"
status: ready
---

You know tables, keys, basic transactions and basic indexes. This lesson is what a team running
Postgres in production actually has to get right: what "isolation" really guarantees, how the
optimiser makes decisions, when the schema-flexible JSONB column is a gift and when it is a trap, and
the operational realities — connection limits, bloat, partitioning — that do not show up until real
load and real time have passed.

## Where the basics break down

A schema that looks correct in isolation (pun intended) fails under concurrency and scale in specific,
predictable ways: two transactions racing on the same row produce a result nobody would have chosen if
they had been run one after another; a query that was fast in testing does a sequential scan in
production because the planner's statistics or the index design did not match real data; a JSONB
column that made the MVP easy to ship becomes the column nobody can write a reliable report against;
and a database that ran fine for two years slowly grows tables full of dead rows nobody is cleaning up
fast enough. None of these are exotic failures. They are the default outcome of not deciding on
isolation, indexing, schema shape and operations deliberately.

## Isolation levels and what MVCC actually means for your team

Postgres achieves concurrency using **MVCC — Multi-Version Concurrency Control**. When a row is
updated, Postgres does not overwrite it in place; it writes a new row version and leaves the old one
in place until nothing needs it any more. Readers never block writers and writers never block readers,
because each transaction sees a consistent snapshot of the versions valid at the time its transaction
(or statement) started. This is the mechanical reason Postgres reads are cheap even under heavy write
load — and it is also the direct cause of the bloat problem later in this lesson, because those old row
versions have to be cleaned up by something.

Postgres offers four SQL standard isolation levels; in practice three matter:

- **Read Committed (the default).** Each statement sees a fresh snapshot as of when *that statement*
  started. Two statements in the same transaction can see different committed data if another
  transaction commits in between. Fine for most application code, and cheap.
- **Repeatable Read.** The whole transaction sees one snapshot, taken at its first statement. Prevents
  the previous level's "the answer changed under me mid-transaction" problem. Concurrent writes to the
  same row can still conflict, causing one transaction to fail and need a retry.
- **Serializable.** The strongest level: the observable result is guaranteed equivalent to *some*
  serial (one-at-a-time) execution of all serializable transactions, detected and enforced by the
  engine at commit time via conflict detection, not by locking everything up front.

:::manager
The question for a review is not "did the team think about isolation" — it is "does the level match the
invariant." Read Committed plus an application-level bug ("check balance, then in a second statement,
deduct") is a classic race condition that isolation alone does not fix — it needs either a single
atomic statement, an explicit row lock, or Repeatable Read/Serializable with retry logic. If nobody can
say which isolation level a critical financial flow runs at and why, that is a gap worth closing before
the next incident finds it.
:::

:::engineer
```sql
-- Read Committed default: safe for most CRUD, not safe for check-then-act without more care
BEGIN;
SELECT balance_cents FROM accounts WHERE id = 1;      -- read
-- application computes new balance
UPDATE accounts SET balance_cents = 900 WHERE id = 1; -- write, possibly stale
COMMIT;

-- Safer: do the check inside the same statement, atomically
UPDATE accounts SET balance_cents = balance_cents - 100
WHERE id = 1 AND balance_cents >= 100;
-- zero rows affected means insufficient funds; no race window exists

-- Or: explicit locking to hold the row across a multi-statement check
BEGIN;
SELECT balance_cents FROM accounts WHERE id = 1 FOR UPDATE;  -- blocks concurrent writers
UPDATE accounts SET balance_cents = balance_cents - 100 WHERE id = 1;
COMMIT;
```
`SELECT ... FOR UPDATE` and single-statement atomic updates are usually a better fix for a
check-then-act race than raising the isolation level, because they are cheaper and the failure mode
(blocking, or zero rows affected) is easier to reason about than a serialization-failure retry loop.
:::

:::callout{kind=decision title="Which isolation level, by default?"}
Stay on Read Committed and fix races with atomic statements or explicit locks where you find them —
it is the cheapest option and covers most application code correctly. Move to Repeatable Read for
report-style transactions that must not see a partial picture. Reach for Serializable only for a
genuinely multi-row invariant that cannot be expressed as a single atomic statement or lock, and only
with retry logic in place, because serialization failures under load are expected behaviour, not bugs.
:::

## Indexes and EXPLAIN, for real

`EXPLAIN` shows a plan; `EXPLAIN (ANALYZE, BUFFERS)` actually runs the query and shows real row counts,
real timings and real buffer (cache) hits versus disk reads — the single most useful diagnostic tool
in Postgres. The number that matters most is where *estimated* rows and *actual* rows diverge sharply:
that gap means the planner's statistics are stale or the query shape defeats estimation, and it is
usually the root cause of a plan that looks wrong.

A composite index's **column order matters**. An index on `(customer_id, booked_at)` serves queries
that filter on `customer_id` alone or on both columns; it does not efficiently serve a query that
filters on `booked_at` alone. Put the column used for equality filters first, range filters after, and
match the order your actual queries use.

:::engineer
```sql
EXPLAIN (ANALYZE, BUFFERS)
SELECT * FROM payments WHERE customer_id = 42 AND booked_at > now() - interval '30 days';

-- Index Scan using idx_payments_customer_booked on payments
--   Index Cond: (customer_id = 42) AND (booked_at > ...)
--   Rows Removed by Filter: 0
--   Buffers: shared hit=8
--   Planning Time: 0.14 ms   Execution Time: 0.09 ms
```
`Buffers: shared hit=8` with no `read` means every page came from cache — no disk I/O. A query that
looks fast in `EXPLAIN ANALYZE` timing but shows heavy `read` buffers under real production concurrency
is a sign the working set does not fit in memory, which is a capacity conversation, not a query-tuning
one.
:::

:::manager
Ask for `EXPLAIN (ANALYZE, BUFFERS)` output, not just "it's fast in testing," before approving a query
that will run frequently against a large table. Testing data volumes and cache-warm laptops hide
exactly the problems that show up at 2 a.m. under production load.
:::

## JSONB: the "both" option, and when it's a trap

`JSONB` stores JSON in a decomposed binary form that supports indexing and reasonably efficient
querying — it genuinely gives you document-database-style flexibility inside a relational table, and
for the right use case it is a good option, not a compromise. It fits data that is legitimately
variable-shaped and rarely needs to be joined or aggregated across many rows: feature flags, a
provider's arbitrary webhook payload, per-tenant configuration.

The trap: it is tempting to put a column into JSONB "for now" to avoid a schema migration, and the
column quietly becomes load-bearing business data that the relational model was built to protect —
untyped, unconstrained, unindexed by default, and invisible to a foreign key. If two application
versions disagree about what a JSONB key means, the database will not stop them, because it enforces
nothing about the JSON's internal shape unless you explicitly add that enforcement.

:::engineer
```sql
ALTER TABLE customers ADD COLUMN preferences JSONB NOT NULL DEFAULT '{}';

-- Index a specific key for fast lookups
CREATE INDEX idx_customers_pref_channel
    ON customers ((preferences->>'channel'));

-- Or a GIN index to support containment/existence queries across arbitrary keys
CREATE INDEX idx_customers_pref_gin ON customers USING GIN (preferences);

SELECT * FROM customers WHERE preferences @> '{"channel": "sms"}';

-- Constrain the shape you care about, even inside JSONB
ALTER TABLE customers ADD CONSTRAINT preferences_channel_valid
    CHECK (preferences->>'channel' IN ('sms', 'email', 'push') OR preferences->>'channel' IS NULL);
```
A `CHECK` constraint on a JSONB field is easy to forget and worth the reminder: you can still enforce
the parts of the shape that matter, rather than treating JSONB as an all-or-nothing escape from rules.
:::

:::callout{kind=decision title="Column, or JSONB key?"}
If it needs to be queried across many rows, joined to another table, reported on, or has a rule the
database should enforce (a foreign key, a range, an enum) — it is a column. If it is genuinely
variable-shaped, per-record, rarely queried in bulk, and owned entirely by the application that writes
it — JSONB is a legitimate choice. Revisit the decision when a "rarely queried" JSONB key becomes a
report requirement; that is the signal to promote it to a real column.
:::

:::manager
When a design review shows core business facts — a status, an amount, a currency, anything finance
will eventually need to total or reconcile — living inside a JSONB blob "for flexibility," that is the
moment to push back. Flexibility for the application is often just risk deferred to the reporting team.
:::

## Partitioning

**Partitioning** splits one logical table into physically separate pieces (partitions), most commonly
by a date range, while queries still address it as one table. It helps when a table is large enough
that maintenance operations (index rebuilds, vacuum) and range-scoped queries ("this month's
transactions") become slow across the whole table, because Postgres can skip partitions a query's
`WHERE` clause rules out (**partition pruning**), and old partitions can be dropped or archived
instantly instead of deleted row by row.

It is not free: more partitions mean more objects to manage, indexes are typically created per
partition, and a query that does not filter on the partition key gets no pruning benefit and may be
slower than an unpartitioned table for that access pattern. Partitioning is an operational decision for
a table with a genuine size or lifecycle problem, not a default.

:::engineer
```sql
CREATE TABLE transactions (
    id BIGINT GENERATED ALWAYS AS IDENTITY,
    booked_at TIMESTAMPTZ NOT NULL,
    amount_cents BIGINT NOT NULL,
    PRIMARY KEY (id, booked_at)
) PARTITION BY RANGE (booked_at);

CREATE TABLE transactions_2026_01 PARTITION OF transactions
    FOR VALUES FROM ('2026-01-01') TO ('2026-02-01');
CREATE TABLE transactions_2026_02 PARTITION OF transactions
    FOR VALUES FROM ('2026-02-01') TO ('2026-03-01');
```
A query filtering `WHERE booked_at >= '2026-02-01'` touches only the relevant partition(s). Dropping a
seven-year-old partition to satisfy a retention policy is a metadata operation, not a slow bulk delete.
:::

:::manager
Partitioning by date is also how many teams implement a retention policy cleanly: drop the partition
instead of running a slow, lock-heavy `DELETE` across a live table. If a retention requirement exists
and the table is not partitioned, ask how deletion is actually implemented today.
:::

## Connection pooling and pgbouncer

Every Postgres connection is a real operating-system process with real memory overhead — Postgres is
not designed for tens of thousands of idle open connections the way some other databases are. An
application layer that opens a new connection per request, or that scales out many application
instances each holding their own connection pool, can exhaust the database's connection limit well
before it exhausts CPU or memory, causing new connections to be refused while the database itself is
otherwise idle. This is a genuinely common production incident, not a theoretical concern.

**pgbouncer** sits between applications and Postgres and multiplexes many client connections onto a
much smaller number of real database connections. In **transaction pooling** mode (the common choice),
a real connection is only held for the duration of one transaction, then returned to the pool for
another client to use — which is what lets a few dozen real connections serve thousands of application
connections.

:::engineer
```ini
; pgbouncer.ini
[databases]
mydb = host=127.0.0.1 port=5432 dbname=mydb

[pgbouncer]
pool_mode = transaction
max_client_conn = 2000
default_pool_size = 25
```
Transaction pooling has a real cost: session-level features that persist across statements —
`PREPARE`, session-level `SET`, advisory locks held across statements — do not reliably work, because
the underlying real connection can change between transactions. Application code needs to avoid
relying on session state under transaction pooling.
:::

:::manager
"What is our Postgres `max_connections`, how many connections does each application instance open, and
do we pool?" is a question worth asking before a new service goes live, not during its first
traffic-driven outage. The failure mode — connections refused while the database looks otherwise
healthy — is confusing to diagnose under pressure if nobody has asked it in advance.
:::

## Useful extensions

Postgres ships a small core and a rich extension mechanism; a handful earn a place in almost every
production deployment:

- **`pg_stat_statements`** — tracks execution statistics per normalised query, the first place to look
  when asking "what is actually slow in production," as opposed to guessing from application logs.
- **`pgcrypto`** — cryptographic functions (hashing, encryption) usable directly in SQL.
- **`pg_trgm`** — trigram matching, enabling reasonably fast fuzzy/`LIKE '%...%'` text search without
  standing up a separate search engine for modest needs.
- **`postgis`** — geospatial types and queries, the standard choice for location data in SQL.
- **`pgvector`** — vector similarity search for embeddings, letting a single Postgres instance cover a
  workload that used to require a dedicated vector database (see the Rusty lesson and the
  `choosing-a-database` topic).

:::engineer
```sql
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;

SELECT query, calls, mean_exec_time, total_exec_time
FROM pg_stat_statements
ORDER BY total_exec_time DESC
LIMIT 10;
```
This single query is usually the fastest route to "which query should we actually tune first" —
ranked by real aggregate cost, not by which one someone happened to notice.
:::

:::manager
Enabling `pg_stat_statements` on day one, before there is a performance problem, is one of the
cheapest operational decisions a team can make. Ask whether it is on; on managed Postgres it is
usually one configuration flag away.
:::

## Vacuum and bloat: the classic operational surprise

Recall MVCC: an `UPDATE` or `DELETE` does not remove the old row version immediately; it marks it dead
and leaves it in place. **Vacuum** is the process that reclaims that space for reuse. **Autovacuum**
runs this automatically in the background, and for most tables with default settings it is enough —
but a table with very high update/delete churn, or one where autovacuum is misconfigured or falling
behind, accumulates **bloat**: dead row versions that inflate table and index size, slow down scans
that have to skip past them, and in the worst case (transaction ID wraparound, a hard internal limit)
force Postgres into an aggressive, disruptive forced vacuum to protect data integrity.

This is the operational surprise almost every team hits eventually: a table that has run fine for a
year or two, on a high-churn workload, gets slower and larger for no reason visible in the schema or
the query plans, and the cause is bloat that ordinary monitoring was not watching for.

:::engineer
```sql
SELECT relname, n_dead_tup, n_live_tup, last_autovacuum
FROM pg_stat_user_tables
ORDER BY n_dead_tup DESC
LIMIT 10;

-- Manual, blocking-free reclaim for a table you've identified as bloated
VACUUM (VERBOSE, ANALYZE) payments;

-- Full, exclusive-lock reclaim that actually shrinks the file on disk (rarely needed, plan for downtime)
VACUUM FULL payments;
```
`n_dead_tup` climbing steadily relative to `n_live_tup`, or `last_autovacuum` far in the past on a
busy table, is the early warning. `VACUUM FULL` rewrites the table and takes an exclusive lock — it is
a last resort, not a routine maintenance step.
:::

:::manager
"When did autovacuum last run on our busiest tables, and do we monitor dead-tuple counts?" is a
question almost nobody asks until bloat has already caused a slowdown. It costs nothing to monitor and
a great deal to discover the hard way, usually as an unplanned maintenance window.
:::

:::callout{kind=bank-context}
Transaction ID wraparound protection is not optional and not tunable away — Postgres will eventually
force a vacuum to protect data integrity even under heavy load if autovacuum has been starved for too
long. For a system with an uptime SLA, monitoring vacuum health is a DR-adjacent concern, not a nice-to-have.
:::

## What good looks like

A Postgres-backed service that is operationally sound shows:

- Every table has a primary key; foreign keys are used and their columns are indexed.
- Isolation level and locking strategy for any multi-step, multi-row invariant is a stated decision,
  not an accident of the default.
- `EXPLAIN (ANALYZE, BUFFERS)` is part of the review for any new query expected to run frequently
  against a large table.
- JSONB is used for genuinely variable, application-owned data — not for core business facts that
  reporting or reconciliation will need.
- Large or fast-growing tables with a clear time dimension have a partitioning and retention story.
- Connection count and pooling strategy (pgbouncer or equivalent) are sized for the number of
  application instances, not discovered during an outage.
- `pg_stat_statements` is enabled, and dead-tuple/autovacuum health is monitored, not just disk usage.

## Exercises

::::exercise{id=ex-race-condition type=scenario title="The team proposes a check-then-act balance update"}
A team's code reads an account balance, checks in the application that it covers a withdrawal, then
issues a separate `UPDATE` to deduct it, all at the default Read Committed isolation level. Under load,
occasional overdrafts occur that should have been rejected. What is happening, and what are two
different fixes, with their tradeoffs?
:::solution
Between the read and the write, another concurrent transaction can also read the same (still-current)
balance and also decide the withdrawal is covered, before either write commits — Read Committed does
not prevent this, because each statement only sees a fresh snapshot at that statement's start, not
across the whole check-then-act sequence. Fix one: a single atomic `UPDATE ... WHERE balance_cents >=
amount`, checking and updating in one statement — cheapest, no lock held, and zero rows affected
signals insufficient funds. Fix two: `SELECT ... FOR UPDATE` to lock the row for the duration of the
transaction, forcing concurrent attempts to wait — simple to reason about but holds a lock and can
serialise throughput on a hot account. Raising to Serializable is a third option but adds retry-on-
conflict complexity for a problem the first fix solves more cheaply.
:::
::::

::::exercise{id=ex-jsonb-or-column type=design title="JSONB or a column?"}
A team is adding a `metadata` JSONB column to a `transactions` table to store per-transaction extra
data from various upstream systems: some entries have a `channel`, some have a `merchant_category`,
some have arbitrary provider-specific fields. Six months in, finance asks for a monthly report broken
down by `merchant_category`. Was the original JSONB decision wrong? What would you do now?
:::solution
Not necessarily wrong at the time — genuinely variable, provider-specific data is a reasonable JSONB
use case. The signal to act is the reporting requirement: `merchant_category` has become a field that
needs to be queried and aggregated across many rows regularly, which is exactly the case JSONB serves
badly at scale. The fix is to promote it: add a real `merchant_category` column, backfill it from the
JSONB key with an `UPDATE ... SET merchant_category = metadata->>'merchant_category'`, index it, and
either stop writing it into JSONB going forward or keep both temporarily during a migration window.
Leave the genuinely arbitrary, non-reported provider fields in JSONB — the decision is per-field, not
all-or-nothing for the column.
:::
::::
