---
title: "Auth Patterns — SAML-era knowledge, updated"
estimatedMinutes: 18
objectives:
  - "Map SAML-era SSO concepts onto their OIDC equivalents precisely"
  - "Know what changed in recommended OAuth2/OIDC practice, and roughly when"
  - "Spot the three access-control and token gotchas that catch experienced architects"
status: ready
---

You designed or reviewed SSO when SAML was the default enterprise answer — Identity Provider, Service
Provider, XML assertions, maybe ADFS. The underlying problem (prove identity once, use it across many
systems) has not changed. The mechanism most new systems use has moved to OIDC/OAuth2, and the details
matter more here than in most refreshers in this curriculum: get one of them wrong in a real review and
it is a security finding, not a style preference. Where a detail depends on a specific vendor or
current spec text, this lesson says so rather than asserting it from memory.

## What you probably remember

| SAML-era concept | Rough OIDC/OAuth2 equivalent |
| --- | --- |
| Identity Provider (IdP) | OpenID Provider / Authorization Server |
| Service Provider (SP) | Client (the application relying on the identity) |
| SAML Assertion (signed XML) | ID Token (signed JWT) |
| SP-initiated / IdP-initiated login | Authorization Code flow, initiated by the Client redirecting to the Authorization Server |
| SAML metadata XML exchange | OIDC Discovery document (`/.well-known/openid-configuration`) plus dynamic or manual client registration |
| Attribute statements in the assertion | Claims in the ID token / userinfo response |

The core trust model is the same shape: a central party authenticates the user and issues a signed
statement; relying applications trust that statement because they trust the signing party's key. What
changed is the encoding (XML vs JSON/JWT), the transport pattern (browser POST bindings vs redirect-
and-token-exchange), and a much stronger default expectation around token lifetime and proof-of-
possession for public clients.

## What changed since

:::callout{kind=changed-since title="JSON/JWT replaced XML/SAML-assertion as the default for new work"}
SAML 2.0 (finalized 2005) is still very much alive in enterprise SSO, particularly for legacy and
some workforce-identity (B2E) scenarios, and you will still encounter it in real environments — this
is not "SAML is gone." But OIDC (built on OAuth2, OAuth2 core spec from 2012, OIDC from 2014) is now
the default choice for new consumer-facing and API-driven identity work, largely because JSON/JWT are
far lighter for mobile and JavaScript clients than XML/SOAP-style bindings ever were.
:::

:::callout{kind=changed-since title="PKCE, originally for mobile, now recommended broadly"}
PKCE (RFC 7636, 2015) was introduced specifically to secure the Authorization Code flow for native/
mobile apps that cannot hold a confidential client secret. Current OAuth security guidance has since
broadened the recommendation toward using PKCE for essentially all Authorization Code flow clients,
confidential or not, as defense in depth. Verify the exact current recommendation against your
identity provider's own documentation or the current OAuth 2.0 Security Best Current Practice
document rather than quoting a specific clause from memory — this guidance has been strengthened more
than once.
:::

:::callout{kind=changed-since title="The Implicit flow went from recommended to deprecated"}
For years, the OAuth2 Implicit flow (tokens returned directly in the redirect, no exchange step) was
the standard advice for browser-based single-page apps, precisely because they could not hold a
secret. Current guidance now recommends Authorization Code with PKCE instead, for the same class of
client, because it avoids exposing tokens in the browser's URL/history/referrer. If you last learned
OAuth2 when Implicit was still the recommended pattern for SPAs, that recommendation has since
reversed.
:::

:::callout{kind=changed-since title="Refresh token rotation and shorter access token lifetimes"}
Where an access token was once commonly long-lived for convenience, current practice favours short
access token lifetimes (commonly minutes) paired with a refresh token, often with rotation (each use
of a refresh token issues a new one and invalidates the old, so a stolen, reused refresh token is
detectable). The exact lifetime numbers are a risk decision made per system, not a fixed spec value —
do not assume a specific number without checking the system in front of you.
:::

:::engineer
```
SAML-era (conceptually):                     OIDC-era:
Browser -> SP -> redirect to IdP              Browser -> Client -> redirect to /authorize
IdP authenticates user, POSTs signed          Authorization Server authenticates user,
  XML assertion back to SP's ACS URL            redirects back with a short-lived "code"
SP validates assertion signature,             Client exchanges code (+ PKCE verifier) for
  establishes a local session                    tokens at /token; validates ID token signature
```
:::

:::manager
The management-level translation: if your organisation is migrating workforce or partner SSO from
SAML to OIDC, expect the trust relationship and governance questions to be almost identical (which
party is authoritative for identity, how is the relationship registered and revoked, what claims are
released) — what changes is the wire format and client libraries, not the fundamental risk model. Ask
your identity team for the migration's actual driver (usually: better mobile/SPA support, or a vendor
requiring OIDC) rather than assuming it is required everywhere SAML currently works.
:::

## Gotchas that still bite

- **Assuming an ID token is an access token, or vice versa.** The ID token is for the Client to learn
  who authenticated (do not send it to a Resource Server as authorization); the access token is what
  gets sent to the Resource Server. Conflating them is a common, concrete integration bug, not just a
  naming nitpick.
- **Trusting the token's own `alg` header during verification** instead of pinning the expected
  algorithm server-side — the same class of mistake that caused real historical JWT library
  vulnerabilities, and still shows up in hand-rolled verification code.
- **No re-authentication for step-up.** SAML-era session assumptions ("logged in once this morning, at
  the office") do not map safely onto today's longer-lived, more mobile access patterns. A token or
  session valid since this morning being used to authorize a large payment this afternoon, with no
  fresh authentication challenge, is a gap worth flagging in review regardless of which protocol is
  underneath.
- **RBAC role explosion carried over unchanged from the SAML/enterprise-groups era.** Enterprise
  directory groups mapped reasonably well onto SAML role attributes for a fixed set of applications;
  the same coarse group-based model, unchanged, often does not scale to fine-grained, per-transaction
  authorization decisions in modern API-driven systems. See the ABAC discussion in Intermediate.
- **Client secrets treated like SAML metadata** — shared once, rarely rotated. OAuth2 client secrets
  and signing keys need the same rotation discipline as any other credential; "we exchanged metadata
  once during onboarding" is a SAML-era mental model that under-rotates OIDC client credentials.

:::callout{kind=bank-context}
Both SAML and OIDC can satisfy strong-authentication and audit requirements; the protocol choice
itself is rarely the compliance question. The compliance question is whether the specific
implementation enforces the properties you need — session/token revocation, step-up for high-risk
actions, claim minimisation — regardless of which protocol carries the identity. Do not treat "we
moved to OIDC" as itself a control; ask what it enabled that SAML did not, for this specific system.
:::

## Ten-minute drill

::::exercise{id=ex-saml-to-oidc type=scenario title="Migrating a partner integration from SAML to OIDC"}
A partner fintech currently authenticates its staff into your bank's partner portal via SAML SSO
(your bank is the IdP). The partner now also wants API access to customer account data on behalf of
consenting customers, and proposes reusing the same SAML relationship for this. What do you tell them,
and what should the API access actually use?
:::solution
The two problems are different in kind, not just protocol: SAML SSO here authenticates the *partner's
staff* into a portal (workforce/B2B identity) — that can reasonably stay as-is if it works. API access
"on behalf of a consenting customer" is a different relationship entirely: the customer is the
Resource Owner, the partner's system is the Client, and the correct shape is OAuth2/OIDC Authorization
Code flow with PKCE, where the customer explicitly authenticates and consents at your bank's own
Authorization Server, not the partner's SAML session. Reusing the SAML staff-login relationship for
customer-data API access would conflate "the partner's employee is who they say they are" with "this
specific customer consented to this specific data access" — those must stay separate, both for
correctness and because customer consent has its own regulatory basis (this is the Open Banking/PSD2
shape covered in Beginner). Recommend standing up the OAuth2/OIDC flow as a genuinely separate
integration, not an extension of the existing SAML trust.
:::
::::
