---
title: "When NOT to Use MongoDB — refresher"
estimatedMinutes: 15
objectives:
  - "Re-anchor the decision framework and the four core limits in ten minutes"
  - "Know what has genuinely narrowed the gap since you last evaluated MongoDB, and what hasn't"
  - "Spot the fit-decision mistakes that still get past experienced architects"
status: ready
---

You have made database choice calls before. The framework has not changed. What has changed:
transactions and validation closed some of the gap that used to make this an easy no for anything
transactional, which makes the decision genuinely harder to make lazily now than it was — "MongoDB
doesn't do transactions" is no longer a valid reason to rule it out reflexively, so the real criteria
matter more, not less.

## What you probably remember

| Concept | One-line anchor |
| --- | --- |
| Joins | $lookup exists but is explicit, per-query, and doesn't enforce referential integrity. |
| Transactions | Multi-document transactions exist but cost more than a single-document write; a routine, high-consequence need argues against MongoDB. |
| Reporting | Aggregation framework works; ad-hoc SQL/BI tooling generally doesn't talk to it natively — budget for ETL or a bespoke pipeline function. |
| Audit trails | No built-in immutable/temporal record; you must engineer append-only history deliberately. |
| Schema drift | No enforced schema by default; without a named owner and validation, shape drifts silently. |
| Operational maturity | Running MongoDB well (failover, backup, upgrades, index tuning under load) is its own skill set, not a given. |
| Decision framework | Score transactional weight, join density, reporting/audit need, immutability need, team maturity — honestly, weighted by consequence. |
| Good fit | Document-shaped domain, read-heavy, predictable access, low cross-document transactions, no strict immutability requirement. |

## What changed since

:::callout{kind=changed-since title="Multi-document transactions (4.0, 2018) narrowed, did not close, the transactional gap"}
Before 2018, "MongoDB can't do transactions" was a correct, simple reason to rule it out for
transactional workloads. That is no longer accurate as a blanket statement — but the performance cost
relative to a single-document write is still real, and a workload where most writes need
cross-document atomicity is still fighting the tool, just less absolutely than before. The decision
now hinges on volume and consequence, not on capability existing at all.
:::

:::callout{kind=changed-since title="$jsonSchema validation (3.6, 2017) narrowed the schema-drift argument, if actually used"}
"MongoDB has no schema enforcement" is no longer true as a blanket statement either — but it remains
opt-in, and the schema-drift risk in this lesson is about collections where validation was never
turned on, which is still the common case in practice. The tool to close the gap exists; whether a
given team has used it is a separate, still-live question in every review.
:::

:::callout{kind=changed-since title="Change streams (3.6, 2017) make a deliberate audit trail more buildable"}
Change streams give a real-time feed of writes to a collection, which is a practical building block
for an application-level audit log or for feeding an external immutable store — cheaper to build well
than it was pre-2017. It is still something you must design and build; it did not become a built-in
guarantee.
:::

:::callout{kind=changed-since title="Time series collections (5.0, 2021) and clustered collections narrowed some hand-rolled-schema arguments"}
Some of what used to be "MongoDB makes you hand-roll this yourself" for time-ordered or
insert-heavy data has native support now (see the document-modeling refresher). This affects the
join-density and schema-engineering side of the decision more than the transactional or audit side.
:::

## Gotchas that still bite

- **Treating "transactions exist now" as "the transactional argument is settled."** The cost gap is
  narrower, not gone. Ask about volume and consequence, not just capability.
- **Treating $jsonSchema's existence as evidence it's in use.** Check the specific collection, not
  the platform's general capability.
- **Re-litigating the whole decision from first principles every time**, instead of using the
  five-criteria framework consistently, which is what makes the decision auditable and defensible
  later.
- **Forgetting the migration-away cost when the original decision is questioned.** "It's not a great
  fit anymore" and "we should migrate it" are different conclusions with very different price tags —
  see the intermediate lesson's migration section before assuming the second follows automatically
  from the first.
- **Applying the framework as a pure veto list rather than a weighted score.** A system with minor
  friction on one criterion and a strong case elsewhere can still be the right call.

:::callout{kind=bank-context}
For anything already live and in regulatory scope, re-running this framework periodically (not just
at initial build) is worth doing deliberately — data volume, transactional load and reporting
requirements on a system tend to grow well past what was true at the original decision, and the fit
that was correct at launch is not guaranteed to still be correct three years later.
:::

## Ten-minute drill

::::exercise{id=ex-re-evaluate type=scenario title="Re-evaluate a three-year-old decision"}
A payments-adjacent service was built on MongoDB three years ago when it handled a modest volume of
low-value transactions with no regulatory reporting requirement. It now handles ten times the volume,
touches larger-value transactions, and a new regulatory reporting obligation has landed on the team.
Walk through the five criteria briefly and say whether this decision needs revisiting.

:::solution
Transactional weight: likely higher now given volume and value growth — worth re-checking actual
cross-document atomicity needs, not just assuming they scaled linearly. Join density: probably
unchanged unless the domain model grew more relational. Reporting/audit requirement: this is the
material change — a new regulatory reporting obligation is exactly the criterion this framework
weights most heavily, and it wasn't true at the original decision. Immutability: follows directly from
the new reporting obligation — check whether historical records can be reconstructed and attested to.
Team maturity: worth confirming operational experience actually grew with the system rather than
being assumed to have kept pace.

Conclusion: yes, this decision needs revisiting, specifically because the criterion that changed
(reporting/audit) is the one this framework weights most heavily for a bank, not because MongoDB
itself changed. Revisiting does not automatically mean migrate — it may mean adding a properly
engineered immutable record and an ETL path to reporting, staying on MongoDB. Only escalate to
"consider migration" if that engineering, honestly costed, turns out to cost more than the system is
worth rebuilding elsewhere.
:::
::::
