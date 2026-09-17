---
title: "Choosing a Database"
estimatedMinutes: 35
objectives:
  - "Name the main database categories and state what each is genuinely good at"
  - "Explain what each category costs to run in practice, not just to build with"
  - "Recognise resume-driven database selection before it costs a migration"
status: ready
---

A database choice is one of the few technology decisions your organisation will still be living with
in ten years. Frameworks get rewritten; a production dataset with a decade of transaction history
does not move without a project of its own. This lesson gives you the vocabulary for the main
categories of database, what each one is genuinely for, and what each one costs once it is running in
production and not just in a demo.

## Why this exists

A team building a new lending platform picks MongoDB because two engineers used it at their last job
and "it's fast to get started." Eighteen months later, finance wants a monthly regulatory return that
joins loan, customer, collateral and repayment data across nine collections, the query takes four
minutes and times out the reporting tool, and nobody on the team knows how to write the aggregation
pipeline that would fix it. The technology was never wrong in isolation. It was wrong for that data
shape and that query pattern, and nobody made the choice on those terms.

:::manager
The question to ask before any database is selected is not "can this store the data?" — almost
anything can. It is "what will we need to *ask* the data in two years, and does this store make that
easy or does it fight us?" Reporting and audit requirements are usually clear from day one at a bank;
they are the requirement most often left out of the pitch for a new data store.
:::

:::engineer
There is no universal benchmark that settles this. Every vendor's numbers are true for their chosen
workload and access pattern and largely meaningless for yours. The only reliable evaluation is running
your actual query shapes against your actual data volume, which is why the framework in the
Intermediate lesson insists on a proof-of-concept with real queries before a decision is final.
:::

## Relational databases

Rows in tables, a fixed schema, foreign keys, and SQL. The engine enforces relationships and
constraints for you: a payment cannot reference an account that does not exist, a balance column can
be declared `NOT NULL`. Multi-table transactions are atomic by default (see the Postgres Essentials
topic for what that guarantee actually means). This is still the right default for anything with
strong consistency needs and a query pattern nobody has fully enumerated yet, because SQL lets anyone
ask a new question of the data without a schema migration.

The cost: the schema has to be designed reasonably well up front, and it resists a certain kind of
change (adding a wholly new shape of record touches more than one place). At large write scale,
horizontal scaling takes real engineering (sharding, read replicas) rather than being automatic.

:::manager
Relational is the safe default for core financial data: ledgers, positions, anything that reconciles.
If a team wants to move core ledger data off a relational store, the burden of proof is on them, not
on the status quo.
:::

:::engineer
```sql
SELECT c.name, SUM(t.amount) AS total
FROM customers c
JOIN transactions t ON t.customer_id = c.id
WHERE t.booked_at >= '2026-01-01'
GROUP BY c.name;
```
One query, no application-side joining, and the database guarantees `t.customer_id` refers to a real
customer because of the foreign key.
:::

## Document databases

Records are self-contained JSON-like documents rather than rows spread across normalised tables. A
customer profile with a variable set of addresses, contact methods and preferences is one document
rather than four joined tables. This fits data whose shape genuinely varies between records, and
whose reads want the whole thing at once.

The cost: cross-document consistency and ad-hoc cross-document reporting are the weak points.
Multi-document transactions exist in modern engines but are heavier than a single-table update.
Schema is enforced by convention or optional validation rules, not by the engine, so drift between
what code A writes and what code B expects is a real and common failure mode.

:::manager
Document stores earn their keep on read-heavy, single-entity access patterns: a customer profile
screen, a product catalog. They are a poor fit for anything finance will need to join and total across
many records — that is exactly the MongoDB-for-a-ledger mistake above.
:::

:::engineer
```json
{ "_id": "cust-1044", "name": "A. Okafor",
  "addresses": [{"type": "home", "city": "Leeds"}],
  "kyc": {"status": "verified", "checkedAt": "2026-02-01"} }
```
One read returns everything about the customer. There is no `JOIN`; related facts that must be
queried across many customers (see the `document-modeling` and `aggregation-pipelines` topics) need
either denormalised copies or an aggregation pipeline.
:::

## Key-value stores

The simplest model: a key, an opaque value, fast get/put, usually in memory or memory-first. No
query language beyond "give me the value for this key." This buys extremely low, predictable latency
and simple horizontal scaling.

The cost: you give up querying by anything other than the key. Every access pattern you need must be
planned into a key design up front (or a secondary index bolted on, which erodes the simplicity).
Durability varies by product — some are caches that can lose data on restart unless explicitly
configured otherwise.

:::manager
Key-value stores are usually a supporting cast member, not the system of record: a session store, a
cache in front of a slower database, a rate-limiter's counters. Treat a proposal to make one the
primary store for anything with reporting requirements as a red flag worth a direct question.
:::

:::engineer
```
SET session:9f21ab "{"userId":1044,"expiresAt":1780000000}" EX 1800
GET session:9f21ab
```
Redis-style: one key, one value, an expiry. There is nothing here resembling "find all sessions for
user 1044" without a second index you build and maintain yourself.
:::

## Wide-column stores

Rows are grouped by a partition key, and each row can have a different, large set of columns (Cassandra,
HBase, Bigtable-style). Built for very high write throughput and linear horizontal scale across many
commodity nodes, with tunable consistency rather than one fixed guarantee.

The cost: the schema is designed around the queries you already know you will run, not around the
entities. Adding a genuinely new query pattern later often means a new table and a data migration.
Operating a large cluster of these well is a specialist skill, and ad-hoc queries or joins are not
what the engine is for.

:::manager
This category earns its cost only at a scale most banking workloads never reach: very high sustained
write volume across many regions (telemetry, IoT, large-scale event capture). If nobody in the
proposal can state the target writes-per-second and why a relational store with partitioning cannot
hit it, the choice needs more scrutiny, not less.
:::

:::engineer
```sql
CREATE TABLE events_by_device (
  device_id text, ts timestamp, payload text,
  PRIMARY KEY (device_id, ts)
) WITH CLUSTERING ORDER BY (ts DESC);
```
The partition key (`device_id`) is chosen to match the known query ("recent events for this device"),
not to model the entity. A different query needs a different table.
:::

## Search engines

Built around inverted indexes: full-text relevance ranking, fuzzy matching, faceted filtering across
large text and semi-structured data (Elasticsearch/OpenSearch and similar). This is the category to
reach for when the requirement is genuinely "search," not "look up by known key."

The cost: it is usually not your system of record — data is indexed *into* it from somewhere else,
which means a second data store, a sync pipeline, and the operational question of what happens when
they drift out of step. Consistency is eventual, and running a cluster well (shard sizing, index
lifecycle, memory) is a real, ongoing operational job.

:::manager
Ask "is this a lookup or a search?" before a search engine enters a design. Looking up a customer by
account number is an index in the relational database. Free-text search across call-centre notes for
fraud investigation is a genuine search problem.
:::

:::engineer
```json
GET /transactions/_search
{ "query": { "match": { "narrative": "urgent wire overseas" } } }
```
Relevance-ranked full-text matching across a field, something a relational `LIKE` query cannot do at
useful speed or quality once the dataset is large.
:::

## Graph databases

Data modelled explicitly as nodes and relationships, with queries that traverse relationships (Neo4j
and similar). This is the right shape when the *question* is about connections several hops deep:
"which accounts are within three transfers of this flagged account," fraud rings, entitlement chains.

The cost: it is a niche skill relative to SQL, so hiring and knowledge transfer are harder. For
questions that are not fundamentally about traversal depth, a graph database adds complexity without
adding value — a relational join two levels deep does not need a graph engine.

:::manager
The tell that a graph database is the right call: the team keeps writing recursive queries or
building traversal logic in application code against a relational store, and that code keeps growing.
That is a graph problem trying to happen in the wrong tool.
:::

:::engineer
```cypher
MATCH (a:Account)-[:TRANSFER*1..3]->(b:Account {flagged: true})
RETURN DISTINCT a;
```
"Every account within three transfer-hops of a flagged account" — expressible in one line here,
painful as a recursive CTE and worse as application code.
:::

## Time-series databases

Optimised for data that is timestamped, append-mostly, and queried by time range and aggregation
(Prometheus, InfluxDB, TimescaleDB). Storage and query engines exploit the fact that new data mostly
arrives at "now" and old data is usually summarised, not read row-by-row, which enables aggressive
compression and fast range/aggregate queries.

The cost: outside its lane — arbitrary joins, updating historical rows, relational-style modelling —
it is either awkward or unsupported. Retention policy (downsampling, expiry) has to be designed
deliberately or storage grows without bound.

:::manager
Metrics, market tick data, and IoT telemetry are the classic fit. A general transaction ledger is
time-stamped too, but its access pattern (point lookups, joins, exact historical amounts that must
never be downsampled) is not a time-series access pattern. Timestamped is not the same as time-series.
:::

:::engineer
```sql
SELECT time_bucket('1 hour', ts) AS bucket, avg(latency_ms)
FROM request_metrics
WHERE ts > now() - interval '1 day'
GROUP BY bucket ORDER BY bucket;
```
A one-hour rollup over a day of data, fast because the engine is built to answer exactly this shape
of question at high ingest volume.
:::

## Analytical / columnar databases

Data stored column-by-column rather than row-by-row (Snowflake, BigQuery, ClickHouse, Redshift). A
query that scans one column across a billion rows to compute a sum only reads that column, not every
field of every row, which makes wide aggregate queries over huge datasets fast. This is the reporting
and analytics tier, not the transactional one.

The cost: row-by-row inserts and updates are comparatively slow or awkward — these engines are built
for bulk loads and large scans, not for "update this one customer's balance." Running one well
(and, for the self-hosted options, sizing and tuning it) is a specialist skill, and the managed
versions bill by data scanned or compute-time in ways that need active cost management.

:::manager
This is where regulatory and management reporting belongs once the relational OLTP store cannot
absorb heavy analytical queries without slowing down the transactional workload it exists to serve.
Separating "the system that takes the payment" from "the system that reports on all payments this
quarter" is a standard, sound pattern — not a sign the first system failed.
:::

:::engineer
```sql
SELECT product, date_trunc('month', booked_at) AS month, SUM(amount)
FROM fact_transactions
GROUP BY product, month;
```
The same SQL shape as the relational example earlier — the difference is entirely in how the engine
stores and scans data underneath, which is why this category is easy to reach for without noticing
you have added a second system to operate.
:::

## Common mistakes

- **Resume-driven selection.** Picking a database because it is exciting to have used, not because
  the requirements point at it. The tell: the pitch leads with the technology, not the access pattern.
- **Ignoring the reporting requirement.** Finance and regulators will ask questions of the data that
  the original feature team never anticipated. Ask what those questions are before, not after.
- **Confusing "can store it" with "is good at it."** Almost every category above can technically hold
  almost any data. The question is what happens to query speed, consistency and operability at your
  real volume.
- **Treating the choice as permanent because it is hard to reverse.** It genuinely is hard to reverse
  — which is an argument for a proof-of-concept before committing, not for skipping the analysis.
- **One database for everything, or a different database for everything.** Both extremes are
  covered honestly in the Intermediate lesson; neither is free.

:::callout{kind=bank-context}
Retention, audit trail, and data residency requirements narrow this decision before performance ever
enters it. A store that cannot produce an immutable, queryable record of "what changed, when, and who
changed it" for the required retention period is disqualified regardless of how well it performs.
:::

## Putting it together

::::exercise{id=ex-pick-a-category type=scenario title="Pick the category, not the product"}
Three proposals land on your desk in the same week:

1. A fraud team wants to find rings of accounts connected by transfers within four hops.
2. A trading desk wants sub-millisecond lookups of the latest price for a instrument by its ticker,
   feeding a risk calculation, with no need to query by anything except the ticker.
3. A regulatory reporting team wants to run heavy monthly aggregate queries across two years of
   transaction history without slowing down the systems that process payments today.

For each, name the database category (not a specific vendor) that fits, and the one question you
would ask the proposing team to confirm it is the right call and not a resume-driven pick.
:::solution
1. **Graph.** The question is fundamentally about traversal depth across relationships. Ask: "how many
   hops deep does the real fraud pattern go, and have you tried this as a recursive query in the
   existing relational store first?" — if two hops covers it, a graph database may be unnecessary.
2. **Key-value.** Single-key lookup, latency-critical, no secondary query need. Ask: "what happens
   when someone inevitably needs to query by something other than the ticker?" — if that is likely
   soon, the design needs a plan for it now, not a retrofit later.
3. **Analytical/columnar**, fed from the transactional store rather than querying it directly. Ask:
   "how will data get from the ledger into this system, how stale can it be, and who reconciles the
   two?" — the sync pipeline is the real engineering cost, not the columnar engine itself.
:::
::::
