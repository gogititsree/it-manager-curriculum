---
title: "Alerting Design — Refresher: What SLO Culture Changed"
estimatedMinutes: 15
objectives:
  - "Re-anchor symptom vs cause alerts and paging etiquette in ten minutes"
  - "Know what SLO/error-budget culture added since the threshold-alerting era"
  - "Spot the alerting mistakes that persist even among experienced on-call veterans"
status: ready
---

You have carried a pager, tuned thresholds, and sat in post-incident reviews. The fundamentals of
"don't wake people for nothing, make alerts actionable, write runbooks that work at 3 a.m." have not
changed. What is genuinely new is a more rigorous framework — SLOs, error budgets, burn-rate
alerting — for *deciding* what deserves a page in the first place, replacing a lot of threshold-by-
feel tuning with a calculated, defensible number.

## What you probably remember

| Concept | One-line anchor |
| --- | --- |
| Threshold alert | Fire when a metric crosses a fixed number; tune the number by trial and error until noise is tolerable. |
| Symptom vs cause | Alert on what the customer notices, not just an internal metric, whenever you can. |
| Runbook | Short, specific doc linked from the alert; useless if it just says "investigate." |
| Escalation | If the first responder does not acknowledge in time, it automatically goes to the next person. |
| On-call rotation fairness | Track who actually gets paged, not just who is scheduled. |
| Post-incident review | Root cause plus contributing factors, blameless, produces action items with owners. |

## What changed since

:::callout{kind=changed-since title="SLOs and error budgets became the standard framework for 'how urgent is this' (Google's SRE book, 2016, widely adopted through the following years)"}
Instead of tuning a threshold until the noise feels acceptable, the modern approach sets an explicit
target (the SLO) for a specific customer-facing indicator, calculates the allowed failure budget,
and pages based on how fast that budget is being consumed. This turns "is this alert too
sensitive?" from a judgement call into a number everyone can see and agree on ahead of time.
:::

:::callout{kind=changed-since title="Burn-rate alerting replaced single-threshold-plus-duration as the sophisticated default"}
Where you might have tuned "error rate > X% for Y minutes" by feel, burn-rate alerting calculates
urgency directly from how quickly the error budget would be exhausted at the current rate, typically
using two time windows (short and long) so a real fast, severe failure pages quickly while a brief
blip does not. The multipliers (a widely cited example uses roughly 14x the base rate for a fast
page, roughly 3x for a slower ticket) come from published SRE practice, not from each team
reinventing tuning independently.
:::

:::callout{kind=changed-since title="Error budgets became a release-velocity conversation, not just an ops one"}
"Can we ship this risky change this week" now often has a shared, numeric answer: how much error
budget is left this month. This shifted error-budget ownership from purely an SRE/ops concern into
something product and engineering leadership look at together when deciding release risk.
:::

:::callout{kind=changed-since title="Paging tooling and chatops matured"}
If your last hands-on exposure was an on-call phone tree or a pager literally called a pager,
today's equivalent is a paging platform (PagerDuty, Opsgenie, or similar) with automatic escalation
policies, integrated with chat tooling so an incident gets a dedicated channel, a declared incident
commander role, and a timeline automatically, rather than assembled ad hoc over phone calls.
:::

:::manager
The management-relevant shift: you no longer have to defend a threshold on instinct alone. "We page
when we're burning the monthly error budget fast enough to exhaust it in a few hours" is a
defensible, auditable statement in a way "we page at 5% errors because that felt about right" never
quite was. If your teams are still tuning thresholds purely by feel, that is worth naming as a gap
against current practice.
:::

## Gotchas that still bite

- **Setting the SLO to current performance** instead of actual customer need — bakes in no room to
  detect real degradation and gives false confidence. Set it from what customers require, sanity-
  checked against, not derived from, current numbers.
- **Single-window burn-rate alerts.** A short window alone still pages on blips; a long window
  alone is still too slow for a genuinely fast outage. The two-window pattern exists because
  neither alone solves the problem — a mistake people who learned single-threshold alerting
  sometimes reintroduce out of habit when first building burn-rate alerts.
- **Cause alerts still creeping back in as pages.** CPU and memory thresholds are just as tempting
  to page on as they always were; the discipline required to keep them as warnings, not pages,
  has not gotten any easier just because the framework around it improved.
- **On-call load still under-tracked.** SLOs improved *which* alerts fire; they do not automatically
  fix an unfair rotation or a chronically overloaded on-call person. That still needs deliberate
  management attention regardless of how good the alerting is.

:::callout{kind=bank-context}
An error budget is also a useful, concrete artefact for a regulator or auditor asking how a bank
balances release velocity against operational risk for a customer-facing system: it is a specific,
pre-agreed number rather than a post-hoc justification for why a risky change was allowed to ship.
:::

## Ten-minute drill

::::exercise{id=ex-modernise-threshold type=scenario title="Modernise a threshold alert"}
An existing alert reads: "page if checkout error rate exceeds 2% for 10 minutes." The team has
recently agreed an SLO of 99.5% availability over 30 days for checkout. Redesign this as SLO-based
burn-rate alerting, and say what changes in practice for the on-call engineer.
:::solution
The SLO implies a 0.5% base error budget over 30 days. Replace the flat 2%/10min threshold with a
two-window burn-rate alert: a fast-burn check (short window, e.g. 5m, and a matching longer window,
e.g. 1h, both exceeding roughly 14x the base rate, i.e. around 7%) that pages, and a slow-burn
check (a longer window, e.g. 6h, exceeding roughly 3x the base rate, around 1.5%) that files a
ticket instead of paging. In practice this means the on-call engineer is paged specifically when the
budget is being consumed fast enough to matter within the 30-day window — not on every excursion
above an arbitrary flat number — and gets a slower, less urgent signal for genuine but gradual
degradation, which the old single threshold could not distinguish.
:::
::::
