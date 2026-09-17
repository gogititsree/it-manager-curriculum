---
title: "OpenTelemetry: Collector Pipelines and Rolling It Out"
estimatedMinutes: 40
objectives:
  - "Design a collector pipeline with receivers, processors and exporters"
  - "Reason about context propagation across async and cross-team boundaries"
  - "Build a realistic, phased adoption plan across many teams"
  - "Make the vendor-neutrality case to procurement with specifics, not slogans"
status: ready
---

You know the API/SDK/protocol/collector split and roughly what context propagation does. This
lesson is about the two things that actually determine whether an OpenTelemetry rollout succeeds
across an organisation: how you configure the collector, and how you sequence adoption across teams
that do not report to you and do not share your priorities.

## Where the basics break down

"Every team adds the OTel SDK to their service" sounds like a rollout plan and is not one. In
practice: teams instrument inconsistently (some spans have useful attributes, some have none), a
few high-traffic services generate more telemetry than the backend budget assumed, async boundaries
silently drop context, and — without a central collector — every team ends up hard-coding a backend
endpoint and credentials into their own service, which is precisely the lock-in OTel was meant to
avoid. None of these show up until multiple teams are involved; they are invisible in a single
team's pilot.

:::engineer
A single-team pilot typically looks like this in the collector config: one `otlp` receiver, one
`otlp/primary` exporter, done. Multi-team reality adds a `tail_sampling` processor once telemetry
volume grows past what the backend budget assumed, an `attributes/strip-pii` processor once a
second team's data includes fields the first team's did not have, and eventually an agent/gateway
split once a single collector instance cannot keep up with fleet-wide volume. None of this is
visible from a one-service trial.
:::

:::manager
Budget an OTel rollout as an organisational change with a technical component, not the reverse. The
collector configuration is a day's work for one engineer. Getting twenty teams to instrument
consistently, propagate context across their queues, and not blow the telemetry budget is a
quarter's work involving standards, review, and probably a shared library, similar in shape to the
structured-logging rollout in logs-metrics-traces.
:::

## Collector pipelines

A collector pipeline is built from three stages: **receivers** (how data gets in — OTLP, but also
Prometheus scraping, and others), **processors** (transform, filter, batch, sample data in
transit), and **exporters** (where data goes out — one or many backends).

:::engineer
```yaml
receivers:
  otlp:
    protocols:
      grpc:
      http:

processors:
  batch: {}
  attributes/strip-pii:
    actions:
      - key: user.email
        action: delete
  tail_sampling:
    policies:
      - name: keep-errors
        type: status_code
        status_code: { status_codes: [ERROR] }
      - name: sample-rest
        type: probabilistic
        probabilistic: { sampling_percentage: 5 }

exporters:
  otlp/primary:
    endpoint: primary-backend:4317
  otlp/pilot-vendor:
    endpoint: pilot-vendor:4317

service:
  pipelines:
    traces:
      receivers: [otlp]
      processors: [attributes/strip-pii, tail_sampling, batch]
      exporters: [otlp/primary, otlp/pilot-vendor]
```
This single configuration change — adding `otlp/pilot-vendor` to the exporter list — is what "pilot
a new vendor without touching application code" looks like in practice, and it is also where a PII
stripping rule gets enforced once, centrally, instead of trusted to every team's own instrumentation.
:::

:::callout{kind=decision title="Collector topology: agent, gateway, or both"}
A common pattern runs a lightweight **agent** collector per host/pod (handles local batching, adds
host/pod metadata) that forwards to a smaller number of **gateway** collectors (do the expensive
work — tail sampling needs to see all spans for a trace, so it usually belongs at the gateway,
where data from the whole fleet converges, not the agent). Running everything at the agent tier
(no gateway) is simpler but makes fleet-wide tail sampling and centralised PII rules harder to
enforce consistently.
:::

:::manager
The collector pipeline configuration is the single artefact worth reviewing directly, not just the
architecture diagram describing it. Ask to see it. If PII stripping and sampling policy are not in
it, they are not actually enforced centrally, whatever the rollout status report says.
:::

## Context propagation across the boundaries that break it

Synchronous HTTP and gRPC calls propagate context automatically once both sides use OTel's standard
instrumentation for their framework. The places it needs deliberate work: message queues (the trace
context has to be put into the message envelope/headers by the producer and read by the consumer),
scheduled/batch jobs (no inbound request to inherit context from; the job usually starts its own
root trace, or links to the trace that triggered it if there is one), and calls into systems that do
not support OTel at all (a legacy mainframe integration, a third-party API) — where the trace simply
ends, which needs to be an accepted, documented boundary rather than a mystery gap discovered during
an incident.

:::engineer
```java
// Producer: inject trace context into the message before publishing
Context context = Context.current();
Map<String, String> carrier = new HashMap<>();
propagator.inject(context, carrier, (c, k, v) -> c.put(k, v));
message.setHeaders(carrier);
queue.publish(message);

// Consumer: extract and continue the trace instead of starting a new one
Context extracted = propagator.extract(Context.current(), message.getHeaders(),
    (carrier, key) -> carrier.get(key));
try (Scope scope = extracted.makeCurrent()) {
    process(message);   // spans created here join the original trace
}
```
This is boilerplate, which is exactly why it belongs in a shared messaging library rather than each
team reimplementing it — the same argument as the shared logging library for structured logs.
:::

:::manager
Ask any team using a queue between services one direct question: "if I trace a request that crosses
this queue, does it show as one trace or two disconnected ones?" This is the single fastest way to
find where a rollout's coverage actually is, versus where a status report claims it is.
:::

## An adoption strategy for many teams

A realistic sequence, not a big-bang mandate:

1. **Platform team stands up the collector infrastructure first** — agent and gateway tiers,
   routing to the existing backend, with the shared instrumentation libraries (HTTP client/server,
   messaging) published and documented, before asking any product team to adopt anything.
2. **Pilot with one or two willing, moderate-traffic services** end to end, including their async
   boundaries, to find the real gaps (a queue library needing propagation code, a telemetry volume
   surprise) before they are everyone's problem.
3. **Mandate for all new services** immediately — the cheapest point to require it is before a
   service exists, via a service template or scaffolding tool that includes OTel by default.
4. **Migrate existing services opportunistically**, prioritised by which ones are hardest to debug
   today (frequent, hard-to-localise incidents) rather than alphabetically or by team size — this
   is where the business case is strongest and adoption meets the least resistance.
5. **Retire the old, vendor-specific instrumentation** only after a service's OTel coverage has been
   verified in a real incident or a deliberate fire drill, not on a calendar date alone.

:::engineer
A concrete milestone to track per team, not just "instrumented yes/no": percentage of that team's
services exporting via the shared collector (not directly to a vendor), percentage of their spans
carrying the organisation's required minimum attributes (service name, version, environment), and
whether their async integrations use the shared context-propagation library. Three numbers, tracked
per team, turn "we adopted OTel" from a claim into something measurable.
:::

:::manager
Sponsor step one — the collector infrastructure and shared libraries — from wherever budget for
platform/infrastructure work sits, not from an individual product team's roadmap. If a product team
has to fund shared infrastructure out of its own sprint capacity, it will always lose to that
team's own feature deadlines, and the rollout stalls at step one indefinitely.
:::

:::callout{kind=decision title="Big-bang mandate vs phased rollout"}
A hard cutover date across every team tends to produce inconsistent, box-ticking instrumentation
under deadline pressure — spans with no useful attributes, gaps at every async boundary nobody had
time to fix properly. A phased rollout anchored to new-service-by-default plus opportunistic
migration of the worst-debugged existing services takes longer to reach 100% but produces
instrumentation people actually built carefully, because it happened as they had capacity rather
than under a deadline.
:::

## Making the vendor-neutrality case to procurement

The concrete claim to make, with evidence: "instrumentation is OpenTelemetry-based; switching or
adding a backend is a collector exporter configuration change, verifiable by pointing the collector
at a trial vendor's endpoint in parallel with production traffic, with zero application code
changes." This is falsifiable and demonstrable — you can actually run the pilot exporter change
live, in minutes, as proof, rather than asserting it.

:::engineer
```yaml
exporters:
  otlp/incumbent: { endpoint: incumbent-backend:4317 }
  otlp/trial:     { endpoint: trial-vendor:4317 }
service:
  pipelines:
    traces:
      exporters: [otlp/incumbent, otlp/trial]   # the entire "pilot a new vendor" change
```
Everything needed to demonstrate the claim is this diff, reviewable in a pull request, applied to
the collector alone.
:::

:::manager
When a vendor's sales team says "our proprietary agent gives you richer data than OpenTelemetry
can," the honest response is: usually true for a narrow set of vendor-specific features, and it is
a real tradeoff to weigh — but ask them to quantify exactly what is lost using open instrumentation,
in writing, so it becomes a specific, comparable cost of lock-in rather than a vague feature-sheet
claim. Most core tracing, metrics and logging needs are fully served by OTel today.
:::

## What good looks like

- A collector tier exists (at least agent-level) before any team is asked to instrument; nobody
  hard-codes a backend endpoint into application code.
- Shared instrumentation libraries exist for the organisation's common HTTP client, message queue,
  and batch-job frameworks, so context propagation is not reinvented per team.
- New services are instrumented by default via a service template, not left to individual initiative.
- Someone can name, for any given service, whether its traces cross an async boundary and whether
  that boundary is verified to propagate context — not assumed.
- The organisation has actually exercised a parallel-export pilot to a second backend at least once,
  proving the vendor-neutrality claim rather than just asserting it.

:::manager
Review this list against one real service, not in the abstract — pick a service, ask its owning
team to answer each bullet with evidence (a config file, a dashboard, a trace), not a verbal "yes."
The gap between what a status report claims and what an actual service shows is usually where the
real rollout risk lives.
:::

:::engineer
The three metrics named in the adoption-strategy section (collector-routed %, required-attribute
coverage %, async-propagation coverage) are the fastest way to turn this checklist into a number per
team rather than a subjective judgement call.
:::

## Exercises

::::exercise{id=ex-rollout-plan type=design title="Sequence a rollout across twelve teams"}
You manage observability standards across twelve teams, three of which own services connected only
by synchronous HTTP, five of which use a shared Kafka-based event bus, and four of which run
scheduled batch jobs with no inbound requests at all. Sequence a rollout plan and name the specific
risk for each group.
:::solution
Start with the three HTTP-only teams as the pilot group — synchronous propagation is the
best-supported case and will validate the collector and library setup fastest with the least risk.
Next, the five Kafka-connected teams, but only after publishing a shared library that injects and
extracts trace context into Kafka message headers; the risk here is each team reinventing (or
skipping) this by hand, producing broken traces at every queue hop. Last, the four batch-job teams:
these have no natural inbound context to propagate, so the plan needs an explicit decision (root
trace per run, or a link back to a triggering trace where one exists) documented centrally rather
than left to each team to invent independently, since there is no "obvious" default the way there
is for HTTP.
:::
::::

::::exercise{id=ex-pilot-vendor type=scenario title="Prove vendor-neutrality to a skeptical CFO"}
Your CFO doubts the vendor-neutrality claim and wants to see it, not hear it, before approving a
multi-year commitment to a new observability vendor. What do you propose as proof?
:::solution
Propose a live parallel-export pilot: add the candidate vendor as a second exporter in the existing
collector pipeline for a subset of production traffic, alongside the current backend, for a fixed
trial period — zero changes to any service's application code, verifiable in the collector config
diff. Show both backends receiving the same trace data side by side. This directly demonstrates the
claim (a config change, not a re-instrumentation project) rather than asking the CFO to trust an
architecture diagram.
:::
::::
