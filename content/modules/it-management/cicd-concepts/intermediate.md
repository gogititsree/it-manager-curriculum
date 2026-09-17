---
title: "CI/CD in Regulated Shops: Patterns and Gates"
estimatedMinutes: 40
objectives:
  - "Compare trunk-based development and GitFlow and say when each earns its cost"
  - "Design approval gates that satisfy segregation of duties without becoming rubber stamps"
  - "Read the four DORA metrics and use them to ask better questions of a delivery team"
status: ready
---

You know the stages, environments and artefacts. This lesson is about the decisions that separate a
pipeline that ships safely every day from one that "works" but everyone is afraid to touch.

## Where the basics break down

A pipeline that builds, tests and deploys one artefact is necessary but not sufficient once you have
more than one team, a change-control process, and things that must never go live untested. The
basics do not say: which branching model keeps merges from becoming weekly disasters; who is allowed
to approve what; how you know the pipeline is actually making delivery faster and safer rather than
just busier; and who owns the pipeline itself. Those are the questions that separate a mature
delivery organisation from one that has automated its way into a faster version of the same chaos.

## Trunk-based development vs GitFlow

**GitFlow** (long-lived `develop`, feature branches, release branches, hotfix branches) was designed
for infrequent, versioned releases — think shrink-wrapped software with a release every few months.
**Trunk-based development** (short-lived branches, usually merged within a day, everyone integrating
into `main` constantly) is designed for the opposite: continuous delivery, many small releases.

:::callout{kind=decision title="Which branching model?"}
- Releasing continuously, want fast feedback, have good automated test coverage → **trunk-based**,
  with feature flags to hide unfinished work rather than long-lived branches.
- Shipping discrete versions to external customers on a schedule (e.g. a vendor product with
  quarterly releases), or test coverage is too thin to trust `main` at all times → **GitFlow** or a
  simpler release-branch model, accepting the merge overhead.
- Most in-house bank systems that deploy internally and often should default to trunk-based; the
  historical reason for GitFlow (infrequent releases) usually does not apply to them any more.
:::

:::engineer
Trunk-based development depends on feature flags to let incomplete work sit in `main` without being
active in production:

```java
if (featureFlags.isEnabled("new-approval-workflow", customerId)) {
    return newApprovalService.approve(request);
}
return legacyApprovalService.approve(request);
```
Tools like LaunchDarkly, Unleash, or a simple config-driven flag table all do this. The flag itself
becomes something to track and retire — a codebase with three-year-old flags is its own kind of debt.
:::

:::manager
GitFlow's long-lived branches feel safer to a manager because they look like a controlled process.
In practice, long branches mean big, risky merges and delayed feedback — the opposite of safety. If
a team defends GitFlow, ask what their merge conflict rate and average branch age look like. Those
numbers usually make the case for trunk-based on their own.
:::

## Gates and approvals in a regulated shop

A **gate** is a point in the pipeline that must pass before the next stage runs. Gates are either
automatic (a test suite, a security scan, a policy check) or manual (a person approves). The
mistake regulated shops make most often is putting a manual gate where an automatic one would do the
job better and faster, purely because "someone needs to sign off" satisfies an audit checkbox
without satisfying the actual control.

:::manager
**Segregation of duties** in a pipeline means the person who wrote the code is not the same person
who approves its release to production, and ideally cannot deploy it themselves without that
approval being recorded. Implement this as a pipeline rule (a required reviewer group, a protected
branch, a required approval step in the deployment tool), not as a policy document nobody checks.
Ask your team: if I tried to deploy without approval, would the pipeline actually stop me?
:::

:::engineer
GitHub, GitLab and Azure DevOps all support **required reviewers** and **protected environments**:
a deployment to the `production` environment can require one or more approvals from a specific
group, recorded automatically with who approved and when — this is the audit trail, generated for
free instead of chased after the fact.

```yaml
# GitHub Actions: environment protection rule (configured in repo settings, referenced here)
jobs:
  deploy-prod:
    environment: production   # production environment has required reviewers configured
    steps:
      - run: ./deploy.sh
```
:::

:::callout{kind=bank-context title="Change advisory boards (CAB) vs pipeline gates"}
A weekly CAB meeting reviewing every change is slow and, for low-risk changes, adds no real safety —
it becomes a rubber stamp because nobody has time to genuinely review forty changes an hour. The
pattern that works: automatic risk-scoring (based on what changed, blast radius, test coverage) that
routes low-risk changes through an automated gate and reserves human review for genuinely high-risk
ones. This is what "pipeline as the control" means to an auditor, once you can show the routing
logic and the log of decisions it made.
:::

## DORA metrics: measuring delivery, not activity

The DORA (DevOps Research and Assessment) research program identified four metrics that correlate
with both delivery speed and stability — they are not in tension, contrary to older assumptions:

| Metric | What it measures | Elite performers (2023 State of DevOps report) |
| --- | --- | --- |
| Deployment frequency | How often code reaches production | On-demand, multiple times a day |
| Lead time for changes | Commit to running in production | Less than one day |
| Change failure rate | % of deployments causing a production failure | 0–15% |
| Time to restore service | How fast you recover from a failure | Less than one hour |

:::manager
These four together stop a single-metric trap. Deployment frequency alone rewards shipping often and
badly; change failure rate alone rewards shipping rarely and "safely" (slowly). Ask a delivery team
for all four, not the one that makes them look best. A team with high deployment frequency and low
change failure rate is doing something structurally right — small batches, good automated tests, fast
rollback — that is worth understanding and spreading, not just praising.
:::

:::engineer
These are measured from pipeline and incident data, not self-reported: deployment timestamps from
the CD tool, commit timestamps from git, incidents tagged as change-caused in the incident tool, and
time-to-resolve from the same. If a team cannot produce these numbers from tooling, they are
guessing, and the number is not trustworthy yet.
:::

## Pipeline as product

Treat the pipeline itself as a product with users (the engineers who wait on it) and a backlog. A
pipeline that takes forty minutes trains engineers to batch changes and context-switch away, which
increases batch size and therefore risk — the opposite of what CI/CD is for. Someone should own
pipeline reliability and speed the way someone owns application reliability.

:::manager
If engineers routinely say "the pipeline is slow, so I bundle three days of changes into one push,"
that is a direct, measurable cause of your change failure rate. Fixing pipeline speed is often a
higher-leverage investment than adding more manual review, because it fixes the batch-size problem
at the root.
:::

:::engineer
Treat pipeline duration itself as a metric with a target and an owner:

```
p50 pipeline duration: 6 min   (target: < 10 min)
p95 pipeline duration: 22 min  (target: < 15 min — currently missed, investigate the outlier stage)
```
Parallelise independent test suites, cache dependencies between runs, and split a single "run
everything" job into stages that fail fast, so a broken build is reported in seconds, not after a
twenty-minute full run.
:::

## What good looks like

A review checklist for a pipeline you are inheriting or approving:

- One artefact is built once and promoted unchanged through every environment.
- Every path to production goes through the pipeline — no direct server or console access that
  bypasses it for routine changes.
- Approval gates map to genuine risk (segregation of duties, blast radius), not blanket process.
- Rollback is a tested, one-command (or one-click) action, not a plan that has never been rehearsed.
- The pipeline's own definition is version-controlled and reviewed like application code.
- Someone can produce deployment frequency, lead time, change failure rate and restore time on
  request, from tooling, without a manual audit.
- Secrets (API keys, database passwords) are injected by a secrets manager (Vault, AWS Secrets
  Manager, Azure Key Vault), never committed to the pipeline definition or the repo.

## Exercises

::::exercise{id=ex-gate-scenario type=scenario title="The team wants to skip the pipeline for a hotfix"}
Production is down. The team wants SSH access to patch the server directly "just this once" instead
of going through the pipeline, which takes fifteen minutes. What do you ask, and what do you decide?
:::solution
Ask first: why does the pipeline take fifteen minutes for an emergency fix — is there a fast-path
(a pre-approved emergency change process with a smaller test set) that still goes through the
pipeline, or does emergency literally mean "no pipeline exists for this case"? If there is no
fast path, that is the real gap, and building one (documented, pre-approved, still leaves an audit
trail, still deploys the built artefact) is a better fix than allowing ad hoc SSH access.

Decide: allow direct access only under a documented break-glass procedure — time-boxed, logged,
requiring a follow-up entry of exactly what changed, and a mandatory post-incident item to bring the
change back through the normal pipeline so the running system matches what is in source control
again. Unlogged direct access, even "just this once," breaks the guarantee that production matches
what was tested, and normalises the exception.
:::
::::

::::exercise{id=ex-branching-scenario type=scenario title="A team defends long release branches"}
A team maintaining a policy engine used by three other teams wants to keep a `develop` branch and
cut a release branch every two weeks, arguing their consumers need stability. What questions surface
whether this is the right call, and what alternative would you propose?
:::solution
Ask: what actually breaks for consumers on more frequent releases — is it the deploy cadence, or
breaking API changes landing without warning? Those are different problems with different fixes.
Ask about their test coverage and merge conflict pain on the current model; a two-week branch is
often hiding a testing gap, not solving a real consumer-stability problem.

Alternative: trunk-based development with versioned API contracts and feature flags for
work-in-progress; consumers pin to a stable API version, not to a release branch. This gets the team
faster feedback and smaller merges while giving consumers the actual thing they need — a stable
contract, not an infrequent deploy.
:::
::::
