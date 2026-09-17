---
title: "Authentication & Authorization Patterns"
estimatedMinutes: 40
objectives:
  - "Distinguish authentication from authorization, and sessions from tokens"
  - "Name the four OAuth2 roles and say what each one does"
  - "Explain why MFA matters and what 'factor' means precisely"
status: ready
---

Almost every security incident a bank reports involves getting one of two questions wrong: "who is
this?" (authentication) and "what are they allowed to do?" (authorization). This lesson builds the
vocabulary precisely, because in this domain a vague understanding is worse than none — it leads to
confident wrong answers in a review. Where a detail depends on a specific implementation or a spec
edge case, this lesson says so rather than guessing.

## Why this exists

A banking application has to answer "who is this?" for a customer on a mobile app, an employee at a
branch terminal, and a partner system calling an API — three different situations with three
different appropriate mechanisms. Getting authentication and authorization tangled together, or
using a mechanism built for one situation (say, a browser session cookie) in a situation it was not
designed for (a server-to-server API call), is a recurring root cause in security reviews.

:::manager
Keep two questions separate in every review: **authentication** — is this really who they claim to
be? — and **authorization** — given who they are, are they allowed to do this specific thing? A
system can authenticate perfectly and still authorize wrongly, and vice versa. Treat them as two
separate controls to review, not one.
:::

## Sessions vs tokens

Two different mechanisms answer "how does the server know who is making this request, on every
request, without asking for a password every time?"

**Session-based auth**: after login, the server creates a session record (server-side state, usually
in a database or cache) and gives the browser a session ID in a cookie. On each request, the browser
sends the cookie back, and the server looks up the session to know who it is. This is the older,
still very common model for browser-based web applications.

**Token-based auth**: after login, the server issues a token (commonly a JWT — JSON Web Token) that
itself contains the claims about who the user is, cryptographically signed so it cannot be forged
without the signing key. The client sends the token on each request, usually in an `Authorization`
header, and the server verifies the signature rather than looking anything up. This is the dominant
model for APIs, mobile apps, and service-to-service calls.

:::engineer
```http
# Session-based: cookie holds an opaque ID, server holds the actual data
Set-Cookie: sessionId=8f14e2a1; HttpOnly; Secure; SameSite=Strict

# Token-based: the Authorization header carries a signed, self-contained token
Authorization: Bearer eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI0MiJ9.signature...
```
A JWT has three base64url-encoded parts separated by dots: header (algorithm), payload (claims,
e.g. `sub` for subject/user id), and signature. Anyone can *decode* a JWT and read the payload — it is
not encrypted, only signed. Never put secrets in a JWT payload.
:::

The practical tradeoff: a session can be revoked instantly (delete the server-side record) but
requires a lookup on every request and does not scale as cleanly across many independent services. A
token needs no lookup (fast, works well across distributed services) but is genuinely hard to revoke
before it expires, because the server verifying it has no record to delete — this is why token
lifetimes matter so much, covered further in Intermediate.

:::manager
"Can we log this user out immediately, everywhere?" is a question worth asking explicitly whenever a
team proposes a pure token-based design with no server-side revocation list. The honest answer for a
pure stateless-token system is often "not until the token expires" — acceptable for some risk levels,
not for others (e.g. after a confirmed account compromise).
:::

## OAuth2: the four roles

OAuth2 is not itself an authentication protocol — it is an **authorization** framework: a way for a
user to grant a third-party application limited access to their data on another service, without
handing over their password. It defines four roles, and confusing them is the single most common
source of muddled OAuth2 discussions:

- **Resource Owner** — the user, who owns the data and grants access to it.
- **Client** — the application requesting access (e.g. a budgeting app that wants read access to your
  transactions).
- **Authorization Server** — issues tokens after authenticating the resource owner and getting their
  consent (e.g. the bank's login and consent screen).
- **Resource Server** — the API that holds the protected data and accepts the token to grant access
  (e.g. the bank's transactions API).

:::engineer
```
Resource Owner  ── logs in & consents ──>  Authorization Server
                                                   │
                                          issues access token
                                                   │
         Client  <────────────────────────────────┘
            │
            │  Authorization: Bearer <access token>
            ▼
     Resource Server (checks token, returns data)
```
:::

:::manager
When a vendor says "we support OAuth2", ask which role their system plays, and which flow (see
Intermediate for the flows). "OAuth2" alone describes a family of possible integrations, not one
specific mechanism — the details materially affect your risk posture and integration effort.
:::

:::callout{kind=bank-context}
In UK/EU retail banking, this exact four-role model underlies Open Banking and PSD2 Account
Information / Payment Initiation flows: the bank is the Authorization Server and Resource Server, the
customer is the Resource Owner, and a third-party provider (TPP) is the Client. Strong Customer
Authentication (SCA) requirements layer on top of this at the authentication step — verify the current
requirements against the regulator's own material rather than assuming detail from memory, as this
area has been amended more than once.
:::

## Multi-factor authentication (MFA)

Authentication is stronger when it combines independent **factors** — categories of evidence, not
just "more passwords." The standard three categories:

- **Something you know** — a password, a PIN.
- **Something you have** — a phone receiving an OTP (one-time passcode), a hardware token, an
  authenticator app generating time-based codes.
- **Something you are** — biometrics: fingerprint, face.

MFA means combining factors from **different** categories. Two passwords is not MFA — it is one
factor, checked twice. A password plus an SMS code is two factors (know + have). A precise detail
worth getting right in review: SMS-delivered OTP is a real, widely deployed second factor, but it is
also the weakest common option, because it is vulnerable to SIM-swap attacks; authenticator apps or
hardware tokens are generally considered stronger. Check current guidance from your security team
rather than treating any one option as automatically acceptable.

:::manager
When a team says "we have MFA", the follow-up question is which factor combination, and whether it
is required for every login or only for step-up on risky actions (see "risk-based" / "adaptive" auth
in Intermediate). Both are legitimate designs; which one is appropriate depends on the transaction
risk, and that is a judgement call your risk and compliance colleagues should sign off on, not
engineering alone.
:::

## Common mistakes

- **Confusing authentication with authorization** — "the user is logged in" does not mean "the user
  is allowed to see this specific account."
- **Storing passwords in a way that is not a modern, salted hash** — this is a foundational control;
  if you hear "we store passwords encrypted, not hashed" in a review, that is worth escalating, not
  nodding past.
- **Treating a JWT's contents as secret.** It is signed, not encrypted (unless explicitly using
  encrypted JWTs, which is a distinct, less common thing). Anyone can read the payload.
- **Using a long-lived session cookie or token for a high-risk action** without re-authentication
  (step-up auth) — e.g. allowing a payment above a threshold using a session that was authenticated
  ten hours ago.
- **Assuming "OAuth2" means "secure" by itself.** OAuth2 is a framework with several flows of very
  different security properties; the wrong flow choice (see Intermediate) can be a real vulnerability.

## Putting it together

::::exercise{id=ex-classify-mechanism type=design title="Choose session or token for three integrations"}
Your bank is building: (1) a customer-facing web portal, (2) a mobile app calling the bank's own
APIs, (3) a partner fintech calling the bank's APIs to retrieve account data on behalf of a consenting
customer. For each, would you reach for session-based or token-based auth, and why? What role does
each party play if OAuth2 is involved?
:::solution
1. **Web portal**: session-based is a defensible default (server-rendered or hybrid apps with the
   browser as the client) — simple, revocable instantly, well-supported by browser cookie security
   features (`HttpOnly`, `Secure`, `SameSite`). A single-page app calling a separate API could
   reasonably use tokens instead; both are legitimate, and the choice should be stated, not assumed.
2. **Mobile app calling the bank's own APIs**: token-based, typically OAuth2 with the mobile app as
   the Client, the bank as both Authorization Server and Resource Server, since there is no browser
   cookie jar shared between the app and the API in the same way, and tokens work naturally across
   app restarts and API calls.
3. **Partner fintech calling the bank's APIs**: token-based OAuth2 is the standard shape — the
   customer is the Resource Owner, the fintech is the Client, the bank is the Authorization Server and
   Resource Server. This is the Open Banking / PSD2 shape. The key review question: what OAuth2 flow
   does the fintech use to get its token, and does it ever see the customer's bank credentials
   directly? (It should not — see Intermediate for why the Authorization Code flow exists.)
:::
::::
