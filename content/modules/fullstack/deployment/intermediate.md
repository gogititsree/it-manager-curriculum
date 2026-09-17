---
title: "Deployment in Production: Kubernetes, Progressive Rollouts and Change Control"
estimatedMinutes: 45
objectives:
  - "Explain the core Kubernetes objects well enough to read a manifest in review"
  - "Distinguish blue/green from canary deployment and know when each fits"
  - "Design health checks, config and secrets correctly for a containerized service"
  - "Reconcile fast, automated deployment with regulated change control"
status: ready
---

You know what an image is and how rollback works for a single container. This lesson covers what
happens once you have many services, many instances of each, and a real need to deploy without
downtime, roll back safely, and satisfy a Change Advisory Board at the same time.

## Where the basics break down

Running one container by hand (`docker run`) does not survive contact with production: a container
can crash and needs restarting automatically; traffic needs distributing across several instances of
a service; a node (physical or virtual machine) can fail and workloads need moving off it; and a
deploy needs to replace old instances with new ones without a gap where no instance is serving
traffic. Manually scripting all of this per service is exactly the kind of repetitive, error-prone
operational work that led to orchestrators.

## Kubernetes basics

**Kubernetes** (often "K8s") is a container orchestrator: you describe the desired state of your
workloads declaratively, and it continuously works to make reality match that description — starting
containers, restarting failed ones, moving workloads off failed nodes. The objects worth knowing to
read a manifest in review:

- **Pod** — the smallest deployable unit; one or more containers that are scheduled and run together
  on the same node, sharing a network address. Usually one application container per pod in practice.
- **Deployment** — describes how many replicas (copies) of a pod should run, and manages rolling
  updates from one version to another.
- **Service** — a stable network address and DNS name in front of a changing set of pods, so other
  parts of the system do not need to track individual pod IPs, which change constantly as pods are
  replaced.
- **ConfigMap / Secret** — externalized configuration and sensitive values, injected into pods at
  runtime rather than baked into the image (Secrets are base64-encoded, not encrypted, by default in
  the core API — see the config and secrets section below for what that actually means in practice).
- **Namespace** — a logical partition within a cluster, often used to separate teams or environments.

:::engineer
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: payments-service
spec:
  replicas: 3
  selector: { matchLabels: { app: payments-service } }
  template:
    metadata: { labels: { app: payments-service } }
    spec:
      containers:
        - name: payments-service
          image: myregistry/payments-service:1.4.2
          ports: [{ containerPort: 8080 }]
          envFrom:
            - configMapRef: { name: payments-config }
            - secretRef: { name: payments-secrets }
          readinessProbe:
            httpGet: { path: /healthz/ready, port: 8080 }
          livenessProbe:
            httpGet: { path: /healthz/live, port: 8080 }
```
This declares "run 3 replicas of this exact image, with this config and these secrets injected, and
here is how to check whether each one is healthy." Kubernetes reconciles the running state toward this
continuously — if a pod dies, a new one is started to bring the count back to 3.
:::

:::manager
Reading a Kubernetes manifest in review does not require writing YAML yourself. The useful review
questions are: how many replicas (is there real redundancy, or is `replicas: 1` a single point of
failure hiding in a config file), are health checks defined (see below), and where do secrets come
from (a `Secret` object referencing an external secrets manager is a very different risk profile from
one with values typed directly into the manifest).
:::

## Blue/green vs canary

Both are strategies for rolling out a new version with minimal risk and downtime, and they answer
different questions.

:::callout{kind=decision title="Blue/green or canary?"}
**Blue/green**: run two complete, identical environments ("blue" = current live, "green" = new
version), fully deployed and tested in isolation, then switch traffic from blue to green all at once
(typically by repointing a load balancer or router). Rollback is switching traffic back to blue,
which is still fully running and unchanged. Simple to reason about; the cost is running two full
environments' worth of capacity during the switch, and the switch itself is all-or-nothing — a bug
that only appears under real production traffic hits 100% of users at once.

**Canary**: roll out the new version to a small slice of traffic (e.g. 5%) alongside the old version,
monitor error rates and key metrics, then progressively increase the slice if it looks healthy, or
roll back the small slice if it does not. Limits the blast radius of a bad deploy to a fraction of
users, at the cost of more operational complexity (traffic splitting, comparing metrics between two
live populations, deciding the promotion criteria) and a longer window where two versions are live
simultaneously, which has its own consistency implications.

Use blue/green when a full, clean cutover matters more than gradual exposure (e.g. a change with a
database schema migration that needs to happen atomically with the code change). Use canary when
you want to catch problems that only show up under a slice of real traffic before they affect
everyone, and the change is safe to have two versions live at once.
:::

:::engineer
Canary traffic splitting is usually implemented at the ingress/service-mesh layer (e.g. an Istio
VirtualService, or a cloud load balancer's weighted routing) rather than inside the application:
```yaml
# illustrative shape, not a specific product's exact syntax — verify against your ingress/mesh docs
http:
  - route:
      - destination: { host: payments-service, subset: v1 }
        weight: 95
      - destination: { host: payments-service, subset: v2 }
        weight: 5
```
:::

:::manager
"We do canary deployments" is not complete without an answer to: what metric decides promotion or
rollback, and is that decision automated or does a human watch a dashboard? A canary strategy with no
defined promotion criteria just means "we found out from users," slower, for 5% of them first.
:::

## Health checks

Kubernetes needs to know two different things about a container, and conflating them is a common
mistake: is it **alive** (should it be restarted if not), and is it **ready** (should it currently
receive traffic)?

- **Liveness probe** — if this fails repeatedly, the container is considered stuck/crashed and is
  restarted. Should check "is this process fundamentally broken," not "is a downstream dependency
  currently unavailable" — a database outage should not cause every pod to restart in a loop.
- **Readiness probe** — if this fails, the pod is temporarily removed from the Service's routing (no
  new traffic sent to it) without being restarted. This is the right place to check dependencies:
  "can I currently serve requests," which may legitimately be "no" briefly during startup or a
  downstream blip.

:::manager
A production incident pattern worth knowing by name: liveness and readiness checks pointed at the
same endpoint, which checks a downstream dependency. A downstream outage then causes every pod to be
killed and restarted repeatedly (because liveness failed), making the outage worse instead of just
routing around it (which is all readiness failing should do). Ask, specifically, whether these two
probes check different things.
:::

## Config and secrets

Configuration that varies by environment (a database hostname, a feature flag) belongs outside the
image, injected at deploy time — `ConfigMap` objects for non-sensitive values. Secrets (credentials,
API keys, signing keys) need a real security boundary, and it is worth being precise here: Kubernetes'
built-in `Secret` object base64-encodes values, which is an encoding, not encryption — anyone with
API access to read the Secret object can trivially decode it. Real secret protection in a Kubernetes
context typically means encryption at rest for the cluster's underlying data store (etcd) being
enabled, and/or integrating an external secrets manager (HashiCorp Vault, or a cloud provider's
secrets manager) that injects secrets at runtime rather than storing them in the base Secret object
directly — verify which of these, if any, a given cluster actually has configured before assuming
"it's a Kubernetes Secret" means it is adequately protected for a regulated workload.

:::manager
"We use Kubernetes Secrets" is not, by itself, an answer to "how are credentials protected" for a bank
workload. Ask specifically whether etcd encryption at rest is enabled and whether an external secrets
manager is in use, and who has API-level access to read Secret objects directly.
:::

## Rollback

The Kubernetes-native rollback mechanism (`kubectl rollout undo`, or the equivalent in a GitOps
workflow) redeploys the previous Deployment revision, which references the previous image tag —
mechanically similar to what you saw in Beginner, but now happening across many replicas with the
orchestrator managing the rolling transition rather than a manual one-by-one restart.

:::engineer
```bash
kubectl rollout status deployment/payments-service     # watch a rollout in progress
kubectl rollout undo deployment/payments-service        # roll back to the previous revision
```
A rolling update by default replaces pods gradually (old ones removed only as new ones become ready),
so there should be no gap with zero healthy replicas — this depends on readiness probes being correctly
defined, which is why they matter operationally, not just architecturally.
:::

## Change control collision

This is worth naming directly: Kubernetes and modern deployment pipelines are built around frequent,
small, automated, low-ceremony deploys — the opposite instinct from a traditional Change Advisory
Board process built around infrequent, larger, manually-approved changes with a scheduled window.
Neither instinct is wrong; they need to be reconciled deliberately, not left in tension.

:::callout{kind=bank-context}
A workable reconciliation many regulated organisations land on: pre-approve a class of changes (e.g.
"deployments of previously-tested container images, via the standard pipeline, with automated
rollback on failed health checks") as a standing change, subject to the pipeline enforcing its
controls (tests passed, approvals recorded, canary/blue-green strategy followed), while reserving
individual CAB review for higher-risk changes (schema migrations, new external dependencies, security-
relevant changes). This requires the pipeline itself to be auditable — who approved what, what tests
ran, what the rollback trigger was — which is real engineering and governance work, not a policy
memo. Do not assume this reconciliation exists by default; ask to see it.
:::

:::manager
If a team says "we deploy multiple times a day" in a regulated environment, the follow-up is not
"is that allowed" — it is "what is pre-approved as standing change, what still requires individual
sign-off, and can the pipeline prove after the fact what happened for any given deploy." A mature
answer here is a real differentiator between teams that have done the governance work and teams that
have just turned on automation.
:::

## What good looks like

- Health checks are correctly split between liveness (is it alive) and readiness (should it get
  traffic), not pointed at the same dependency-checking endpoint.
- A stated rollout strategy (blue/green or canary) with explicit promotion/rollback criteria, not
  left to a human's judgement call under pressure.
- Secrets come from an external secrets manager or an encrypted-at-rest store, not plain Kubernetes
  Secret objects with no additional protection, for anything handling regulated data.
- Rollback has been tested, not just assumed to work, and takes minutes, not hours.
- Replica counts provide real redundancy (`replicas: 1` is a red flag for anything production-facing).
- The relationship between the deployment pipeline and change control is explicit: what is
  pre-approved standing change, what requires individual CAB review, and how the pipeline proves
  what happened.

## Exercises

::::exercise{id=ex-rollout-strategy type=scenario title="Choosing a rollout strategy for a schema-changing release"}
A team is deploying a new version of a payments service that requires a database schema migration
(a new required column, backfilled from existing data) alongside the code change. They ask whether
to use canary or blue/green. What do you ask, and what would you recommend?
:::solution
Key question: is the new code able to run against the *old* schema during a gradual rollout, and is
the old code able to run against the *new* schema? If the migration is not backward/forward
compatible (e.g. the column is required and old code does not populate it, or vice versa), a canary
split — where old and new code run simultaneously against the database for a period — risks the old
code writing invalid rows once the new schema is in place, or the new code failing against rows the
old code wrote. In that case, recommend either: (a) a blue/green cutover coordinated tightly with the
migration (migrate schema, then switch all traffic to the new version at once, minimizing the window
of mixed versions), or better, (b) restructure the change into backward-compatible steps (add the
column as optional and backfill first, deploy code that can handle both states, then make it required
in a later, separate deploy) — the standard "expand/contract" pattern for schema changes, which makes
either canary or blue/green safe because there is no version of the code that is incompatible with
the schema at any point. Recommend (b) if there is time for it; it is the more robust answer.
:::
::::

::::exercise{id=ex-change-control-design type=scenario title="Reconciling daily deploys with CAB"}
Your bank's CAB process currently requires a named approver and a scheduled window for every
production change, evaluated weekly. A platform team wants to deploy up to ten times a day using an
automated pipeline with tests, canary rollout and automated rollback on failed health checks. What do
you propose to reconcile these?
:::solution
Propose a standing/pre-approved change category specifically for deploys that go through the full
automated pipeline unchanged: tests must pass, the canary/rollout strategy must execute as configured,
automated rollback must trigger on defined health-check failure criteria, and every deploy must be
logged with what changed, who merged it, and what the pipeline's gate results were. CAB pre-approves
this category once, with defined guardrails, rather than approving each of the ten daily deploys
individually. Any change that falls outside the guardrails — a schema migration, a new external
dependency, a change to the auth/authorization logic, or anything the pipeline cannot fully test
automatically — routes to individual CAB review as before. This requires the pipeline to produce an
auditable record per deploy (not just logs an engineer could edit), which is a real deliverable to
scope and build, not a policy exception to request verbally.
:::
::::
