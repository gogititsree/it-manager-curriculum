---
title: "Logs, Metrics, Traces — Monitoring-Era Refresher"
estimatedMinutes: 15
objectives:
  - "Map Nagios/Zabbix-era monitoring vocabulary onto today's observability vocabulary"
  - "Know what changed and roughly when"
  - "Spot the two or three mistakes that still catch experienced infrastructure people"
status: ready
---

You ran Nagios or Zabbix, wrote check scripts, and knew exactly which host was down from a red cell
on a dashboard. That instinct — "watch the system, know when it breaks" — is exactly right and has
not changed. What changed is the shape of the systems you are watching (many small services instead
of a few big hosts) and the vocabulary the industry uses now. This is a translation, not a
re-education.

## What you probably remember

| You knew it as | Now called / done as |
| --- | --- |
| A Nagios/Zabbix check ("is this host up, is this disk full") | Still exists, but as one metric among thousands, not the whole picture |
| Threshold alert on CPU/disk/host-down | Still valid but now considered a weak signal; see alerting-design topic |
| One log file per host, `tail -f` and grep | Centralised, structured, indexed log aggregation across many hosts/containers |
| SNMP polling, agent-based checks | Metrics scraped over HTTP (Prometheus) or pushed via an SDK (OpenTelemetry) |
| A single "the app is slow" ticket | A trace showing exactly which of N services in the request path is slow |
| Vendor agent (APM tool's proprietary agent) | Vendor-neutral instrumentation standard (OpenTelemetry), vendor chooses the backend |

## What changed since

:::callout{kind=changed-since title="Monitoring became observability (roughly 2017-2020)"}
"Monitoring" watched for known failure modes you predefined (thresholds, checks). "Observability"
is the ability to ask arbitrary new questions about a system's internal state from its external
outputs, without having predicted the question in advance — because modern systems fail in ways
nobody anticipated, across service boundaries a single Nagios check never crossed. The three
pillars (logs, metrics, traces) are the toolkit; observability is the property they give you when
used together, not a fourth tool.
:::

:::callout{kind=changed-since title="One host per check -> one request across many services"}
Your check script asked "is this host healthy?" A modern request touches ten or more services, each
independently deployed and scaled, often on infrastructure that does not have a fixed hostname
(containers, serverless). A trace, not a per-host check, is now the tool for "why was this one
request slow" because there is no longer one host to look at.
:::

:::callout{kind=changed-since title="Free text logs -> structured, centralised logs"}
grep on one box became a query language (increasingly SQL-like or PromQL-like) against an indexed
store holding every service's logs, correlated by request. The shift is from "I know which file to
open" to "I know which field to filter on" — the skill moved from filesystem knowledge to schema
knowledge.
:::

:::callout{kind=changed-since title="Vendor APM agents -> OpenTelemetry (standardised roughly 2019 onward)"}
You likely knew one or more proprietary APM agents, each with its own instrumentation format and
lock-in. OpenTelemetry standardises the instrumentation API and wire protocol so the same
instrumented code can send data to any compliant backend. Covered in full in the opentelemetry
topic; the short version: instrumentation is no longer married to the vendor you pick.
:::

:::manager
The practical translation for you as a manager: your old instinct to demand "a dashboard that shows
the system is healthy" is still exactly correct. What you additionally need to demand now is that
the system is *traceable* — that when the dashboard goes red, someone can get from "error rate up"
to "this exact request, this exact service, this exact line" in minutes, across service boundaries
that did not exist in the monolith-and-a-few-hosts world. That capability is what "observability"
is buying you over "monitoring," and it is worth naming explicitly in what you require of teams.
:::

## Gotchas that still bite

- **Threshold-alert habits carried forward unchanged.** "Alert when CPU > 80%" made sense for a
  fixed fleet of hosts you owned outright; in an autoscaled, containerised world it is frequently
  noise — the system is designed to run hot and scale, and a flat threshold does not know that. See
  the alerting-design topic for symptom-based alternatives.
- **Assuming one dashboard equals full coverage.** A Nagios "all green" screen implied health.
  A modern metrics dashboard can be all green while a specific customer segment or a specific
  downstream dependency is failing, because the aggregate hides it. Check the granularity, not just
  the colour.
- **Treating logs, metrics and traces as separate tools chosen by separate teams**, the way an APM
  tool, a log shipper and a monitoring system used to be three separate procurements. They now need
  to share identifiers (the correlation ID) to be useful together; buying or building them in
  isolation reproduces the old silo problem in new tools.
- **Underestimating cardinality** because host-based monitoring never had the problem — a fixed
  fleet of a few hundred hosts is naturally low cardinality. A metric labelled by container ID,
  pod name, or user ID in a dynamic, autoscaled environment is a completely different, much larger
  number, and the old instinct that "labels are basically free" is now wrong.

:::callout{kind=bank-context}
If your audit evidence today is "the Nagios history shows the host was up," expect that to be
insufficient going forward: an auditor will increasingly ask for the specific transaction's trace
and structured log entry, not host-level uptime, because host uptime says nothing about whether
the one transaction that matters succeeded.
:::

## Ten-minute drill

::::exercise{id=ex-translate-check type=scenario title="Translate an old check into today's tools"}
You used to run a Nagios check: "alert if the batch settlement job has not produced its output file
by 06:00." Redesign this using logs/metrics/traces vocabulary for a modern, service-based batch
pipeline. What signal replaces the file-existence check, and what would you add that the old check
could never tell you?
:::solution
Replace the file-existence check with a metric emitted by the job itself on completion (e.g. a
`batch_job_last_success_timestamp` gauge, or a `batch_job_completed_total` counter with a `status`
label) scraped or pushed into the same metrics system as everything else, alerted on via "time since
last success exceeds threshold" rather than polling for a file. Add structured logs from each stage
of the pipeline with a correlation ID per batch run, so a failure two stages in can be traced to the
exact record or partition that caused it — something a binary file-exists check could never tell
you. If the pipeline spans multiple services (extract, transform, load, each independently
deployed), add a trace per batch run so you can see which stage consumed the time, exactly as you
would for a request-based system.
:::
::::
