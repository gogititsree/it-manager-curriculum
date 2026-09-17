---
title: "OpenTelemetry — Vendor-Agent-Era Refresher"
estimatedMinutes: 15
objectives:
  - "Map vendor-agent-era APM concepts onto OpenTelemetry equivalents"
  - "Know what changed and roughly when OTel became the default choice"
  - "Spot the adoption mistakes that undermine the vendor-neutrality benefit"
status: ready
---

You have likely encountered application performance monitoring before — a proprietary agent
installed alongside the application, a vendor dashboard, a support contract. OpenTelemetry is not a
new vendor; it is the industry agreeing on a common, open instrumentation layer that any vendor's
backend can consume, so the agent-per-vendor world becomes optional infrastructure detail instead
of a foundational commitment.

## What you probably remember

| You knew it as | OpenTelemetry equivalent |
| --- | --- |
| Vendor's proprietary agent bundled with the app | OTel SDK: open, vendor-neutral, implements a vendor-neutral API |
| Vendor's proprietary wire protocol to their cloud | OTLP: an open, standard protocol any compliant backend can receive |
| "We're locked into Vendor X's instrumentation" | Instrumentation is vendor-neutral by default; the backend is a swappable configuration choice |
| A vendor-specific trace ID / correlation mechanism | W3C Trace Context (`traceparent` header) — a cross-vendor, cross-language standard |
| Agent auto-instruments common frameworks | Same idea, but the instrumentation libraries are open source and shared across the ecosystem, not vendor-proprietary |
| One tool doing collection, storage and dashboards together | Explicitly split: OTel collects/transports; storage and dashboards are separate products (Prometheus, Grafana, or a vendor backend) |

## What changed since

:::callout{kind=changed-since title="OpenTelemetry formed by merging two projects (2019)"}
OpenTelemetry was formed from a merger of OpenTracing and OpenCensus, under the CNCF. Since then it
has become the de facto standard most major observability vendors support natively as an ingestion
format, alongside or instead of their own proprietary agents.
:::

:::callout{kind=changed-since title="Traces reached general maturity first; metrics and logs followed"}
OTel's tracing API/SDK stabilised first; its metrics support followed, and logs support (integrating
existing structured-logging practice rather than replacing it) matured later still, and in recent
years has become solid enough for production use across the officially supported languages. If your
last exposure to OTel was "tracing only, metrics and logs not really there yet," that gap has
substantially closed — check the current status per language rather than assuming the old
limitation still holds.
:::

:::callout{kind=changed-since title="Auto-instrumentation broadened"}
Early OTel adoption often meant manually wrapping every function you wanted a span for. Automatic
instrumentation — agents/libraries that instrument common frameworks (HTTP servers/clients,
popular database drivers, common messaging libraries) without code changes — has broadened
substantially across languages in recent versions, lowering the initial adoption cost a great deal
compared to a few years ago.
:::

:::manager
The management-relevant shift: "should we adopt OpenTelemetry" used to be a real technical bet on
an immature standard. It is now closer to a default expectation — most vendors assume it, most new
instrumentation libraries target it first, and choosing a vendor-proprietary agent instead is
increasingly the exception that needs justifying, not the reverse. If a vendor is pushing you toward
their proprietary agent instead of OTel-based ingestion, ask why.
:::

## Gotchas that still bite

- **Assuming "adopted OpenTelemetry" means full coverage.** Automatic instrumentation covers common
  frameworks well; internal libraries, queues, and batch jobs usually still need explicit
  instrumentation, and this is the most common source of a rollout that looks complete in a status
  report and has real gaps in practice.
- **Skipping the collector** to save initial setup time, then discovering every service is
  hard-coded to one backend's endpoint and credentials — reproducing the exact lock-in OTel was
  adopted to avoid, just with open instrumentation feeding a still-closed pipeline.
- **Context propagation breaking at async boundaries** — the same failure mode as correlation IDs
  in logs-metrics-traces, now standardised but not automatic: a queue or batch job needs deliberate
  code to inject and extract trace context.
- **Telemetry volume surprises.** Full, unsampled instrumentation of a high-traffic service can
  generate far more data than a pilot with one low-traffic service suggested; tail-based sampling
  at the collector (see logs-metrics-traces and the intermediate lesson) is the usual fix, decided
  before, not after, the bill arrives.
- **Treating OTel adoption as purely a technical rollout.** It is a cross-team standards effort,
  the same shape as the structured-logging standard — it needs a shared library, a mandate for new
  services, and a realistic phased plan for existing ones, not a single memo.

:::callout{kind=bank-context}
"Our instrumentation is vendor-neutral" is a stronger answer in a vendor-risk review than "we use
Vendor X's agent throughout," but it is only true if a collector-based pipeline actually exists —
if every service exports directly to one vendor's proprietary endpoint, the code may technically use
OTel's API while the deployment is still fully locked to one backend. Verify the deployment
topology, not just the instrumentation library, before making the vendor-neutrality claim in a
procurement conversation.
:::

## Ten-minute drill

::::exercise{id=ex-assess-otel-claim type=scenario title="Assess a team's vendor-neutrality claim"}
A team tells you "we're on OpenTelemetry, so we're vendor-neutral." Their services each export
directly to their APM vendor's OTLP endpoint with no collector in between. Is the claim accurate?
What, specifically, would you ask to verify it, and what would you require before it is true?
:::solution
The claim is only partly accurate. Using OTel's API and SDK means the *instrumentation code* is
vendor-neutral — genuinely a real improvement over a proprietary agent. But with every service
exporting directly to one vendor's endpoint, switching vendors still means reconfiguring (or worse,
redeploying) every service, not a single change, because there is no centralised routing point.
Ask: "if we switched backends tomorrow, how many services would need a config or code change, and
who would make it?" If the answer is "all of them, individually," the org has vendor-neutral
instrumentation but not yet a vendor-neutral deployment. Require a collector tier between services
and the backend before making the full vendor-neutrality claim to procurement or in a vendor
negotiation.
:::
::::
