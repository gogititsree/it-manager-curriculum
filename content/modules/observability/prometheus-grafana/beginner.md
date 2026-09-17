---
title: "Prometheus & Grafana"
estimatedMinutes: 35
objectives:
  - "Explain the pull model and why it surprised people who knew push-based monitoring"
  - "Distinguish the four Prometheus metric types and when to use each"
  - "Read a basic PromQL query, including rate()"
  - "Describe what makes a dashboard useful versus decorative"
status: ready
---

Prometheus is the metrics database almost every modern system is built on, and Grafana is the
dashboard tool almost everyone points at it. Together they are the default answer to "how do I see
what my system is doing right now and over the last month." If you configured SNMP polling or wrote
Nagios checks, the concepts here will feel familiar; the mechanics are different enough to be worth
learning properly rather than assumed.

## Why this exists

Older monitoring tools generally worked by **pushing**: an agent on each host sent its metrics to a
central collector, or a script ran a check and reported its result. This means the collector has to
trust, receive and process whatever arrives, from however many agents happen to be running, and if
an agent crashes silently the collector may never notice — no data arriving looks the same as no
problem existing. Prometheus inverted this: it **pulls**. The central system reaches out to each
service on a schedule and asks "what are your current numbers?" If a service does not answer,
Prometheus knows immediately, because the absence of a successful scrape is itself a signal.

:::engineer
Concretely, a scrape failure shows up as a metric of its own: Prometheus sets `up{job="..."}` to 0
for that target. You can alert on `up == 0` directly, which is something a purely push-based system
has no equivalent for — there, silence and health look identical until something else notices the
data stopped arriving.
:::

:::manager
The pull model is also an operational simplification worth knowing about: you configure *where to
scrape from* centrally, rather than configuring *where to push to* on every single service. Adding
a new service to monitoring is a one-line addition to Prometheus's target list, not a config change
rolled out to that service. This is one reason the model spread so fast once containers and
autoscaling made the number of things to monitor much larger and more dynamic.
:::

## The pull model

Every service exposes an HTTP endpoint, conventionally `/metrics`, that returns its current numbers
as plain text when asked. Prometheus is configured with a list of targets (or a way to discover
them automatically — from Kubernetes, from a cloud provider's service registry) and, on a fixed
interval (commonly every 15 or 30 seconds), makes an HTTP GET request to each target's `/metrics`
endpoint and stores what comes back.

:::engineer
```text
# What a service's /metrics endpoint returns (plain text, human-readable)
# HELP http_requests_total Total HTTP requests
# TYPE http_requests_total counter
http_requests_total{method="GET",status="200"} 184223
http_requests_total{method="GET",status="500"} 41
```
Nothing here requires a Prometheus-specific library beyond exposing this format — many languages
have a client library that maintains these counters in memory and serves this page for you.
:::

:::manager
The practical management question the pull model raises: who is responsible for making sure a
service's `/metrics` endpoint exists, is registered as a scrape target, and stays that way as
services are added or retired? Left informal, this is exactly the kind of thing that quietly
degrades — a new service goes live unmonitored because nobody added it to the target list.
:::

:::callout{kind=tip title="Why 'pull surprised everyone'"}
People coming from push-based tools (StatsD, many APM agents, SNMP traps) often assume pull cannot
scale or cannot reach short-lived jobs. Both are manageable: Prometheus scales by federation and
sharding for very large fleets, and short-lived jobs (batch jobs, cron tasks) use a **Pushgateway**
— a small intermediary that a job pushes its final result to once, which Prometheus then scrapes
like any other target. Pull is the default; push is the documented exception, not the norm.
:::

## The four metric types

- **Counter**: a number that only goes up (or resets to zero on restart) — total requests, total
  errors. You almost never read a counter's raw value; you read its *rate of change*.
- **Gauge**: a number that goes up and down — current memory usage, queue depth, number of active
  connections. You read a gauge's value directly.
- **Histogram**: counts observations (like request durations) into configurable buckets, plus a
  running sum and count — lets you compute percentiles and averages after the fact from stored
  data, without deciding on the percentile ahead of time.
- **Summary**: similar to a histogram but calculates quantiles (percentiles) client-side before
  they reach Prometheus. Cheaper to query, but the percentiles cannot be aggregated correctly
  across multiple instances, which is a serious limitation in a scaled-out service. Histograms are
  now the generally preferred choice for latency; summaries are mostly seen in older instrumentation.

:::engineer
```text
# Counter: only increases
http_requests_total{status="200"} 184223

# Gauge: goes up and down
queue_depth 42

# Histogram: bucketed observations, plus _sum and _count
http_request_duration_seconds_bucket{le="0.1"} 9200
http_request_duration_seconds_bucket{le="0.5"} 9800
http_request_duration_seconds_bucket{le="+Inf"} 10000
http_request_duration_seconds_sum 812.4
http_request_duration_seconds_count 10000
```
`le` means "less than or equal to" — the bucket labelled `0.5` counts every request that took 0.5
seconds or less. This shape is what lets PromQL compute a percentile across many instances later.
:::

:::manager
When reviewing a team's instrumentation plan, the question that matters is "counter, gauge or
histogram, and why" for each metric. A latency number stored as a gauge (last value only, no
distribution) cannot tell you about the slow 1% of requests that a histogram would show — this is a
common instrumentation mistake with real consequences during an incident review, where "average
latency looked fine" turns out to be hiding a real problem in the tail.
:::

## PromQL basics, and why rate() exists

PromQL is Prometheus's query language. The single most important function to understand is
`rate()`, because counters are cumulative totals, and a cumulative total is almost never the number
you actually want.

:::engineer
```promql
# The raw counter: a huge, ever-increasing number, not directly useful
http_requests_total{status="500"}

# rate(): per-second average rate of increase over the last 5 minutes — this is what you want
rate(http_requests_total{status="500"}[5m])

# Turn that into a percentage of all requests
sum(rate(http_requests_total{status="500"}[5m]))
  /
sum(rate(http_requests_total[5m]))
```
`rate()` also correctly handles counter resets (a service restarting resets its counter to zero) —
computing the difference between two raw readings yourself would show a nonsensical negative
number across a restart; `rate()` detects and corrects for it.
:::

:::callout{kind=gotcha title="Why not just subtract two readings?"}
It is tempting to read a counter now, read it again in five minutes, and subtract. This breaks the
moment the service restarts (counter resets to zero, producing a negative and wrong result) and
does not smooth over scrape jitter. `rate()` is not a convenience; it is the correct way to turn a
counter into a rate, full stop.
:::

:::manager
You do not need to write PromQL yourself, but recognising `rate(...[5m])` as the normal, correct
shape of a query lets you spot a red flag in a review: a dashboard or alert querying a raw counter
with no `rate()` wrapped around it is very likely showing a meaningless, ever-climbing number
instead of the trend it was meant to show.
:::

## Grafana: dashboards people actually use

Grafana is a visualisation layer that queries Prometheus (and other data sources) and renders
graphs, tables and single-value panels into dashboards. The tool is not the hard part; deciding
what belongs on a dashboard is.

A dashboard people actually use during an incident answers, at a glance: is the system serving
requests successfully (error rate), is it fast enough (latency, ideally as a distribution not just
an average), and is it under resource pressure (saturation — queue depth, CPU, memory). This is
close to the "four golden signals" idea from Google's SRE work: latency, traffic, errors,
saturation. A dashboard with fifty panels covering every metric a service exposes is not more
useful than one with six — it is a wall of numbers nobody can scan under pressure.

:::manager
"Wall art" dashboards — built once for a launch review, full of green numbers, never opened during
an actual incident — are a common and wasteful pattern. The test: ask the on-call rotation which
dashboard they actually open first when paged. If the answer is not the one leadership was shown
last quarter, that is worth knowing, and worth asking teams to consolidate toward the one that
gets used.
:::

:::engineer
A minimal dashboard for one service, as a starting template: request rate, error rate (as a
percentage, using the ratio query above), latency as a histogram-derived percentile (p50, p95, p99
lines, not a single average), and a saturation panel relevant to the service (queue depth, DB
connection pool usage, memory). Four to six panels, not fifty.
:::

## Common mistakes

- Reading a counter's raw value instead of wrapping it in `rate()`.
- Building a summary metric (client-side percentile) for a service that runs many replicas, then
  trying to average the percentiles across replicas — this is not mathematically valid; use a
  histogram and let PromQL compute the percentile across all the raw bucket data instead.
- A dashboard with every available metric on it, so nothing stands out during an incident.
- Assuming pull cannot monitor short-lived batch jobs, and therefore not monitoring them at all,
  instead of using a Pushgateway.
- Choosing a gauge for something that should be a counter (or vice versa), which quietly breaks
  every `rate()`-based query and every alert built on it.

## Putting it together

::::exercise{id=ex-pick-metric-type type=design title="Pick the metric type"}
For a checkout service, decide counter, gauge or histogram for each, and say why:

1. Total number of checkout attempts.
2. Current number of items in the shopping-cart abandonment queue.
3. How long each checkout API call takes.
4. Whether the payment gateway integration is currently marked healthy or unhealthy.
:::solution
1. **Counter** — only increases; you query it with `rate()` to get attempts per second.
2. **Gauge** — goes up and down as items enter and leave the queue; you read its current value
   directly.
3. **Histogram** — you want the distribution (p50/p95/p99), not just an average, since tail latency
   is usually what matters during an incident.
4. **Gauge**, typically `1` for healthy and `0` for unhealthy — a boolean-like state that changes
   over time, read directly rather than rated.
:::
::::
