---
title: "Deployment — VM/WAR knowledge mapped to containers"
estimatedMinutes: 18
objectives:
  - "Map every step of a VM/WAR deployment runbook onto its container/Kubernetes equivalent"
  - "Know what changed in deployment practice since the VM-and-application-server era, and roughly when"
  - "Spot the gotchas that catch experienced ops-minded architects moving to containers"
status: ready
---

You have owned VM provisioning, application server configuration, and WAR deployment runbooks. None
of the underlying problems changed — you still need a reliable build, a controlled rollout, a fast
rollback, and environment-specific config without environment-specific artifacts. What changed is
almost everything about the mechanism. This is the fast map.

## What you probably remember

| VM/WAR-era concept | Rough container-era equivalent |
| --- | --- |
| VM (provisioned, patched, configured by hand or a script) | Container image (built once, immutable, versioned) |
| Application server (Tomcat, WebLogic, WebSphere) deploy folder | `ENTRYPOINT` in the image; the process runs directly, no separate app-server layer |
| SCP the WAR to each VM | Push image to a registry; orchestrator pulls it to nodes |
| Manually restart the app server per VM | Orchestrator performs a rolling update across replicas automatically |
| Load balancer in front of a fixed pool of VMs | Kubernetes Service, routing to a dynamic, changing set of pod IPs |
| `server.xml` / properties files per environment | ConfigMaps and Secrets injected at deploy time; same image, different config |
| Keep the previous WAR on disk for rollback | Keep the previous image tag in the registry for rollback |
| Nagios/manual health check script | Liveness/readiness probes, checked continuously by the orchestrator |

## What changed since

:::callout{kind=changed-since title="Docker popularized containers for mainstream use (2013 onward)"}
Container technology (Linux namespaces and cgroups) predates Docker, but Docker made building and
running images practical for ordinary application teams starting around 2013, and it became a default
part of most new backend and frontend deployment pipelines within a few years after. If your last
deploys were straight to VMs, this is the single biggest shift to anchor on.
:::

:::callout{kind=changed-since title="Kubernetes became the dominant orchestrator (stable release 2015, broad enterprise adoption through the later 2010s)"}
Where an app server managed one JVM process's lifecycle on one VM, Kubernetes manages the lifecycle
of many container instances across a fleet of nodes: scheduling, restarting failed containers,
routing traffic, and rolling out updates. Alternatives existed and still exist (Docker Swarm, Nomad,
managed platform-as-a-service options), but Kubernetes is the one you should expect to encounter by
default in most current job postings and vendor integrations.
:::

:::callout{kind=changed-since title="Infrastructure as code and GitOps replaced manual provisioning scripts"}
Where VM provisioning was often a runbook plus a shell script (or a ticket to an infrastructure team),
current practice declares infrastructure and deployment state in version-controlled files (Terraform
for infrastructure, Kubernetes YAML or Helm charts for workloads), often applied automatically when
that version control changes ("GitOps," via tools like Argo CD or Flux). The audit trail is now "here
is the commit that changed this" rather than "here is the runbook someone followed."
:::

:::callout{kind=changed-since title="Progressive rollout strategies (blue/green, canary) are now standard vocabulary"}
Where a VM-era deploy was often an all-at-once restart during a maintenance window, canary and
blue/green strategies are now the expected default for anything customer-facing at scale, specifically
to avoid an all-or-nothing exposure to a bad deploy. See Intermediate for the mechanics and the
tradeoff between them.
:::

:::engineer
```
VM/WAR era:                                   Container/Kubernetes era:
Build WAR on CI server                        Build image on CI, push to registry
SCP to app-vm-01, app-vm-02, app-vm-03         Update Deployment's image tag
Stop Tomcat on each VM                         Orchestrator rolls pods gradually
Copy WAR into webapps/                         (no manual per-machine file copy)
Start Tomcat, tail catalina.out                Orchestrator checks readiness probes
Manually verify each VM in the LB pool         Service automatically routes only to ready pods
```
:::

:::manager
The management-level translation for a status report: "deployment moved from a set of manually-
operated machines to a declared, version-controlled desired state that an orchestrator continuously
enforces." The operational skill that mattered before (careful runbooks, careful manual verification)
still matters, but it has moved into writing and reviewing the declarative configuration and the
pipeline, not executing steps by hand.
:::

## Gotchas that still bite

- **Treating a container like a VM you patch in place.** The instinct to SSH in and fix something
  live does not survive — a container replaced by the orchestrator (a restart, a rolling update, a
  node failure) reverts to whatever the image actually contains. Fixes belong in the image and the
  pipeline, not applied live.
- **`replicas: 1` reproducing a single-VM single point of failure**, just now inside a Kubernetes
  manifest instead of a documented "and if that VM dies, someone gets paged" runbook. The old
  single-point-of-failure instinct to check for still applies, in a new file format.
- **Assuming Kubernetes Secrets are encrypted because they sound like a security feature.** They are
  base64-encoded by default, not encrypted, unless etcd encryption at rest and/or an external secrets
  manager is specifically configured — an easy assumption to carry over from "we always encrypted
  config at rest" VM-era practice without checking whether the container-era equivalent actually does.
- **No rollback rehearsal.** The VM-era instinct to actually test a rollback runbook before relying on
  it applies just as much to `kubectl rollout undo` — an untested rollback path is still an untested
  rollback path, regardless of how modern the tooling is.
- **Conflating liveness and readiness checks**, pointing both at a downstream dependency check. This
  is a genuinely new failure mode with no direct VM-era equivalent (an app server crash-looping on a
  database outage was possible before, but the specific liveness/readiness distinction, and the
  mistake of collapsing it, is new vocabulary worth learning precisely, not assuming you already know).

:::callout{kind=bank-context}
The CAB collision is real and worth naming to your own management chain early: a pipeline capable of
ten deploys a day does not fit a change process designed for a weekly change window, and forcing it
to fit (by batching deploys artificially to match the old cadence) throws away most of the risk-
reduction benefit of small, frequent, individually-tested changes. The fix is a pre-approved standing-
change category with pipeline-enforced guardrails, not a faster rubber stamp on the old process. See
Intermediate for the shape of this.
:::

## Ten-minute drill

::::exercise{id=ex-vm-runbook-to-k8s type=scenario title="Translate a rollback runbook"}
Your existing rollback runbook: "if the new WAR causes errors, SCP the previous WAR back to all three
VMs, restart Tomcat on each, verify in the load balancer's health check page, and log the rollback
time in the change ticket." Write the container/Kubernetes-era equivalent, and note what new question
you now need an answer to that did not exist in the VM-era version.
:::solution
Equivalent: `kubectl rollout undo deployment/payments-service` (or the GitOps equivalent — revert the
commit that changed the image tag, and let the automated pipeline apply it), then confirm via
`kubectl rollout status` and the Service's readiness-backed routing that traffic is again reaching
only healthy, previous-version pods; log the rollback in the change ticket exactly as before, ideally
with the pipeline's own audit record attached rather than a manually-typed timestamp.

New question that did not exist in the VM-era version: is the previous image tag still available in
the registry, and does your registry's retention/cleanup policy guarantee it will be for at least as
long as your required rollback window? A VM-era rollback depended on a file you kept on disk under
your own control; a container-era rollback depends on an external system's (the registry's) retention
policy, which is a new dependency worth confirming explicitly rather than assuming.
:::
::::
