---
title: "Cloud Fundamentals (AWS & Azure)"
estimatedMinutes: 35
objectives:
  - "Name the four building blocks of cloud infrastructure: compute, storage, network, identity"
  - "Explain the shared responsibility model and where the provider's job ends"
  - "Explain what a region and an availability zone are, and why they matter for resilience"
status: ready
---

Public cloud is renting someone else's data centre by the API call instead of building your own.
The physical hardware — servers, disks, routers, the building, the power and cooling — belongs to
Amazon Web Services (AWS), Microsoft Azure, or Google Cloud Platform (GCP). What you get is a set of
building blocks you assemble through a console, a command line, or code. This lesson covers those
blocks and the two ideas — shared responsibility and regions — that shape every decision built on
top of them.

## Why this changes the job

On-premises, "we need a new server" meant a purchase order, a rack, a delivery date measured in
weeks, and a team that owned the physical box for its whole life. In the cloud it means an API call
that returns a running machine in minutes, billed by the second or hour, that you can destroy the
moment you stop needing it. The consequence for a manager: capacity planning stops being about
guessing demand six months out and buying for the peak; it becomes about paying roughly for what you
use, in exchange for a new set of decisions about cost, security and vendor dependency.

:::manager
The single biggest mindset shift for someone from an on-prem world: **infrastructure is now
disposable and elastic, not a fixed asset you depreciate over five years**. That changes budgeting
(capex to opex), changes the failure model (rebuild rather than repair), and changes what "capacity
planning" means. If your team is still requesting cloud resources with the lead times and mental
model of a hardware purchase order, that is the first thing to fix.
:::

## Compute: renting capacity by the hour

**Compute** is somewhere your code runs. The main shapes:

- **Virtual machines** — AWS EC2, Azure Virtual Machines. A full operating system you manage,
  closest to an on-prem server.
- **Containers** — a packaged application with its dependencies, run by a managed service (AWS ECS
  or EKS, Azure Container Apps or AKS) so you do not patch the underlying OS yourself.
- **Serverless functions** — AWS Lambda, Azure Functions. You supply code; the platform runs it on
  demand and you are billed per invocation, not for idle time.

:::engineer
```bash
# AWS: launch a small virtual machine
aws ec2 run-instances --image-id ami-0abcdef1234567890 --instance-type t3.small --count 1

# Azure equivalent
az vm create --resource-group myRG --name myVM --image Ubuntu2204 --size Standard_B2s
```
The instance types differ by provider (`t3.small` vs `Standard_B2s`) but the shape of the decision —
how much CPU and memory, and whether you need a full VM at all — is the same everywhere.
:::

:::manager
More managed (serverless) generally means less operational burden but less control and a different
cost curve — cheap at low, spiky volume; potentially more expensive than a VM at sustained high
volume. This tradeoff recurs everywhere in cloud and is worth a section of its own later.
:::

## Storage: object, block and file

Three storage shapes cover almost everything:

- **Object storage** — AWS S3, Azure Blob Storage. Store files (documents, images, backups,
  logs) addressed by a key, accessed over HTTP, effectively unlimited capacity. Not a filesystem you
  mount.
- **Block storage** — AWS EBS, Azure Managed Disks. A virtual hard disk attached to one virtual
  machine, formatted with a filesystem, used for a database's data files or an OS disk.
- **File storage** — AWS EFS, Azure Files. A shared filesystem multiple machines can mount at once,
  the cloud equivalent of a network file share.

:::engineer
Object storage is the default for anything that is not a running database's data files: it's
durable (AWS quotes 99.999999999% — "eleven nines" — durability for S3 Standard, achieved by storing
copies across multiple facilities), cheap, and infinitely scalable without you provisioning capacity
in advance.
:::

:::manager
The question to ask in a design review: "why block storage and not object storage here?" A team
storing large binary files (PDFs, images, backups) on an attached disk instead of object storage is
usually paying more and building their own replication and backup story for something the platform
already solved. Block storage is for things that genuinely need a filesystem underneath one machine
— mainly database engines.
:::

## Network and identity: the virtual data centre and who's allowed in

A **virtual network** (AWS VPC — Virtual Private Cloud, Azure VNet) is your own isolated slice of
the provider's network: your own IP address ranges, subnets, and rules about what can talk to what.
Nothing reaches your resources from the internet unless you explicitly allow it.

**Identity and access management (IAM)** controls who — a person or a piece of software — can do
what, on which resources. This is the cloud's replacement for physical access to a data centre: if
IAM is wrong, the "walls" of the virtual data centre mean nothing.

:::engineer
```json
// AWS IAM policy: allows reading objects from one S3 bucket, nothing else
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Action": "s3:GetObject",
    "Resource": "arn:aws:s3:::payments-archive/*"
  }]
}
```
Both AWS and Azure default to **deny everything**; access is a sum of explicitly granted
permissions. Azure's equivalent is role-based access control (RBAC) with built-in and custom roles
assigned at a subscription, resource group, or resource scope.
:::

:::manager
IAM is where "least privilege" stops being a slogan and becomes an enforceable setting. The review
question: does this service account or role have exactly the permissions it needs, or was it granted
broad admin access because that was faster to set up? Overly broad IAM roles are one of the most
common causes of cloud security incidents, and they are entirely self-inflicted.
:::

## Shared responsibility, regions and availability zones

The **shared responsibility model** splits security duties: the provider secures the physical data
centre, the hardware, and the virtualisation layer ("security **of** the cloud"). You secure your
data, your identity configuration, your network rules, and your operating system patches for
anything you manage yourself ("security **in** the cloud"). Moving to the cloud reduces your
responsibilities; it does not remove them.

A **region** is a geographic area (e.g. `eu-west-2` in London, `westeurope` in the Netherlands) with
multiple physically separate data centres called **availability zones**. Running across multiple
availability zones protects against a single data centre failure; running in one region only
protects against a whole-region event (rare, but it has happened) if you also replicate to a second
region.

:::engineer
```bash
# AWS: list availability zones in a region
aws ec2 describe-availability-zones --region eu-west-2
```
A resource is usually created "in" a region and, for most managed services, spread across zones for
you automatically if you ask for multi-AZ (e.g. RDS Multi-AZ deployment); for raw compute, you
place instances in specific zones yourself and put a load balancer in front to spread traffic.
:::

:::callout{kind=bank-context title="Data residency"}
Which region your data lives in is often a regulatory question, not just a technical one — some
data must stay within a country or economic area. Confirm the region for every service that stores
customer data, not just the primary database; logs, backups, and managed-service metadata can
default to a different region than you expect.
:::

:::manager
"Is this highly available?" should always get a follow-up: available across zones within one
region, or across regions? Most systems only need multi-AZ. Multi-region adds real cost and
complexity and is usually reserved for the handful of services where an entire region being
unavailable is unacceptable.
:::

## Common mistakes

- **Treating cloud resources like owned hardware** — leaving idle VMs running because "we might
  need it," instead of destroying and recreating on demand.
- **Overly broad IAM roles** granted for convenience during setup and never tightened afterwards.
- **Assuming the provider secures everything** — patching your own OS, encrypting your own data, and
  configuring your own network rules are still your job under shared responsibility.
- **Public by accident** — a storage bucket or database left open to the internet because a default
  or a quick fix was never revisited. This is one of the most common causes of real breaches.
- **Single availability zone for anything that matters** — no protection from a single data centre
  failure.

## Putting it together

::::exercise{id=ex-service-sketch type=design title="Place a new internal reporting service"}
Your team needs to stand up a small internal reporting service: a web app, a database holding
customer transaction summaries, and a nightly job that writes a CSV export to long-term storage. For
each part, name the AWS or Azure service category you'd use (compute, storage, network, identity),
and say one shared-responsibility item you would need to own yourselves.
:::solution
- **Web app**: compute — a container service (ECS/AKS) or a platform-as-a-service (AWS Elastic
  Beanstalk, Azure App Service) rather than a raw VM, since you don't need OS-level control. You own:
  application-level access control and keeping the app's dependencies patched.
- **Database**: a managed database service (AWS RDS, Azure SQL Database) rather than self-run on a
  VM, so the provider handles patching and backups of the engine. You own: which data is stored,
  encryption configuration, and IAM/network rules controlling who can reach it — and because this is
  customer transaction data, confirming the region satisfies data residency requirements.
- **Nightly CSV export**: object storage (S3/Blob Storage), not a file share — it's write-once,
  read-occasionally, and doesn't need a mounted filesystem. You own: bucket access policy (must not
  be public) and a lifecycle rule for how long exports are retained.
- **Network/identity**: a VPC/VNet with the database in a private subnet unreachable from the
  internet, and an IAM role for the app scoped only to the specific database and bucket it needs —
  not a broad admin role.

A manager reviewing this would ask specifically whether the database and bucket are reachable from
the public internet by default, and whether the app's IAM role is scoped to exactly these two
resources.
:::
::::
