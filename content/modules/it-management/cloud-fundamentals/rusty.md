---
title: "Cloud Fundamentals — refresher"
estimatedMinutes: 18
objectives:
  - "Map on-prem infrastructure concepts to their AWS and Azure equivalents"
  - "Identify what is genuinely different about cloud, not just renamed"
  - "Spot the gotchas that catch experienced infrastructure people specifically"
status: ready
---

You ran data centres, or managed people who did. You know what a firewall rule, a SAN, and a load
balancer are. Most of cloud is the same concepts with new names and an API in front of them. Some of
it is genuinely different. This refresher is the map.

## What you probably remember (mapped to cloud names)

| On-prem concept | AWS | Azure |
| --- | --- | --- |
| Physical/virtual server | EC2 instance | Virtual Machine |
| SAN / attached disk | EBS volume | Managed Disk |
| Network file share | EFS | Azure Files |
| Data centre network segment | VPC (+ subnets) | VNet (+ subnets) |
| Firewall / ACL | Security Group, NACL | Network Security Group (NSG) |
| Load balancer | ELB / ALB / NLB | Azure Load Balancer / Application Gateway |
| DNS | Route 53 | Azure DNS |
| Active Directory | AWS IAM Identity Center (+ AD Connector) | Azure AD / Entra ID (native) |
| Off-site backup / tape archive | S3 Glacier | Azure Blob Archive tier |
| Site-to-site VPN / leased line | Direct Connect | ExpressRoute |
| Rack/site as a fault domain | Availability Zone | Availability Zone |
| Data centre / campus | Region | Region |

## What is genuinely different

:::callout{kind=changed-since title="Infrastructure is code, not inventory"}
The biggest real change is not a renamed box, it's that everything is provisioned by API call and
typically defined declaratively — Terraform, AWS CloudFormation, Azure Bicep/ARM templates — checked
into version control the same way application code is. "What's our network topology?" should be
answerable by reading a repository, not by asking whoever last touched the router. If your
organisation still configures cloud resources by hand through the console, you have not actually
picked up the main benefit of the cloud model yet.
:::

:::callout{kind=changed-since title="Elasticity changes capacity planning entirely"}
You no longer buy for peak and run at 20% average utilisation for three years. Auto-scaling adjusts
compute to actual demand, and you're billed close to what you use. This changes the manager's
question from "did we buy enough hardware" to "is our architecture actually able to scale down when
demand drops, or are we paying cloud prices for on-prem-shaped fixed capacity?" A lot of early cloud
migrations lift-and-shift a fixed-size estate and get none of the cost benefit as a result.
:::

:::callout{kind=changed-since title="Identity, not the network perimeter, is now the primary boundary"}
On-prem security leaned heavily on network perimeter (if you're inside the firewall, you're mostly
trusted). Cloud, especially with remote/hybrid work and services that must be reachable over the
internet at all, leans on identity: IAM policies and role assumption enforce "who can do what"
regardless of network location. This is also the direction on-prem security has moved (zero trust),
but in cloud it's not optional — there usually is no equivalent of "physically inside the building."
:::

:::callout{kind=changed-since title="Managed services replace a lot of what used to be a team's job"}
Patching a database engine, configuring replication, running backups — a managed service (RDS,
Azure SQL Database) does this for you now, for a price. The skill that mattered — deep operational
tuning of a specific engine — still matters, but less of your team's time goes to keeping the lights
on and more to using the engine well. Evaluate proposals to self-manage something the cloud provider
offers managed with real scepticism; it is usually reproducing work the provider already does well.
:::

:::engineer
```hcl
# Terraform: the modern equivalent of a change ticket + a runbook, as a reviewable diff
resource "aws_db_instance" "reporting" {
  engine            = "postgres"
  instance_class    = "db.t3.medium"
  allocated_storage = 50
  multi_az          = true
}
```
`terraform plan` shows exactly what will change before it happens — the equivalent of a pre-change
review, generated automatically instead of written by hand.
:::

:::manager
The mapping table gets you 80% of the way to reading a cloud architecture diagram. The other 20% —
infrastructure as code, elasticity-driven cost, identity as the perimeter, and managed services doing
what your team used to — is where the real judgement calls are now, and where "we've always done it
this way" from an on-prem career stops being reliable guidance.
:::

## Gotchas that still bite

- **Lift-and-shift with no redesign.** Moving a fixed-size on-prem architecture to cloud VMs keeps
  the cost structure of on-prem (fixed capacity) while adding a margin on top. The savings come from
  redesigning to use elasticity and managed services, not from the move itself.
- **Assuming "in the cloud" means "backed up."** Object storage durability protects against hardware
  failure, not against someone deleting the wrong bucket or a ransomware-style overwrite. You still
  need versioning, backup, and a deletion-protection policy.
- **IAM roles copied from an old tutorial or a "just make it work" fix**, left broad forever.
  Standing broad access is still the most common real-world cloud security finding.
- **Assuming shared responsibility means the provider handles security.** They handle the data
  centre and the platform; your data, your configuration, your IAM, your patches on anything you
  manage are still yours.
- **Egress cost surprises.** Data transfer out to the internet (and sometimes between regions) is
  billed and easy to miss when estimating; data transfer in is usually free. A design that moves a
  lot of data out (backups to another provider, cross-region replication) needs this modelled up
  front.

:::callout{kind=bank-context}
Data residency and audit trail requirements do not go away in the cloud; they move to configuration
(which region, which logging is enabled, who can access it) instead of physical control. Confirm
region and logging settings explicitly for every service touching regulated data — don't assume the
provider's defaults satisfy your regulator.
:::

## Ten-minute drill

::::exercise{id=ex-onprem-mapping type=scenario title="Translate an on-prem design to cloud, and find what's actually different"}
An on-prem design has: two application servers behind a hardware load balancer, a SAN-backed
database server with nightly tape backup, and a firewall rule allowing only the load balancer to
reach the app servers. Translate this to an AWS or Azure equivalent, and name one thing about the
cloud version that is not just a renamed component.
:::solution
Translation: an Auto Scaling Group (or VM Scale Set) of app server instances behind an Application
Load Balancer (or Application Gateway); a managed database (RDS/Azure SQL Database) with automated
backups instead of a self-run database on SAN storage with tape; a Security Group/NSG on the app
instances allowing inbound only from the load balancer.

What's genuinely different, not just renamed: the Auto Scaling Group means the number of app
servers now flexes with load automatically, and the managed database means backup, patching and
failover are the provider's job, not a nightly tape job someone owns. Both of these change ongoing
operational work and cost structure, not just vocabulary — which is the actual point of making the
move, not merely the fact that the diagram now has different icons.
:::
::::
