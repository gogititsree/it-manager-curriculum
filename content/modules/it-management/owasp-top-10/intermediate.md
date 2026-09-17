---
title: "Finding and Preventing OWASP Top 10 Issues"
estimatedMinutes: 40
objectives:
  - "Explain what SAST, DAST, SCA and penetration testing each catch, and what each misses"
  - "Build security checkpoints into an SDLC instead of relying on a pre-release scan"
  - "Ask category-specific questions in a design review before code is written"
status: ready
---

You know the ten categories. This lesson is about how they're actually found in a real pipeline, and
how to stop finding the same class of bug over and over at the end of every release.

## Where the basics break down

Knowing the ten names does not, by itself, catch anything. Vulnerabilities are found by specific
tools and techniques, each with real blind spots, and by design decisions made before any code
exists. A team that runs one tool once a year and calls it "covered" is not covered; a team that
never threat-models a design will keep introducing A04-class insecure design flaws that no scanner
can find after the fact, because the flaw is in the intended behaviour, not a coding mistake.

## SAST, DAST, SCA and penetration testing

Four different techniques, each catching a different slice of the Top 10:

| Technique | What it does | Catches well | Misses |
| --- | --- | --- | --- |
| **SAST** (static application security testing) | Scans source code without running it | Injection patterns, hardcoded secrets, some crypto misuse | Business-logic flaws, access control bugs that depend on runtime context |
| **DAST** (dynamic application security testing) | Attacks a running application from the outside | Misconfiguration, some injection, missing security headers | Anything behind a login flow it can't navigate; deep logic flaws |
| **SCA** (software composition analysis) | Checks dependencies against known-vulnerability databases | A06: vulnerable and outdated components | Vulnerabilities not yet published (zero-days); misuse of a safe library |
| **Penetration test** | A skilled human (or team) attacking the application, often with source access | Business-logic flaws, chained exploits, access control, most of what tools miss | Anything outside the tested scope and time-box; a point-in-time snapshot |

:::engineer
```yaml
# A pipeline that runs all three automated categories on every pull request
- run: semgrep --config=owasp-top-ten .        # SAST
- run: npm audit --audit-level=high            # SCA
- run: zap-baseline.py -t https://staging.internal  # DAST, against a deployed test instance
```
Tools like Semgrep, SonarQube, and Checkmarx do SAST; OWASP ZAP and Burp Suite do DAST; `npm audit`,
`pip-audit`, OWASP Dependency-Check and Snyk do SCA. None of these replace a penetration test; they
make the penetration test find fewer, more interesting things instead of the same known-CVE noise.
:::

:::manager
No single technique covers the Top 10. The review question for a security program: "which of SAST,
DAST, SCA and pen testing do we run, how often, and against what — every PR, nightly, quarterly?" A
program that only does an annual pen test is finding out about A01/A04-class design flaws once a
year, in production-adjacent conditions, which is both slow and expensive compared to catching them
at design time.
:::

## Secure SDLC: shifting the checkpoint left

A **secure software development lifecycle (SDLC)** puts security checkpoints throughout
development, not only at the end:

1. **Requirements** — security and compliance requirements written down alongside functional ones
   (e.g. "PII fields must be encrypted at rest"; "all admin actions must be logged with actor and
   timestamp").
2. **Design — threat modelling** — before code is written, walk the design and ask "how could this
   be attacked?" A common lightweight framework is **STRIDE** (Spoofing, Tampering, Repudiation,
   Information disclosure, Denial of service, Elevation of privilege), applied to each trust
   boundary in the design.
3. **Build** — SAST and SCA run automatically on every change.
4. **Test** — DAST against a deployed test environment; security-specific test cases alongside
   functional ones.
5. **Release** — a final gate confirming no unresolved high/critical findings.
6. **Operate** — logging and monitoring (closing the A09 gap), and a patching process for newly
   disclosed vulnerabilities in dependencies already in production.

:::callout{kind=decision title="Where to invest first if you can only do one thing"}
- If nothing exists yet: **threat modelling at design time** for anything touching money, PII, or
  external input. It is the only stage that catches A04-class insecure design, and it is far cheaper
  than fixing a design flaw after launch.
- If threat modelling already happens but nothing is automated: **SCA in the pipeline**. It is the
  cheapest to add and catches a category (A06) responsible for a large share of real breaches.
:::

:::manager
"Shift left" is not a slogan for developers to write more secure code by willpower; it's a
structural claim: a flaw caught in design costs a conversation, the same flaw caught in a pen test
costs a redesign under deadline pressure, and caught after a breach costs an incident, a regulator
call, and possibly your job. Ask where in the lifecycle security currently gets involved, and push it
left one stage at a time.
:::

:::engineer
A lightweight threat model can be a single markdown file per feature, reviewed in the same pull
request as the design doc, rather than a separate heavyweight process:

```markdown
## Threat model: forgot-password flow
Trust boundary: public internet -> API
- Spoofing: could someone request a reset for an account they don't own? (yes, by design; the
  reset code is the control)
- Tampering: can the reset code be brute-forced? -> rate limit + expiry required
- Information disclosure: does "email not found" leak which emails have accounts? -> use identical
  responses
```
Tools like OWASP Threat Dragon can produce diagrams for more complex designs, but a markdown
checklist reviewed alongside the code is often enough and, critically, actually gets done.
:::

## What to ask for in a design review, by category

A quick reference for a design review, mapped back to the ten categories:

- **Access control (A01)**: "Where is authorisation checked — server-side, on every request, or
  assumed from the UI?"
- **Cryptographic failures (A02)**: "What's encrypted at rest and in transit, with what algorithm,
  and who holds the keys?"
- **Injection (A03)**: "Does any user input reach a database, shell command, or rendered page
  without parameterisation or escaping?"
- **Insecure design (A04)**: "Has this been threat-modelled? What's the abuse case, not just the
  happy path?"
- **Misconfiguration (A05)**: "What's the difference between this environment's config and a secure
  baseline, and who checks that?"
- **Vulnerable components (A06)**: "What's our patching SLA for critical CVEs in dependencies, and
  is it met?"
- **Auth failures (A07)**: "Is MFA required for sensitive actions? How do sessions expire?"
- **Integrity failures (A08)**: "Do we verify signatures on anything we install or deserialise from
  outside our trust boundary?"
- **Logging failures (A09)**: "Can we reconstruct who did what, when, from logs alone, six months
  from now?"
- **SSRF (A10)**: "Does this feature make outbound requests based on user input, and is there an
  allow-list?"

## What good looks like

- Security requirements are written alongside functional requirements, not bolted on later.
- Threat modelling happens at design time for anything touching money, PII, or external input.
- SAST and SCA run automatically on every pull request; findings above an agreed severity block the
  merge.
- DAST runs against a real deployed environment on a defined cadence, not only before major releases.
- Penetration tests are scoped to what automated tooling can't reach (business logic, chained
  exploits), not spent re-finding known CVEs.
- There is an owned, measured patching SLA for critical vulnerabilities, and it is actually met.

## Exercises

::::exercise{id=ex-tooling-scenario type=scenario title="A team asks which single tool to buy"}
A team has no SAST, DAST or SCA today, and one pen test a year. They have budget for one tool this
quarter and ask which to buy. What do you tell them, and what would you want to know before
answering?
:::solution
First find out: what do they build (a public-facing web app pulls DAST forward in priority; a
service with many third-party dependencies pulls SCA forward), and how mature is their dependency
management today (if they don't even know their dependency list, SCA has the fastest payoff and is
usually the cheapest to stand up).

General answer for most teams starting from zero: **SCA first**. It's the fastest to deploy, produces
the fewest false positives (a known CVE either matches your version or it doesn't), and A06
(vulnerable and outdated components) is one of the most common, cheaply-preventable causes of real
breaches. SAST is valuable next but needs tuning to avoid drowning the team in false positives; DAST
and better pen-test scoping follow once the basics are automated. The annual pen test stays, but its
value goes up once SCA/SAST remove the noise it would otherwise spend time rediscovering.
:::
::::

::::exercise{id=ex-threat-model-scenario type=scenario title="Threat-model a new feature before it's built"}
A team is designing a "forgot password" flow: user enters their email, receives a 6-digit code, enters
it to reset their password. Using STRIDE loosely, name two plausible attacks and the design change
that prevents each.
:::solution
**Tampering / brute force (a Spoofing-adjacent attack)**: an attacker submits guesses for the 6-digit
code repeatedly until one works (only a million combinations). Prevention: rate-limit code attempts
per account (e.g. 5 tries then lock for a period), and expire the code after a short window (e.g. 10
minutes).

**Information disclosure**: the "enter your email" step returns a different message for "email not
found" vs "code sent," letting an attacker enumerate which emails have accounts. Prevention: return
an identical response regardless of whether the email exists ("if that address has an account, a
code has been sent").

Both are A04 (insecure design) issues: no scanner finds "reset codes aren't rate-limited" because
the code works exactly as designed. This is why threat modelling has to happen before or during
design, not as a scan after the feature ships.
:::
::::
