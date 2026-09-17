---
title: "SLOs, Error Budgets and Burn-Rate Alerting"
estimatedMinutes: 40
objectives:
  - "Define an SLO and an error budget and connect them directly to alerting policy"
  - "Design a burn-rate alert and explain why it beats a flat threshold"
  - "Run a post-incident review that improves alerting rather than assigning blame"
  - "Manage on-call health as an explicit, measured responsibility"
status: ready
---

You know symptom versus cause alerts and what a good alert looks like. This lesson is about the
framework that tells you, rigorously, which symptoms deserve an alert at all, and how urgently: SLOs
and error budgets, and the burn-rate alerting technique built on top of them.

## Where the basics break down

A flat threshold alert ("page if error rate > 1%") has two failure modes that only show up at
scale. First, it does not distinguish a brief, self-correcting blip from a sustained problem that
will actually hurt customers if it continues — it either pages too eagerly or, if you add a long
`for:` window to compensate, too slowly for a fast, severe failure. Second, it has no connection to
what the business actually promised — a 1% threshold might be far too strict for a best-effort
internal tool and dangerously loose for a payments API with a contractual 99.9% target. Flat
thresholds do not scale to an organisation running dozens of services with different stakes,
because there is no shared, principled way to set them.

:::engineer
```yaml
# The pattern that does not scale: a hand-picked threshold per service, no shared basis
- alert: CheckoutErrorRate
  expr: error_ratio{job="checkout"} > 0.01
- alert: ReportingErrorRate
  expr: error_ratio{job="reporting"} > 0.01   # same threshold, very different stakes
```
Both alerts use the same `0.01` because someone picked a round number, not because either service's
actual customer-facing target was calculated. SLO-based alerting (below) replaces the guess with a
number derived from an agreed target per service.
:::

:::manager
The question SLOs answer: "how bad, for how long, is actually acceptable for this specific
service?" Without an explicit answer, every team sets its own threshold by feel, which means your
alerting standards are only as good as each team's individual judgement — inconsistent, and
un-auditable when someone asks why a particular incident was, or was not, treated as urgent.
:::

## SLOs and error budgets

A **Service Level Objective (SLO)** is a target for a specific, measurable indicator (the **SLI** —
service level indicator, such as "percentage of requests completed successfully within 300ms") over
a rolling window: "99.9% of checkout requests succeed within 300ms, measured over 30 days." The
**error budget** is the gap between 100% and the SLO — here, 0.1% of requests are allowed to fail or
be slow before you have breached your own target. The error budget is not aspirational slack; it is
a resource you deliberately choose to spend, on deploys, experiments, and the ordinary background
failure rate of any real system.

:::engineer
```promql
# SLI: fraction of requests succeeding within 300ms, last 30 days
sum(rate(http_requests_total{job="checkout", status!~"5..", le="0.3"}[30d]))
  /
sum(rate(http_requests_total{job="checkout"}[30d]))

# Error budget remaining, as a fraction (SLO 99.9% -> budget 0.1%)
1 - ((1 - SLI_above) / (1 - 0.999))
```
The SLO number itself is a business decision — negotiated with product and, for a regulated
service, sometimes anchored to a contractual or regulatory obligation — not something engineering
picks alone.
:::

:::callout{kind=decision title="Setting an SLO: start from customer impact, not current performance"}
A common mistake is setting the SLO to whatever the service currently achieves ("we're at 99.95%,
let's call that the target"), which bakes in no margin for improvement and gives no signal when
performance genuinely degrades within the existing target. Set the SLO from what customers actually
need — informed by current performance as a sanity check, not driven by it.
:::

:::manager
An error budget reframes a familiar argument. "Can we ship this risky change" stops being a
values debate and becomes: "we have this much budget left this month; is this change worth
spending some of it?" This is a genuinely useful tool for balancing release velocity against
reliability with a shared, visible number instead of a recurring negotiation based on whoever
argues more forcefully.
:::

## Burn-rate alerting

A flat threshold cannot tell the difference between "we will exhaust the entire 30-day error budget
in six hours at this rate" and "we will exhaust it in three weeks, comfortably within the window, if
nothing changes." **Burn-rate alerting** solves this directly: it alerts on how fast you are
consuming the error budget, not on the raw error rate, and uses that rate to decide urgency.

:::engineer
```yaml
# Fast burn: would exhaust the entire 30-day budget in about 2 hours at this rate. Page.
- alert: CheckoutErrorBudgetFastBurn
  expr: |
    (job:http_error_ratio:rate5m{job="checkout"} > (14.4 * 0.001))
    and
    (job:http_error_ratio:rate1h{job="checkout"} > (14.4 * 0.001))
  for: 2m
  labels: { severity: page }

# Slow burn: would exhaust the budget in a few days. Ticket, not a page.
- alert: CheckoutErrorBudgetSlowBurn
  expr: job:http_error_ratio:rate6h{job="checkout"} > (3 * 0.001)
  for: 15m
  labels: { severity: ticket }
```
The `14.4` and `3` multipliers come from the widely-used Google SRE multi-window burn-rate approach:
a short-window and long-window check, both required, catches fast severe burns quickly while
avoiding a page for a brief spike that a longer window shows is not sustained. Exact multipliers
depend on how much of the budget you are willing to risk before paging.
:::

:::callout{kind=decision title="Why two time windows, not one"}
A single short window (5 minutes) pages on brief spikes that self-resolve. A single long window (6
hours) is too slow for a genuinely fast, severe outage. Requiring both a short-window and a
long-window condition to hold catches real, sustained fast burns quickly while filtering out noise
that a short window alone would page on.
:::

:::manager
Burn-rate alerting is the mechanism that makes "page urgently only when it genuinely matters" into
something calculated, not judged. It is also the direct, principled answer to alert fatigue: an
alert tied to actual budget consumption, at a rate that would genuinely breach the promised target,
is close to definitionally worth waking someone for.
:::

## Post-incident reviews that improve alerting

A post-incident review that only produces "root cause: X, fixed by Y" misses half its value. The
alerting-specific questions worth adding to every review: was the responder paged by the right
alert, at the right time — not too late, not by a confusing cause alert instead of the symptom that
actually mattered? Did the runbook help or need real-time improvisation? Should this incident
produce a new alert, a tuned threshold, or a better runbook, and who owns making that change before
the next similar incident?

:::engineer
```text
Post-incident review addendum, alerting section:
- First alert that fired: <name>, at <time>. Time to acknowledge: <mins>.
- Was this the right alert (symptom, tied to customer impact) or a cause alert that
  under-described what was wrong?
- Runbook followed: <link>. Did it match reality, or was it out of date?
- Action items: [new alert | tuned threshold | rewritten runbook], owner, due date.
```
Adding this as a standing section of every review template, not an optional extra, is what makes
alerting quality actually improve incident over incident instead of being re-discussed from scratch
each time.
:::

:::manager
The review question that most improves alerting quality over time: "if this exact failure happened
again next week, would the current alerts and runbook get someone to the fix faster than this time?"
If the honest answer is no, the review is incomplete until an owner and a deadline exist for
whatever closes that gap.
:::

## On-call health as a management metric

Track, per person, per rotation: pages received, pages outside working hours, and pages that turned
out to be false positives or duplicates of an already-known issue. These are workload and quality
metrics you can act on directly — reduce noisy alerts, rebalance a rotation, or add headcount to a
rotation that is structurally too small for its page volume.

:::engineer
```promql
# Pages per person, last 7 days, from an alerting platform's own metrics export
sum by (responder) (pages_total{severity="page"}[7d])

# After-hours pages specifically (outside a defined business-hours window)
sum by (responder) (pages_total{severity="page", hour_bucket="after-hours"}[7d])
```
Most paging platforms (PagerDuty, Opsgenie and similar) expose this data via API or export; the
query pattern is the same idea regardless of the specific tool.
:::

:::manager
Set a stated tolerance before you need it — for example, no one is paged after-hours more than a
defined number of times per week on average without a rebalancing conversation. Reviewing this
quarterly, proactively, catches an unfair rotation before someone resigns over it, which is a much
worse time to discover the imbalance.
:::

:::callout{kind=bank-context}
Attrition on an on-call rotation is expensive in a way that is easy to underweight: replacing an
engineer who leaves partly because of pager burnout costs months of hiring and ramp-up time, and the
departing engineer typically takes institutional incident knowledge with them — exactly the
knowledge that makes the next incident faster to resolve. Treating on-call load as a tracked,
reviewed metric is cheaper than treating attrition as an unrelated HR problem after the fact.
:::

## What good looks like

- Every paging alert maps to an SLO breach or a genuine fast burn toward one — not a raw internal
  metric threshold picked by feel.
- Burn-rate alerts use at least two time windows; cause-level metrics (CPU, memory, disk) generate
  tickets or warnings, not pages, unless directly tied to imminent customer impact.
- Every paging alert has a runbook, reviewed after each real page for whether it actually helped.
- Pages per person per rotation are tracked and reviewed, with a stated tolerance for how much
  after-hours load is acceptable before it triggers a rebalancing conversation.
- Post-incident reviews explicitly evaluate whether the alerting and runbook worked, with an owner
  and deadline for any gap found.

:::manager
Use this list the way the equivalent checklist works elsewhere: pick one item per review cycle and
ask a team to defend their current state against it, rather than auditing all five at once. It
surfaces more over a year than a single exhaustive audit that happens once and is never repeated.
:::

:::engineer
A quick self-check query for the first bullet: list every alert with `severity: page` and confirm
each one either references a recording rule tied to an SLO/error-budget calculation, or has an
explicit, documented reason it is exempt (a genuinely rare, hard-outage-only cause alert). Anything
without either is a candidate for demotion to `severity: ticket` or deletion.
:::

## Exercises

::::exercise{id=ex-set-slo type=scenario title="A team proposes a 99.99% SLO for everything"}
A team proposes a blanket 99.99% availability SLO for all twelve of their services, "to be safe."
What do you ask, and what would you push back on?
:::solution
Ask what a 99.99% target actually costs to achieve and maintain (roughly 52 minutes of allowed
downtime per year, across the whole system) and whether every one of the twelve services has
customer impact that justifies that cost — an internal reporting service and a customer-facing
payments API do not need the same target. Push back on a uniform blanket target: it either
over-invests engineering effort in services where it does not matter, or, more dangerously, creates
false confidence that all twelve are equally critical when an incident forces a prioritisation
decision. Ask for a target per service, justified by actual customer or business impact, with the
higher bar reserved for the services that truly need it.
:::
::::

::::exercise{id=ex-burn-rate-design type=design title="Design burn-rate alerts for a real SLO"}
Given an SLO of 99.9% availability over 30 days for an API, design a fast-burn and a slow-burn alert.
State the windows, the approximate multiplier reasoning, and the severity for each.
:::solution
Fast burn: short window (e.g. 5m) and long window (e.g. 1h) both required to exceed roughly 14x the
base error rate implied by the SLO (0.1%), paging at `severity: page` — this would exhaust the
30-day budget in a few hours if sustained, which justifies waking someone. Slow burn: a longer
window (e.g. 6h) exceeding roughly 3x the base rate, filed as `severity: ticket` rather than a page
— this would exhaust the budget over several days, giving time to address it during business hours.
The exact multipliers should be tuned to how much of the budget the team is willing to risk before
escalating, but the two-window, two-severity structure is the reusable pattern regardless of the
specific numbers chosen.
:::
::::
