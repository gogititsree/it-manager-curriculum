# Curriculum map

Six modules, 26 topics. Order on the dashboard puts IT Management first because it is the
destination; the technical modules feed it. The learner picks a level per topic; the suggested
default for this learner is **Rusty + Manager mode** for the technical modules and **Beginner** for
anything marked ★ (new since they were hands-on).

Each topic below lists the intent per level. Content sessions expand these into lessons following
CONTENT-AUTHORING.md.

## it-management — IT Management Extras

| Topic | Beginner | Intermediate | Rusty |
| --- | --- | --- | --- |
| cicd-concepts | pipeline stages, environments, artefacts, why automation | trunk-based vs GitFlow, gates and approvals in regulated shops, DORA metrics, pipeline as product | what changed: GitHub Actions/GitLab CI era, GitOps, policy-as-code |
| cloud-fundamentals ★ | compute/storage/network/identity; shared responsibility; regions | landing zones, IAM design, networking (VPC/VNet), managed services vs self-run, the bill | mapping on-prem concepts to AWS/Azure names; what is genuinely different |
| owasp-top-10 | the ten categories with one bank-flavoured example each | how each is found (SAST/DAST/pen test), what to ask for in a design review, secure SDLC | what changed in the 2021 list vs 2017; supply-chain and SSRF additions |
| architecture-decision-frameworks | ADRs, options tables, the one-page decision | ATAM-lite quality-attribute tradeoffs, RFC processes, reversible vs one-way doors, disagreement protocols | refresher plus what changed in how teams document decisions now |
| cost-tradeoff-thinking | TCO, run vs change, build vs buy basics | unit economics of cloud, FinOps basics, cost of delay, saying no with numbers, vendor negotiations | quick frameworks recap; what changed with consumption pricing |

## java — Java

| Topic | Beginner | Intermediate | Rusty |
| --- | --- | --- | --- |
| oop-fundamentals | classes, encapsulation, interfaces, composition, immutability | SOLID in practice, generics, records/sealed types, design smells in review | recap; changed since Java 8: records, sealed, pattern matching, var, text blocks; gotchas |
| spring-boot ★ | what DI is, starters, a REST controller, config and profiles | layering, transactions, testing slices, actuator, security starter, common misuse | Spring → Boot mapping for someone who knew XML-era Spring |
| concurrency-jvm-tuning | threads vs tasks, executors, the memory model in one page | virtual threads, structured concurrency, GC choices, heap sizing, reading thread dumps and GC logs | what changed since Java 8: CompletableFuture, virtual threads, ZGC/G1 defaults; gotchas |

## python — Python

| Topic | Beginner | Intermediate | Rusty |
| --- | --- | --- | --- |
| syntax | types, collections, comprehensions, functions, modules | typing, dataclasses, context managers, generators, packaging basics | Python 2 → 3 mental patches; f-strings, typing, pathlib, match |
| scripting-automation | files, subprocess, argparse, HTTP with requests | robust CLIs, logging, retries, secrets, scheduling, packaging with uv/pipx | what replaced the tools you used (pip/venv → uv, cron → …) |
| data-handling-pandas ★ | DataFrame basics, reading CSV/Excel, filtering, groupby | joins, tidy data, performance, polars as the alternative, charts for a status deck | recap for someone who used pandas 0.x |
| api-development | routes, JSON, validation, running locally | FastAPI vs Flask decision, pydantic, async, OpenAPI, auth middleware, deployment | Flask-era knowledge updated to FastAPI/pydantic v2 |

## fullstack — Full Stack

| Topic | Beginner | Intermediate | Rusty |
| --- | --- | --- | --- |
| frontend-basics | HTML/CSS/JS model, components, state, the build step | React mental model, data fetching, accessibility, performance budgets, why estimates slip | jQuery-era → component-era mapping; what changed in tooling |
| rest-api-design | resources, verbs, status codes, JSON shapes | versioning, pagination, idempotency keys, errors, OpenAPI, review checklist | recap; what changed: OpenAPI 3, JSON:API/Problem Details conventions |
| auth-patterns | sessions vs tokens, OAuth2 roles, MFA | OIDC flows, JWT pitfalls, mTLS, RBAC vs ABAC, secrets handling, bank-specific failure modes | SAML-era knowledge updated to OIDC/PKCE; gotchas |
| deployment ★ | containers, images, environments, rollback | Kubernetes basics, blue/green, canary, config and secrets, health checks, change control | VM/WAR deploys → containers mapping |

## databases — MongoDB & Databases

| Topic | Beginner | Intermediate | Rusty |
| --- | --- | --- | --- |
| document-modeling | documents vs rows, embedding vs referencing | schema patterns (bucket, outlier, subset), schema validation, versioning documents | recap plus what changed: transactions, schema validation |
| aggregation-pipelines | stages, $match/$group/$project | $lookup, $facet, windowing, performance traps, reading a pipeline in review | recap; newer stages and operators |
| indexing-performance | index basics, explain(), the working set | compound index design (ESR rule), covered queries, sizing, sharding overview | recap; gotchas |
| when-not-mongodb | honest limits: joins, transactions, reporting, audit | decision criteria for a bank; migrations away; hybrid designs | recap |
| choosing-a-database | relational / document / key-value / search / graph / time-series in one page each | decision framework with quality attributes, ops burden, licensing, cloud managed options | what changed in the landscape |
| postgres-essentials | tables, keys, transactions, indexes | isolation levels, JSONB, partitioning, connection pooling, extensions | recap; what changed since 9.x |

## observability — Observability

| Topic | Beginner | Intermediate | Rusty |
| --- | --- | --- | --- |
| logs-metrics-traces ★ | the three pillars and what each answers | structured logging, cardinality, sampling, cost, correlation IDs | monitoring → observability mapping |
| prometheus-grafana ★ | pull model, metric types, a first dashboard | PromQL, recording rules, dashboard design, HA/retention, cost | Nagios/Zabbix era → Prometheus mapping |
| opentelemetry ★ | what it standardises, SDK vs collector | context propagation, collector pipelines, adoption strategy for many teams | vendor-agent era → OTel mapping |
| alerting-design | symptoms vs causes, paging etiquette | SLOs, error budgets, burn-rate alerts, runbooks, on-call health | recap; what changed with SLO culture |

## Suggested paths

- **Manager fast path (≈ 12 hours):** it-management (all, Rusty/Beginner as marked) → observability
  (Beginner) → cloud-fundamentals → auth-patterns (Rusty) → when-not-mongodb → cost-tradeoff-thinking.
- **Read the PR path:** java/oop-fundamentals (Rusty) → spring-boot (Beginner) → rest-api-design
  (Rusty) → python/syntax (Rusty).
- **Between meetings:** flashcards only, all topics, default level.

## Prerequisites (informational, nothing is locked)

- java/spring-boot ← java/oop-fundamentals
- java/concurrency-jvm-tuning ← java/oop-fundamentals
- python/scripting-automation, data-handling-pandas, api-development ← python/syntax
- fullstack/auth-patterns ← fullstack/rest-api-design
- fullstack/deployment ← it-management/cicd-concepts
- databases/aggregation-pipelines, indexing-performance, when-not-mongodb ← databases/document-modeling
- databases/choosing-a-database ← databases/when-not-mongodb, databases/postgres-essentials
- observability/prometheus-grafana, opentelemetry, alerting-design ← observability/logs-metrics-traces

These are recorded in each topic's `topic.yaml` and checked by the content validator.
