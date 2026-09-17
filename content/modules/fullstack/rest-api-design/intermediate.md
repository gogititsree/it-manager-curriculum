---
title: "REST APIs in Production: Versioning, Pagination and Review"
estimatedMinutes: 42
objectives:
  - "Choose and defend a versioning strategy for a public or partner-facing API"
  - "Design pagination and idempotency correctly for collection and payment endpoints"
  - "Use RFC 7807 Problem Details as the error shape and know why it beats ad hoc error JSON"
  - "Run an API design review using a checklist you could hand to another manager"
status: ready
---

You know resources, verbs, status codes and basic JSON shapes. This lesson is about what breaks once
an API has real consumers, has to change without breaking them, and has to survive retries, partial
failures and a security review.

## Where the basics break down

A REST API that works in a demo with one client and a handful of test calls hits different problems
in production: clients built against version 1 cannot tolerate version 2's breaking change; a
`GET /payments` that returned ten rows in testing returns two million in production and times out; a
retried `POST /payments` after a network timeout creates a duplicate payment; and every team invents
its own error JSON shape, so a client integrating with five internal APIs needs five different error
parsers. None of these are exotic — they are the default outcome of not deciding on a strategy up
front.

## Versioning

APIs change. The question is not whether to version, but how to signal a breaking change to consumers
without breaking them on day one. Three common strategies, each with a real tradeoff:

:::callout{kind=decision title="Where does the version go?"}
- **URL path** (`/v1/payments`, `/v2/payments`) — simplest to understand, visible in every log line
  and every curl command; the tradeoff is that a "version" now looks like it applies to the whole API
  even when only one resource changed.
- **Header** (`Accept: application/vnd.bank.payments.v2+json`, or a custom `Api-Version` header) —
  keeps URLs stable, which matters for caching and bookmarking; the tradeoff is that it is invisible
  in casual inspection (logs, browser address bar) and easy for a client to get wrong silently.
- **No versioning, only additive changes** — never remove or repurpose a field, only add new optional
  ones; breaking changes become new resources instead. Simplest for consumers long-term, but requires
  real discipline and does not solve every kind of breaking change (e.g. a semantic change to an
  existing field's meaning).
:::

Most public and partner-facing bank APIs use URL path versioning because it is unambiguous to
external teams who did not read your internal style guide. Internal, tightly-coupled services (same
team on both ends, deployed together) can often get away with the additive-only approach and skip
formal versioning entirely.

:::manager
Ask what the deprecation policy is for the previous version, not just what the new version looks
like. "We ship v2" without an answer to "how long does v1 keep working, and who is still calling it"
is an incomplete plan — and for partner/regulatory integrations, an unannounced v1 shutdown is a real
incident, not just a technical inconvenience.
:::

## Pagination

Any endpoint returning a collection needs a pagination strategy before it has real data volume, not
after the first timeout. Two common approaches:

:::engineer
```
Offset-based:
GET /payments?limit=50&offset=100

Cursor-based:
GET /payments?limit=50&cursor=eyJpZCI6OTk5fQ
```
Offset-based is simple and lets a client jump to page N, but is unstable if rows are inserted or
deleted between pages (a row can be skipped or repeated), and gets slower for the database as the
offset grows on large tables. Cursor-based (an opaque token encoding "where I left off", typically
the last row's sort key) stays stable and fast regardless of table size, at the cost of not supporting
"jump to page 40" — only "next" and "previous". For anything payment- or transaction-related at real
scale, cursor-based is the safer default.
:::

A well-designed paginated response also tells the client whether more data exists and how to get it,
rather than making the client guess from the row count:

```json
{
  "data": [ /* ... */ ],
  "pagination": { "nextCursor": "eyJpZCI6MTA0OX0", "hasMore": true }
}
```

:::manager
"The reports screen times out for large accounts" is very often a missing-pagination bug, not a
database sizing problem. Ask whether the endpoint has a hard row limit and what happens above it
before approving infrastructure spend to fix it.
:::

## Idempotency keys

Networks fail after the server has already processed a request but before the client received the
response. The client, not knowing which happened, retries. For a `GET` this is harmless. For a
`POST /payments`, a naive retry can create a second, real payment.

The standard fix: the client generates a unique **idempotency key** (typically a UUID) and sends it
with the request. The server stores, keyed by that value, the result of the first successful
processing, and returns the same result on any retry with the same key instead of processing again.

:::engineer
```http
POST /payments HTTP/1.1
Idempotency-Key: 7c9e6679-7425-40de-944b-e07fc1f90ae7
Content-Type: application/json

{ "debtorAccountId": "42", "creditorAccountId": "57", "amount": { "value": "250.00", "currency": "GBP" } }
```
Server behaviour: first request with this key → process normally, store the response against the key
(usually with a retention window, e.g. 24 hours). Any subsequent request with the same key → return
the stored response without reprocessing, even if the request body differs (or `422` if the body
differs, depending on how strict you want to be — document the choice).
:::

:::callout{kind=bank-context}
Idempotency keys are effectively mandatory for any payment-initiation API. A duplicate payment caused
by a client retry is a real customer-money incident, not a theoretical edge case, and "the client
should not retry" is not a control you can rely on — you do not own every client.
:::

## Error shapes: RFC 7807 Problem Details

Every team inventing its own error JSON is a real integration cost. RFC 7807 (and its refinement,
RFC 9457) defines a standard shape for HTTP API errors, `application/problem+json`, so a generic
client-side error handler can work across APIs from different teams and vendors without custom
parsing per API.

:::engineer
```json
HTTP/1.1 422 Unprocessable Entity
Content-Type: application/problem+json

{
  "type": "https://api.bank.example/errors/insufficient-funds",
  "title": "Insufficient funds",
  "status": 422,
  "detail": "Account 42 has insufficient available balance for this payment.",
  "instance": "/payments/attempts/8f14e2",
  "accountId": "42"
}
```
`type` is a URI identifying the error category (a stable identifier a client can branch on
programmatically); `title` is a short human-readable summary; `detail` is specific to this occurrence;
`instance` identifies this specific occurrence for tracing. Extra fields (`accountId` here) are
allowed and encouraged for machine-readable context beyond the required ones.
:::

:::manager
If a design review shows a custom error shape (`{"error": "...", "code": 42}`) reinvented per team,
ask whether adopting Problem Details was considered. It is a small engineering cost for a real
reduction in integration friction, especially for partner-facing APIs your bank does not fully
control the client code for.
:::

## OpenAPI: the contract as a document

An OpenAPI (formerly Swagger) specification describes an API's endpoints, request/response shapes,
and error responses in a machine-readable YAML or JSON document. It is the API-design equivalent of a
database schema: it lets tools generate client SDKs, mock servers, documentation, and contract tests
automatically, and it lets a design review happen against the contract before a line of
implementation code is written.

:::engineer
```yaml
paths:
  /payments/{id}:
    get:
      summary: Get a payment
      parameters:
        - name: id
          in: path
          required: true
          schema: { type: string }
      responses:
        '200':
          description: The payment
          content:
            application/json:
              schema: { $ref: '#/components/schemas/Payment' }
        '404':
          description: Not found
          content:
            application/problem+json:
              schema: { $ref: '#/components/schemas/ProblemDetails' }
```
Current tooling (as of recent years, OpenAPI 3.0 and 3.1) can validate real requests/responses against
this document in CI, catching drift between the spec and the implementation automatically.
:::

:::manager
Ask for the OpenAPI spec as a design review artefact, before implementation starts, not as
after-the-fact documentation generated from code. Reviewing the contract early is far cheaper than
discovering a shape problem after two teams have built against it.
:::

## What good looks like

A review checklist for a REST API design, usable in a design review meeting:

- **Resources, not verbs**, in the URL structure; consistent casing and pluralisation.
- **Every collection endpoint is paginated**, with a documented default and maximum page size.
- **Every state-changing `POST` that creates something with real-world consequence** (payments,
  orders) supports an idempotency key.
- **Errors use a consistent shape** (ideally Problem Details) across every endpoint, including
  validation errors.
- **A versioning strategy is stated explicitly**, with a deprecation policy for the previous version.
- **An OpenAPI spec exists and is reviewed**, not generated after the fact as documentation.
- **Money is never a bare float**; timestamps are ISO 8601 with explicit timezone/UTC.
- **Authentication and authorization are specified per endpoint**, not assumed — see the Auth Patterns
  topic.
- **Rate limiting and its response shape** (`429 Too Many Requests`, with a `Retry-After` header) are
  defined for any externally-facing endpoint.

## Exercises

::::exercise{id=ex-review-design type=scenario title="The team proposes a payments API without idempotency keys"}
A team presents a design for `POST /payments` with no idempotency key support, reasoning "our mobile
app has retry logic that checks the payment list before retrying, so duplicates can't happen." What do
you ask, and what would you push back on?
:::solution
Push back points: (1) "our mobile app" is one client; the API likely has, or will have, other
consumers (partner integrations, internal batch systems, a future web app) that will not implement
the same check — the API's safety should not depend on every client implementing bespoke duplicate
prevention correctly. (2) The check-before-retry approach has its own race condition: if two retries
happen close together, or if the check-then-post is not atomic, duplicates can still occur under load.
(3) Idempotency keys are a small, well-understood addition (a header plus a server-side dedupe store
with a retention window) compared to the cost of investigating and remediating a duplicate-payment
incident after the fact. Ask what the plan is for reconciling a duplicate if the client-side
protection ever fails — if there is no good answer, that is the argument for building the
server-side control now.
:::
::::

::::exercise{id=ex-version-decision type=scenario title="v1 to v2: a breaking change is needed"}
A payments API needs to change `amount` from a plain number to a `{value, currency}` object — a
genuine breaking change for existing clients. Three partner banks currently call v1. What is your
recommended path, and what would you communicate to those partners and by when?
:::solution
Recommended path: introduce `/v2/payments` (or the equivalent header-based version) with the new
shape, keep `/v1/payments` running unchanged and fully supported for a defined deprecation window
(commonly 6-12 months for partner-facing financial APIs, but the real number depends on your specific
partner contracts — check them rather than assuming a figure). Communicate to partners: the v2
availability date, the exact shape change with a migration guide and example payloads, a concrete v1
sunset date, and a monitoring mechanism (e.g. a dashboard or automated notice) showing whether each
partner has migrated, so the sunset is not a surprise. Do not repurpose the existing `amount` field's
meaning in place — that breaks every client silently with no error to signal it, which is worse than a
clean version bump they can plan around.
:::
::::
