---
title: "Prometheus & Grafana in Production"
estimatedMinutes: 40
objectives:
  - "Write recording rules and know when a query belongs in one"
  - "Set retention and a high-availability approach appropriate to the stakes"
  - "Review a dashboard proposal against a real checklist instead of taste"
  - "Reason about the cost drivers of a Prometheus deployment at scale"
status: ready
---

You can read a `/metrics` endpoint and write a `rate()` query. This lesson is about running
Prometheus and Grafana as production infrastructure that a bank can depend on for incident response
and capacity planning, which raises questions a single-instance demo never has to answer.

## Where the basics break down

A single Prometheus server scraping a handful of services and a few Grafana dashboards works
without much thought. It breaks down along three axes as the system grows: **query cost** (a
complex PromQL expression recomputed from raw data on every dashboard load, by every viewer,
becomes slow and expensive at scale), **availability** (a single Prometheus instance is a single
point of failure for your ability to see what is happening, which is a bad place to be during an
incident), and **retention economics** (raw time-series data at full resolution, kept forever, does
not fit on one server's disk, and vertically scaling one box only goes so far).

:::engineer
The symptom is usually a Prometheus instance whose scrape duration or rule-evaluation duration
creeps upward (both are themselves Prometheus metrics: `scrape_duration_seconds`,
`prometheus_rule_group_last_duration_seconds`), then starts missing its own scrape interval, which
degrades every downstream alert and dashboard silently until someone notices gaps in a graph.
:::

:::manager
The failure mode to watch for: a Prometheus setup that worked fine in the pilot quietly becomes the
thing that falls over *during* a major incident, because incident-time is exactly when dashboard
load and query volume spike, and that is also exactly when you most need the system to still be
up. Load-test your observability stack's failure mode, not just the system it watches.
:::

## Recording rules

A **recording rule** precomputes an expensive or frequently-used query on a schedule and stores the
result as a new time series, so dashboards and alerts read a cheap precomputed value instead of
recomputing the expensive expression on every page load.

:::engineer
```yaml
groups:
  - name: checkout-slos
    interval: 30s
    rules:
      - record: job:http_requests:rate5m
        expr: sum by (job) (rate(http_requests_total[5m]))
      - record: job:http_error_ratio:rate5m
        expr: |
          sum by (job) (rate(http_requests_total{status=~"5.."}[5m]))
          /
          sum by (job) (rate(http_requests_total[5m]))
```
The naming convention `level:metric:operations` (here `job:http_error_ratio:rate5m`) is a
Prometheus community convention — it tells a reader at a glance what the aggregation level and the
applied function are, without opening the rule file.
:::

:::manager
Recording rules are a cheap, low-drama place to require review discipline: ask that every new
paging alert names the recording rule it queries in the pull request, not a raw expression. This
one small process step is what keeps "the alert" and "the dashboard" from quietly drifting apart
over time as queries are tweaked independently.
:::

:::callout{kind=decision title="When a query needs a recording rule"}
Rule of thumb: if a query is used in more than one dashboard panel or alert, or if it is expensive
enough that ad-hoc exploration of it feels slow, turn it into a recording rule. Alerts in particular
should almost always alert on a recording rule, not a raw expression — it keeps the alert evaluation
cheap and consistent with what the dashboard shows, so the number a person sees during an incident
matches the number that paged them.
:::

## Retention and high availability

Prometheus stores data on local disk by default, which does not survive a host failure and does not
scale indefinitely. Two separate decisions sit here: how long to keep data, and how to survive a
Prometheus instance dying.

For retention, common practice is short full-resolution retention on the primary Prometheus (weeks,
tuned to disk size and query needs) with a **remote-write** integration to a long-term storage
system (Thanos, Cortex/Mimir, or a managed vendor equivalent) that downsamples and retains data for
months or years at lower resolution, cheaply. For high availability, the standard pattern is running
two or more identically-configured Prometheus instances scraping the same targets independently —
not clustered, just duplicated — so a query tool (or Thanos/Mimir's query layer) can serve from
whichever instance answers, and a single instance failing does not blind you.

:::engineer
```yaml
# Primary Prometheus: short local retention, remote-writes everything onward
global:
  scrape_interval: 15s
storage:
  tsdb: { retention.time: 45d }
remote_write:
  - url: https://thanos-receive.internal/api/v1/receive
```
A second, identically configured Prometheus instance scraping the same targets (same config, no
shared state with the first) is the entire HA mechanism — no clustering software required, just
duplication plus a query layer that can read from either.
:::

:::manager
The two decisions map to two different risks and should be budgeted separately: retention length is
mostly a compliance and capacity-planning question (how far back do you need to look for a trend or
an audit?); HA is an incident-response question (can you see what is happening *right now* if one
component fails?). A team that has long retention but no HA can still be blind during the exact
moment they need visibility most.
:::

:::callout{kind=bank-context}
"How long is a metric kept, and can you show me the trend for a specific date six months ago" is a
realistic audit or post-incident-review question for a regulated system. Confirm your long-term
storage retention matches what the business, not just engineering, expects to be able to answer.
:::

## Dashboard design as a review discipline

The distinction between a dashboard "people actually use" and "wall art" is not taste; it is
whether the dashboard answers the questions asked during an actual incident, in the order they get
asked. A useful structure follows the golden signals (latency, traffic, errors, saturation) at the
top, with drill-down panels below for the specific dependencies most likely to be the cause when
something is wrong.

:::engineer
A dashboard review checklist, concretely:

- Top row: request rate, error rate (%), latency percentiles (p50/p95/p99, not average alone),
  saturation — all for the service itself, all time-windowed consistently (same range, same step).
- Below that: the two or three dependencies most likely to cause this service's incidents
  (database, downstream API, queue), each with its own error rate and latency.
- Every panel has a clear title stating what "bad" looks like, not just a metric name — "Error rate
  (target < 1%)" beats "http_requests_total{status=~'5..'}".
- No panel that nobody has looked at in the last quarter. Prune ruthlessly; a dashboard that takes
  ten seconds to visually scan under pressure is worth more than one with everything on it.
:::

:::manager
In a post-incident review, ask: "which dashboard did the first responder open, and did it answer
the question they needed in under a minute?" If the answer is "they had to build an ad-hoc query,"
that is a dashboard gap worth fixing before the next incident, not a one-off inconvenience.
:::

## Cost

Prometheus itself (self-hosted) has no licence cost, but is not free: it costs compute, storage, and
the engineering time to run recording rules, HA, and long-term storage well. Managed alternatives
(cloud-vendor Prometheus-compatible services, or SaaS metrics platforms) trade that operational cost
for a metered bill, usually priced on the number of active time series and query volume — which is
exactly why cardinality control (covered in logs-metrics-traces) has a direct line to the invoice
under a managed service, where a self-hosted setup would "only" show up as a slow query or a full
disk.

:::engineer
The single query worth running monthly regardless of self-hosted vs managed: total active series
count, and its trend over the last quarter (`count({__name__=~".+"})` against your metrics backend,
or the equivalent series-count metric a managed platform exposes). A steady climb disconnected from
new service launches is the earliest, cheapest-to-check signal of a cardinality problem.
:::

:::manager
Ask which pricing model a proposed metrics platform uses before approving it. Series-count pricing
punishes cardinality mistakes financially and immediately; a self-hosted, disk-bound setup punishes
them operationally and a little later. Either way, the standards from logs-metrics-traces about
cardinality budgets are what actually controls the cost — the tool choice mainly decides *how* the
overrun shows up.
:::

## What good looks like

- Every alert queries a recording rule, not a raw expensive expression, so alert evaluation is fast
  and consistent with what a dashboard shows.
- Retention is tiered: short full-resolution for operational queries, longer downsampled retention
  for trend and audit questions, sized deliberately rather than defaulted.
- At least two Prometheus replicas scrape every critical target independently; a single instance
  failing does not blind on-call during an incident.
- Every service's primary dashboard fits the golden-signals shape and has been opened during a real
  incident in the last quarter — not built once and forgotten.
- Metric cardinality growth is monitored and tied to a named owner per service, and cost or storage
  growth is reviewed against it before assuming organic traffic growth.

:::manager
Walk this list with one real, critical service in a review rather than treating it as an abstract
policy. Ask its owning team to show, not describe, each item — the recording rules an alert
actually queries, the HA replica count, the retention config. Evidence beats a verbal confirmation.
:::

:::engineer
Most of this list is directly queryable or config-visible: replica count and scrape config are in
the Prometheus configuration itself; recording-rule usage is visible in the alerting rules file;
series count and its trend come from the query in the Cost section above. None of it requires
trusting a status report.
:::

## Exercises

::::exercise{id=ex-ha-retention-scenario type=scenario title="A team proposes single-instance Prometheus"}
A team building a new payments microservice proposes a single Prometheus instance with 90 days of
local retention and no remote-write. What do you ask, and what would you require before this ships
to production?
:::solution
Ask: what happens to visibility during an incident if this one instance is unreachable or the host
it runs on fails — a real, not hypothetical, risk for a payments-critical service? Ask what the
disk-full failure mode looks like at 90 days of local retention as traffic grows, and whether that
has been tested. Require at minimum a second independently-scraping Prometheus instance for HA, and
a remote-write path to shared long-term storage so retention is not bound to one host's disk and
survives that host being rebuilt. A single, disk-bound instance for a payments service is a
visibility single point of failure precisely where you can least afford one.
:::
::::

::::exercise{id=ex-dashboard-audit type=design title="Audit a real dashboard"}
Pick (or imagine) a dashboard with 30+ panels built for a service launch. Using the checklist above,
decide what to keep, what to cut, and what is missing.
:::solution
Keep: the golden-signals row (rate, errors, latency percentiles, saturation) and panels for the two
or three most incident-relevant dependencies. Cut: per-instance breakdowns better suited to ad-hoc
exploration than a fixed dashboard, panels duplicating the same metric at different aggregations,
and anything nobody has referenced in the last quarter (check Grafana's panel view/usage data if
available). Likely missing: a clear "what does bad look like" threshold on each panel, and a link
or section pointing at the runbook for this service, so the dashboard is also the entry point into
the response, not just a picture.
:::
::::
