---
title: "Cloud at Scale: Landing Zones, IAM and the Bill"
estimatedMinutes: 45
objectives:
  - "Explain what a landing zone is and why a single shared account/subscription doesn't scale"
  - "Design IAM using groups and roles rather than per-person or per-service grants"
  - "Read a cloud bill well enough to ask the right cost questions"
status: ready
---

You know compute, storage, network and identity as single building blocks. This lesson is about
what changes once there are dozens of teams, hundreds of accounts, and a monthly bill someone has to
defend.

## Where the basics break down

One AWS account or one Azure subscription, with a hand-configured VPC and a handful of IAM roles,
works fine for a pilot. It stops working once ten teams need isolated environments, security needs
guardrails that don't depend on every engineer configuring things correctly, and finance needs to
know which team is spending what. The single-account model has no natural way to isolate blast
radius (one team's mistake can affect another's resources), no consistent baseline for security
controls, and no clean cost attribution. All three problems have a standard answer.

## Landing zones: the pattern for many accounts

A **landing zone** is a pre-configured, multi-account (AWS) or multi-subscription (Azure)
environment with guardrails baked in before any team starts building: a standard account structure,
centralised logging, a baseline set of security policies applied automatically, and a defined way
for new accounts to be provisioned. AWS's reference implementation is **AWS Control Tower**; Azure's
is the **Azure Landing Zone** pattern built on **management groups** and **Azure Policy**.

:::engineer
A typical account structure: a management/root account (billing and organisation-wide policy only,
nothing runs here), a shared-services account (logging, networking hub, CI/CD), and one or more
accounts per team or environment (dev, test, production), each isolated by default. AWS
Organizations with Service Control Policies (SCPs) enforces guardrails ("no account may disable
CloudTrail logging") that individual account admins cannot override.
:::

:::manager
The business case for a landing zone: it turns "did the team configure security correctly?" from a
question you ask after the fact into a guarantee enforced before the team can do anything at all. If
your organisation is provisioning cloud accounts ad hoc, with security review happening per-project
after the account already exists, that is the single highest-leverage gap to close — it does not
scale past a handful of teams and every account is a fresh chance to get something wrong.
:::

## IAM design: groups, roles and federation

At scale, IAM stops being about individual permission grants and becomes about **roles** (a defined
set of permissions for a job function, e.g. "read-only database access for the reporting team") and
**federation** (people authenticate through your existing identity provider — Azure AD/Entra ID,
Okta — rather than having separate cloud-provider passwords).

:::callout{kind=decision title="Per-person IAM users vs federated roles"}
- Small pilot, a handful of people, short-lived → individual IAM users can be acceptable, tracked
  carefully, still with MFA.
- Any real organisation, especially regulated → **federated roles only**. People and services assume
  a role through your identity provider; there is no separate cloud password to leak, rotate, or
  forget to revoke when someone leaves. Joiner/mover/leaver process changes one place (the identity
  provider), not every cloud account.
:::

:::engineer
```
# AWS: a person authenticates via SSO (federated through the identity provider) and assumes a role
aws sts assume-role --role-arn arn:aws:iam::123456789012:role/ReportingReadOnly --role-session-name jsmith

# The role's policy grants only what "reporting read-only" needs — nothing implicit, nothing broad
```
Service-to-service access follows the same principle: a Lambda function or an EC2 instance assumes a
role via an **instance profile** or, better, short-lived credentials — never a hard-coded access
key.
:::

:::manager
Privileged access management (PAM) is the review question that matters most here: who has standing
admin access to production, and is it time-boxed ("just-in-time" elevation, expiring after a few
hours) or permanent? Permanent standing admin access for a broad group of engineers is the single
most common finding in a cloud security review, and it is entirely a policy choice, not a technical
limitation.
:::

## Networking beyond one VPC

Once you have more than one account, networks need to talk to each other without exposing anything
to the public internet. Two common patterns:

- **Hub-and-spoke** — a central "hub" VNet/VPC holds shared services (a firewall, a VPN or
  Direct Connect/ExpressRoute link back to the bank's own data centre); "spoke" VPCs peer to the hub,
  not to each other, so traffic is inspectable and blast radius stays contained.
- **Private connectivity to managed services** — AWS PrivateLink / VPC endpoints, Azure Private Link
  let a VM reach a managed service (a database, a storage account) without the traffic ever crossing
  the public internet, even though the service is technically "outside" your VPC.

:::manager
The question for a design review: does traffic between this new service and our on-prem systems, or
between two cloud accounts, ever transit the public internet, even briefly and even encrypted? For a
bank, the answer your network and security teams usually want is no — private connectivity
(ExpressRoute/Direct Connect plus PrivateLink/Private Link) end to end.
:::

:::engineer
```hcl
# Terraform: a VPC endpoint so traffic to S3 never leaves AWS's private network
resource "aws_vpc_endpoint" "s3" {
  vpc_id       = aws_vpc.main.id
  service_name = "com.amazonaws.eu-west-2.s3"
}
```
A hub-and-spoke topology is usually built with a Transit Gateway (AWS) or Virtual WAN (Azure) at the
hub, with spoke VPCs/VNets attached to it rather than peered directly to each other — this keeps the
number of connections linear in the number of spokes instead of growing as a full mesh.
:::

## Managed services vs self-run

Almost everything you'd run yourself has a managed equivalent: a database on a VM vs RDS/Azure SQL
Database; Kafka you operate vs Amazon MSK/Azure Event Hubs; a Kubernetes cluster you build vs
EKS/AKS.

:::callout{kind=decision title="Managed vs self-run"}
- Default to **managed** unless you have a specific, articulated reason not to (a feature the managed
  version lacks, a cost model that doesn't fit your usage pattern, or a hard requirement to run
  on-prem/air-gapped). Managed services shift patching, backup, and high-availability engineering
  onto the provider, which is almost always cheaper than the engineering time to replicate it well.
- Self-run remains justified for: very large, steady-state workloads where the managed premium is
  significant at scale; software with no managed equivalent; or genuine regulatory constraints on
  where control-plane operations can happen.
:::

:::manager
When a team proposes running their own database on a VM instead of using the managed service, the
honest cost comparison is not "managed service price vs VM price" — it's "managed service price vs
VM price plus the engineering hours to build and maintain patching, backup, failover and monitoring
to the same standard." That second number is usually far larger than the sticker price suggests, and
almost nobody tracks it against the decision after the fact.
:::

:::engineer
```bash
# AWS RDS: a managed PostgreSQL instance with automated backups and Multi-AZ failover,
# provisioned in one command instead of built by hand
aws rds create-db-instance --db-instance-identifier reporting-db \
  --engine postgres --multi-az --backup-retention-period 7 \
  --db-instance-class db.t3.medium --allocated-storage 100
```
Compare that one command to standing up PostgreSQL on a VM: OS patching, replication configuration,
backup scripting, and failover testing are all now the provider's problem instead of yours.
:::

## The bill

Cloud costs are usage-based and itemised at a granularity that's overwhelming without structure.
Three practices make a bill reviewable:

- **Tagging** — every resource tagged with team, environment, and cost centre, enforced (not just
  requested) via policy, so cost can be attributed rather than guessed at.
- **Budgets and alerts** — AWS Budgets, Azure Cost Management alerts, set per account/subscription
  or per tag, so an unexpected spike is caught in days, not at month-end.
- **Reserved/committed pricing** for predictable, steady-state workloads (AWS Reserved
  Instances/Savings Plans, Azure Reservations) once usage is understood — often 30–60% cheaper than
  on-demand for workloads that don't vary.

:::engineer
```bash
# AWS: cost by tag, last 30 days
aws ce get-cost-and-usage --time-period Start=2026-08-15,End=2026-09-15 \
  --granularity MONTHLY --metrics "UnblendedCost" --group-by Type=TAG,Key=team
```
Without enforced tagging this query returns a large "untagged" bucket that nobody can explain,
which is the most common reason a cloud cost review stalls.
:::

:::manager
Ask any team requesting new cloud spend three things: is it tagged so it shows up in cost
attribution, is there a budget alert on it, and is it sized for actual measured usage or a guess? A
team that cannot answer the first two has no way to notice if the bill triples next month until
finance asks about it.
:::

## What good looks like

- New accounts/subscriptions come from a landing zone pipeline with guardrails already applied, not
  a manual setup.
- No standing broad admin access to production; privileged access is time-boxed and logged.
- All human and service access is federated through the identity provider; no long-lived access
  keys in code or CI secrets.
- Cross-account and cross-environment traffic uses private connectivity, not the public internet.
- Every resource is tagged for cost attribution, and budgets have alerts, not just after-the-fact
  reports.
- "Should this be managed or self-run?" has been asked and answered with a reason, not defaulted by
  habit.

## Exercises

::::exercise{id=ex-landing-zone-scenario type=scenario title="A team wants a shortcut around the landing zone"}
A team says the landing zone provisioning process takes two weeks and they need an environment
tomorrow for a proof of concept. They ask for a standalone account outside the normal process, "just
for now." What do you ask, and what do you decide?
:::solution
Ask: what specifically takes two weeks — is it the guardrail application itself (usually automated
and fast) or a manual approval queue behind it? That's a process problem to fix, separate from
whether this PoC needs an exception. Ask what the PoC will touch — any real or customer data, any
connectivity to production systems — because "just a PoC" environments have a habit of quietly
becoming permanent with none of the guardrails ever retrofitted.

Decide: push for a fast-track landing zone path (many organisations build exactly this — a
lighter-weight, faster provisioning tier for sandboxes with no real data and no production
connectivity) rather than an ungoverned exception. If a true exception is unavoidable, time-box it
explicitly with a calendar reminder to either decommission or bring it into the landing zone, and
never let it hold real customer data in the meantime.
:::
::::

::::exercise{id=ex-cost-scenario type=scenario title="The cloud bill jumped 40% and nobody knows why"}
Finance flags a 40% month-on-month increase in cloud spend. Tagging coverage is about 60%. Walk
through how you would investigate and what you would put in place so this doesn't recur.
:::solution
Investigate: start with the cost-by-service breakdown for the month, compare to the prior month to
find which service categories grew; then break the top movers down by tag where tags exist, and by
account/subscription where they don't, to narrow to a team. Check for the common culprits: a
forgotten large resource left running (e.g. a test environment never torn down), a change in usage
pattern (a new feature driving real traffic — not necessarily bad, just needs to be understood), or
a pricing tier change (on-demand vs reserved, or a service moved to a more expensive tier).

Put in place: enforce tagging via policy so it can't be skipped (a resource without required tags
fails to deploy, not just gets flagged later), budget alerts per account so a 40% jump is caught in
week one, and a monthly cost review as a standing agenda item with the biggest movers surfaced
automatically — not something finance has to chase engineering to explain after the fact.
:::
::::
