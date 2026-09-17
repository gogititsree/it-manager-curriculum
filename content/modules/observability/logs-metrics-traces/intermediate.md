---
title: "Logging, Metrics and Tracing: A Standard You Can Impose"
estimatedMinutes: 40
objectives:
  - "Write down a structured-logging standard several teams can actually follow"
  - "Explain cardinality budgets well enough to review a metrics proposal"
  - "Set a sampling and retention policy that survives an incident and an audit"
  - "Use correlation IDs to review whether a team's services are actually traceable end to end"
status: ready
---

You know what logs, metrics and traces are for. This lesson is about turning that into something
you can hand to five different teams and expect consistent, comparable output — which is the actual
job once you are the one setting standards rather than writing the logging call yourself.

## Where the basics break down

Every team, left alone, invents its own log format, its own metric names, and its own idea of what
counts as an error. In isolation each choice is reasonable. Across fifteen teams it means an
incident that spans three services needs three different query languages in your head, because
"status" means an HTTP code in one service's logs, an enum string in another's, and a boolean
`success` field in the third. None of this shows up in a code review, because a single service's
logging looks fine in isolation. It shows up at 2 a.m. when the person on call cannot correlate three
services' worth of evidence fast enough, and it shows up on the observability bill when nobody
owns cardinality across the fleet.

:::engineer
```text
service A log: {"status":"200", ...}
service B log: {"result":"SUCCESS", ...}
service C log: {"success":true, ...}
```
Three services, one concept, three field names and three value shapes. A query that answers "how
many requests failed across A, B and C in the last hour" now needs three separate expressions
instead of one — exactly the tax an incident under time pressure cannot afford.
:::

:::manager
The fix is not a better tool. It is a short, mandatory standards document — the kind you are about
to see the shape of below — plus a linter or CI check that enforces the parts that can be checked
mechanically (field names, required fields, log level usage). Standards a team can silently ignore
are not standards; they are suggestions that show up as inconsistency in the next incident review.
:::

## A structured-logging standard you can actually impose

The standard needs to be short enough that a team reads it in five minutes and specific enough that
two teams following it produce genuinely comparable logs. A workable minimum:

| Field | Required | Rule |
| --- | --- | --- |
| `ts` | yes | ISO 8601, UTC, milliseconds. Never local time. |
| `level` | yes | One of `debug`, `info`, `warn`, `error`. No custom levels. |
| `service` | yes | The deployable unit's name, matching its name in the service catalogue. |
| `trace_id` | yes, on any request-scoped log | Propagated, never generated per-line. |
| `message` | yes | Human-readable, but never the only place structured data lives. |
| free-form fields | yes, as needed | `snake_case`, primitive values only (no nested objects more than one level deep — they do not index well). |
| PII fields | conditional | Only fields on an approved allow-list; masked or tokenised otherwise. |

:::engineer
```json
{"ts":"2026-09-15T14:32:07.114Z","level":"error","service":"fraud-svc",
 "trace_id":"b7e4c1a9...","txn_id":"8f21a","user_id":"4821",
 "message":"rejected: missing field","field":"merchantCategoryCode"}
```
The field names are the contract. If `service` is `service_name` in one team's logs and `app` in
another's, every cross-service query has to know both, which does not scale past two teams. Put the
field list in a shared library (a logging wrapper each service imports) so the standard is enforced
by the dependency, not by memory.
:::

:::callout{kind=decision title="Document vs shared library"}
Enforce the standard with a shared logging library that every service must use, not a document
alone. A document gets read once at onboarding and drifts. A library that only accepts structured
calls (`log.error("rejected", Map.of("field", "merchantCategoryCode"))`) instead of a raw string
concatenation makes the non-compliant path harder to write than the compliant one.
:::

:::manager
Roll this out with a grace period and a visible exceptions list, not a hard cutover. Mandate the
standard for all new services immediately; give existing services a deadline with an owner named
per service, and track the list publicly so "we haven't migrated yet" is a visible, chased-down
line item rather than a silent gap discovered mid-incident.
:::

## Cardinality budgets

A cardinality budget is a number you set and review, not a one-off warning. A practical starting
point: cap the number of active time series per service, and require sign-off to raise it. Most
metrics backends can report "series churn" — how many new label combinations appeared in the last
hour — which is the earliest warning sign of a cardinality mistake, well before storage or cost
alarms fire.

:::engineer
```promql
# Series churn proxy: count of distinct label combinations for one metric
count(count by (le, method, status, endpoint) (http_request_duration_seconds_bucket))
```
Watch this number after every deploy. A sudden 100x jump almost always means a new label was added
with an unbounded value (a raw path instead of a route template, e.g. `/users/48213` instead of
`/users/:id`) rather than genuine new traffic.
:::

:::manager
Put a cardinality budget in the same category as a resource budget: reviewed quarterly, owned by a
named person per service, and part of the pre-production checklist for any new metric. The review
question that catches almost everything: "for this label, list the possible values." If the answer
is "it depends on the request," it is not a metric label.
:::

## Sampling and retention as one policy, not two

Sampling (what fraction of traces you keep) and retention (how long you keep what you have) are
usually set by two different teams for two different reasons — cost for one, compliance for the
other — and they need to be set together, because a short retention window undermines an incident
review and a long one for high-cardinality raw data becomes the largest line on the bill.

A workable default for a bank-scale system: metrics retained at full resolution for weeks, then
downsampled and kept for a year or more for capacity and trend reporting (metrics are cheap enough
to keep long). Logs retained at a length driven by regulatory and audit requirements for the data
involved, which is usually longer than engineering wants and shorter than compliance first asks for
— this is a negotiation, not a technical constant. Traces are the shortest-lived and most
aggressively sampled: keep 100% of error and slow traces (tail-based sampling), a small percentage
of the rest, for days to a few weeks, because their value is almost entirely for debugging the
recent past.

:::engineer
```yaml
# Example tiering, expressed as config a platform team would actually own
metrics:  { full_resolution: 45d, downsampled: 13mo }
logs:     { hot_queryable: 30d, cold_archive: 13mo, class: "transaction-record" }
traces:   { error_and_slow: 30d, sampled_rest_pct: 5, sampled_rest_retention: 14d }
```
Expressing retention as config, per data class, rather than a paragraph in a wiki, makes it
something a platform team can actually enforce and audit against, not just intend.
:::

:::callout{kind=bank-context}
Regulatory incident reporting windows (for example, a requirement to notify within a fixed number
of hours of a significant operational incident) are a retention *floor*, not a ceiling: whatever
window you must report within, your logs must still exist and be queryable for the full duration of
the investigation that follows, which is usually longer than the reporting deadline itself. Confirm
retention against your specific regulatory obligations before setting a platform-wide default; do
not assume one region's rule applies to another.
:::

:::manager
Ask any team's retention numbers in one sentence each, and ask who decided them. "We keep logs for
30 days because that is the default" is a red flag; "we keep logs for 13 months because compliance
requires 12 months of queryable history for this data class, plus a month's buffer" is a decision
you can defend in an audit.
:::

## Correlation IDs as a review checkpoint

A correlation ID standard is only as good as its weakest link: the one service in the chain that
does not propagate it, generates its own, or drops it at a queue boundary (a very common failure —
synchronous HTTP calls propagate headers naturally; a message dropped onto a Kafka topic does not,
unless someone deliberately puts the trace ID in the message envelope).

:::engineer
The checkpoints to review in any service:

1. On receiving a request: read the incoming trace ID header if present; generate one only if
   absent (i.e. this service is the entry point).
2. On every outbound call — HTTP, gRPC, or a message published to a queue — forward the trace ID,
   in the header for synchronous calls and in the message envelope for asynchronous ones.
3. In every log line written while handling the request: include the trace ID.
4. On receiving a message from a queue: read the trace ID from the envelope, not generate a fresh
   one, so the chain is not broken at the async boundary.
:::

:::manager
The review question: "pick a request that crosses a queue or an event bus, not just a synchronous
HTTP call, and trace it end to end." Correlation nearly always works across REST calls because HTTP
headers propagate by default in most frameworks; it nearly always breaks at the first queue,
because someone has to deliberately carry the ID into the message. That is where to spend review
time.
:::

## What good looks like — a checklist

- Every service uses the shared structured-logging library; no raw string concatenation for
  request-scoped events.
- A per-service cardinality budget exists, is reviewed, and series churn is monitored after every
  deploy.
- Retention for logs, metrics and traces is written down per data class, with the compliance basis
  named, not defaulted.
- Correlation IDs propagate across every hop including async ones, verified by tracing one real
  request through the chain, not by reading the code.
- PII fields in logs are on an explicit allow-list; nothing else request-derived is logged
  unmasked.
- A team's proposal for a new metric or a new log field states its cardinality and its owner before
  it ships, not after cost or an incident surfaces it.

:::manager
Use this checklist item by item across a quarterly review cycle rather than as a one-time audit —
pick one or two items, ask teams to demonstrate current state, and track gaps to closure with
owners and dates. An exhaustive one-off audit finds problems once; a rotating review finds drift
continuously, which is what actually matters here.
:::

:::engineer
A fast way to spot-check item four (correlation IDs across async hops) without reading every
service's code: pick a transaction that you know crosses a queue, search the trace backend for its
trace ID, and count the distinct services that appear. If the count is lower than the known number
of services the transaction actually touches, propagation is broken somewhere in between.
:::

## Exercises

::::exercise{id=ex-standards-review type=scenario title="A team's proposal"}
A team wants to add `customer_email` as a label on their `login_attempts_total` metric, "so we can
see login patterns per customer." What do you say, and what would you offer instead?
:::solution
Refuse the label: email is unbounded and often PII, and this would multiply the metric's series
count by roughly the customer base, likely millions, threatening both cost and the metrics
backend's stability. What they actually want — login patterns per customer — is a log-query or
analytics question, not a real-time aggregate metric. Offer: keep `login_attempts_total` bucketed
by low-cardinality dimensions (`result`, `auth_method`, `client_type`); log each attempt with
`customer_id` as a structured field so per-customer analysis runs against the log store or a
downstream analytics pipeline, where high-cardinality lookups are what the system is designed for.
:::
::::

::::exercise{id=ex-retention-policy type=design title="Draft a one-page retention policy"}
Draft a one-page policy: for logs, metrics and traces, what gets retained, for how long, at what
resolution, and who signs off on exceptions. Assume a payments system subject to a 12-month
audit-evidence requirement for transaction records.
:::solution
A reasonable shape: metrics at full resolution for 30-45 days, downsampled (e.g. 5-minute
aggregates) for 13 months for trend and capacity reporting. Logs containing transaction records at
full detail for 13 months to satisfy the audit requirement with a month's buffer, in a
cheaper/colder tier after the first 30-60 days of "hot" queryable storage for incident response;
non-transactional debug logs at a much shorter window (7-14 days) since they carry no audit
obligation. Traces: 100% of error/slow traces and a small sample of the rest, kept 14-30 days,
since their value is operational not evidential — if a trace's content is itself audit-relevant,
that data point belongs in a transaction log instead, not in trace storage. Sign-off for exceptions
sits with whoever owns the compliance relationship, not with engineering alone, because "how long"
is a shared decision, not a purely technical one.
:::
::::
