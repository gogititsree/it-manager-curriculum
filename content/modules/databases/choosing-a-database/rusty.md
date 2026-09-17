---
title: "Choosing a Database — refresher"
estimatedMinutes: 15
objectives:
  - "Re-anchor the database categories and the CAP-theorem-era vocabulary in ten minutes"
  - "Know what has actually changed in the landscape since the NoSQL wars"
  - "Spot the two or three landscape gotchas that still catch experienced architects"
status: ready
---

You picked databases before, probably during or just after the NoSQL movement, when the choice felt
like a war between relational and "everything else." That framing is dated. This refresher assumes
you remember the categories and spends its time on what moved.

## What you probably remember

| Concept | One-line anchor |
| --- | --- |
| Relational | Tables, joins, SQL, ACID transactions; the safe default for consistency-critical data. |
| NoSQL (as a single bucket) | Document, key-value, wide-column and graph, lumped together as "not relational," usually for scale or schema flexibility. |
| CAP theorem | Pick two of consistency, availability, partition tolerance — used, and overused, to justify giving up strong consistency for scale. |
| Eventual consistency | Reads may lag writes briefly; acceptable for some data, not for a balance. |
| Sharding | Manual horizontal partitioning of a relational database, usually painful, usually a last resort. |
| Search engines / graph databases | Specialist stores for full-text and traversal-heavy queries respectively. |

## What changed since

:::callout{kind=changed-since title="Managed services became the default, not the exception (roughly the 2015–2025 decade)"}
Standing up and operating a database used to be most of the cost of choosing one. Cloud-managed
offerings (RDS/Aurora, Atlas, Cosmos DB and equivalents) now exist for essentially every category in
the Beginner lesson, which shifts the real decision from "can we operate this" to "should we operate
this ourselves, and what does the managed bill look like at our scale." Self-hosting is now a
deliberate choice, not the default.
:::

:::callout{kind=changed-since title="Distributed SQL / NewSQL narrowed the CAP tradeoff"}
Databases such as Google Spanner and its open-source-influenced peers (CockroachDB, YugabyteDB) offer
horizontally scalable strong consistency using synchronised clocks and consensus protocols, a
combination the CAP-era conventional wisdom treated as essentially unavailable. They are not free —
latency and operational complexity are real — but "strong consistency at scale requires giving up
availability" is no longer the settled answer it was.
:::

:::callout{kind=changed-since title="Vector databases emerged as a genuine new category (accelerating from roughly 2023)"}
Driven by embeddings-based search and retrieval-augmented generation for LLM applications, a category
of databases optimised for nearest-neighbour search over high-dimensional vectors appeared and grew
fast (Pinecone, Weaviate, Milvus and others), and vector search capability was added as an extension
to existing engines, notably Postgres via `pgvector`. If your mental map of "the categories" predates
this, it is missing one now.
:::

:::callout{kind=changed-since title="Postgres absorbed a lot of the reasons to reach for a specialist store"}
JSONB, full-text search, `pgvector`, PostGIS, and a large extension ecosystem mean a single Postgres
instance now credibly covers document-ish, search-ish and vector workloads that a decade ago would
each have justified a separate specialised database. "Just use Postgres until you have a specific,
measured reason not to" is a far more defensible default than it used to be. See the Postgres
Essentials topic for the detail.
:::

:::callout{kind=changed-since title="Open-source licensing got contentious"}
Several widely used open-source database projects changed their licence specifically to restrict
cloud providers from reselling a hosted version without a commercial agreement — MongoDB moved to the
SSPL in 2018, Elastic changed licence in 2021 (later relicensing part of the stack back to AGPL in
2024), and Redis changed licence in 2024, which produced a community fork (Valkey). The practical
effect: "it's open source" is no longer a sufficient answer in a vendor-risk review — check the
specific licence and what it permits, for the specific product, as of now.
:::

:::manager
The net shift for someone approving these decisions: the interesting question moved from "which
category" (still answered mostly as in the Beginner lesson) to "buy managed or run it ourselves" and
"what does the licence actually permit us to do." Budget the review time accordingly.
:::

## Gotchas that still bite

- **"NoSQL" as a monolithic bucket.** Document, key-value, wide-column and graph stores solve
  different problems and should never be evaluated as one alternative to "relational." That framing
  was already imprecise a decade ago and is more so now that the categories have diverged further.
- **CAP theorem as a thought-terminating cliché.** It is a real constraint on distributed systems, not
  a licence to skip the quality-attribute analysis. Distributed SQL changed the tradeoff's shape; it
  did not delete it.
- **Assuming "managed" means "no operational thinking required."** A managed service still needs
  capacity planning, index and query tuning, backup verification, and an understanding of its specific
  failure modes and limits. It removes patching and hardware, not judgement.
- **Reaching for a vector database by default.** For most organisations' actual scale, `pgvector` in
  an existing Postgres instance is simpler to operate and audit than a new specialist store. Justify
  the separate system with a measured requirement, the same discipline as any other polyglot proposal.
- **Trusting a licence you checked years ago.** Licence terms and managed-service permissions for a
  given product can change; re-verify at renewal or before a new dependency, not from memory.

## Ten-minute drill

::::exercise{id=ex-landscape-check type=scenario title="A five-year-old architecture diagram"}
You inherit an architecture document from five years ago recommending MongoDB for "flexible schema"
customer data and a separate Elasticsearch cluster for search, with a note that "Postgres doesn't do
JSON well." What do you check before accepting that recommendation still holds, and what is your
one-paragraph response to the team?
:::solution
Check: current licence and managed-service terms for both products versus when the document was
written; whether Postgres JSONB and full-text search (and `pgvector` if any AI-adjacent search is now
in scope) would now cover the requirement in one engine; and whether the original "flexible schema"
justification still holds or was actually data that should have been modelled relationally from the
start. Response: the "Postgres doesn't do JSON well" premise is outdated — re-run the evaluation with
current Postgres capability as a serious candidate, re-check both products' current licence terms
against vendor-risk policy, and only keep the two-store design if a fresh proof-of-concept shows a
real, measured gap that one engine cannot close.
:::
::::
