---
title: "Deciding at Scale: Tradeoffs, RFCs and Disagreement"
estimatedMinutes: 40
objectives:
  - "Run a lightweight quality-attribute tradeoff analysis (ATAM-lite) on a real design"
  - "Design an RFC process that gets genuine input without stalling every decision"
  - "Classify a decision as reversible or one-way, and apply the right amount of process to each"
status: ready
---

You can write a clean ADR for a decision you own. This lesson is about decisions that involve
several teams, real disagreement, and tradeoffs between quality attributes that pull in different
directions — where a one-page template alone doesn't tell you how to run the conversation.

## Where the basics break down

An ADR documents a decision well after — or right as — it's made. It says nothing about how to
surface the tradeoffs *before* committing, how to get honest input from people who disagree with the
likely outcome, or how much process a given decision deserves. Applying the same heavyweight review
to a config change and a core-ledger technology choice wastes effort on the former and under-serves
the latter. The gap at this level is judgement about process, not documentation format.

## ATAM-lite: quality-attribute tradeoffs

The **Architecture Tradeoff Analysis Method (ATAM)**, developed at the Software Engineering
Institute, is a formal, multi-day workshop process. Most teams don't need the full version, but the
core idea scales down well — call it **ATAM-lite**:

1. List the **quality attributes** that matter for this decision (e.g. availability, latency,
   consistency, cost, time-to-market, auditability) — usually 3–5, rarely more.
2. For each candidate design, score how it affects each attribute — better, worse, or neutral —
   against the current state.
3. Find the **tensions**: where improving one attribute makes another worse. This is the actual
   decision, not a checklist to satisfy.

:::engineer
```
Quality attributes: consistency, availability, latency, operational complexity

Option: Synchronous cross-region replication for the ledger database
  consistency: better (strong)      availability: worse (write blocks on remote ack)
  latency: worse (+40-80ms per write)   operational complexity: worse (failover tuning)

Option: Asynchronous replication with reconciliation job
  consistency: worse (eventual, seconds of lag)   availability: better
  latency: better   operational complexity: worse (reconciliation logic to build and monitor)
```
Writing the tensions out explicitly, even in this rough form, surfaces the real argument in ten
minutes instead of an hour of people talking past each other because they're each optimising for a
different attribute without saying so.
:::

:::manager
The value of ATAM-lite for a manager is not the scoring exercise itself — it's that it forces every
participant to **name which quality attribute they actually care about** before arguing for an
option. Most architecture disagreements are really disagreements about priorities (is latency or
consistency more important here?) disguised as disagreements about technology. Surface the priority
question first, and the technology argument often resolves itself.
:::

## RFC processes: decisions that need many voices

A **Request for Comments (RFC)** process — the term borrowed from IETF standards work — is a
lightweight way to get genuine input from people who aren't in the room, without a meeting for
every decision. The author writes a proposal (often close to ADR shape: context, proposed decision,
alternatives considered), circulates it for a fixed comment window, addresses substantive objections,
and then a named owner decides.

:::callout{kind=decision title="When an RFC earns its cost"}
- Affects more than one team, or sets a pattern others will follow → **RFC**, so the people who'll
  live with the consequences get a real chance to object before it's built, not after.
- Affects only the proposing team and is reversible → **skip the RFC**; write the ADR after deciding
  and move on. An RFC on every decision trains people to stop reading them.
:::

:::manager
The failure mode to watch for: RFCs that get "approved" by silence because reviewers are too busy to
read them, followed by loud objections once the thing is built. Set a real comment deadline, chase
specific stakeholders by name rather than broadcasting to a channel, and be explicit that silence by
the deadline counts as no objection — so silence is a choice, not an accident.
:::

:::engineer
A practical RFC has a clear decider named up front (not "the team will build consensus") and a
comment period measured in days, not weeks — a two-week RFC on a decision that needs to ship this
sprint just means the decision gets made anyway, without the input the RFC was supposed to collect.
:::

## Reversible vs one-way-door decisions

Not every decision deserves the same process. The useful split, popularised in Amazon's shareholder
letters as "Type 1 vs Type 2" decisions: **reversible (two-way door)** decisions can be undone
cheaply if wrong; **one-way-door** decisions are expensive or impossible to reverse.

:::callout{kind=decision title="Matching process to decision type"}
- **Reversible**: a config value, a feature flag default, a library choice with a clean abstraction
  boundary → decide fast, with a single accountable owner, and adjust later if wrong. Heavy process
  here is pure overhead.
- **One-way door**: your core ledger's data model, which cloud provider you standardise on, an
  irreversible customer data migration → slow down, run the RFC, do the ATAM-lite tradeoff analysis,
  get the right people in the room. The cost of extra process here is small next to the cost of
  getting it wrong and being stuck.
:::

:::manager
The single highest-leverage judgement a manager makes in this space is correctly classifying which
door a decision is. Teams that treat every decision as one-way become slow and risk-averse on things
that don't deserve it; teams that treat one-way decisions as reversible end up stuck with an
expensive mistake. Ask explicitly, for any decision brought to you: "if this turns out wrong, what
does it cost to undo?" before deciding how much process it needs.
:::

:::engineer
A practical tell for "one-way door" at the code level: does reversing this require a data migration,
a breaking API change to external consumers, or contractual renegotiation with a vendor? If yes to
any of those, it's one-way regardless of how the team currently talks about it. A library swap
behind a clean interface, by contrast, is almost always reversible even if it doesn't feel that way
mid-migration.
:::

## Disagreement protocols

Even with a good process, people will disagree, sometimes after a decision is made. Two patterns
that work:

- **Disagree and commit** — once a decision is made by the accountable owner after genuine input,
  everyone (including those who disagreed) commits to executing it as if they'd agreed, while the
  objection is recorded. Revisit only if new information appears, not just because someone still
  doesn't like it.
- **DACI (Driver, Approver, Contributors, Informed)** — names, explicitly, who drives the decision,
  who has final approval authority, who contributes input, and who merely needs to know the outcome.
  Most decision paralysis comes from nobody being clearly the Approver.

:::manager
"Disagree and commit" only works if the disagreement was genuinely heard first — using the phrase
to shut down a legitimate late-arriving objection is a fast way to lose trust. The test: could the
person who disagreed accurately state the reasoning for the decision they disagree with? If not,
they weren't actually heard, and "commit" is being used to paper over that.
:::

:::engineer
Record the objection in the ADR itself, not just in a meeting nobody wrote up:

```markdown
## Consequences
...

## Dissent
A. Kowalski argued for option B (lower latency) over the chosen option A (lower operational
complexity). Recorded for revisit if latency becomes a measured production problem.
```
A one-line dissent record costs nothing to write and is exactly what you want on hand if the
decision needs revisiting later with the original reasoning intact.
:::

## What good looks like

- Every cross-team or one-way-door decision has a named RFC or ADR, not just a meeting nobody
  wrote up.
- Quality attributes and their tensions are named explicitly before a technology is chosen, not
  argued about implicitly.
- Decisions are classified reversible/one-way before deciding how much process to apply, and the
  process actually differs.
- A DACI (or equivalent) exists for any decision with more than two stakeholders, so there's a named
  Approver, not an assumed consensus.
- Disagreement is recorded even after commit, so a decision that turns out wrong can be revisited
  with the original objection on record, not reconstructed from memory.

## Exercises

::::exercise{id=ex-door-classification type=scenario title="Classify three decisions and match the process"}
Classify each as reversible or one-way-door, and say what process (if any) fits: (1) choosing the
default page size for a paginated API, (2) choosing the primary key strategy for a new core customer
database, (3) picking which logging library a new microservice uses.
:::solution
1. **Default page size**: reversible — a config value, changeable any time with no data migration.
   Process: a single owner decides, no RFC needed.
2. **Primary key strategy for a core customer database**: one-way-door — changing primary keys after
   millions of rows and dozens of dependent systems exist is a major, risky migration. Process: RFC,
   ATAM-lite tradeoff analysis (uniqueness guarantees, sharding implications, migration cost if
   wrong), and a named Approver senior enough to own the consequence.
3. **Logging library for a new microservice**: reversible in principle (libraries can be swapped)
   but worth a lightweight team-level standard so every service doesn't pick independently — not a
   full RFC, but a short ADR referencing an existing team convention if one exists, or a quick
   proposal if not.

The exercise's point: (1) and (3) look superficially similar (both are "just a technical choice") but
have very different real reversal costs once you ask what undoing them actually requires.
:::
::::

::::exercise{id=ex-rfc-silence type=scenario title="An RFC got no comments and was approved by default"}
An RFC proposing a shared authentication library for all customer-facing services got zero comments
in its two-week window and was marked approved. Three months after rollout, two teams say they never
saw it and it breaks their existing session-handling logic. What went wrong, and what would you
change?
:::solution
What went wrong: broadcasting the RFC to a channel is not the same as confirming the specific
affected teams saw it. "Silence means approval" only works if you can show the right people had a
real chance to read it — a channel post easily gets lost, especially over a two-week window where
priorities shift.

What to change: for RFCs with identifiable affected teams, name them explicitly as required
reviewers (DACI's "Contributors" or "Informed," made concrete), require an explicit acknowledgement
from each named team before the decision is marked approved — not just elapsed time — and keep the
comment window short enough that it stays a priority rather than something to get to eventually. This
also argues for classifying "shared library affecting all customer-facing services" correctly as a
decision with broad blast radius up front, which should have triggered more deliberate stakeholder
identification than a general broadcast.
:::
::::
