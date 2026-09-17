---
title: "Deployment: From VMs and WARs to Containers"
estimatedMinutes: 35
objectives:
  - "Explain what a container image is and how it differs from a VM"
  - "Map WAR/VM deployment steps onto their container equivalents"
  - "Describe environments, rollback, and why both still matter with containers"
status: ready
---

You have deployed applications before: build a WAR file, copy it to a VM, drop it in an application
server's deploy folder (or run an installer), restart the service, check the logs. That model still
works and is still running in plenty of banks today. Containers solve the same problem — get code
running reliably somewhere — differently enough that the vocabulary needs rebuilding from "what is an
image" up. This lesson does that.

## Why this exists

A VM/WAR deployment has a real, recurring failure mode: "it works on my machine" (or in staging) and
not in production, because the production VM has a different OS patch level, a different JVM minor
version, a different set of libraries installed globally, or leftover state from a previous deploy
that was never cleaned up. Fixing this by writing ever more detailed runbooks and provisioning
scripts is the traditional answer, and it is a lot of ongoing, error-prone work. Containers are, at
their core, a way to package "the application plus everything it needs to run" into one immutable
unit, so that unit behaves identically everywhere it runs.

:::manager
The management-relevant framing: a VM is "a computer you configure and then deploy an application
onto"; a container image is "the application and its exact environment, packaged together, deployed
as one unit." The second approach trades configuration-drift risk for a different discipline
(building and managing images correctly) — it does not eliminate operational work, it relocates it.
:::

## What is an image

A **container image** is a packaged, read-only bundle: your application code, the language runtime it
needs (e.g. a specific JVM version), the OS-level libraries it depends on, and instructions for how to
start it — all frozen together as a single artifact. A **container** is a running instance of an
image, in the same way an object is an instance of a class, or a running process is an instance of a
program on disk.

The critical property: an image built once behaves the same way whether it runs on a developer's
laptop, a test environment, or production, because it carries its dependencies with it instead of
relying on whatever happens to be installed on the host machine.

:::engineer
```dockerfile
FROM eclipse-temurin:21-jre-alpine       # base image: a minimal OS + a specific JRE version
COPY target/payments-service.jar /app/app.jar
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "/app/app.jar"]
```
This `Dockerfile` describes how to build an image: start from a known base (OS + JRE), copy in the
built application, declare the port it listens on, and declare the startup command. `docker build`
turns this into an image; `docker run` starts a container from it.
:::

The nearest VM/WAR equivalent, for anchoring: the base image is roughly "the VM's OS and JRE
installation"; the `COPY` step is roughly "copying the WAR to the deploy folder"; the `ENTRYPOINT` is
roughly "the application server starting the app." The difference is that all of it — OS packages
included — is captured in one versioned, rebuildable artifact instead of being whatever state the VM
happens to be in.

:::callout{kind=tip title="Images are layered and cached"}
Each instruction in a Dockerfile creates a layer; unchanged layers are reused across builds. Ordering
matters: put things that change rarely (the base image, dependency installation) before things that
change often (your application code), so rebuilds are fast and only re-do the layers that actually
changed.
:::

## Container vs VM: what is actually different

A VM virtualises an entire computer, including its own kernel — a hypervisor runs several complete
guest operating systems on one physical machine. A container shares the host machine's kernel and
isolates only the process, filesystem and network view — it is a lighter-weight form of isolation.
Practically: containers start in roughly seconds rather than the minutes a VM boot can take, and many
containers can run on the same host with far less overhead than the same number of VMs, because there
is no duplicated OS kernel per instance.

:::engineer
```
VM:                                Container:
┌─────────────────────────┐        ┌─────────────────────────┐
│ App                     │        │ App                     │
│ Libraries                │        │ Libraries                │
│ Guest OS kernel          │        │ (shares host kernel)     │
├─────────────────────────┤        ├─────────────────────────┤
│ Hypervisor                │        │ Container runtime        │
├─────────────────────────┤        ├─────────────────────────┤
│ Host OS + hardware        │        │ Host OS + hardware        │
└─────────────────────────┘        └─────────────────────────┘
```
:::

:::manager
Containers are not automatically "more secure" or "less secure" than VMs — they have a different
isolation boundary (shared kernel vs separate kernel), which changes what a security review needs to
check. A container escape (a bug letting a process break out of its container) is a more direct route
to the host than a VM escape (breaking out of a hypervisor), because the kernel is already shared.
This is a real, specific question for a threat model, not a reason to avoid containers outright — ask
your security team what container-specific controls (e.g. rootless containers, restricted
capabilities) are in place, rather than assuming the isolation is equivalent to a VM's.
:::

## Environments, config, and rollback

None of this changes with containers: you still need separate **environments** (development, test,
staging, production) so changes are validated before they reach customers, still need a way to inject
environment-specific **configuration** (a database URL that differs between staging and production)
without rebuilding the image per environment, and still need **rollback** — a fast, reliable way back
to the previous known-good version when a deploy goes wrong.

What changes is the mechanism. With a WAR/VM deploy, rollback often meant redeploying the previous
WAR file and restarting, hoping the VM's other state (installed libraries, OS patches) had not drifted
since. With containers, rollback means running the previous image tag — since the image is immutable
and self-contained, "the previous version" is an exact, known artifact, not "whatever the VM looked
like last week."

:::engineer
```bash
docker run myregistry/payments-service:1.4.2     # deploy a specific, immutable version
docker run myregistry/payments-service:1.4.1     # rollback: run the previous tag, byte-for-byte
```
Configuration is injected at runtime, not baked into the image, typically as environment variables or
mounted config files, so the same image can run unchanged in staging and production with different
settings:
```bash
docker run -e DATABASE_URL=postgres://staging-db/... myregistry/payments-service:1.4.2
```
:::

:::manager
"Can we roll back in under five minutes, to an exact known state?" is the question to ask regardless
of deployment technology. Containers make the answer more reliably "yes" because the artifact is
immutable and versioned, but only if the team actually tags and retains old images and has practiced
the rollback, not just assumed it will work.
:::

## Common mistakes

- **Baking environment-specific config into the image** — then needing a separate image per
  environment, which defeats "build once, run anywhere" and reintroduces drift.
- **Treating a container like a lightweight VM you SSH into and patch.** Containers are meant to be
  replaced, not patched in place; a patched-in-place container's fix disappears the next time it
  restarts from the original image.
- **No image versioning discipline** — deploying `:latest` everywhere makes rollback ambiguous, because
  "latest" is not a fixed, reproducible version.
- **Large, bloated images** built from a full OS base image with unnecessary tools installed, which
  increases attack surface and slows every deploy.
- **Assuming containers are automatically portable across cloud providers** — the container itself is
  portable, but the surrounding infrastructure it depends on (managed databases, load balancers,
  identity services) usually is not, without real migration work.

:::callout{kind=bank-context}
A rollback plan is typically a mandatory field in a change record for a regulated deployment. With
image-based deployment, the honest, checkable answer is "redeploy image tag X, verified working in
staging" — a concrete artifact reference, not a description of manual steps. This is generally an
easier answer to defend in a Change Advisory Board (CAB) review than a WAR/VM rollback plan that
depends on the target VM's current, possibly-drifted state, though the actual rollback speed still
needs to be tested, not assumed.
:::

## Putting it together

::::exercise{id=ex-map-deploy-steps type=design title="Map a WAR deployment runbook to containers"}
Your current runbook for deploying a new version of an internal service: (1) build the WAR on a build
server, (2) SCP it to three application VMs, (3) stop the app server on each VM, (4) copy the new WAR
into the deploy folder, (5) start the app server, (6) tail the logs to confirm startup, (7) if
anything looks wrong, SCP the previous WAR back and repeat steps 3-6. Rewrite this as a container-based
runbook, and note anything that gets simpler or harder.
:::solution
1. Build a container image from the application (`docker build`), tag it with a version (e.g. a git
   commit SHA or semantic version), push it to an image registry.
2. Deploy that specific image tag to the target environment (which, on real infrastructure, is
   usually an orchestrator like Kubernetes rather than three individually-managed VMs — see
   Intermediate) instead of SCP-ing a file to named machines.
3-5. The orchestrator handles starting new containers from the image and stopping old ones — there is
   no manual "stop the app server, copy the file, start it again" sequence per machine.
6. Confirm startup via the orchestrator's health check status and centralized logs, not by SSHing into
   each VM to tail a file.
7. Rollback: redeploy the previous image tag. No file copying, and it is the exact previous artifact
   rather than "whatever was on the VM before."

What gets simpler: no per-VM manual steps, no risk of the three VMs ending up in different states, an
exact rollback artifact. What gets harder, or at least different: you now depend on an image registry
being available and correctly secured, and on the orchestrator itself being correctly configured —
the operational complexity has moved, not disappeared, and the team needs to actually own that new
layer.
:::
::::
