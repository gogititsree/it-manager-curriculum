---
title: "Deciding, and Migrating Away, Honestly"
estimatedMinutes: 45
objectives:
  - "Apply a concrete decision framework, with real criteria, to choose MongoDB or not for a given system"
  - "Describe schema drift and operational maturity as risks distinct from the technical limits"
  - "Know what a real migration away from MongoDB involves, and why 'just move it' understates the work"
status: ready
---

The beginner lesson listed MongoDB's genuine limits. This lesson is about making the actual call for
a specific system, and about the two risks that have nothing to do with the database engine itself —
schema drift and operational maturity — plus what happens when the call turns out to have been wrong
and something has to move.

## Where the basics break down

Knowing the four limits (joins, transactions, reporting, audit) is necessary but not sufficient. Two
systems can both have "some joins and some multi-document writes" and land on opposite sides of the
decision, because the *proportion* and the *consequence of getting it wrong* differ. A marketing
preferences service with occasional joins and no regulatory audit requirement can live happily on
MongoDB. A ledger with joins and multi-row transactions on the hot path, subject to audit, cannot,
regardless of how well it is engineered — the workload shape is fighting the tool on every write.

## Decision criteria for a bank

Score the candidate system honestly against these, and weight audit and transactional integrity
heavily for anything touching money movement or regulatory reporting — a bank cannot treat those as
equal in weight to developer convenience.

:::callout{kind=decision title="A working framework"}
1. **Transactional weight.** What fraction of writes need atomicity across more than one document,
   and what happens if that atomicity is violated? Occasional and low-consequence → fine. Routine and
   high-consequence (money movement) → strong signal against.
2. **Join density.** Is the data naturally document-shaped (a handful of relationships, mostly
   read together), or is it naturally relational (many entities, queried in many different
   combinations, exactly the shape SQL and a relational optimiser exist for)? The latter fights
   MongoDB's grain.
3. **Reporting and audit requirement.** Does finance, risk or a regulator need ad-hoc, exact,
   attestable answers from this data? If yes, budget for either a reporting store fed by ETL, or
   reconsider whether the system of record itself should be relational.
4. **Immutability and audit trail.** Is this in scope for "reconstruct exact historical state, prove
   it hasn't changed"? If yes, either MongoDB with a deliberately engineered append-only design, or a
   database that gives you more of this by default — evaluate both against the actual engineering
   cost, not against which one is fashionable.
5. **Team and operational maturity with MongoDB specifically.** Covered fully below — a team that has
   run relational databases in production for a decade and has never operated MongoDB is taking on
   more risk than the technology alone would suggest.
:::

:::manager
This framework is a scoring conversation, not a veto list. A system can score "some transactional
weight, low join density, no ad-hoc reporting need, no audit scope, experienced team" and be a
perfectly good MongoDB fit even though it has *some* transactional weight. The failure mode to watch
for in a review is not "any yes to any question rules it out" — it's a team that never asked the
questions at all.
:::

## Schema drift with no owner

Because MongoDB does not require a schema, and validation is opt-in, the actual shape of the data in
a collection is only as disciplined as whoever is writing to it. Without a named owner for the schema
— someone who reviews changes to document shape the way a DBA would review an ALTER TABLE — a
collection accumulates inconsistent field names, types that vary by which service wrote the document,
and undocumented optional fields nobody remembers the purpose of. This is not a MongoDB defect; it is
what happens to any schema-flexible system without a governance process, and MongoDB removes the
forcing function (a migration that fails loudly) that a relational schema change provides for free.

:::callout{kind=warning title="The tell"}
Ask: "who approves a new field being added to this collection, and is validation updated when they
do?" If there is no answer, or the answer is "whoever's writing the code that sprint," schema drift is
already happening, whether or not anyone has noticed it yet.
:::

## Operational maturity

Running MongoDB well in production — replica set failover, backup and point-in-time restore,
capacity planning against working-set growth, upgrade paths across major versions, understanding
`explain()` and index design under real load — is a skill set, same as running Postgres or Oracle
well is a skill set. A team with deep relational operations experience and none with MongoDB is not
starting from zero, but they are starting from a different set of instincts, and the gap shows up
first in an incident, not in a demo.

:::manager
"Do we have anyone who has operated MongoDB through a failover, a version upgrade, and a capacity
crunch, not just written application code against it?" is a fair and important question before
committing a regulated, revenue-critical system to it. The honest answer is sometimes "no, and we
should either build that experience deliberately, bring in help, or reconsider the database" — all
three are legitimate responses; pretending the gap doesn't exist is not.
:::

## Where MongoDB is a genuinely good fit

To be fair to the tool: a service with a naturally document-shaped domain (a customer profile, a
product catalogue, a content management system, an event or notification store), read-heavy with
predictable access patterns, low cross-document transactional needs, and no strict regulatory
immutability requirement is a strong fit — often materially simpler and faster to build and run than
forcing the same domain into a normalised relational schema. This module has spent most of its time
on limits because the limits are what a manager needs to actively watch for; that should not read as
"never use it."

## How a migration away actually goes

When a system was put on MongoDB and the workload turned out to need what a relational database gives
you natively, "just migrate it" understates what actually happens:

1. **Schema translation is not mechanical.** Embedded documents have to be normalised into tables;
   decisions made for document locality (bucket/outlier/subset patterns) have to be unwound, and the
   team has to relearn the data's actual relationships from the application code, because the
   original entity-relationship model was never written down as tables.
2. **Data quality problems surface that the flexible schema was hiding.** Inconsistent field types,
   missing values covered by application-level defaults, and drifted shapes across years of writes
   all have to be reconciled before they fit a rigid schema — this is usually the single largest
   source of delay.
3. **Dual-write or change-data-capture period.** A live system cannot simply stop and restart on a
   new database; most migrations run both systems in parallel, either dual-writing from the
   application or streaming changes (e.g. via change streams) into the new store, with reconciliation
   checks, before cutting reads over.
4. **Application code changes throughout**, not just the data layer — queries written as aggregation
   pipelines become SQL, and the code that leaned on document locality for performance may need
   rework once that locality is gone.
5. **It is a project with its own budget and timeline, not a sprint task.** For a system of any real
   size, treat it as a migration project comparable in scope to the original build, not a database
   swap.

:::callout{kind=bank-context}
The regulatory angle makes step 2 sharper than it would be elsewhere: reconciling historical data
that must remain auditable, mid-migration, without a gap or an unexplained discrepancy, needs its own
sign-off — this is usually where a migration project's timeline actually comes from, more than the
technical schema translation itself.
:::

## What good looks like

A decision document a manager can approve should show:

- The five criteria above, scored honestly, not just technical capability asserted in the abstract.
- For anything touching money movement or regulatory reporting: an explicit statement of how
  transactional integrity and audit are handled, not an assumption that "MongoDB supports
  transactions now" closes the question.
- A named owner for schema governance if MongoDB is chosen.
- An honest statement of the team's current MongoDB operational experience, and a plan if there's a
  gap.
- If migrating away is on the table: a scoped estimate that includes data reconciliation and
  dual-running, not just "rewrite the queries."

## Putting it together

::::exercise{id=ex-score-the-system type=scenario title="Score a proposed system against the framework"}
A team proposes MongoDB for a new "customer risk scoring" service: it reads customer and transaction
data (already in MongoDB elsewhere) to compute a score, writes one score document per customer per
day, and that score feeds into a nightly regulatory risk report that compliance must be able to
attest to and reproduce exactly, including for past dates if queried later. Score this against the
five criteria and give a recommendation.
:::solution
Transactional weight: low — one document written per customer per day, no cross-document atomicity
needed for the write itself. Join density: moderate — reads span customer and transaction data, but
that's read-only aggregation, not a hot-path join requirement. Reporting and audit requirement: high
— this is exactly the case that matters. A nightly figure compliance must attest to and reproduce
exactly for past dates is an immutability and point-in-time reconstruction requirement, not just a
reporting-tooling inconvenience. Immutability: high stakes, same reason. Team maturity: assume
unknown, ask directly.

Recommendation: MongoDB can technically store the score documents fine, but the audit and
point-in-time-reproducibility requirement is the deciding factor, not storage convenience. Either the
score documents must be written as strictly immutable, versioned records (never updated in place, a
new document per compute run, explicit supersession rather than overwrite) with that discipline
enforced and reviewable — or the regulatory report itself should be built off a store better suited
to exact historical reconstruction, with MongoDB feeding it rather than serving compliance queries
directly. The wrong answer is treating "we can write a document" as having satisfied "compliance can
reproduce this exactly for any past date," which are not the same requirement.
:::
::::
