---
title: "OpenTelemetry"
estimatedMinutes: 30
objectives:
  - "Explain what OpenTelemetry standardises and what it deliberately does not"
  - "Distinguish the API, SDK, protocol and collector, and what each does"
  - "Explain SDK-only versus collector-based deployment at a basic level"
  - "Describe why vendor-neutral instrumentation matters to a procurement decision"
status: ready
---

If you worked with an APM tool in the last fifteen years — AppDynamics, Dynatrace, New Relic, or an
in-house agent — you instrumented your code against that vendor's proprietary library. Switching
vendors meant re-instrumenting every service. OpenTelemetry (often shortened to OTel) is the
industry's answer to that problem: a single, vendor-neutral standard for producing telemetry data
(traces, metrics, logs), so the instrumentation in your code stops being tied to which backend you
send it to.

## Why this exists

Before OpenTelemetry, "add tracing to our services" meant picking a vendor first, because the
instrumentation code you wrote — the calls that say "a span started here, this attribute matters" —
were specific to that vendor's SDK. If the bank later wanted to switch vendors, or run two
(on-premises tooling plus a cloud vendor during a migration), every team's code had to change.
OpenTelemetry separates "how do I describe what my code is doing" from "where does that description
get sent," which is exactly the kind of decoupling that makes a large organisation's tooling
decisions reversible instead of permanent.

:::engineer
Concretely: before OTel, a Java service instrumented with one vendor's agent might call
`vendorSdk.startTransaction(name)`; a service instrumented with another vendor's agent called a
completely different method with a different shape. With OTel, both call the same
`Tracer.spanBuilder(name).startSpan()` from the OTel API — the vendor difference moves entirely
into configuration (which SDK exporter is wired up), out of the application code.
:::

:::manager
This is a procurement and vendor-risk argument as much as a technical one: instrumenting against
OpenTelemetry means the observability *backend* — Grafana, Datadog, a cloud vendor's APM,
whatever — becomes a swappable choice made later, evaluated on price and features, rather than a
decision baked irreversibly into every service's source code on day one. Say this explicitly when
justifying an OTel standard to people who do not write code: it converts a one-way door into a
two-way one.
:::

## What OpenTelemetry actually standardises

OpenTelemetry is not one product; it is a specification plus reference implementations, with four
distinct pieces worth naming separately:

- **API**: the set of calls your code makes — "start a span," "record this metric," "add this
  attribute." Stable, and what your application code depends on directly.
- **SDK**: the implementation behind the API in a given language — batches data, applies sampling,
  exports it. Configured, not usually called directly by application code.
- **Protocol (OTLP)**: the wire format and network protocol telemetry is sent in, regardless of
  language or backend — this is what makes the data portable between vendors.
- **Collector**: an optional, separate process that receives telemetry (often via OTLP), can
  transform, filter, batch, or route it, and forwards it to one or more backends.

:::engineer
```text
Your code  --calls-->  OTel API  --implemented by-->  OTel SDK
                                                          |
                                                   exports via OTLP
                                                          |
                                                          v
                                         [ optional: OTel Collector ] --> Backend(s)
```
The API is the only thing your application code needs to know about. Everything after it — SDK
configuration, whether a collector sits in between, which backend receives the data — is
infrastructure configuration, changeable without touching application code.
:::

:::manager
When a team says "we're instrumenting with OpenTelemetry," ask which of the four pieces they mean —
usually it is just the API and SDK, which is a real and useful start, but the vendor-neutrality
benefit is not complete until a collector sits between services and the backend. The two are often
conflated in status updates.
:::

:::callout{kind=tip title="What OpenTelemetry deliberately does not standardise"}
OTel does not provide a storage backend, a query language, or a dashboard — that is Prometheus,
Grafana, or a commercial vendor's job. It standardises the production and transport of telemetry,
not what you do with it once it arrives. This scope boundary is intentional and is why it works
alongside Prometheus rather than replacing it.
:::

## Context propagation

**Context propagation** is the mechanism that lets a trace follow a request across service
boundaries — the same underlying idea as the correlation ID from logs-metrics-traces, but
standardised so different services, written by different teams in different languages, agree on
the exact header format. The dominant standard is the **W3C Trace Context** specification, carried
in an HTTP header called `traceparent`.

:::engineer
```text
traceparent: 00-b7e4c1a9d3f2e8...-a3f8e1c2...-01
             │  └─ trace ID (32 hex)  └─ span ID (16 hex) └─ flags
```
When service A calls service B, A's OTel SDK adds this header automatically (via instrumentation of
the HTTP client); B's OTel SDK reads it automatically (via instrumentation of the HTTP server) and
continues the same trace instead of starting a new one. Neither team writes this header-handling
code by hand — it comes from using OTel's automatic instrumentation for common frameworks and
libraries.
:::

Before this was standardised, a bank running services from several vendors, or several internal
teams with different conventions, often had no reliable way to correlate a request across all of
them — each tool used its own header name and ID format, if it propagated anything at all.
Standardising on W3C Trace Context means a request that touches a mainframe integration layer, a
cloud-native microservice and a third-party payment gateway, each instrumented independently, can
still be followed as one trace as long as each hop respects the same header, regardless of who
built it or which language it is written in.

:::manager
Context propagation is the thing that fails silently and expensively. A team that adds a new
internal HTTP client library, a message queue, or a batch job without OTel instrumentation breaks
the chain at exactly that point — traces stop there, and nobody sees an error, they just see a
trace that mysteriously ends. This is worth asking about directly for any new integration point,
not assumed to "just work" because most calls do.
:::

## SDK vs collector: two deployment shapes

The simplest setup has each service's OTel SDK exporting directly to a backend. This works, but it
means every service needs to know the backend's address and credentials, and any change to
sampling, filtering, or routing logic means redeploying every service. The alternative runs an
**OpenTelemetry Collector** — usually one per host, cluster, or region — that receives data from all
local services and centralises the decisions about where it goes and how it is processed.

:::engineer
```text
# Direct export (simple, but every service configures the backend)
service --OTLP--> backend

# Via collector (one place to change routing, sampling, filtering)
service --OTLP--> collector --> backend A
                             --> backend B (e.g. during a vendor migration)
```
A collector can also do tail-based sampling (keep errors and slow traces, sample the rest — see
logs-metrics-traces), strip sensitive attributes before export, and add or rewrite attributes
centrally, none of which needs to be coded into every individual service.
:::

:::manager
The collector is where a platform team earns its keep: it turns "fifty services each configured to
talk to a specific vendor" into "fifty services that talk to one internal endpoint, and the
platform team changes vendors, adds filtering, or enforces PII stripping in one place." This is
also usually where a bank enforces data residency or masking rules centrally rather than trusting
every team to do it correctly in application code.
:::

## The vendor-neutrality argument for procurement

When evaluating an observability vendor, instrumenting against OpenTelemetry means the vendor
evaluation and the instrumentation work are separate projects. You can pilot a new vendor by
pointing the collector's output at them, in parallel with the existing backend, without touching a
single service's code — because the instrumentation was never vendor-specific to begin with.

:::engineer
In practice this is a one-line change to the collector's exporter configuration — adding a second
`exporters` entry and listing it alongside the existing one in the pipeline — rather than a change
requiring any service to be rebuilt or redeployed. The intermediate lesson shows the full
configuration shape.
:::

:::manager
Treat this as a concrete, demonstrable claim rather than an assertion: before signing a multi-year
vendor commitment, ask the team to actually run a short parallel-export pilot to a second backend,
proving the switching cost is a config change, not a project.
:::

:::callout{kind=bank-context}
Vendor lock-in is itself a risk a procurement or vendor-risk function will ask about. "Our
instrumentation is OpenTelemetry-based; switching backends means a collector configuration change,
not re-instrumenting services" is a materially stronger answer than "our tracing is built on
[Vendor]'s proprietary agent throughout the codebase," and is worth having ready before that
question is asked in a renewal negotiation.
:::

## Common mistakes

- Assuming "we adopted OpenTelemetry" means data automatically flows everywhere — automatic
  instrumentation covers common frameworks; a custom internal library, a queue, or a batch job
  usually needs explicit instrumentation added.
- Treating the collector as optional complexity to skip, then discovering every service is
  hard-coded to one vendor's endpoint when a vendor change is needed.
- Not planning for context propagation across asynchronous boundaries (queues, batch jobs) — the
  same failure mode as correlation IDs generally, and it breaks the same way.
- Rolling OTel out inconsistently across teams so some services are instrumented and some are not,
  leaving traces with gaps exactly where they are hardest to explain.
- Confusing "we use the OTel API" with "we are vendor-neutral in practice." If every service still
  exports directly to one vendor's endpoint with no collector in between, switching vendors later
  still means touching every service individually — the instrumentation is open, but the deployment
  is not. The intermediate lesson covers collector pipelines, which is what closes this gap.

## Putting it together

::::exercise{id=ex-explain-otel type=reflect title="Explain OTel to someone in procurement"}
Write two or three sentences explaining, to someone with no engineering background, why requiring
new services to use OpenTelemetry reduces vendor risk. Avoid the words "API," "SDK," and
"collector."
:::solution
There is no single ideal answer; a good one sounds like: "Right now, if we build monitoring using
one company's tools, switching to a different company later means rewriting that monitoring
throughout our systems — that is expensive and slows us down. OpenTelemetry is an open, shared
standard that separates 'describing what our systems are doing' from 'which company's dashboard we
send that description to.' Adopting it means we can change monitoring vendors later based on price
and features, without rewriting our applications."
:::
::::
