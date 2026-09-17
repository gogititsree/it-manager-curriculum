---
title: "CI/CD Concepts — refresher"
estimatedMinutes: 15
objectives:
  - "Re-anchor pipeline, environment and artefact vocabulary in ten minutes"
  - "Know what moved since the Jenkins-and-shell-scripts era: GitHub Actions/GitLab CI, GitOps, policy-as-code"
  - "Spot the gotchas that still cause outages even on modern tooling"
status: ready
---

You built and ran pipelines before, probably hand-rolled Jenkins jobs or a shell script triggered by
a cron job or a webhook. The core idea — automate the path from commit to production, with gates —
has not changed. Where the pipeline lives, how it is defined, and how deployment state is tracked
have.

## What you probably remember

| Concept | One-line anchor |
| --- | --- |
| Pipeline | Automated stages from commit to release; each stage is a pass/fail gate. |
| Environments | dev → test/QA → staging → production, each closer to real conditions. |
| Artefact | The one built, versioned thing (image, JAR, binary) promoted unchanged through every stage. |
| Continuous integration | Merge and test frequently, catch integration problems in hours, not weeks. |
| Continuous delivery/deployment | Every change that passes the pipeline is releasable (delivery) or actually released (deployment) automatically. |
| Rollback | A tested way to redeploy the previous artefact; not a plan, a rehearsed action. |

## What changed since

:::callout{kind=changed-since title="Jenkins → hosted, YAML-defined pipelines"}
Self-hosted Jenkins with Groovy `Jenkinsfile`s is now one option among several, not the default.
GitHub Actions and GitLab CI (both mainstream since roughly 2019–2020) define pipelines in YAML,
live in the same repository as the code, and run on hosted runners you don't patch yourself. Azure
DevOps Pipelines does the same for Microsoft shops. The practical difference for you: pipeline
definitions are now reviewed in the same pull request as the code change, and "who maintains the CI
server" is largely no longer your team's problem.
:::

:::callout{kind=changed-since title="GitOps (mainstream since ~2020, via Argo CD / Flux)"}
Instead of the pipeline pushing changes directly to production (`kubectl apply`, `terraform apply`
run from CI), a **GitOps** controller (Argo CD, Flux) running in the target environment continuously
reconciles what's running against a git repository that declares the desired state. The pipeline's
job becomes: build, test, and open a pull request updating the desired-state repo. Deployment
becomes a git merge, which means it inherits code review, and the running state can never silently
drift from what's in git, because the controller keeps re-applying it.
:::

:::callout{kind=changed-since title="Policy-as-code (OPA/Conftest, mainstream mid-2020s)"}
Gates that used to be a checklist a human read ("does this change follow naming conventions? does it
avoid public S3 buckets?") are increasingly enforced by tools like Open Policy Agent (OPA) or
cloud-native policy engines (AWS Config rules, Azure Policy) that evaluate infrastructure-as-code
before it applies and fail the pipeline automatically. This converts "policy is a document" into
"policy is a gate," with a log of every pass and fail — a much stronger audit story than a checklist.
:::

:::engineer
```yaml
# GitHub Actions calling an OPA policy check before a Terraform apply
- name: Policy check
  run: conftest test --policy policy/ infra/plan.json
- name: Terraform apply
  run: terraform apply -auto-approve tfplan
```
And the GitOps shift means fewer credentials in the pipeline itself: the pipeline needs write access
to a git repo, not standing deploy credentials into production.
:::

:::manager
What this means in review: if a team's pipeline still runs `kubectl apply` or `terraform apply`
directly from a CI job with long-lived cloud credentials sitting in CI secrets, that is now the
older, higher-risk pattern, not the default. Ask why they have not moved to a pull-based (GitOps)
model, and where the deploy credentials live and how they are rotated.
:::

## Gotchas that still bite

- **"Build once" gets violated by container base image drift.** Rebuilding a Docker image days
  later with `latest` base tags pulls a different OS patch level than what was tested — pin base
  image digests, not just tags.
- **Feature flags nobody retires.** Trunk-based development plus flags left in code for years
  becomes its own tangle of untested combinations. Flags need an owner and an expiry.
- **Pipeline secrets sprawl.** Long-lived API keys and cloud credentials sitting in CI secret stores
  are a common breach vector; short-lived, workload-identity-based credentials (OIDC federation from
  GitHub Actions to AWS/Azure, no stored key at all) are the current answer.
- **"It works in staging" with staging on different data or scale.** Environment parity is still a
  discipline, not something GitOps or better YAML buys you automatically.
- **Approval fatigue.** Automated gates just move the rubber-stamp problem to a person clicking
  "approve" on a dashboard without reading it, if the gate isn't actually risk-based.

:::callout{kind=bank-context}
GitOps' git-as-source-of-truth model is a genuinely good fit for audit: every production change is a
merged, reviewed, timestamped git commit with an author, rather than a log entry in a CI tool that
may or may not be retained as long as your regulator wants. Worth raising with your risk team if they
still think of "the pipeline logs" as the primary evidence.
:::

## Ten-minute drill

::::exercise{id=ex-modernise-pipeline type=scenario title="A team wants to modernise a Jenkins/shell-script pipeline"}
A team runs a self-hosted Jenkins server with a 400-line shell script pipeline, deploying by SSHing
into servers and running `kubectl apply` with a long-lived service account key stored in Jenkins
credentials. They ask where to start. What do you tell them, in priority order, and why that order?
:::solution
1. **Get the deploy credential off long-lived storage first** — move to short-lived, federated
   credentials (OIDC) if staying with direct-apply, since this is the highest-severity risk (a
   stolen static key) and the cheapest to fix.
2. **Move the pipeline definition into YAML in the repo** (GitHub Actions/GitLab CI, or keep Jenkins
   but move to a `Jenkinsfile`) so it is reviewed like code — this pays off immediately regardless of
   what else changes.
3. **Introduce GitOps for the deploy step** (Argo CD/Flux) once the above is stable — this is the
   biggest structural change and benefits from not being done under time pressure with the other two
   risks still open.
4. Retire the shell script incrementally behind the new pipeline definition rather than a big-bang
   rewrite, so you are never running an untested pipeline against production.

The order matters because it fixes the worst risk (standing credentials) first and cheapest, defers
the highest-effort change (GitOps) until the foundation is stable, and avoids a risky all-at-once
migration.
:::
::::
