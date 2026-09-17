---
title: "REST API Design"
estimatedMinutes: 35
objectives:
  - "Explain what makes an API 'RESTful' and why resources are the core idea"
  - "Choose the correct HTTP verb and status code for a given operation"
  - "Read a JSON request/response shape and judge whether it is well designed"
status: ready
---

Every screen a customer sees, every batch job, every integration with a payment network eventually
talks to a backend over an API. Most of those APIs, inside the bank and at the vendors you buy from,
are REST APIs over HTTP with JSON bodies. This lesson gives you the vocabulary to read one, and to
tell a well-designed one from a poorly designed one, without writing the code yourself.

## Why this exists

Before REST became the default, integration meant SOAP (heavy XML envelopes, a rigid contract
language called WSDL) or bespoke binary protocols, each with its own rules. REST won because it reuses
a protocol everyone already has (HTTP) and a small, well-understood set of verbs and status codes
that map onto ordinary CRUD operations: create, read, update, delete. A REST API is not a specific
technology — it is a set of conventions layered on top of plain HTTP. Understanding those conventions
is what lets you read an unfamiliar API's documentation in five minutes instead of fifty.

:::manager
When a vendor or another team says "we expose a REST API", that phrase alone tells you very little
about quality. Two APIs can both be technically RESTful while one is a pleasure to integrate with and
the other causes a support ticket every sprint. The rest of this lesson is what separates them.
:::

## Resources: the core idea

REST organises an API around **resources** — nouns, not actions. An `Account`, a `Payment`, a
`Customer` are resources. Each resource has a URL that identifies it (`/accounts/42`), and you act on
it using HTTP verbs rather than encoding the action into the URL itself.

The naive, non-RESTful instinct (common in older SOAP-influenced or RPC-style APIs) is to name
endpoints after actions: `/getAccount`, `/createPayment`, `/cancelPayment`. A RESTful design instead
has one URL per resource and lets the HTTP verb say what you are doing to it.

:::engineer
```
Non-RESTful (RPC-style):        RESTful:
POST /getAccount                GET    /accounts/42
POST /createPayment             POST   /payments
POST /cancelPayment             DELETE /payments/99
POST /updateCustomerAddress     PATCH  /customers/7
```
The right column has one concept per line — a noun and a verb — instead of a growing list of
custom-named actions.
:::

:::manager
A quick smell test for a design doc: count how many endpoint names are verbs (`/processPayment`,
`/getStatus`). A handful is normal for genuine actions that are not CRUD (see "not everything is
CRUD" below); a design that is mostly verbs has not adopted the resource model and will be harder for
other teams to predict and integrate with.
:::

## HTTP verbs and what they mean

| Verb | Meaning | Safe? | Idempotent? |
| --- | --- | --- | --- |
| `GET` | Read a resource or collection | Yes | Yes |
| `POST` | Create a new resource (usually) | No | No |
| `PUT` | Replace a resource entirely | No | Yes |
| `PATCH` | Partially update a resource | No | No (usually) |
| `DELETE` | Remove a resource | No | Yes |

**Safe** means the call does not change server state (a `GET` should never have side effects — no
"this endpoint logs you out" behind a `GET`). **Idempotent** means calling it once has the same effect
as calling it many times — important because networks fail and clients retry. `DELETE /payments/99`
twice still results in the payment being gone either way; `POST /payments` twice, without protection,
creates two payments. This is why idempotency keys exist for `POST` — covered in Intermediate.

:::engineer
```http
GET /accounts/42 HTTP/1.1
Host: api.bank.example

PATCH /customers/7 HTTP/1.1
Content-Type: application/json

{ "address": { "line1": "221B Baker Street", "postcode": "NW1 6XE" } }
```
`PATCH` sends only the fields that changed. `PUT` would require sending the entire customer object,
and any field left out would typically be interpreted as cleared — a common source of accidental data
loss when a client uses `PUT` but only means to update one field.
:::

## Status codes: what they signal

Status codes are grouped by their first digit, and getting the group right matters more than picking
the "perfect" specific code:

- **2xx — success.** `200 OK` (general success), `201 Created` (a `POST` made a new resource — include
  its URL in the `Location` header), `204 No Content` (success, nothing to return, common for `DELETE`).
- **4xx — the client's fault.** `400 Bad Request` (malformed input), `401 Unauthorized` (not
  authenticated — you don't know who this is), `403 Forbidden` (authenticated, but not allowed),
  `404 Not Found`, `409 Conflict` (e.g. trying to create something that already exists, or a version
  conflict), `422 Unprocessable Entity` (well-formed but fails validation rules).
- **5xx — the server's fault.** `500 Internal Server Error` (unhandled failure), `503 Service
  Unavailable` (temporarily down, often with a `Retry-After` header).

The single most common mistake: returning `200 OK` with an error described only in the JSON body. This
breaks every generic tool (caching, monitoring, retries) that relies on the status code to know what
happened without parsing the body.

:::manager
In a review, ask to see the error responses, not just the success case. A team that cannot show you a
`404` or `422` example has usually not designed the failure paths yet, and those are exactly the paths
that generate support tickets and incident reviews.
:::

:::callout{kind=gotcha title="401 vs 403, precisely"}
`401 Unauthorized` really means "unauthenticated" — the server does not know who you are (missing or
invalid credentials). `403 Forbidden` means "I know who you are, and you are not allowed to do this."
Confusing the two is extremely common and makes debugging access issues harder, because the wrong one
sends an operator down the wrong path (re-checking credentials vs re-checking permissions).
:::

## JSON shapes: reading a request and response

A REST API's contract is largely its JSON shapes. Reading one well means checking: what fields are
present, which are optional, what are the types, and how are relationships between resources
represented (nested objects, or just an ID to look up separately).

:::engineer
```json
// GET /payments/99
{
  "id": "99",
  "status": "SENT",
  "amount": { "value": "250.00", "currency": "GBP" },
  "debtorAccountId": "42",
  "creditorAccountId": "57",
  "createdAt": "2026-03-14T09:12:00Z"
}
```
Note: money is an object with `value` and `currency`, not a bare number — this avoids ambiguity about
currency and avoids floating-point rounding issues if `value` is treated as a string/decimal rather
than a binary float. Timestamps are ISO 8601 with an explicit `Z` (UTC). Relationships are given as
IDs (`debtorAccountId`), not embedded objects, so the client fetches the account separately when it
needs more than the ID — this keeps the payment response small and avoids stale embedded data.
:::

:::manager
Money represented as a plain floating-point number in a JSON API is a red flag worth raising in any
review — it is a well-known source of rounding errors. Expect an integer minor-unit count (cents) or a
string decimal, paired with an explicit currency code.
:::

## Not everything is CRUD

Some real operations do not map cleanly onto create/read/update/delete: "approve this payment",
"reset this password", "reconcile this batch". Forcing these into `PATCH` with a status field works
sometimes, but for actions with real side effects and their own audit trail, a resource-shaped
"action" is often clearer:

:::engineer
```http
POST /payments/99/approvals
POST /passwords/reset-requests
POST /batches/5/reconciliations
```
Each of these is still a noun (`approval`, `reset-request`, `reconciliation`) — the action is modelled
as a resource being created, which keeps the verb vocabulary (`POST` = create) consistent instead of
inventing new HTTP-verb-like meanings.
:::

## Common mistakes

- **Verbs in URLs** (`/cancelPayment`) instead of resources and HTTP verbs.
- **200 with an error in the body.** Breaks caching, monitoring, and generic retry logic.
- **Inconsistent pluralisation and casing** — `/account` next to `/Payments` next to `/customer-list`.
  Pick collection-plural, kebab-case or camelCase, and stay consistent across the whole API.
- **Leaking internal IDs or implementation details** — database auto-increment integers exposed
  directly as public IDs make enumeration attacks and future migrations both harder.
- **No pagination on collection endpoints** — `GET /payments` that can return millions of rows with no
  limit is a production incident waiting to happen. Covered in Intermediate.

:::callout{kind=bank-context}
Every API that touches customer or payment data needs a clear answer to "what is logged, and can we
reconstruct who did what, when" — this is an audit trail requirement, not just an engineering nicety.
A well-designed resource-oriented API with explicit action-resources (like `/payments/99/approvals`)
makes this easier to answer than one where actions are buried inside opaque `PATCH` bodies.
:::

## Putting it together

::::exercise{id=ex-design-endpoints type=design title="Design the endpoints for a standing order"}
A customer can set up a recurring payment ("standing order"): create it, view it, change the amount or
frequency, pause it, and cancel it permanently (which is different from pausing — it cannot be
resumed). Sketch the resource(s), URLs, HTTP verbs, and the status codes you would expect for a
successful call to each.
:::solution
- `POST /standing-orders` → `201 Created`, body includes the new standing order and its `id`; response
  has a `Location: /standing-orders/123` header.
- `GET /standing-orders/123` → `200 OK` with the current representation; `404` if it does not exist or
  belongs to another customer (many teams return `404` rather than `403` here to avoid confirming
  existence to an unauthorised caller — worth a discussion, not a universal rule).
- `PATCH /standing-orders/123` → partial update (amount or frequency) → `200 OK` with the updated
  resource.
- Pause is a state change with its own semantics, not a field the client should set freely — model it
  as an action-resource: `POST /standing-orders/123/pauses` → `201 Created` (or `200 OK` if you treat
  "paused" as idempotent), and `DELETE /standing-orders/123/pauses/current` (or similar) to resume.
- Cancel, being permanent and different from pause: `DELETE /standing-orders/123` → `204 No Content`.
  A subsequent `GET` returns `404` (or `410 Gone` if you want to distinguish "never existed" from
  "existed and was removed" — a genuinely defensible choice either way).
- A reviewer should ask: is pause reversible in the model the same way it is reversible in the
  business? Modelling "paused" as just a status field on `PATCH` would let a client silently un-pause
  by sending the wrong value, whereas an explicit action-resource makes the transition auditable.
:::
::::
