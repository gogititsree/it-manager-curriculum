---
title: "CI/CD Concepts"
estimatedMinutes: 30
objectives:
  - "Explain what continuous integration and continuous delivery each solve, in one sentence"
  - "Name the stages a typical pipeline runs and what each one is checking for"
  - "Explain why the same build artefact should move through every environment unchanged"
status: ready
---

Continuous integration and continuous delivery (CI/CD) are the automated path a code change takes
from a developer's laptop to something running in production. Before CI/CD existed as a discipline,
that path was a person: someone copied files, ran a script by hand, and hoped. This lesson builds
the vocabulary you need to read a pipeline diagram and ask the right questions about one.

## Why automate the path to production

Every manual step between "code is written" and "code is running" is a place where the wrong
version ships, a step gets skipped under deadline pressure, or the only person who knows the
process is on leave. Automation does not remove judgement from releasing software; it removes
typing from it, so the judgement can be spent on whether to release, not on remembering the
eleven commands that make a release happen.

:::manager
The business case is not "developers like automation." It is **repeatability and evidence**. A
pipeline that runs the same steps every time produces a log of what happened, in what order, with
what result. That log is what you show an auditor instead of asking a person to remember what they
did on a Tuesday six months ago.
:::

:::engineer
A pipeline is usually defined as code, checked into the same repository as the application, so a
change to the pipeline is reviewed the same way as a change to the app:

```yaml
# .github/workflows/ci.yml (GitHub Actions) — the shape is similar in GitLab CI, Azure Pipelines
on: [push]
jobs:
  build:
    steps:
      - uses: actions/checkout@v4
      - run: npm ci
      - run: npm test
      - run: docker build -t myapp:${{ github.sha }} .
```
:::

## The pipeline: stages from commit to release

A pipeline is a sequence of automated stages, each one a gate. If a stage fails, the pipeline stops
and nothing moves forward. A typical pipeline:

1. **Build** — compile or bundle the code; fail fast on anything that does not even build.
2. **Test** — run unit tests, and often static analysis (linting, a security scanner).
3. **Package** — produce one immutable artefact: a container image, a JAR, a zip.
4. **Deploy to a test environment** — install the artefact somewhere real and run further checks
   (integration tests, sometimes automated UI tests).
5. **Deploy to production** — the same artefact, promoted, usually behind a manual or automatic
   approval gate.

:::engineer
Each stage should have one job and a clear pass/fail signal. A pipeline that has a single "run
everything" script hides which check actually failed and slows down feedback — a developer waits
twenty minutes to learn their code did not compile, instead of thirty seconds.
:::

:::manager
When you review a pipeline (or ask a vendor about theirs), ask what happens on failure: does it
stop, notify someone, and leave the previous version running? A pipeline that "usually works" and
has no clear failure behaviour is a bigger risk than a slow one.
:::

## Environments: dev, test, staging, production

An environment is a place the software runs, with its own configuration, data and (usually)
infrastructure. The standard progression is **development → test/QA → staging (or UAT) →
production**, each one closer to production conditions than the last. The point of the earlier
environments is to find problems where a failure costs nothing, before you find them where a
failure costs money or an incident report.

:::manager
The number and names of environments vary by shop, but the principle a manager should hold the line
on is: **production-like enough to be trustworthy, cheap enough to run often**. Environments that
drift from production configuration (different database version, missing firewall rule) produce the
worst kind of failure: the one that only shows up after go-live.
:::

:::engineer
Config differs by environment (a database URL, a feature flag); code does not. That split is usually
implemented with environment variables or a config service (e.g. AWS Systems Manager Parameter
Store, Azure App Configuration), never by branching the code itself.
:::

## Artefacts: build once, promote everywhere

An **artefact** is the packaged, versioned output of the build stage — a container image with a
tag, a JAR file, a compiled binary. The rule that separates a trustworthy pipeline from a risky one:
**build the artefact once, and move that exact artefact through every environment**. Never rebuild
from source for each environment. If you rebuild, you can no longer prove that what passed testing
is what reached production — a dependency could have updated in between builds.

:::engineer
Artefacts are stored in a registry: a container registry (Docker Hub, Amazon ECR, Azure Container
Registry) for images, or an artefact repository (JFrog Artifactory, Sonatype Nexus) for packages.
The artefact is tagged with a build number or commit hash, never with a mutable tag like `latest`,
so any environment can say exactly which version it is running.
:::

:::manager
Ask: "Is what's in production the same binary that passed our tests, or did something rebuild it
along the way?" If nobody can answer confidently, the pipeline is not doing the one thing it exists
to guarantee. This one question catches more real pipeline risk than most formal audits do.
:::

## Common mistakes

- **Rebuilding per environment** instead of promoting one artefact — breaks the guarantee that
  tested code is what ships.
- **Manual steps hiding inside an "automated" pipeline** — a human SSHing in to "just fix one
  thing" defeats the whole point and leaves no record.
- **No rollback plan** — a pipeline that can deploy forward but has no tested way to redeploy the
  previous artefact turns every release into a one-way door.
- **Testing only in an environment that does not resemble production** — passes in test, fails in
  production because of a config or data difference nobody checked.
- **Treating the pipeline definition as untested, unreviewed code** — it is code; it should be
  reviewed and can have bugs like any other code.

:::callout{kind=bank-context}
In a regulated environment, the pipeline log plus the artefact registry is often your primary
evidence for a change: who approved it, what tests ran, what got deployed and when. Treat "the
pipeline produces an auditable trail" as a requirement, not a side effect.
:::

## Putting it together

::::exercise{id=ex-pipeline-sketch type=design title="Sketch a pipeline for a new internal service"}
A team is building a small internal service (an expenses-approval API) that will call a payments
system. Sketch the pipeline stages from commit to production. For each stage, say what it checks
and what artefact or output it produces. Where would you put a manual approval, and why there and
not somewhere else?
:::solution
A reasonable shape:

1. **Build** — compile, produce a container image tagged with the commit hash.
2. **Test** — unit tests, dependency vulnerability scan; fail the pipeline on either.
3. **Package/publish** — push the image to the registry; this is the one artefact used from here on.
4. **Deploy to test** — deploy the same image, run integration tests against a fake or sandboxed
   payments endpoint.
5. **Manual approval** — before production, because this service touches payments; someone
   accountable confirms the tested version is the one going live. Put the gate here, not earlier,
   because earlier gates would just be approving untested code, and not later, because after this
   point deployment should be fully automatic and fast.
6. **Deploy to production** — the same image; smoke test; automatic rollback trigger if the smoke
   test fails.

The key thing a manager should look for in this answer: one artefact carried through unchanged, and
the approval placed where a human judgement genuinely adds value (is this the right change to make
now) rather than where it just re-does what the tests already checked.
:::
::::
