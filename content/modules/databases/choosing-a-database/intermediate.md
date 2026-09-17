---
title: "Choosing a Database: A Repeatable Decision Framework"
estimatedMinutes: 40
objectives:
  - "Run a database selection as a quality-attribute evaluation instead of a technology popularity contest"
  - "Score consistency needs, query shape, scale shape, operational maturity, licensing, managed-service availability and exit cost explicitly"
  - "Evaluate a polyglot-persistence proposal honestly, including its integration and reporting tax"
status: ready
---

You know the categories from the Beginner lesson. This lesson is the method: how to run a selection
process that a team can actually follow, that produces a decision you can defend in front of an
architecture review board two years later, and that does not quietly become "whichever database the
loudest engineer used last."

## Where the basics break down

Two failure modes dominate real selections, and they look opposite but share a cause: nobody wrote
down the requirements before the technology conversation started.

The first is **resume-driven selection**: the team proposes a database because someone on it knows it
well, the vendor gave a compelling conference talk, or it is what "modern" architectures use. The
second is **inertia-driven selection**: every problem gets solved with whatever the team already runs,
including problems that store badly fits, because standing up something new is politically expensive.
Both produce the same downstream symptom — a database chosen to fit the team's comfort rather than the
data's shape — and both are cured the same way: force the requirements onto paper before any product
name is allowed into the room.

:::manager
If a proposal document mentions a specific database product before it states the consistency
requirement, the query shape, and the expected scale, send it back. The order matters: requirements,
then evaluation, then product. Reversing the order is how resume-driven selection hides in a document
that otherwise looks rigorous.
:::

## The quality-attribute framework

Score every candidate against the same seven attributes. Not every attribute matters equally for every
system — weight them — but every candidate gets scored on all seven, including the one the team
already wants to pick.

1. **Consistency needs.** Does correctness require every reader to see the latest write immediately
   (strong consistency — a ledger balance), or is a short delay acceptable (eventual consistency — a
   product view counter)? This single question eliminates more categories than any other.
2. **Query shape.** Point lookups by key? Ad-hoc joins nobody has written yet? Full-text relevance?
   Graph traversal? Range aggregation over time? Name the actual queries, not "flexible querying."
3. **Scale shape.** Not just size — the *shape* of load. Read-heavy or write-heavy? Steady or bursty?
   One large dataset or many small tenants? A system doing 200 writes/second steadily is a different
   problem from one doing 20,000/second for ten minutes at market open.
4. **Operational maturity.** Does your organisation already run this well, with monitoring, backup,
   patching and an on-call rotation that understands it? A technically superior database nobody can
   operate at 3 a.m. is a worse choice than a merely adequate one your team already knows.
5. **Licensing.** Open source with a permissive licence, open source with a copyleft or
   source-available licence that restricts managed hosting, or commercial with per-core cost? This
   affects both bill and legal review timeline.
6. **Managed-service availability.** Is there a mature managed offering from a cloud provider your
   organisation already has a relationship with? Self-hosting shifts real, ongoing cost onto your
   team; a managed service shifts it into a bill your team can at least see, forecast, and negotiate.
7. **Exit cost.** If this choice is wrong, what does undoing it cost in eighteen months — a
   configuration change, an application-layer swap, or a multi-quarter data migration with a parallel
   run? Estimate this *before* committing, not after the first painful renewal.

:::engineer
A usable scoring sheet is a spreadsheet, not a document: one row per attribute, one column per
candidate, 1–5 scores, a weight per row agreed with the team beforehand, and a weighted total. The
value is not the arithmetic — it is that disagreements surface as "we scored operational maturity
differently" instead of as a vague argument about which technology is better.
:::

:::callout{kind=decision title="Consistency needs vs scale shape: the tradeoff that eliminates the most options"}
Systems that need strong consistency across a wide dataset with high write throughput are the hardest
and most expensive to build (this is most of what distributed-systems research spends its time on).
If your honest answer is "strong consistency, huge scale, low latency, cheap to run," that combination
does not exist — decide which one gives first, deliberately, rather than discovering it in an incident.
:::

## Running the evaluation without resume-driven selection

A repeatable method, in order:

1. **Write the requirements first**, using the seven attributes above, before any product is named.
   Circulate this document and get sign-off separately from the technology choice.
2. **Long-list by category**, using the Beginner lesson's categories, not products. Eliminate
   categories the requirements rule out (a strong-consistency ledger rules out most document and
   key-value stores as the system of record on the spot).
3. **Short-list two or three products** within the surviving categories, weighted toward ones with
   managed-service availability and operational maturity in your organisation.
4. **Run a proof-of-concept with real queries and real (or realistically sized and shaped) data**, not
   the vendor's sample dataset. Time-box it. The proof-of-concept's job is to falsify the choice, not
   to justify it — assign someone the explicit role of trying to break it.
5. **Write the decision down** — an ADR or equivalent (see `architecture-decision-frameworks`) stating
   what was ruled out and why, not just what was chosen. The "why not" is what a future reviewer,
   including you in three years, actually needs.

:::manager
The single best defence against resume-driven selection is step 4: nobody gets to skip the
proof-of-concept because they are "confident." Confidence is exactly the failure mode. Budget a
sprint for it; it is cheap compared to the migration it can prevent.
:::

:::engineer
A proof-of-concept for a transactional workload should include, at minimum: the three or four highest-
volume queries run against realistic data volume, one concurrent-write test that mimics real
contention, and one failure-injection test (kill a node, drop the connection, restore from backup).
Vendors' happy-path demos never cover the last one, and it is usually where the real decision hides.
:::

## Polyglot persistence, honestly

"Polyglot persistence" — using the right specialised database for each part of the system rather than
one general store for everything — is defensible and often correct. A payments platform reasonably
uses a relational store for the ledger, a search index for customer-service lookups, and a columnar
store for regulatory reporting. Each choice, evaluated against the framework above, can be individually
right.

The part the pitch usually omits is the tax:

- **Integration tax.** Data now needs to move between stores — change-data-capture, dual writes, or an
  event stream. Each of those is itself a system to build, monitor, and keep from silently drifting out
  of sync. A dual-write bug that only affects the second store is a class of bug most teams do not
  discover until an audit.
- **Reporting tax.** A question that used to be one SQL join across two tables in one database becomes
  a cross-system query, or requires yet another store (typically the analytical/columnar one) fed from
  all the others. Someone has to own that pipeline, its latency, and what "as of" means when a number
  is quoted to a regulator.
- **Operational tax.** Every additional store is another thing to patch, monitor, back up, secure, and
  staff for. Three databases done well can be a better decision than one database misused — but three
  databases each done at 60% maturity because the team is spread thin is worse than one.

:::callout{kind=decision title="Polyglot persistence: worth it or not?"}
Worth it when: each store serves a genuinely different, well-understood access pattern, the
integration mechanism (CDC, events) is itself a deliberately chosen and owned system, and the team has
the operational capacity to run more than one store well. Not worth it when: the "specialised" stores
duplicate what the primary relational store already does adequately, or nobody has been assigned to
own the sync between them.
:::

:::manager
Ask, for any polyglot proposal: "who owns the pipeline that keeps these stores consistent, and what
happens when it breaks at 2 a.m.?" If the honest answer is "nobody yet," the proposal is not ready,
regardless of how sound each individual store choice is.
:::

## Licensing and managed services in practice

Licence terms have moved in the last several years: a number of popular open-source database projects
have changed licences specifically to restrict cloud providers from offering a competing managed
version without a commercial agreement. This affects you two ways: it can affect which managed
offerings exist for a given product, and it can affect what your own organisation is permitted to do
if you ever considered offering the database as a service internally to other teams. Check the current
licence and the specific managed-service terms for any candidate as a standing step, not a one-time
assumption — do not rely on what was true when you last checked.

:::manager
Get the licence question in front of your legal or vendor-risk team early, in parallel with the
technical proof-of-concept, not after a preferred choice has already been informally agreed. It is a
much easier conversation before anyone is attached to the outcome.
:::

## What good looks like

A design review that handles a database choice well shows:

- The requirements (the seven attributes) are written down and were agreed before a product was named.
- At least one category or product was seriously considered and explicitly rejected, with a stated
  reason — not just the one that was chosen.
- A proof-of-concept ran against real query shapes and real-ish volume, including a failure scenario.
- Exit cost was estimated, in writing, before commitment.
- For a polyglot proposal, there is a named owner for the integration pipeline and a stated answer for
  what "as of" means in any cross-store report.
- Licensing and managed-service status were checked against current terms, not remembered from a
  previous project.

## Exercises

::::exercise{id=ex-polyglot-pitch type=scenario title="The team proposes three databases for one product"}
A new savings product's team proposes: Postgres for the ledger, MongoDB for the customer-facing
mobile app's flexible profile data, and Elasticsearch for the call-centre agent's customer search. The
pitch is well-argued and each individual choice looks reasonable against the Beginner lesson's
categories. What three questions do you ask before approving it, and what would make you send it back?
:::solution
Ask: (1) Who owns the pipeline moving data from Postgres into MongoDB and Elasticsearch, and what is
the plan when it fails or falls behind? (2) What does the regulatory reporting query look like across
these three stores, and who is building and owning that? (3) Does the team's current operational
capacity (headcount, on-call maturity, monitoring) support three stores well, or would two, with one
store absorbing the search requirement via a relational full-text index, be a better match for the
team that exists today rather than the team on paper?

Send it back if: no owner is named for the integration pipeline, the reporting query has not been
prototyped, or the "flexible profile data" in MongoDB is actually data finance or risk will need to
join with the ledger (in which case that data belongs in Postgres, and the document store's role
should shrink to what is genuinely presentation-shaped).
:::
::::

::::exercise{id=ex-scorecard type=design title="Build a scorecard"}
Your team wants a database for a new fraud-alerts system: alerts arrive from six upstream systems in
different shapes, investigators need free-text search across alert narratives, and every alert and its
disposition must be retained and queryable for seven years for audit. Using the seven attributes, sketch
a scorecard (attribute, weight, and which one or two categories from the Beginner lesson you would
short-list) and state which attribute you weighted highest and why.
:::solution
Query shape (free-text search, high weight) and licensing/retention-audit-ability (high weight, because
of the seven-year requirement) dominate here. Consistency needs are moderate — alert status changes
should not be lost, but sub-second cross-alert consistency is not the driver. Short-list: a search
engine (Elasticsearch/OpenSearch) for the narrative search, backed by a relational store as the
system of record for the alert and disposition data that must be reconciled and retained — a small,
deliberate, two-store polyglot design with the search index rebuildable from the relational data rather
than being the source of truth. The key judgement call: search is for finding, the relational store is
for the record — do not let the search index become the only place an alert's disposition lives.
:::
::::
