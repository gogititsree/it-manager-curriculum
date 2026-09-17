---
title: "Prometheus & Grafana — Nagios/Zabbix-Era Refresher"
estimatedMinutes: 15
objectives:
  - "Map Nagios/Zabbix concepts onto Prometheus/Grafana equivalents"
  - "Know what changed in the metrics-and-dashboarding world and roughly when"
  - "Spot the mistakes an experienced infra person makes on first contact with PromQL"
status: ready
---

You configured Nagios checks and NRPE plugins, or Zabbix templates and triggers, and built MRTG or
Cacti graphs from SNMP polling. Prometheus and Grafana solve the same core problem — know the
system's state, alert when it is bad, graph it over time — with a different architecture. The
instincts about what matters (thresholds, trends, dashboards) transfer directly; the mechanics do
not.

## What you probably remember

| You knew it as | Prometheus/Grafana equivalent |
| --- | --- |
| Nagios/Zabbix agent pushing or being polled via NRPE/SNMP | Prometheus pulls a `/metrics` HTTP endpoint on a schedule; short-lived jobs push once to a Pushgateway |
| Zabbix trigger / Nagios check threshold | PromQL alerting rule, evaluated against a query, often via Alertmanager |
| MRTG/Cacti graph from an RRD | Grafana panel querying Prometheus (no RRD; raw time series retained) |
| Templates applied per host group | Service discovery + relabeling; scrape targets found automatically, not hand-listed |
| "The host is down" (host-centric) | A target failing to scrape (`up == 0`) is one signal among many app-level metrics |
| Cacti's fixed graph types | PromQL: any aggregation, ratio or function you can express in the query language, computed on demand |

## What changed since

:::callout{kind=changed-since title="Push/poll agents -> pull over HTTP (Prometheus, first released 2012, CNCF since 2016)"}
Instead of configuring where each host sends its data (push) or which OIDs to poll via SNMP,
services expose a plain-text HTTP endpoint and Prometheus scrapes it. Adding a target is a
configuration change on the Prometheus side (or, more often now, automatic via service discovery),
not a rollout to every monitored host.
:::

:::callout{kind=changed-since title="RRD fixed-resolution graphs -> raw time series + PromQL"}
Cacti and MRTG stored data in a round-robin database that pre-decided its resolution and rollup
behaviour when the graph was created. Prometheus stores raw samples and lets you write any query —
rate, percentile, ratio, join across metrics — at read time, against Grafana panels you can change
without re-provisioning a data collection pipeline.
:::

:::callout{kind=changed-since title="Static host lists -> service discovery"}
You maintained host groups and templates by hand, or synced them from a CMDB. Prometheus commonly
discovers targets automatically from Kubernetes, a cloud provider's API, or a service registry, and
relabels them into the labels you query on — necessary once the "hosts" are containers that live for
minutes, not servers that live for years.
:::

:::callout{kind=changed-since title="Threshold checks -> multi-dimensional labels"}
A Zabbix trigger typically watched one host, one item. A Prometheus metric carries labels
(`service`, `region`, `instance`, `status`) so one query can aggregate or slice across any
combination — "error rate for this service, in this region, across all instances" — without a
separate check per combination you might care about.
:::

:::manager
The management-relevant change: your old world let you monitor a roughly fixed inventory of hosts
you controlled the list of. The new world assumes the inventory changes constantly (containers
scaling up and down within minutes) and is built around that from the ground up. If a team still
maintains a hand-curated list of "things to monitor," that is itself a sign they have not actually
adopted the model, whatever tool the dashboard says it is running.
:::

## Gotchas that still bite

- **Reading a counter's raw value**, the way you'd read a Cacti graph's current line height. A raw
  Prometheus counter is a large, ever-increasing number; you almost always need `rate()` to get a
  useful per-second figure, and forgetting this produces graphs that are technically correct and
  practically meaningless.
- **Treating a scrape failure the same as "host down."** `up == 0` in Prometheus means the last
  scrape of that target failed — could be the service down, could be a network blip, could be the
  service too slow to respond in time. It is a weaker, noisier signal than a Nagios host-down check
  and needs the same "for" duration discipline (don't alert on one missed scrape) covered in
  alerting-design.
- **Assuming everything must be a dashboard**, the Cacti-era habit of one graph per metric. Most
  metrics are for ad-hoc PromQL exploration during an investigation, not a permanent dashboard
  panel; only the golden-signal metrics for a service earn a permanent spot.
- **Building alerts on raw PromQL expressions instead of recording rules**, which is invisible
  until the query gets expensive at scale and either slows evaluation or silently disagrees with
  what a dashboard using a different (but supposedly equivalent) expression shows.

:::callout{kind=bank-context}
If your current audit evidence is a Cacti graph screenshot glued into a report, expect this to be
replaced by an auditor's own PromQL query or a Grafana panel with a shareable link — evidence
becomes reproducible and queryable rather than a static image, which is generally an improvement
but does mean the underlying retention and access controls need to be right.
:::

## Ten-minute drill

::::exercise{id=ex-write-promql type=code title="Write the PromQL"}
Given a counter `http_requests_total{service, status}` scraped every 15s, write the query for: the
percentage of requests returning a 5xx status, over the last 5 minutes, for the `checkout` service.
Then say what changes if this needs to run efficiently as an alert evaluated every 30 seconds across
fifty services.
:::solution
```promql
sum(rate(http_requests_total{service="checkout", status=~"5.."}[5m]))
  /
sum(rate(http_requests_total{service="checkout"}[5m]))
```
For fifty services evaluated every 30 seconds as alerts: turn the per-service ratio into a
recording rule computed once on a schedule (e.g. `service:http_error_ratio:rate5m`), grouped by
`service` rather than repeated fifty times with a hardcoded name, and alert against the recorded
metric. This keeps alert evaluation cheap and consistent, and is the direct PromQL equivalent of
moving from fifty hand-written Zabbix triggers to one templated trigger applied across a host
group.
:::
::::
