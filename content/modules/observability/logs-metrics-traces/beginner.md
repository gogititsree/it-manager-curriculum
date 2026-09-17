---
title: "Logging vs Metrics vs Tracing"
estimatedMinutes: 30
objectives:
  - "State the one question each of logs, metrics and traces answers"
  - "Recognise structured logging and explain why it beats free-text logging"
  - "Explain cardinality in plain terms and why it is a budget problem, not just a technical one"
  - "Describe what a correlation ID is for"
status: ready
---

You have been reading logs since before "observability" was a word — grepping an app server's
output at 2 a.m., tailing a file over SSH, staring at a Nagios dashboard that says a host is red.
That instinct is correct and still useful. What is new is that a modern system is made of dozens or
hundreds of small services instead of one big application, and no human can hold that system's
state in their head from logs alone. The three pillars — logs, metrics, traces — are the
vocabulary the industry settled on for the three different questions you need answered when
something is wrong and you do not yet know what.

## Why this exists

Picture a payment that fails somewhere between the mobile app, the API gateway, the payments
service, the fraud check and the ledger. With one monolithic application and one log file, you grep
for the transaction ID and read top to bottom. With fifteen services, each with its own log file,
its own host, and its own restart schedule, "grep the log" stops working: which of fifteen logs,
on which of possibly dozens of instances, at which of the fifteen different clocks? You need three
different tools, each answering a different question, stitched together by something that survives
the trip across all fifteen services. That stitching problem — not any single tool — is what
observability is actually about.

:::engineer
Concretely: a single request from a mobile app might touch a gateway, an auth service, a fraud
check, a ledger service and a notification service — five separately deployed, separately scaled
processes, possibly on five different hosts with five slightly different clocks. No single log
file, however carefully grepped, contains the full picture; the tooling has to be built to stitch
independent event streams back into one story.
:::

:::manager
The business case in one sentence: observability is what turns "the payments team is looking into
it" into "row 4821 in the ledger service failed a currency conversion at 14:32:07, here is the
exact input, and the fix ships in twenty minutes." The gap between those two sentences is measured
in hours of downtime and, at a bank, in incident reports you have to write.
:::

## The three pillars, one question each

- **Logs** answer: *what exactly happened, here, at this moment?* A log line is a discrete event
  with detail — an error message, a stack trace, the exact payload that failed validation.
- **Metrics** answer: *how is the system behaving over time, in aggregate?* A metric is a number
  that changes — requests per second, error rate, queue depth, CPU usage — cheap to store and cheap
  to query even years later, because you threw away the detail and kept the shape.
- **Traces** answer: *where did the time go, across which services, for this one request?* A trace
  follows a single request as it hops from service to service and shows you the timeline: 40ms in
  the gateway, 210ms in fraud check, 8ms in the ledger.

None of the three replaces the others. A dashboard (metrics) tells you error rate jumped at 14:32.
A trace for a failing request at 14:32 tells you it died in the fraud-check call. The log line from
the fraud-check service at 14:32:07 tells you exactly why: a null pointer on a missing field. You
typically use them in that order — metric flags the problem, trace localises it, log explains it.

:::engineer
A minimal mental model, side by side:

```text
LOG    14:32:07 ERROR fraud-svc  txn=8f21a "missing field: merchantCategoryCode" trace_id=b7e4...
METRIC fraud_svc_requests_total{status="error"} 1489  (a running counter, scraped every 15s)
TRACE  gateway(40ms) -> fraud-svc(210ms, ERROR) -> [ledger never called]   trace_id=b7e4...
```
The `trace_id` in the log line and the trace is what lets you jump from "error rate is up" to "here
is the exact broken request and the exact broken line" in three clicks instead of a war room.
:::

:::manager
When a team pitches an observability investment, ask which of the three pillars they are actually
short on. "We have dashboards but no way to find the one failing transaction" is a tracing and log-
correlation gap, not a metrics gap, and buying a better metrics tool will not fix it. Naming the
right pillar avoids funding the wrong tool.
:::

## Structured logging

A free-text log line — `Payment failed for user 4821 on card ending 4321` — is easy for a human to
read and nearly useless for a machine to search at scale. You cannot reliably ask "show me every
failure for merchant category code X in the last hour" against a sentence; you can ask it against a
field. **Structured logging** writes each log line as a set of key-value fields, usually JSON, so
that log storage and search tools can index and query it exactly like a database.

:::engineer
```json
{"ts":"2026-09-15T14:32:07Z","level":"error","service":"fraud-svc",
 "txn_id":"8f21a","user_id":"4821","reason":"missing field: merchantCategoryCode",
 "trace_id":"b7e4c1..."}
```
Same information as the free-text sentence, but every field is queryable, filterable and
aggregatable independently. Most logging libraries in every language now default to, or easily
support, JSON output — this is a configuration choice, not a rewrite.
:::

:::manager
Require structured logging as a platform standard, not a team preference. The return is concrete:
incident queries that took twenty minutes of grepping across hosts take twenty seconds against an
indexed field. The cost is small — it is a logging-library configuration change, not new code — but
it needs to be *mandated* because no individual team feels the pain of an inconsistent format; the
person who feels it is whoever is on call for the incident that spans five teams' logs.
:::

## Cardinality: the thing that silently destroys budgets

**Cardinality** is the number of distinct values a field can take. `http_method` has low
cardinality (GET, POST, PUT, DELETE — maybe ten values ever). `user_id` has high cardinality
(millions of values). `trace_id` has effectively unlimited cardinality — every value is unique.

This matters enormously for metrics specifically, because a metrics system stores a separate time
series for every unique combination of label values. A metric like `http_requests_total{method,
status, endpoint}` with 10 methods, 10 statuses and 50 endpoints is 5,000 time series — fine. Add
`user_id` as a label and it becomes millions of time series, most seen exactly once. The database
was not designed for that, and it will fall over or, worse, quietly become slow and expensive months
after nobody remembers adding the label.

:::manager
This is the single most common way a well-run observability platform gets an unexplained cost
spike or a mystery outage. It is a quiet, structural failure: nobody's individual change looks
wrong in review, and the bill or the incident shows up weeks later, disconnected from the cause.
The standard to set: **user IDs, transaction IDs, email addresses and free-text values never
become metric labels.** They belong in logs and traces, where each event is stored once, not in
metrics, where every unique combination multiplies the storage.
:::

:::engineer
Rule of thumb: before adding a label to a metric, ask "how many distinct values can this have,
across all time?" Under a few hundred: fine. Thousands: think hard. Millions (user ID, request
ID, raw email, IP address): never — put it in the log line or trace attribute instead, where it
belongs.
:::

:::callout{kind=bank-context}
PII discipline applies to all three pillars, not just databases. A `user_id` in a log line is
usually acceptable if access to logs is controlled and retention is bounded; a customer's full
name or account number in a log line, searchable by anyone with log access, is often a finding
in an audit. Agree what is loggable with your data-protection team before a platform standard
ships, not after an incident review surfaces it.
:::

## Sampling

Traces are expensive to store in full: a busy service generates a trace for every single request.
**Sampling** means keeping only a fraction of traces — say, 1 in 100 — while keeping all the
metrics (cheap, aggregated) and error logs (rare, worth keeping). A common and important refinement
is **tail-based sampling**: decide whether to keep a trace *after* seeing how it ended, so you keep
100% of the traces that errored or were slow, and only a sample of the boring, fast, successful
ones. That way rare failures are never the ones you sampled away.

:::manager
Ask any team proposing a tracing rollout what their sampling strategy is before asking what tool
they picked. "We keep everything" does not survive contact with real traffic volumes and a real
storage bill. "We sample 1% head-based" means you may lose exactly the slow, failing request you
needed during the next incident. Tail-based sampling, keeping all the interesting traces and a
sample of the rest, is the answer that scales and does not throw away the evidence you need.
:::

:::engineer
```text
Head-based sampling: decide at request start — "keep 1 in 100" — cheap, but may drop the one
  slow/failing request that mattered.
Tail-based sampling: decide after the request finishes — keep ~100% of errors and slow requests,
  a small percentage of the rest. Needs a buffering layer (often the collector) since the decision
  is made after the fact.
```
:::

## Correlation IDs

A **correlation ID** (also called a trace ID or request ID) is a single identifier generated when
a request first enters the system and passed along on every call to every downstream service, and
included in every log line written while handling that request. It is the thread that lets you
find the log lines, the trace, and eventually a metric spike, all belonging to the same one
customer action, across services owned by different teams.

:::engineer
The mechanics: the gateway generates a `trace_id` (or reads one already present, from a mobile app
or an upstream system), puts it in an HTTP header (commonly `traceparent` under the W3C standard,
covered in the OpenTelemetry topic), and every service that receives the header logs it and forwards
it to the next call. Nothing about this requires a specific vendor — it is a convention every
service must follow, which is why it has to be a platform mandate, not fifteen teams inventing their
own header name.
:::

:::manager
The correlation ID standard is only as strong as its weakest link. In a review, pick a request that
crosses a team boundary — ideally one that also crosses an asynchronous hop like a queue — and ask
someone to actually trace it end to end. This finds gaps a status report claiming "we have
distributed tracing" will not.
:::

## Cost

All three pillars cost money to store and query, but not in the same way or the same shape. Metrics
are cheap per data point but you pay for every distinct time series times how long you retain it —
this is why cardinality control matters so much. Logs are the most expensive per byte at scale
because you are often storing and indexing full free-text or JSON payloads for every request. Traces
sit in between, and sampling is the main lever that controls their cost. A team that turns on
verbose debug logging in production, traces every request at 100%, and lets metric cardinality grow
unchecked can turn an observability bill into a bigger line item than the infrastructure it is
watching.

:::manager
The three cost levers to know, in order of leverage: metric cardinality (can be a 10-100x
multiplier if it goes wrong), log verbosity and retention (linear but large), trace sampling rate
(directly proportional to storage). When a team's observability bill jumps, ask about a new label
before you ask about traffic growth — traffic growth is rarely 10x overnight; a cardinality mistake
often looks exactly like it.
:::

:::engineer
Three cheap checks that catch most cost problems early: a metrics query for the count of active
time series per job, growth of that count week over week; a log-volume-by-service dashboard,
watched for a sudden jump after a deploy; and a trace sampling rate that is actually configured
(not defaulted to "keep everything") for every high-traffic service.
:::

## Common mistakes

- Logging free text and hoping to grep it later at scale; structured fields are searchable, prose
  is not.
- Adding a high-cardinality field (user ID, email, raw URL with query string) as a metric label.
- No correlation ID, so an incident becomes "which of fifteen logs do I open first?"
- Tracing everything at 100% in a high-traffic service, or sampling so aggressively that the one
  failing request that matters was never kept.
- Treating the three pillars as competing choices ("we use metrics, we don't need logs") instead of
  complementary tools that answer different questions.

## Putting it together

::::exercise{id=ex-pick-pillar type=scenario title="Which pillar answers the question?"}
For each of these, say whether logs, metrics or traces is the *right first tool*, and why:

1. "Is checkout slower than usual this week?"
2. "This one customer's payment from 09:14 this morning failed — why?"
3. "Which of the six services in the checkout path is adding the most latency to a slow request?"
4. "How many distinct error types did the fraud service return yesterday?"
:::solution
1. **Metrics.** A time-series dashboard of latency/error rate over the week shows the trend without
   opening a single log line.
2. **Logs**, found via the correlation ID for that transaction — you need the exact detail for one
   event, not an aggregate.
3. **Traces.** You need the timeline across services for one request to see where the time went.
4. **Logs**, aggregated — this is a count of distinct structured values (an error-type field) over
   a time window, which a log query answers directly; note it is *not* a good metric label, because
   "error type" as free text is a cardinality risk if it is not a small, controlled enum.
:::
::::
