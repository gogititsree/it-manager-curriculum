---
title: "REST API Design — refresher"
estimatedMinutes: 16
objectives:
  - "Re-anchor resources, verbs and status codes in ten minutes"
  - "Know what changed in API conventions since the SOAP/WSDL and early-REST era"
  - "Spot the gotchas that still cause incidents in APIs designed by experienced engineers"
status: ready
---

You have designed or reviewed web service contracts before, possibly back when SOAP and WSDL were
still normal, or in the early days of REST when conventions were less settled. The core ideas have not
moved. What has solidified is the detail: standard error shapes, machine-readable contracts, and a
much stronger default expectation around pagination and idempotency.

## What you probably remember

| Concept | One-line anchor |
| --- | --- |
| Resource | A noun with a URL (`/accounts/42`); act on it with HTTP verbs, not action-named endpoints. |
| GET / POST / PUT / DELETE | Read / create / replace / remove. `PATCH` for partial update joined later but is now standard. |
| Idempotent | Calling it once has the same effect as calling it many times: `GET`, `PUT`, `DELETE` are; `POST` generally is not. |
| Status codes | 2xx success, 4xx client error, 5xx server error. `404` not found, `401` unauthenticated, `403` forbidden. |
| JSON over XML | REST APIs mostly moved to JSON bodies; SOAP's XML envelopes and WSDL contracts fell out of use for new work. |

## What changed since

:::callout{kind=changed-since title="OpenAPI 3.x is the de facto contract format (OpenAPI 3.0 in 2017, 3.1 in 2021)"}
Swagger 2.0 became OpenAPI 3.0 and later 3.1. If you knew WSDL as "the contract file", OpenAPI is its
REST-era, JSON/YAML-based, far lighter equivalent — and unlike WSDL it is now normal to generate
mocks, client SDKs and contract tests from it, and to review it in a design meeting before code is
written.
:::

:::callout{kind=changed-since title="RFC 7807 Problem Details (2016), refined as RFC 9457 (2023)"}
A standard JSON error shape (`application/problem+json`: `type`, `title`, `status`, `detail`,
`instance`, plus extension fields) replaced the practice of every team inventing its own error JSON.
Worth checking whether a given API actually adopted it — many still have not — but it is now the
reference point to cite in a review.
:::

:::callout{kind=changed-since title="Idempotency keys are now an explicit, expected pattern"}
Where retry-safety used to be either ignored or handled ad hoc per team, an `Idempotency-Key` header
plus server-side dedupe is now the standard, named pattern for any `POST` with real-world
consequences (payments, orders). Popularized by payment processors' public APIs; expect it by default
in anything that moves money.
:::

:::callout{kind=changed-since title="Cursor-based pagination is now the default recommendation at scale"}
Offset/limit pagination (`?offset=100&limit=50`) is still common for small, stable datasets, but
cursor-based pagination (an opaque token, not a page number) is now the recommended default for large
or frequently-changing collections, because offset pagination degrades in both correctness (rows
skipped/repeated on insert/delete) and performance as the table grows.
:::

:::callout{kind=changed-since title="GraphQL and gRPC as alternatives, not replacements, for most bank APIs"}
GraphQL (client-specified queries over a single endpoint) and gRPC (binary, contract-first,
high-performance RPC, common for internal service-to-service calls) both grew significantly since the
mid-2010s. Neither replaced REST for external/partner-facing APIs at most banks — REST/JSON remains
the default there — but expect to see gRPC inside a backend's internal service mesh and occasionally
GraphQL on a customer-facing aggregation layer. Worth knowing the names even if you are not
specifying either directly.
:::

:::engineer
```json
HTTP/1.1 422 Unprocessable Entity
Content-Type: application/problem+json

{ "type": "https://api.bank.example/errors/insufficient-funds",
  "title": "Insufficient funds", "status": 422,
  "detail": "Account 42 has insufficient available balance." }
```
If you last designed error responses as `{"error": "some string"}` or a bank-specific numeric code
with no standard shape, this is the current reference point to hold a review against.
:::

:::manager
The one-line version for a status report: "API contracts are now specified and reviewed as machine-
readable documents (OpenAPI) before code is written, error shapes follow a published standard, and
retry-safety for money-moving calls is a named, expected pattern, not an afterthought." If a team
cannot produce an OpenAPI spec for a service under review, that is now a legitimate gap to flag.
:::

## Gotchas that still bite

- **Verb-named endpoints creeping back in** under time pressure (`/processRefund` instead of
  `POST /refunds`) — the SOAP-RPC instinct never fully died, and it still degrades API predictability
  the same way it always did.
- **Assuming `POST` is idempotent because "the client only calls it once."** It is not idempotent by
  the HTTP specification, and network retries happen regardless of client intent. This is exactly what
  idempotency keys exist to fix.
- **Offset pagination on a table that grows.** Works fine in testing with a thousand rows, degrades in
  both correctness and latency once real data volume arrives. This bites experienced engineers as
  often as junior ones, because it is invisible until scale.
- **200 OK with an error in the body**, still the single most common violation seen in review,
  regardless of how senior the team is. It breaks generic tooling silently.
- **Treating OpenAPI as documentation generated after the fact** instead of a reviewed, contract-first
  artefact — this loses most of its value (catching shape mismatches before implementation, enabling
  mocks for parallel frontend/backend work).

:::callout{kind=bank-context}
An audit or regulatory review will often ask for the API contract, not the code. A current, accurate
OpenAPI spec (validated in CI against the real implementation, not hand-maintained and drifting) is a
much stronger answer than "the code is the documentation" — the latter requires an auditor to read
source code to understand an external-facing contract, which is not a reasonable expectation.
:::

## Ten-minute drill

::::exercise{id=ex-modernise-api type=code title="Modernise an endpoint design"}
Here is an endpoint as it might have been designed a decade ago. Identify what you would change and
why, then sketch the modern version.

```
POST /processPayment
Request: { "from": "42", "to": "57", "amt": 250.00 }
Response (success): { "success": true }
Response (failure): 200 OK, { "success": false, "error": "insufficient funds" }
```
:::solution
Problems: verb-named endpoint instead of a resource; bare float for money with no currency; `200 OK`
returned even on failure, with success/failure encoded only in the body; no idempotency protection for
a money-moving `POST`; no structured, machine-readable error.

```
POST /payments
Idempotency-Key: 7c9e6679-7425-40de-944b-e07fc1f90ae7
{ "debtorAccountId": "42", "creditorAccountId": "57",
  "amount": { "value": "250.00", "currency": "GBP" } }

Success  -> 201 Created, Location: /payments/9981, body = the created payment
Failure  -> 422 Unprocessable Entity, application/problem+json:
  { "type": ".../errors/insufficient-funds", "title": "Insufficient funds", "status": 422,
    "detail": "Account 42 has insufficient available balance." }
```
In review: does the idempotency key have a defined retention window? Is `422` the right code here, or
should insufficient funds be `409 Conflict` (state-dependent) — defensible either way, but the API
should be internally consistent about which it uses for this class of error.
:::
::::
