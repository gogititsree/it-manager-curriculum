---
title: "Auth in Production: OIDC, JWTs, mTLS and Access Control"
estimatedMinutes: 45
objectives:
  - "Explain OIDC's relationship to OAuth2 and describe the Authorization Code flow with PKCE"
  - "Name the common JWT pitfalls and how each is mitigated"
  - "Distinguish RBAC from ABAC and know when each is the right tool"
  - "Run an auth design review checklist a manager could actually use"
status: ready
---

You know sessions vs tokens, the OAuth2 roles, and what MFA means. This lesson covers how identity is
actually verified (OIDC), the sharp edges of the tokens you now rely on (JWT pitfalls), the extra
control used for service-to-service trust (mTLS), and how access decisions get made at scale (RBAC vs
ABAC). This is the highest-stakes topic in the curriculum for precision — where a detail depends on a
specific vendor's implementation or an exact spec clause, this lesson says so rather than guessing.

## Where the basics break down

OAuth2 alone answers "can this app access this data" — it was not designed to answer "who is this
person" in a standard, interoperable way, and for years teams bolted ad hoc identity information onto
OAuth2 access tokens, inconsistently. Raw JWTs get treated as inherently secure when several of their
common failure modes are implementation mistakes, not protocol flaws. RBAC, simple and effective at
small scale, becomes unmanageable ("role explosion") once permission requirements get genuinely
contextual. Each of these is a well-documented, named problem with a well-documented, named fix.

## OIDC: authentication built on OAuth2

**OpenID Connect (OIDC)** is a thin, standardized identity layer on top of OAuth2. Where OAuth2 gives
you an **access token** (proof of authorization to call an API), OIDC additionally defines an **ID
token** — a JWT specifically containing claims about who the user is (issued by the Authorization
Server, now more precisely called the OpenID Provider in this context), and a standard `/userinfo`
endpoint to fetch profile claims. This is the modern, standardized replacement for what SAML did in
the enterprise SSO world for the previous generation — see the Rusty lesson for that mapping in
detail.

The flow considered current best practice for anything with a user and a browser or mobile app
involved is the **Authorization Code flow with PKCE** (Proof Key for Code Exchange):

:::engineer
```
1. Client generates a random "code_verifier", derives a "code_challenge" from it (SHA-256 hash).
2. Client redirects the user's browser to the Authorization Server's /authorize endpoint,
   including the code_challenge (not the verifier).
3. User authenticates (and consents, if a third-party client) at the Authorization Server.
4. Authorization Server redirects back to the Client with a short-lived authorization "code".
5. Client exchanges the code for tokens at the /token endpoint, this time sending the original
   code_verifier.
6. Authorization Server checks the verifier matches the earlier challenge, then returns an
   access token (and, for OIDC, an ID token; optionally a refresh token).
```
PKCE exists to protect this exchange even when the "code" is intercepted in step 4 (a real risk for
mobile/native apps and single-page apps, which cannot safely hold a fixed client secret) — without the
matching `code_verifier`, an intercepted code alone cannot be redeemed for tokens. Current guidance
(the OAuth 2.0 Security Best Current Practice) recommends PKCE for essentially all clients now, not
only public/native ones — check your identity provider's current documentation for the exact
recommendation it makes, since this has been strengthened over time.
:::

:::callout{kind=warning title="Flows to be wary of"}
The **Implicit flow** (tokens returned directly in the browser redirect, no code exchange step) was
common for single-page apps roughly a decade ago and is now formally deprecated in current OAuth
guidance, primarily because tokens end up exposed in browser history and referrer headers. The
**Resource Owner Password Credentials flow** (the client collects the user's actual password and
sends it to the Authorization Server directly) defeats much of the point of OAuth2 — the client sees
the real credential — and should be treated as a legacy pattern to migrate away from, not a default
choice for new integrations. If you see either proposed for new work, ask why.
:::

:::manager
If a vendor or internal team cannot name which OAuth2/OIDC flow they use, that is itself a finding.
"We use OAuth2" is not a complete answer; "Authorization Code with PKCE" is. Ask, and verify the
answer against their actual redirect/token exchange behaviour if the integration is significant.
:::

## JWT pitfalls

JWTs are widely used and widely misused. The failure modes worth knowing precisely:

:::callout{kind=gotcha title="alg: none and algorithm confusion"}
The JWT header declares which signing algorithm was used. Some early JWT libraries would accept a
token claiming `"alg": "none"` (no signature at all) or would accept an asymmetric public key
mistakenly used as an HMAC secret if the verifying code trusted the algorithm named in the token
rather than the algorithm it expected. The fix: server-side verification code must pin the expected
algorithm itself and reject anything else, never trust the `alg` header's claim. Modern, well-
maintained JWT libraries handle this correctly by default; the risk is mainly in older or hand-rolled
verification code — worth confirming which library version is in use during a review.
:::

:::callout{kind=gotcha title="No built-in revocation"}
A signed JWT is valid until it expires — there is no protocol-level way to revoke one early, because
verification does not require contacting the issuer. Mitigations: keep access token lifetimes short
(commonly minutes, not hours — the exact right number is a risk decision, not a fixed spec value), use
a refresh token (longer-lived, but revocable because refreshing does require a server round trip) to
get new access tokens, and maintain a denylist for the rare cases (confirmed compromise) that need
immediate effect despite the cost of a lookup.
:::

:::callout{kind=gotcha title="Payload is signed, not encrypted"}
Anyone holding the token can base64-decode and read the payload. Do not put anything sensitive
(account numbers, personal data beyond what is already exposed by the interaction) in a standard JWT.
If confidentiality of the payload itself is required, that calls for an encrypted JWT (JWE) or simply
not putting the sensitive data in the token at all — fetch it server-side using the token as
authorization instead.
:::

:::engineer
```javascript
// Verification: pin the algorithm and issuer explicitly, do not trust the token's own header
jwt.verify(token, publicKey, {
  algorithms: ['RS256'],          // reject any token not using exactly this
  issuer: 'https://auth.bank.example',
  audience: 'payments-api',
});
```
:::

:::manager
"We validate the JWT signature" is necessary but not sufficient. Ask specifically whether the
verification code pins the algorithm, checks `issuer` and `audience`, and checks expiry — a surprising
number of real incidents trace back to one of these being skipped, not to the cryptography itself
being broken.
:::

## mTLS: mutual TLS

Ordinary TLS (the padlock in a browser) authenticates the server to the client — the client checks
the server's certificate. **Mutual TLS (mTLS)** adds the reverse: the server also requires and checks
a client certificate, so both sides cryptographically prove their identity before any application data
is exchanged. This is common for service-to-service traffic inside a bank's own network or between
tightly-coupled partners (e.g. some payment network connections), where both ends are known,
provisioned systems rather than an arbitrary public client.

:::engineer
Both sides present an X.509 certificate during the TLS handshake, each verified against a trusted
certificate authority (which may be a public CA or, very commonly for internal service mesh mTLS, an
internal/private CA managed by the platform team). The application code typically never sees this
directly — it is usually terminated at a load balancer, API gateway, or service-mesh sidecar (e.g.
Istio, Linkerd), which is worth confirming for any specific system rather than assuming.
:::

:::manager
mTLS proves *which system* is calling, not *which end user* the call is on behalf of. A common design
mistake is treating a valid mTLS connection as sufficient authorization for a user-level action — you
still need the user's own token (e.g. a JWT) carried inside that mutually-authenticated channel for
anything acting on a specific customer's behalf.
:::

## RBAC vs ABAC

**Role-Based Access Control (RBAC)**: permissions are attached to roles (`teller`, `branch-manager`,
`compliance-officer`), and users are assigned one or more roles. Simple to reason about and audit —
"who can approve payments over £10,000" is answered by "who has the role that includes that
permission." It breaks down when access genuinely depends on context: "a teller can approve this
specific payment only for their own branch, only during business hours, only below their personal
limit" needs a role per combination, and the role count explodes.

**Attribute-Based Access Control (ABAC)**: permissions are expressed as policies over attributes of
the user, the resource, and the environment — role, branch, transaction amount, time of day, device
trust level — evaluated at request time. More flexible, and it avoids role explosion, at the cost of
being harder to audit at a glance ("what can this person do" requires evaluating policy, not reading a
role list) and requiring more mature tooling to manage well.

:::callout{kind=decision title="RBAC or ABAC?"}
- Permissions map cleanly onto job functions, and context rarely matters → **RBAC**. Simpler to build,
  simpler to audit, and often exactly what a segregation-of-duties control needs to demonstrate.
- Permissions genuinely depend on multiple runtime attributes (amount, branch, time, risk score) →
  **ABAC**, or a hybrid (RBAC for coarse-grained access, ABAC-style policy for fine-grained,
  high-risk decisions layered on top).
- Most real banking systems land on a hybrid: RBAC for "can this person use this system at all",
  ABAC-style rules for specific high-risk transactions.
:::

:::manager
Segregation of duties (SoD) — "the person who initiates a payment cannot also approve it" — is a
control most naturally expressed and audited as roles and role combinations (RBAC), which is one
reason RBAC remains the backbone even in systems that layer ABAC on top for finer-grained decisions.
If an access model cannot produce a clear answer to "list everyone who could both create and approve
a payment," that is a genuine audit finding, not a theoretical concern.
:::

## Secrets handling

API keys, signing keys, database credentials and client secrets need their own discipline, separate
from user authentication: never in source control, never in plain environment variables in a shared
log-visible context if avoidable, rotated on a schedule and immediately on suspected compromise, and
retrieved at runtime from a dedicated secrets manager (examples include HashiCorp Vault and each major
cloud provider's own secrets manager) rather than baked into a container image or config file checked
into a repository.

:::manager
"Where do secrets live, and who can read them" is a question with a specific, checkable answer in a
mature setup (a named secrets manager, an access policy, an audit log of reads) and a vague one in an
immature setup ("they're in the environment config"). The vague answer is a finding.
:::

## Bank-specific failure modes

:::callout{kind=bank-context}
Recurring, real patterns worth naming explicitly in a review: (1) a long-lived session or token used
to authorize a high-value action with no step-up re-authentication; (2) a partner integration using
the Resource Owner Password Credentials flow, meaning the partner's system sees the actual customer
credential; (3) an access model that cannot answer a segregation-of-duties audit question directly;
(4) MFA required for login but not for changing the MFA method or account recovery details itself —
often the actual weak point attackers target. None of these require a novel attack — they are
process/design gaps, which is exactly why they show up repeatedly in real incident post-mortems.
:::

## What good looks like

- The identity flow in use is named explicitly (Authorization Code + PKCE, for example), not just
  "OAuth2" or "SSO".
- JWT verification pins algorithm, issuer and audience, and checks expiry; token lifetimes are short,
  with a refresh mechanism for longer sessions.
- High-risk actions require step-up authentication regardless of how old the current session/token is.
- The access-control model (RBAC, ABAC, or hybrid) can answer a segregation-of-duties question
  directly, on demand.
- Secrets live in a dedicated secrets manager with rotation and audit logging, not in config files or
  environment variables checked into source control.
- Service-to-service calls that need strong mutual identity use mTLS, layered under, not instead of,
  user-level authorization where a specific customer's action is involved.

## Exercises

::::exercise{id=ex-oidc-flow-choice type=scenario title="A partner proposes the implicit flow for a new single-page app"}
A fintech partner integrating with your Open Banking API proposes using the OAuth2 implicit flow
because "it's simpler for our single-page app, no backend token exchange needed." What do you say,
and what would you recommend instead?
:::solution
The implicit flow returns tokens directly in the browser URL fragment with no code-exchange step,
which exposes them to browser history, referrer leakage, and any script running on the page more than
a code-exchange flow does — and it is formally deprecated in current OAuth security guidance for
exactly this reason. Recommend the Authorization Code flow with PKCE instead: it was specifically
designed to let public clients (single-page apps, native/mobile apps) that cannot hold a fixed client
secret still get the security properties of the code-exchange flow, using the code_verifier/
code_challenge pair instead of a client secret. "No backend needed" is not actually a blocker — PKCE
was designed precisely for clients with no confidential backend.
:::
::::

::::exercise{id=ex-access-model-design type=scenario title="RBAC is hitting role explosion"}
A payments approval system has grown to over 200 distinct roles because approval limits vary by
branch, product type, and seniority, and each combination became its own role. The team wants to
know whether to keep adding roles or change approach. What do you ask, and what would you recommend?
:::solution
Ask: how many of these 200+ roles are genuinely distinct job functions versus the same function
parameterised by branch/limit/product? If it's mostly the latter, this is the textbook RBAC role-
explosion problem. Recommend a hybrid: keep a small, stable set of RBAC roles representing actual job
functions (`approver`, `senior-approver`), and move the varying constraints (branch, amount limit,
product type) into ABAC-style policy attributes evaluated at request time against the transaction
being approved. This keeps the audit-friendly property RBAC gives you ("who holds the approver role")
while eliminating the combinatorial role growth. Flag that this is a genuine migration project, not a
config change — plan for it accordingly rather than approving "just add role 201".
:::
::::
