---
title: "Alerting Design"
estimatedMinutes: 30
objectives:
  - "Distinguish a symptom alert from a cause alert and say why symptom alerts are the default"
  - "Describe what makes an alert good versus bad, concretely"
  - "Explain paging etiquette and why on-call health is a management responsibility"
  - "Read a runbook and say whether it would actually help at 2 a.m."
status: ready
---

You have carried a pager, or run a team that did. You know the feeling of an alert firing for
something that turned out not to matter, and the worse feeling of an outage nobody was paged for at
all. Alerting design is the discipline of making sure the right person is woken up for the right
reason, with enough information to act, and not woken up for anything else. Get it wrong and you
get either a 2 a.m. incident nobody was warned about, or a team that has learned to ignore its own
pager.

## Why this exists

A system emits thousands of signals. Most of them, most of the time, mean nothing actionable. If
you alert on everything that could possibly indicate a problem, you train the humans receiving
those alerts to stop trusting them — a phenomenon with a name, **alert fatigue**, and a well
documented consequence: real incidents get missed because they arrive indistinguishable from noise.
The job of alerting design is choosing, deliberately, the small set of signals that justify waking
a human up, and building everything else as a dashboard or a log query instead.

:::engineer
A rough industry rule of thumb: most of what a service exposes on `/metrics` should never page
anyone. Only a handful of signals per service — typically the ones tied directly to customer
experience — justify a page. Everything else belongs on a dashboard for investigation, or as a
lower-severity ticket, not an interrupt.
:::

:::manager
Every alert that pages someone has a cost measured in interrupted sleep, interrupted focus, and
slowly eroding trust in the system if it is wrong. Before approving a new page-worthy alert, ask:
"what does the person do differently, right now, because this fired, that they would not do
otherwise?" If there is no different action, it is not a paging alert — it is a dashboard metric at
most.
:::

## Symptom versus cause alerts

A **symptom alert** fires on something the customer would notice: error rate is elevated, requests
are timing out, the checkout flow is failing. A **cause alert** fires on an internal condition that
might, or might not, lead to a symptom: CPU is high, a disk is filling up, a queue is growing.

The default should be **symptom alerts**, because they directly answer the question that matters —
is the customer affected — and they survive changes to internal architecture (a new caching layer,
a re-platformed database) without needing to be rewritten. Cause alerts have a place, but as
**early warning** for a small number of known, slow-building problems (disk filling up over days),
not as the primary way you learn something is broken.

:::engineer
```yaml
# Symptom alert: fires on what the customer experiences
- alert: CheckoutErrorRateHigh
  expr: job:http_error_ratio:rate5m{job="checkout"} > 0.05
  for: 5m
  labels: { severity: page }
  annotations:
    summary: "Checkout error rate above 5% for 5 minutes"

# Cause alert: fires on an internal condition, useful as early warning only
- alert: CheckoutDiskFillingUp
  expr: predict_linear(node_disk_free_bytes{job="checkout"}[6h], 24*3600) < 0
  labels: { severity: warn }
  annotations:
    summary: "Disk predicted to fill within 24h at current rate"
```
Notice the severities differ: the symptom alert pages; the cause alert, a slow-building and
predictable problem, warns without waking anyone at 3 a.m. — there is time to act during business
hours.
:::

:::manager
A team whose alert list is mostly CPU, memory and disk thresholds (cause alerts) and has few or no
alerts tied to customer-visible error rate or latency (symptom alerts) has its priorities backwards.
Ask to see the alert list in a review; count how many are symptom versus cause. A healthy ratio
leans heavily toward symptom alerts for anything that pages.
:::

## What a good alert looks like

A good alert is: **actionable** (there is something to actually do), **urgent** (it justifies
interrupting someone now, not tomorrow), and **specific** (it says what is wrong and, ideally,
points at where to start). A bad alert is often one, or several, of: **noisy** (fires often for
conditions that self-resolve), **ambiguous** (title gives no idea what is actually wrong), or
**untunable** (nobody has permission or confidence to change its threshold, so everyone just learns
to ignore it).

:::engineer
```text
Bad:  "High CPU on host-42"
      — is this a problem? for whom? what do I do?

Good: "Checkout error rate 8% (threshold 5%) for 6 minutes — customer-facing.
       Runbook: <link>. Recent deploy: <link>. Dashboard: <link>."
      — tells you it matters, for how long, and where to start.
```
:::

:::manager
When reviewing an alert list, read the alert titles alone, without opening any of them. If you
cannot tell from the title which are urgent and which are informational, the on-call team cannot
either at 3 a.m. Titles and severities are worth a review pass on their own, independent of whether
the underlying thresholds are correct.
:::

:::callout{kind=gotcha title="The most common alerting mistake"}
Alerting on a raw threshold with no duration ("`error_rate > 5%`" with no `for:` clause) fires on
every brief blip and trains people to ignore the alert. Almost every symptom alert should require
the condition to hold for a sustained window (a few minutes, tuned to the service) before paging —
this alone eliminates a large fraction of noisy pages.
:::

## Runbooks

A **runbook** is a short, specific document linked directly from the alert that tells the responder
what to check first, what "normal" looks like for this alert, and what to do if the obvious fix does
not work. A runbook that says "investigate the issue" is not a runbook. A useful one names the exact
dashboard to open, the exact log query to run, and the two or three most likely causes based on
history.

:::engineer
```text
## Runbook: CheckoutErrorRateHigh
1. Open dashboard: <link> — check whether error rate is isolated to one endpoint or fleet-wide.
2. Check recent deploys: <link> — a deploy in the last 30 minutes is the most common cause.
3. Run: SELECT status, count(*) FROM logs WHERE service='checkout' AND ts > now()-'10m'
   GROUP BY status — isolate which error dominates.
4. If a bad deploy: roll back via <link>. If not: escalate to #checkout-oncall.
```
A runbook this specific turns "investigate" into a sequence anyone on the rotation can execute.
:::

:::manager
Ask, for your team's top five paging alerts, whether each has a runbook a person who has never seen
this exact incident before could follow at 3 a.m. and make real progress with. If the honest answer
depends on one specific senior engineer being awake, that is a single point of failure in your
incident response, not a documentation nice-to-have.
:::

## Paging etiquette and on-call health

Paging etiquette covers who gets paged, when, and how the load is shared. A few concrete practices:
page only for symptom-level, customer-affecting problems outside business hours; escalate
automatically if the first responder does not acknowledge within a set window, rather than relying
on them to ask for help; rotate on-call fairly and track how often each person is actually paged,
not just who is scheduled.

:::engineer
```yaml
# Escalation policy: page primary, escalate automatically if unacknowledged
escalation_policy:
  - target: primary-oncall
    ack_timeout: 5m
  - target: secondary-oncall
    ack_timeout: 5m
  - target: team-lead
```
Automatic escalation removes the failure mode where a missed page (phone on silent, no signal)
means nobody responds until someone else happens to notice.
:::

:::callout{kind=bank-context}
For systems with regulatory incident-reporting obligations, the time from "problem starts" to
"someone competent is actively working it" is not just an operational metric — it is often the
clock the regulatory reporting window is measured against. Good alerting design is directly load-
bearing for meeting those deadlines, not a separate concern from compliance.
:::

:::manager
On-call health is a genuine management responsibility, not something that takes care of itself.
Track pages per person per week, and specifically pages outside working hours; a rotation where one
person is paged every night is heading toward burnout and eventual attrition, and it usually
reflects an alerting design problem (too noisy, poorly load-balanced) more than a staffing problem.
Review this the same way you would review any other workload metric — regularly, and before someone
quits over it.
:::

## Common mistakes

- Alerting on every metric that could theoretically indicate a problem, producing so much noise
  that real incidents get missed among false ones.
- No `for:` duration on threshold alerts, so brief, self-resolving blips page someone unnecessarily.
- Cause alerts (CPU, memory) treated as primary paging signals instead of early warning.
- A runbook link that goes to a wiki page last edited two years ago, or to nothing at all.
- On-call load concentrated on one or two people because nobody is tracking pages per person.

## Putting it together

::::exercise{id=ex-alert-review type=design title="Review an alert for quality"}
You are handed this alert: `alert: HighMemory, expr: memory_used_percent > 80, severity: page`, no
`for:` clause, no runbook link, no annotation. Rewrite it as a good alert, or argue it should not
page at all.
:::solution
Memory usage alone is a cause alert, not a symptom — high memory does not necessarily mean customers
are affected (the service may run comfortably at 80%+ by design). Before rewriting, ask what memory
pressure actually causes downstream (OOM kills? Increased latency? Nothing, because it auto-scales?).
If it genuinely predicts customer-visible failure, keep it but as a `severity: warn` early-warning
signal with a `for:` window and a trend check (is it climbing toward a known failure point, not just
crossing 80%), not a page. If it does not reliably predict customer impact, remove it as a paging
alert entirely and replace it with the symptom-level alert (error rate, latency, restart count) that
actually reflects what would go wrong for a customer. Either way, add a runbook link and a clear
annotation stating what the threshold means and what to check first.
:::
::::
