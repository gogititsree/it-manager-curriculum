---
title: "OWASP Top 10 Security Basics"
estimatedMinutes: 35
objectives:
  - "Name the ten OWASP Top 10 (2021) categories and give one bank-relevant example of each"
  - "Explain why access control and cryptographic failures top the current list"
  - "Ask a specific, category-grounded question in a design or code review instead of a vague one"
status: ready
---

The OWASP Top 10 is a periodically updated list, maintained by the Open Worldwide Application
Security Project, of the most common and most damaging web application security weaknesses. It is
not a checklist you tick once; it is the shared vocabulary security teams, auditors and developers
use to talk about risk in software. The current edition was published in 2021. This lesson works
through all ten categories with one example each, grounded in banking systems.

## Why this list matters to you

You will not personally find these vulnerabilities. You will review designs, read pen-test reports,
and approve go-lives where these categories are the findings. Knowing the ten names and roughly what
each means is the difference between nodding along to a report and asking a question that changes
the outcome.

:::manager
Every one of these ten categories maps to a real incident somewhere, often at a bank. This is not
theoretical hygiene; it is the short list of ways your organisation ends up in a regulator's letter
or a newspaper. Learning ten names is a cheap investment against that.
:::

## Access control and authentication failures

**A01: Broken Access Control** (top of the 2021 list) is when a user can do or see something they
should not — usually because the server trusted a client-supplied value instead of checking
permissions itself. Bank example: changing an account number in a URL or API request
(`GET /accounts/10293/statement` → `GET /accounts/10294/statement`) and getting someone else's
statement because the server never checked the logged-in user owns account 10294.

**A07: Identification and Authentication Failures** covers weak login, session and credential
handling: no multi-factor authentication on sensitive actions, session tokens that don't expire,
passwords stored or compared insecurely.

:::engineer
```java
// Broken: trusts the client-supplied account id with no ownership check
Statement getStatement(String accountId) {
    return db.findStatement(accountId);
}

// Fixed: authorisation checked server-side against the authenticated user
Statement getStatement(String accountId, AuthenticatedUser user) {
    if (!accountOwnership.belongsTo(accountId, user.id())) throw new ForbiddenException();
    return db.findStatement(accountId);
}
```
:::

:::manager
The review question for both: "if I change this ID in the request, does the server independently
verify I'm allowed to see it, or does it just trust me?" This single question catches a large share
of real-world access control findings.
:::

## Cryptographic failures and injection

**A02: Cryptographic Failures** (renamed in 2021 from "Sensitive Data Exposure") is data that should
be encrypted and isn't, or is encrypted badly — weak algorithms, hardcoded keys, secrets in plain
text. Bank example: customer PII or card data stored unencrypted in a log file that ends up in a
support ticket, or a legacy TLS 1.0 endpoint still accepting connections.

**A03: Injection** (includes SQL injection, and since 2021 also covers cross-site scripting) is
untrusted input being interpreted as code or a command instead of data. Bank example: a branch
search field built with string concatenation into a SQL query, letting an attacker append their own
SQL and read other customers' records.

:::engineer
```sql
-- Vulnerable: user input concatenated directly into the query
"SELECT * FROM accounts WHERE branch = '" + userInput + "'"
-- userInput = "' OR '1'='1" returns every row

-- Fixed: parameterised query, input is always treated as data
"SELECT * FROM accounts WHERE branch = ?"   -- bound parameter, never concatenated
```
:::

:::manager
Ask two things in review: is sensitive data encrypted at rest and in transit with a current
algorithm (not something chosen a decade ago and never revisited), and does every place user input
reaches a database, a shell, or a page use parameterised queries or proper escaping rather than
string building? Both are findable by reading code, not just by testing.
:::

## Design, configuration and outdated components

**A04: Insecure Design** is a 2021 addition: a flaw baked into the architecture before a line of
code was written — for example, a password reset flow with no rate limiting, so an attacker can
brute-force reset codes. This can't be patched later; it needs a redesign.

**A05: Security Misconfiguration** is a default left in place: an admin console exposed to the
internet, verbose error messages leaking a stack trace with internal paths, a cloud storage bucket
left publicly readable.

**A06: Vulnerable and Outdated Components** is running a library, framework or OS version with a
known, published vulnerability. Bank example: a payment service still on an old version of a
logging library or web framework months after a critical CVE and patch were published.

:::manager
These three together explain most breaches that make the news: an unpatched, misconfigured, or
badly designed system, rather than a novel attack technique. Ask your teams for their patching SLA
for critical vulnerabilities, and whether it's actually met — that answer tells you more about your
real exposure than most other security questions.
:::

:::engineer
```bash
# A minimal, cheap habit that catches A06 findings before a pen test does
npm audit --audit-level=high
# or for Java/Maven
mvn org.owasp:dependency-check-maven:check
```
:::

## Integrity, logging, and server-side request forgery

**A08: Software and Data Integrity Failures** covers trusting code or data without verifying its
integrity — installing a software update without checking its signature, or deserialising untrusted
data in a way that lets an attacker run arbitrary code.

**A09: Security Logging and Monitoring Failures** means an attack happens and nobody notices — no
log of the failed login attempts, no alert on unusual data access, so the breach is found (if at all)
weeks later by someone else.

**A10: Server-Side Request Forgery (SSRF)**, added in 2021, is tricking a server into making a
request on the attacker's behalf — for example, a "fetch this image URL" feature that an attacker
points at the server's internal metadata endpoint or an internal-only admin API, using the server as
a proxy into the internal network.

:::callout{kind=bank-context title="Why logging failures matter to a bank specifically"}
Regulators expect you to be able to reconstruct who accessed what, when. A9-style gaps are not just
a technical weakness; they are an audit failure waiting to be found, independent of whether an
actual breach ever occurs.
:::

:::manager
Of these three, ask specifically about SSRF in any design review for a feature that fetches a
URL, an image, a webhook payload, or a document on a user's behalf — it's the easiest of the ten to
miss because the feature "just fetches a link" and looks harmless in a spec. And ask, separately,
whether you could reconstruct the last 90 days of admin actions on a core system from logs alone,
right now, without asking the vendor for help — a surprising number of teams cannot.
:::

:::engineer
SSRF defence in practice: never let a server make outbound requests to an attacker-supplied URL
without an allow-list of permitted destinations, and block the cloud metadata address range
(`169.254.169.254`) from application-initiated requests entirely.
:::

## Common mistakes

- **Treating this as a once-a-year checklist** instead of something baked into every design review
  and every pull request.
- **Fixing the finding, not the class of bug** — patching one SQL injection instance while five more
  string-concatenated queries remain elsewhere in the same codebase.
- **No ownership of dependency patching** — everyone assumes someone else is tracking CVEs against
  the libraries in use.
- **Verbose errors left on in production** "to help debugging," handing attackers a map of your
  internals.
- **Assuming a penetration test once a year is sufficient coverage** rather than one input among
  continuous checks (see the Intermediate lesson on SAST/DAST).

## Putting it together

::::exercise{id=ex-map-finding type=design title="Map a bug report to an OWASP category"}
A bug report says: "The 'download my statement as PDF' feature accepts a `documentUrl` parameter
pointing to any URL, fetches it, and returns the content as a PDF wrapper. A tester pointed it at an
internal-only admin endpoint and got a response back." Which OWASP category is this, why is it
dangerous specifically at a bank, and what is the one-line fix?
:::solution
This is **SSRF (A10)**: the server is tricked into making a request to an internal destination on
the attacker's behalf, using the application server's network position (which is usually trusted, or
at least not internet-facing) as a proxy.

Why it's dangerous at a bank: internal admin endpoints, service-to-service APIs, and cloud metadata
services are often reachable from the app server's network but assumed to be safe because they're
"not exposed to the internet." SSRF breaks that assumption completely — it lets an external attacker
reach anything the application server itself can reach.

Fix: never fetch an arbitrary attacker-supplied URL. Replace it with an allow-list of permitted
domains/hosts for the "fetch a document" feature, and explicitly block internal IP ranges and the
cloud metadata address. A manager reviewing the fix should ask whether the allow-list is enforced
server-side and fails closed (rejects by default) rather than trying to blacklist "bad" URLs, which
is much easier to bypass.
:::
::::
