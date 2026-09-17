---
title: "Cost & Tradeoff Thinking"
estimatedMinutes: 30
objectives:
  - "Calculate total cost of ownership for a system, not just its purchase or build price"
  - "Distinguish run cost from change cost and explain why the split matters for budgeting"
  - "Apply a basic build-vs-buy framework to a real proposal"
status: ready
---

Every technology decision is a cost decision, whether or not a number ever appears on a slide. This
lesson gives you the three tools that turn "I have a feeling this is expensive" into a number you
can defend in a budget meeting: total cost of ownership, the run/change split, and a build-vs-buy
framework.

## Why cost thinking is a management skill, not a finance skill

Engineers are usually excellent at estimating build effort and weak at estimating what a system
costs for the next five years after it ships. Finance is usually excellent at tracking what was
spent and weak at knowing which technical choice caused it. The gap between those two sits exactly
where an IT manager stands, and it is one of the most valuable things you personally add that
neither side can do alone.

:::manager
Nobody will hand you a fully-costed proposal. Part of the job is asking for the number that isn't
there — "what does this cost to run, not just to build?" — until asking it becomes reflexive for the
teams around you.
:::

## Total cost of ownership (TCO)

**TCO** is every cost a system incurs over its useful life, not just the cost to build or buy it.
For software, that typically includes: build or licence cost, infrastructure/hosting, ongoing
maintenance and support staff time, training, integration with existing systems, and eventual
decommissioning.

:::engineer
A simple TCO model for a 5-year horizon:

```
TCO = build_cost
    + (annual_infra_cost * 5)
    + (annual_maintenance_hours * hourly_rate * 5)
    + integration_cost
    + decommission_cost
```
The mistake that breaks this model in practice is not the formula — it's leaving out a term. Support
staff time and decommissioning are the two most commonly forgotten.
:::

:::manager
The number that decides most build-vs-buy and vendor arguments honestly is TCO, not sticker price. A
system that costs $200k to build and looks cheaper than a $250k-a-year licence is not cheaper once
you add five years of a part-time maintainer's salary, infrastructure, and the eventual cost of
migrating off it when it's out of date — which a vendor's roadmap absorbs and your in-house build
does not.
:::

## Run cost vs change cost

Every IT budget splits, explicitly or not, into **run** (keeping existing systems operating: hosting,
licences, support staff, patching) and **change** (building new capability: projects, features,
migrations). The split matters because the two compete for the same budget and the same people, and
a system with high run cost quietly starves the change budget every year it exists.

:::manager
A common, damaging pattern: a system is approved for a one-off build cost, and the run cost that
follows for the next decade never gets attributed back to the decision that created it. Ask, for any
new system: "what's the annual run cost once this is live, and who's paying for it out of whose
budget?" If nobody can answer, the true cost of the decision is being hidden, not avoided.
:::

:::engineer
Run cost is usually visible in a cloud bill or a licence renewal; the part that's easy to miss is the
engineering time spent on **keeping the lights on** — patching, incident response, upgrading
dependencies — which competes directly with time spent on new features even though it rarely shows
up as a line item anywhere.
:::

## Build vs buy basics

The build-vs-buy question is really several smaller questions bundled together: is this a
differentiator for the business, or a commodity capability everyone needs? Does a good vendor option
exist? What's the real TCO of each path?

:::callout{kind=decision title="A basic build-vs-buy framework"}
- **Commodity capability with a mature vendor market** (e.g. expense management, ticketing, BI
  tooling) → **buy**. Building it yourself means spending engineering time re-solving a problem
  vendors have already solved well, with none of the competitive benefit.
- **Core to what makes the business competitive** (e.g. the bank's own trading logic, proprietary
  risk models) → **build**, because a vendor's generic version can't be your advantage, and you don't
  want a competitor able to buy the same capability.
- **In between** (some genuine differentiation, but not the core) → look hard at TCO on both sides,
  and consider buy-then-customise or build-on-a-platform as a middle path.
:::

:::manager
"We could build this ourselves" is true of almost anything and is not, by itself, a reason to build
it. The real question is opportunity cost: what does the team *not* build, or build later, because
they spent months on something a vendor already sells well? That tradeoff is invisible unless you
ask for it explicitly.
:::

:::engineer
A quick sizing check that keeps a build-vs-buy discussion honest: estimate the build effort in
person-weeks, multiply by a loaded cost per week, and compare that single number to the vendor's
quoted annual price before any other argument is made. If the vendor is cheaper before you've even
counted ongoing maintenance, the "build" case needs a genuinely strong non-cost reason to survive.
:::

## Common mistakes

- **Comparing build cost to licence cost** instead of comparing full TCO on both sides.
- **No owner for run cost** — a system's ongoing cost isn't attributed to anyone's budget, so nobody
  is incentivised to reduce it or even track it.
- **Treating "build vs buy" as a one-time decision** rather than revisiting it when the vendor
  market matures or the in-house system's maintenance burden grows.
- **Underestimating integration and migration cost** when comparing a new vendor system to the
  status quo — the sticker price rarely includes the cost of connecting it to everything else.
- **Ignoring decommissioning cost** of the system being replaced, which can be substantial for
  anything holding regulated data.

:::callout{kind=bank-context}
Vendor risk assessment (data handling, financial stability of the vendor, exit strategy if they fail
or you need to leave) is part of the TCO conversation for any "buy" decision at a bank, not a
separate box-ticking exercise done afterwards. An unplanned vendor exit is one of the most expensive
events a "buy" decision can produce.
:::

## Putting it together

::::exercise{id=ex-tco-estimate type=design title="Estimate TCO for two options"}
Your team needs a document-approval workflow tool. Option A: build in-house, estimated 3 months of 2
engineers, then roughly 0.2 FTE ongoing maintenance. Option B: buy a SaaS workflow product at
$40k/year, with an estimated 2 weeks of integration effort. Sketch a rough 5-year TCO for both and
say which factors you're least confident in.
:::solution
A rough sketch (numbers illustrative, using a loaded engineer cost of ~$150k/year):

**Option A (build)**: Build = 3 months × 2 engineers ≈ 0.5 FTE-year ≈ $75k. Maintenance = 0.2 FTE ×
$150k × 5 years = $150k. Infrastructure ≈ $5k/year × 5 = $25k. Rough 5-year TCO ≈ **$250k**, plus
decommissioning cost whenever it's eventually replaced.

**Option B (buy)**: Integration = 2 weeks ≈ $6k. Licence = $40k/year × 5 = $200k. Rough 5-year TCO ≈
**$206k**, plus the vendor may raise prices, which the build option isn't exposed to in the same
way.

Least confident factors: the 0.2 FTE ongoing maintenance estimate for the build option (in-house
tools routinely need more maintenance than first estimated, especially as requirements grow), and
whether the SaaS product's price stays flat over 5 years or the vendor raises it at renewal. A
manager reviewing this should push on both of those assumptions specifically, since they're the ones
most likely to move the final number.
:::
::::
