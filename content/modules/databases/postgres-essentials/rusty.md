---
title: "PostgreSQL Essentials — refresher"
estimatedMinutes: 18
objectives:
  - "Re-anchor the core relational vocabulary in ten minutes"
  - "Know what changed since the 9.x era: partitioning, logical replication, JSONB, parallel query"
  - "Spot the two or three operational gotchas that still catch people who last ran Postgres years ago"
status: ready
---

You ran Postgres before, likely somewhere in the 9.x line. The relational model has not changed. A
lot of what used to require an extension, a workaround, or a separate tool is now built in, and the
managed-service landscape has changed what "running Postgres" even means day to day.

## What you probably remember

| Concept | One-line anchor |
| --- | --- |
| Tables, keys, constraints | Primary/foreign keys, `CHECK`, `NOT NULL` enforced by the engine. |
| ACID transactions | `BEGIN`/`COMMIT`/`ROLLBACK`; all-or-nothing, durable once committed. |
| MVCC | Readers never block writers; old row versions linger until vacuumed. |
| Isolation levels | Read Committed default; Repeatable Read and Serializable available, rarely used. |
| `serial` for auto-increment IDs | `id SERIAL PRIMARY KEY`, backed by a sequence. |
| Streaming replication | Async by default since 9.0/9.1; a standby for failover and read scaling. |
| Manual partitioning | Table inheritance plus `CHECK` constraints and trigger-routed inserts — fiddly, hand-rolled. |
| JSON support | `json` type landed in 9.2 (2012); `jsonb` (binary, indexable) in 9.4 (2014) — you may have caught the early version of this. |

## What changed since

:::callout{kind=changed-since title="Declarative partitioning (PostgreSQL 10, 2017)"}
`PARTITION BY RANGE/LIST/HASH` is now native syntax — `CREATE TABLE ... PARTITION BY RANGE (col)` plus
`CREATE TABLE child PARTITION OF parent FOR VALUES FROM (...) TO (...)`. The old inheritance-plus-
triggers pattern for manual partitioning is now legacy; if you see it in a codebase, it likely predates
2017 or nobody has revisited it. Partition pruning, per-partition indexes and constraint-based query
planning all work automatically now.
:::

:::callout{kind=changed-since title="Built-in logical replication (PostgreSQL 10, 2017)"}
`CREATE PUBLICATION` / `CREATE SUBSCRIPTION` replicate at the table level, row-by-row, rather than
byte-for-byte like streaming replication. This enables selective replication (only some tables), 
replication to a different major version (useful for near-zero-downtime major upgrades), and feeding
downstream systems (a reporting replica, a search index sync) without third-party tools like the older
`pglogical` extension, which pioneered the same idea before it was built in.
:::

:::callout{kind=changed-since title="JSONB got closer to a real query language"}
`jsonpath` and the `@?` / `jsonb_path_query` family arrived in PostgreSQL 12 (2019), giving JSONB a
proper path-query language instead of only key/containment operators. More recent versions added
standard SQL/JSON constructor and query functions (`JSON_TABLE`, `JSON_OBJECT` and similar,
PostgreSQL 17, 2024), moving Postgres's JSON handling toward the SQL standard rather than a
Postgres-specific dialect. The underlying advice from the Intermediate lesson is unchanged: powerful
tooling does not change when JSONB is the right column choice.
:::

:::callout{kind=changed-since title="Parallel query (introduced 9.6, 2016; matured through 10–13)"}
The planner can split a sequential scan, a join, or an aggregate across multiple worker processes and
combine the results, entirely automatically when it estimates a benefit. This was not available at all
in the 9.x era before 9.6. It will not save a query with a missing index — parallelism speeds up a
scan that has to happen, it doesn't remove the need for one that shouldn't.
:::

:::callout{kind=changed-since title="Upsert and MERGE (9.5, 2015 and PostgreSQL 15, 2022)"}
`INSERT ... ON CONFLICT DO UPDATE` ("upsert" in one statement) arrived in 9.5. A full standard SQL
`MERGE` statement, for conditionally inserting, updating or deleting across a join in one statement,
arrived in PostgreSQL 15. Hand-rolled "check then insert-or-update" application logic can usually be
replaced by one of these, atomically.
:::

:::callout{kind=changed-since title="Identity columns replaced serial as the recommended pattern (PostgreSQL 10, 2017)"}
`id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY` is the current recommendation over
`id SERIAL PRIMARY KEY`. Both use a sequence underneath; identity columns follow the SQL standard,
interact more predictably with permissions and `OVERRIDING SYSTEM VALUE` for explicit inserts, and are
what most schema tools now generate by default. Existing `serial` columns do not need urgent migration.
:::

:::callout{kind=changed-since title="Managed Postgres became the default way most teams run it"}
Automated backups, point-in-time recovery, patching, failover and read replicas are now largely a
configuration choice on RDS/Aurora, Cloud SQL/AlloyDB, Azure Database for PostgreSQL and similar,
rather than a build-it-yourself operational project. Newer entrants add serverless autoscaling and
database branching (a full copy-on-write clone of a database for a feature branch or a test run) as
standard offerings. Self-hosting is now a deliberate choice with a stated reason, the same shift
described for databases generally in the `choosing-a-database` topic.
:::

:::manager
None of this changes the fundamentals you already trust Postgres for. What it changes is the build vs
buy calculus for operating it, and it removes several reasons teams used to reach for a second,
specialised database (search, document flexibility, replication tooling) that Postgres now covers
natively or through a mature extension.
:::

## Gotchas that still bite

- **Vacuum is still your job, even on managed Postgres.** Managed services tune autovacuum defaults
  better than most self-hosted setups did, but a high-churn table can still bloat faster than
  autovacuum keeps up. Monitor dead-tuple counts; do not assume "managed" means "solved."
- **Streaming replication is asynchronous by default.** A failover can lose the last few
  not-yet-replicated transactions unless synchronous replication was explicitly configured. This was
  true in the 9.x era too and is still the most common wrong assumption about replica durability.
- **Connection limits are still real, including on serverless/autoscaling offerings.** Autoscaling
  compute does not automatically mean unlimited connections; pooling (pgbouncer or a managed
  equivalent) is still frequently necessary.
- **JSONB flexibility is still a trap for core business data**, regardless of how much better the
  query tooling around it has gotten. A richer path-query language makes JSONB more pleasant to use
  badly, not less of a risk for data that needs constraints and reporting.
- **`serial` in an old schema is not broken.** Do not spend a migration project converting it to
  identity columns without another reason to touch that table; use identity columns going forward.

## Ten-minute drill

::::exercise{id=ex-modernise-partitioning type=code title="Modernise a hand-rolled partitioning scheme"}
You inherit this 9.x-era pattern for partitioning `events` by month, built from parent/child table
inheritance and a trigger:

```sql
CREATE TABLE events (id BIGINT, occurred_at TIMESTAMPTZ, payload TEXT);
CREATE TABLE events_2026_01 (CHECK (occurred_at >= '2026-01-01' AND occurred_at < '2026-02-01'))
    INHERITS (events);
-- plus a trigger function routing INSERTs to the right child table by date
```
Rewrite it using declarative partitioning, and say what operational benefit the rewrite buys beyond
tidier syntax.
:::solution
```sql
CREATE TABLE events (
    id BIGINT GENERATED ALWAYS AS IDENTITY,
    occurred_at TIMESTAMPTZ NOT NULL,
    payload TEXT,
    PRIMARY KEY (id, occurred_at)
) PARTITION BY RANGE (occurred_at);

CREATE TABLE events_2026_01 PARTITION OF events
    FOR VALUES FROM ('2026-01-01') TO ('2026-02-01');
```
The trigger-based routing is gone entirely — Postgres routes each `INSERT` to the correct partition
automatically based on the partition key. Beyond tidier syntax: the planner does real partition
pruning (the old inheritance approach relied on constraint exclusion, which was weaker and easier to
defeat), indexes and constraints are managed per-partition through standard DDL, and dropping an old
partition for retention is an explicit, fast operation instead of a workaround.
:::
::::
