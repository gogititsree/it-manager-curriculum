---
title: "Cost & Tradeoff Thinking — refresher"
estimatedMinutes: 15
objectives:
  - "Re-anchor TCO, build-vs-buy and cost-of-delay thinking in ten minutes"
  - "Know what changed once infrastructure became consumption-priced rather than purchased"
  - "Spot the gotchas that still catch experienced managers doing cost estimates"
status: ready
---

You built budgets and business cases before capex-for-hardware stopped being the default model.
The underlying frameworks — TCO, build vs buy, cost of delay — still work exactly as you remember
them. What changed is the shape of the cost itself: from a small number of large, predictable line
items to a large number of small, variable ones.

## What you probably remember

| Concept | One-line anchor |
| --- | --- |
| TCO | Every cost over the system's life — build/licence, run, maintenance, integration, decommission — not just purchase price. |
| Run vs change | Run keeps existing systems operating; change builds new capability. They compete for the same budget and people. |
| Build vs buy | Commodity with a mature vendor market → buy. Core differentiator → build. Compare full TCO, not sticker price. |
| Cost of delay | What waiting costs per unit of time — turns "not now" into a number you can rank against other priorities. |
| Saying no with numbers | A TCO or unit-cost figure resolves an argument; a gut objection just prolongs it. |

## What changed since

:::callout{kind=changed-since title="Capex to opex: the biggest structural shift"}
On-prem budgeting was dominated by capital expenditure — buy hardware, depreciate it over 3–5 years,
a large predictable line item approved once. Cloud consumption pricing is operating expenditure —
pay for what you use, billed monthly, no upfront commitment required. This changes the budgeting
conversation from "get one large purchase approved" to "manage an ongoing, variable spend line," and
it changes who needs visibility into cost: a monthly-varying opex number needs continuous owner
attention in a way an annual capex purchase never did.
:::

:::callout{kind=changed-since title="Consumption granularity: per-second, per-request, per-token"}
AWS moved EC2 billing to per-second increments in 2017 (from per-hour); most cloud services now bill
at fine granularity — per API call, per GB transferred, per request. The newest wave (2023 onward) is
usage-based pricing for AI/LLM services: cost per token processed, which is far less predictable
than per-VM-hour pricing because usage scales with how a feature is used, not with a provisioned
resource you sized in advance. Budgeting for an AI-powered feature now needs the same unit-economics
discipline as any other consumption service, from day one.
:::

:::callout{kind=changed-since title="FinOps formalised as a discipline (FinOps Foundation, 2019)"}
The practice of jointly managing variable cloud cost across engineering, finance and the business —
previously ad hoc — was formalised by the FinOps Foundation (part of the Linux Foundation, founded
2019) into a named framework: Inform, Optimise, Operate. If your organisation still treats cloud cost
as something finance reviews quarterly after the fact rather than something engineering sees
continuously, that is now recognised as the immature end of a well-documented maturity model, not
just "how it's always been done."
:::

:::callout{kind=changed-since title="FOCUS: a standard billing format across providers (2023)"}
The FinOps Foundation's FOCUS specification (FinOps Open Cost and Usage Specification, first
released 2023) standardises billing data format across AWS, Azure, GCP and other providers, so a
multi-cloud cost dashboard doesn't need custom parsing per vendor. Worth knowing the name if a
vendor or tool mentions FOCUS compliance — it signals the cost data can plug into a common reporting
pipeline rather than a bespoke one.
:::

:::engineer
```
# The unit-economics discipline that didn't exist as cleanly for on-prem capex now applies to every
# consumption-priced service, AI included:
unit_cost = monthly_spend / monthly_units_of_value   # transactions, tokens, active users...
```
Track this from the day a consumption-priced feature launches, not after the first surprising bill.
:::

:::manager
The frameworks in your memory (TCO, build vs buy, cost of delay) are unchanged and still the right
tools. What demands new attention is the *frequency* of the cost conversation: a capex-era budget
got scrutinised once a year at purchase time; an opex, consumption-priced estate needs the same
scrutiny monthly, because the number moves monthly. If your budget review cadence is still annual,
it's mismatched to how the spend actually behaves now.
:::

## Gotchas that still bite

- **Estimating cloud cost like a capex purchase** — sizing once, budgeting a flat number, and being
  surprised when usage (and therefore cost) grows or shrinks month to month.
- **Ignoring egress and cross-service costs** when comparing a cloud option to an on-prem baseline —
  these didn't exist in the old model and are easy to leave out of a first-pass estimate.
- **AI/LLM feature costs estimated like a fixed licence** rather than modelled as consumption that
  scales with usage — a popular feature can make cost scale in ways a traditional per-seat licence
  never did.
- **Reserved/committed pricing signed before usage patterns are understood** — commit too early and
  you're locked into a shape of spend that doesn't match how the workload actually behaves.
- **Treating a low sticker price on a consumption service as the whole picture** — the unit cost at
  projected scale is what matters, not the per-unit price at the volume in this month's demo.

:::callout{kind=bank-context}
Consumption pricing makes vendor cost forecasting harder to defend to a budget committee that wants
a fixed number. Present a range with the assumptions behind it (expected volume, growth rate) rather
than a single number presented as certain — it holds up better under scrutiny and ages better if
usage moves.
:::

## Ten-minute drill

::::exercise{id=ex-consumption-budget type=scenario title="Budget for a consumption-priced AI feature"}
Your team wants to add an AI-powered document summarisation feature, priced by the AI vendor per
1,000 tokens processed. Product estimates 50,000 documents/month at launch, each averaging 2,000
tokens in and 500 tokens out, growing 20%/month for the first year. How would you approach budgeting
this, and what's different from budgeting a traditional software licence?
:::solution
Approach: calculate a per-document unit cost first (tokens in + out per document × price per 1,000
tokens), then project month by month applying the 20% growth rate rather than presenting a single
annual number — because the whole point of consumption pricing is that the number moves. Build the
budget as a range (a conservative and an aggressive growth case) with the assumption (20%/month
growth, average tokens/document) stated explicitly next to the number, and set a budget alert at a
threshold well before year-end so a faster-than-expected growth curve is caught early rather than
discovered at the next budget review.

What's different from a traditional licence: a per-seat licence gives you a fixed number to defend
once a year. This cost scales directly with a business outcome (feature popularity) that product,
not engineering, controls — so the budget conversation has to include product from the start, and
the "budget" is really a monitored ceiling with an alert, not a number you set once and forget until
renewal.
:::
::::
