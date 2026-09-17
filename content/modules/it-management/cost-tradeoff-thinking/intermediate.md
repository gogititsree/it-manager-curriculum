---
title: "Cost Thinking in Practice: FinOps, Delay and Negotiation"
estimatedMinutes: 40
objectives:
  - "Calculate a unit economics figure for a cloud-hosted service and use it to compare architectures"
  - "Apply cost of delay to prioritise between two competing projects"
  - "Build a numeric case to say no to a proposal, instead of an instinct-based one"
status: ready
---

You can build a TCO estimate and tell build from buy. This lesson is about the sharper tools you
need once decisions involve variable cloud spend, competing priorities with real deadlines, and
vendors who negotiate for a living.

## Where the basics break down

TCO and build-vs-buy answer "what does this cost over its life," a largely static question. They
don't answer: is this specific architecture efficient for what it delivers, right now, as usage
changes month to month? What's actually lost by delaying a decision, in a way you can put a number
on? How do you push back on a proposal without it reading as personal preference? Those need a
different, sharper set of tools.

## Unit economics of cloud

**Unit economics** means cost per unit of value delivered — cost per transaction, per customer, per
API call — rather than a raw total. A service costing $50k/month sounds expensive in isolation; at
10 million transactions a month, that's $0.005 per transaction, which may be entirely reasonable.

:::engineer
```
Unit cost = total monthly cloud cost / monthly transaction volume

Service A: $50,000 / 10,000,000 transactions = $0.005 / transaction
Service B: $8,000  /    200,000 transactions = $0.040 / transaction
```
Service B looks cheaper in absolute terms but costs eight times more per transaction — a sign it's
either under-optimised or operating at a scale where fixed costs dominate and haven't been amortised
yet. Track this over time, not as a one-off snapshot; a rising unit cost as volume grows is a real
warning sign that something isn't scaling efficiently.
:::

:::manager
Unit economics turns "the cloud bill went up" from a vague worry into a specific question: did cost
go up because volume grew proportionally (fine, possibly even efficient), or because cost per unit
got worse (a real problem worth investigating)? Ask for cost per transaction/customer/order
alongside the raw total whenever a team reports cloud spend, not instead of it.
:::

## FinOps basics

**FinOps** is the operating model for managing variable cloud cost as a shared discipline between
engineering, finance and the business — not finance auditing engineering after the fact, but the
three working from the same numbers in real time. The **FinOps Foundation** (part of the Linux
Foundation) organises the practice into three iterative phases: **Inform** (accurate, allocated cost
visibility), **Optimise** (rightsizing, reserved capacity, eliminating waste), **Operate** (cost as a
first-class input to engineering decisions, continuously, not quarterly).

:::callout{kind=decision title="Where to start a FinOps practice"}
- No cost visibility by team/service today → start at **Inform**: enforce tagging, get a dashboard
  that attributes cost accurately. Nothing else works without this.
- Visibility exists but spend is inefficient (idle resources, on-demand pricing on steady workloads)
  → **Optimise**: rightsizing exercises, reserved/committed pricing, autoscaling tuned to real
  demand.
- Both exist but cost decisions still happen without engineering awareness of price → **Operate**:
  put unit cost on the same dashboard engineers already watch for latency and error rate.
:::

:::manager
FinOps maturity is a good proxy question for a team's overall operational maturity. A team that can
tell you their cost per transaction and its trend over the last quarter, unprompted, is usually
also the team that has its incident response and deployment practices in order. The correlation is
not a coincidence — both come from the same habit of measuring what matters continuously.
:::

:::engineer
```bash
# Enforce tagging at deploy time rather than hoping for it after the fact
aws resourcegroupstaggingapi get-resources --tag-filters Key=team \
  | jq '.ResourceTagMappingList | length'
# A policy (AWS Config rule, Azure Policy) can reject resources missing required tags outright
```
Rightsizing (the core of Optimise) is usually driven by a report comparing provisioned capacity to
actual utilisation over a trailing window — AWS Compute Optimizer and Azure Advisor both produce
this automatically and are a fast first pass before any manual review.
:::

## Cost of delay

**Cost of delay** puts a number on what waiting costs — lost revenue, continued manual effort, risk
exposure — for every unit of time a decision or project is deferred. It reframes "we don't have
budget for this now" against "what does not doing this cost us every month we wait," which is often
the more honest comparison.

:::engineer
A simple cost-of-delay estimate: a manual reconciliation process costs 2 staff × 20 hours/month ×
$60/hour = $2,400/month in labour, plus an estimated $5,000/month in error-driven rework based on
historical incident data. Automating it costs $60,000 to build. Payback period ≈ $60,000 / $7,400 ≈
8 months. Every month the project is delayed past when it could have started is roughly $7,400 not
saved — a number you can put next to any competing priority.
:::

:::manager
"We'll get to it next quarter" sounds cost-free. Cost of delay makes the actual cost of that
sentence visible: if the reconciliation project above waits two extra quarters, that's roughly
$44,000 in cost not avoided — real money, even though no invoice was ever raised for it. Use cost of
delay explicitly when ranking a backlog of competing projects; it exposes priorities that "urgency"
alone tends to hide, especially for unglamorous operational fixes that never feel as pressing as a
customer-facing feature.
:::

## Saying no with numbers

Saying no to a proposal on gut feel ("this seems too expensive") invites an endless argument about
whose gut is right. Saying no with a number — a TCO comparison, a unit economics figure, a cost of
delay for the alternative — turns the conversation into one about the number, which is far more
resolvable.

:::manager
"I'm not saying no to the idea. I'm saying the TCO here is $X over 3 years against a $Y budget, or
the unit cost is 4x our next-closest comparable service, and I need to see which of those is wrong
before I can say yes." This keeps the conversation on the evidence, not on whether you personally
like the proposal, and it gives the proposer a concrete path to change your mind if the numbers were
wrong.
:::

:::engineer
Write the number down before the meeting, with its assumptions visible, so it can be checked rather
than just asserted:

```
Proposal: real-time fraud scoring service
TCO (3yr): build $180k + run $60k/yr x 3 = $360k
Unit cost at projected volume: $0.018/transaction
Comparable: existing batch scoring costs $0.004/transaction
Ask: what does real-time solve that batch doesn't, worth 4.5x the per-transaction cost?
```
A number with its assumptions on the page invites a specific correction ("your volume estimate is
too low") instead of a vague one ("I don't think that's right").
:::

## Vendor negotiations

A few durable patterns for negotiating with cloud and software vendors: **volume/commitment
discounts** (committing to a usage level in exchange for a lower rate — AWS Savings Plans, Azure
Reservations, or an enterprise agreement with a software vendor); **multi-year terms** in exchange
for price protection (locking in a rate before an expected increase); and **walking away as
leverage**, which only works if you've actually evaluated and priced a real alternative, not
bluffed.

:::manager
The single biggest negotiating mistake: starting the renewal conversation with the incumbent vendor
with no comparable quote from anyone else. Vendors price based on your perceived alternatives, not
your actual usage. Even a rough, credible alternative quote — not necessarily one you'd take —
changes the negotiation meaningfully.
:::

:::engineer
Before any renewal conversation, pull twelve months of actual usage data (API calls, seats active,
storage consumed) rather than negotiating off the contracted entitlement — vendors routinely price
renewals off the larger of the two, and usage data is the concrete evidence that lets you negotiate
down an entitlement nobody is using.
:::

:::callout{kind=bank-context}
Vendor concentration risk is a regulatory concern independent of price: relying on one vendor for a
critical function without a credible exit path can itself be a finding in a vendor risk review, even
if the price is good. Factor exit cost and time into any multi-year commitment, not just the
discount rate.
:::

## What good looks like

- Cloud cost is reported with unit economics (cost per transaction/customer), not just a raw total,
  and the trend is tracked over time.
- A named FinOps practice exists — even informally — covering visibility, optimisation and
  ongoing cost-aware engineering, matched to your organisation's actual maturity level.
- Cost of delay is calculated for at least the top few items competing for budget, not just "urgent"
  vs "not urgent" by feel.
- Pushback on a proposal comes with a number and a specific ask ("show me X"), not just a gut
  objection.
- No vendor renewal negotiation starts without at least one credible comparable quote in hand.

## Exercises

::::exercise{id=ex-unit-economics-scenario type=scenario title="A team's cloud bill tripled after a feature launch"}
A team's monthly cloud bill went from $30k to $90k after launching a new feature, and transaction
volume roughly doubled over the same period. Is this a problem? What do you ask, and how do you
decide?
:::solution
Raw numbers alone don't answer it — this needs unit economics. Before: $30k / (volume V) = unit cost
$30k/V. After: $90k / (2V) = $45k/V — a 50% increase in cost per transaction even though volume only
doubled, meaning the bill tripled for a volume that only doubled. That is worth investigating: ask
what changed architecturally with the new feature (a new expensive dependency, inefficient queries,
under-provisioned autoscaling causing over-provisioning as a workaround, a service not scaling
linearly with load).

Decide: this is not automatically "the feature is bad" — a new feature often has a start-up cost
curve that improves once initial fixed costs (a new database cluster sized for headroom, for
example) are amortised over more volume. But a persistent 50% higher unit cost after a reasonable
settling period, without an explanation tied to specific architecture, is a real finding worth a
focused cost-optimisation pass, not just accepted as "the cost of growth."
:::
::::

::::exercise{id=ex-cost-of-delay-scenario type=scenario title="Two competing projects, one budget slot"}
Two proposals compete for the same budget slot next quarter: Project A, a customer-facing feature
estimated to add $15k/month in new revenue once live, ready to start now; Project B, an internal
tooling fix reducing 40 hours/month of manual reconciliation work at $60/hour, ready to start now.
Both take roughly 3 months to build. Using cost of delay, how would you rank them, and what other
factor might change the ranking?
:::solution
Cost of delay for A ≈ $15,000/month not yet earned while delayed. Cost of delay for B ≈ 40 × $60 =
$2,400/month not yet saved while delayed. On cost of delay alone, A ranks higher — roughly 6x the
monthly cost of waiting.

What might change the ranking: if B's manual process also carries operational risk not captured in
the hours figure (e.g. it's error-prone and has caused past incidents, or a key person doing it
manually is a single point of failure), the true cost of delay for B is understated by looking only
at labour hours. Revenue estimates for A are also often optimistic and should be discounted for
uncertainty, while B's saved-hours estimate is usually more reliable since it's based on measured
current effort rather than a forecast. A careful ranking asks for the confidence level behind each
number, not just the number itself.
:::
::::
