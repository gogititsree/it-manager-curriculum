---
title: "OWASP Top 10 — refresher"
estimatedMinutes: 15
objectives:
  - "Re-anchor the ten current OWASP categories in ten minutes"
  - "Know what moved and what's new between the 2017 and 2021 lists"
  - "Spot the gotchas that still catch experienced reviewers"
status: ready
---

You learned this against the 2013 or 2017 list. The 2021 edition (still the current version as of
this writing) reshuffled the ranking and added two categories that weren't there before. If you last
memorised "injection is #1, XSS is its own category," that has changed.

## What you probably remember

| 2021 category | One-line anchor |
| --- | --- |
| A01 Broken Access Control | Server trusts a client-supplied ID/role instead of checking itself. |
| A02 Cryptographic Failures | Sensitive data unencrypted, or encrypted with something weak or hardcoded. |
| A03 Injection (now includes XSS) | Untrusted input interpreted as code — SQL, shell, or a browser script. |
| A04 Insecure Design | The flaw is in the intended behaviour; needs a redesign, not a patch. |
| A05 Security Misconfiguration | A default left in place: open console, verbose errors, public bucket. |
| A06 Vulnerable/Outdated Components | Running a library or framework with a known, published CVE. |
| A07 Identification & Auth Failures | Weak login, session or credential handling. |
| A08 Software & Data Integrity Failures | Trusting code/data without verifying it (signatures, safe deserialisation). |
| A09 Security Logging & Monitoring Failures | An attack happens and nobody notices, then or later. |
| A10 Server-Side Request Forgery | Server tricked into making a request on the attacker's behalf. |

## What changed since 2017

:::callout{kind=changed-since title="Broken Access Control: #5 to #1 (2021)"}
The single biggest ranking move. Access control bugs — an ID swapped in a URL, a role check that
only exists client-side — became the most reported category by real-world data OWASP collected for
the 2021 edition. If your mental model still has injection as the top concern, access control is now
the bigger, more common problem in practice.
:::

:::callout{kind=changed-since title="Sensitive Data Exposure renamed Cryptographic Failures (2021)"}
The 2017 name described a symptom (data got exposed); the 2021 name names the root cause (crypto
was missing, weak, or misconfigured). Same territory, tighter framing: weak algorithms, hardcoded
or unrotated keys, plaintext storage or transit.
:::

:::callout{kind=changed-since title="XSS folded into Injection; XXE folded into Misconfiguration (2021)"}
2017 had Cross-Site Scripting and XML External Entities as their own top-level categories. In 2021,
XSS became a form of Injection (A03) and XXE became a form of Security Misconfiguration (A05). They
did not stop mattering — they were absorbed as sub-cases of a broader category, because the
underlying pattern (untrusted input trusted as code, or a service accepting more than it should) is
shared.
:::

:::callout{kind=changed-since title="Two new categories: Insecure Design (A04) and SSRF (A10), 2021"}
Both are new top-level entries, not renames. **Insecure Design** formalises that some
vulnerabilities are architectural — no amount of careful coding fixes a password-reset flow with no
rate limit, because it's working as designed. **SSRF** (Server-Side Request Forgery) reflects how
common it became once applications routinely fetch attacker-influenced URLs (webhooks, image
imports, PDF generation) and cloud environments added convenient internal metadata endpoints
(`169.254.169.254`) for SSRF to reach.
:::

:::callout{kind=changed-since title="Insecure Deserialization broadened into Software and Data Integrity Failures (2021)"}
2017's narrow "don't deserialise untrusted data unsafely" broadened to cover the wider supply-chain
problem: trusting a CI/CD pipeline step, an auto-update mechanism, or a third-party package without
verifying integrity. This is the category that covers software supply-chain attacks (a compromised
build step or a malicious package update) — a much bigger concern in 2021 than in 2017, following a
run of real-world supply-chain incidents in the years between the two editions.
:::

:::manager
The pattern across all these changes: OWASP moved from "list of bug types found in code" toward
"list weighted by real reported frequency and impact," and explicitly added the architectural (A04)
and supply-chain (A08) angles that a purely code-level scan can't catch. If your organisation's
security program is still tooled entirely around code scanning, it is aimed at the 2017 list's
centre of gravity, not the 2021 one.
:::

## Gotchas that still bite

- **"We ran a SAST scan, we're covered."** SAST cannot find A01 (access control), most of A04
  (insecure design), or A08-style supply-chain compromise. It's one input, not full coverage.
- **Access control bugs assumed to be edge cases.** They're now the top category by reported
  frequency; treat "does the server check this independently" as a default review question, not a
  special case.
- **Supply-chain trust taken for granted.** A dependency's build pipeline being compromised (not
  just a vulnerable version) is now a real, evidenced attack path — verify package integrity
  (checksums, signed packages, lockfiles) not just "no known CVE."
- **SSRF underestimated because "it's just a fetch."** Any server-side feature that takes a URL from
  user input is a candidate; cloud metadata endpoints make the payoff for an attacker much higher
  than it used to be on-prem.
- **Treating the Top 10 as the whole of application security.** It's the ten most common categories,
  not an exhaustive list — a mature program uses it as a floor, not a ceiling.

:::callout{kind=bank-context}
Auditors and regulators increasingly reference the current (2021) list by name. If your last
internal control mapping still cites the 2017 categories, that's a paperwork gap worth closing even
before any technical remediation — it's a quick, visible fix.
:::

## Ten-minute drill

::::exercise{id=ex-2017-vs-2021 type=code title="Reclassify three 2017-era findings under the 2021 list"}
A five-year-old pen-test report lists these findings under their 2017 category names. Re-map each to
its 2021 category, and say why.

1. "Cross-Site Scripting in the search results page" (2017: A7 XSS)
2. "XML External Entity injection in the document upload parser" (2017: A4 XXE)
3. "Insecure deserialization of session objects allows remote code execution" (2017: A8 Insecure
   Deserialization)
:::solution
1. **A03: Injection (2021)** — XSS is untrusted input rendered as executable script; 2021 treats it
   as a form of injection rather than a standalone category.
2. **A05: Security Misconfiguration (2021)** — XXE stems from an XML parser configured to resolve
   external entities when it shouldn't be; 2021 treats this as a configuration weakness in the
   parser/library setup rather than its own category.
3. **A08: Software and Data Integrity Failures (2021)** — unsafe deserialization is now framed as
   part of the broader problem of trusting data/code without verifying its integrity, alongside
   supply-chain and update-mechanism risks.

The re-mapping matters beyond terminology: it changes what you'd ask for as the fix. XXE-as-
misconfiguration points you at "disable external entity resolution by default across all parsers,"
not just fixing the one upload endpoint the pen test happened to test.
:::
::::
