---
title: "API Development (FastAPI & Flask)"
estimatedMinutes: 35
objectives:
  - "Explain what a route, a request and a JSON response are in a Python web API"
  - "Read a small FastAPI or Flask app and say what each endpoint does"
  - "Explain what request validation is for and why it belongs at the edge"
status: ready
---

A large share of the bank's internal tools are a Python script that grew an HTTP interface: a
health-check dashboard, an internal lookup service, a webhook receiver. This lesson covers the
shape every one of them shares — routes, JSON in and out, and validation — using the two frameworks
you'll see in the wild, FastAPI and Flask.

## Why this exists

An API is a program that answers HTTP requests instead of running once and exiting. The core idea
is small: a **route** maps a URL and HTTP method to a Python function; the function reads the
request and returns data, usually JSON. Everything else — validation, authentication, error
handling — exists to make that basic loop safe to expose to other systems, some of which you don't
control.

:::manager
The question worth asking about any internal API before it goes anywhere near production: who else
calls this, what happens if it's called with bad input, and what happens if it's called by someone
who shouldn't be calling it at all. Those three questions cover most of what separates a demo from
a service.
:::

:::engineer
```python
# FastAPI
from fastapi import FastAPI

app = FastAPI()

@app.get("/accounts/{account_id}")
def get_account(account_id: str):
    return {"account_id": account_id, "balance": 1250.50}
```
```python
# Flask
from flask import Flask, jsonify

app = Flask(__name__)

@app.get("/accounts/<account_id>")
def get_account(account_id):
    return jsonify({"account_id": account_id, "balance": 1250.50})
```
Both do the same thing here. Run either with a local development server and `GET /accounts/123`
returns a JSON body.
:::

## Routes and HTTP methods

A route pairs an HTTP method (`GET` to read, `POST` to create, `PUT`/`PATCH` to update, `DELETE` to
remove) with a URL pattern. Path segments in braces (`{account_id}` / `<account_id>`) become
function arguments.

```python
@app.get("/accounts/{account_id}/transactions")
def list_transactions(account_id: str, limit: int = 20):
    ...                              # limit comes from a query string: ?limit=50

@app.post("/accounts/{account_id}/transactions")
def create_transaction(account_id: str, transaction: TransactionIn):
    ...                              # transaction comes from the JSON request body
```

:::manager
The HTTP method carries meaning your reviewers and monitoring tools rely on: `GET` should never
change data (it's the one thing a load balancer, a retry, or a cache is allowed to assume is safe
to repeat). An endpoint that deletes something behind a `GET` is a recurring, avoidable class of bug
— and occasionally an accident waiting for a web crawler to trigger it.
:::

:::engineer
Status codes matter as much as the method: `200` for a successful read, `201` for a successful
create (often with a `Location` header pointing at the new resource), `204` for a successful action
with no body to return, `4xx` for a client error, `5xx` for a server-side failure. Returning `200`
for everything, including failures, pushes error handling onto callers parsing the response body
instead of checking the status.
:::

## JSON in, JSON out

Requests and responses are (almost always) JSON. Python's own data structures — dicts, lists,
strings, numbers — map onto JSON directly; the framework handles the conversion both ways.

```python
@app.get("/health")
def health():
    return {"status": "ok", "checks": ["db", "cache"]}   # returned as a JSON object automatically
```

:::engineer
A JSON request body arrives as raw bytes; both frameworks parse it for you, but *what* you get
differs. Flask gives you a plain dict via `request.get_json()`, no shape guarantee. FastAPI, using
pydantic, parses it into a typed object and validates it before your function even runs — the
subject of the next section, and the biggest practical difference between the two frameworks.
:::

:::manager
"Returns JSON" is not the same as "returns JSON in a shape anyone can rely on." A response that
sometimes includes a field and sometimes omits it, or changes a field's type between calls, breaks
every consumer quietly. The same discipline that validates *incoming* requests should apply to what
a service sends back.
:::

## Request validation

**Validation** means rejecting a request before your business logic runs, if the input doesn't
match what's expected — wrong type, missing required field, value out of range. Doing this at the
edge, once, is far safer than trusting every internal function to re-check its inputs.

```python
# FastAPI + pydantic: the shape is declared once, validated automatically
from pydantic import BaseModel

class TransactionIn(BaseModel):
    amount: float
    currency: str
    reference: str | None = None

@app.post("/accounts/{account_id}/transactions")
def create_transaction(account_id: str, transaction: TransactionIn):
    # transaction.amount is guaranteed to be a float by the time this line runs
    ...
```

```python
# Flask: validation is your responsibility, usually with an extra library or manual checks
from flask import request

@app.post("/accounts/<account_id>/transactions")
def create_transaction(account_id):
    data = request.get_json()
    if "amount" not in data or not isinstance(data["amount"], (int, float)):
        return {"error": "amount is required and must be a number"}, 400
    ...
```

:::callout{kind=tip title="Why this matters more than it looks"}
A request that "shouldn't happen" — a string where a number was expected, a missing field, a
negative amount where only positive makes sense — happens constantly in practice: a client bug, an
API version mismatch, a malformed retry. Validating at the edge turns "the service crashed with a
confusing 500 error three functions deep" into "the client got a clear 422 telling them exactly what
was wrong."
:::

:::engineer
FastAPI's validation errors are structured JSON by default, naming the offending field and what was
wrong with it — useful for a caller debugging their own request, and useful to you: a log of
validation failures tells you which callers are sending malformed data and how often, without
adding any logging code yourself.
:::

:::manager
This is the core of the FastAPI-vs-Flask decision, previewed here and covered fully at Intermediate
level: FastAPI validates for you, using type hints as the specification. Flask requires you to
build that discipline yourself, every endpoint, or add a library that does it. Neither is wrong, but
"we use Flask and don't validate consistently" is a specific, common gap worth checking for.
:::

## Running it locally

Both frameworks ship a development server for local testing; neither is meant to face real traffic
directly (that's a deployment concern, covered at Intermediate level).

```bash
# FastAPI, via uvicorn
uvicorn main:app --reload            # --reload restarts on code changes, dev only

# Flask
flask --app main run --debug         # --debug enables auto-reload and a fuller error page
```

:::engineer
FastAPI also generates interactive API documentation automatically at `/docs`, from the same type
hints used for validation — visit it after starting the app and you can call every endpoint from
the browser with no extra setup. This is a direct, visible payoff of declaring request/response
shapes up front rather than a value-add feature bolted on separately.
:::

:::manager
The gap between "runs locally" and "safe to deploy" is bigger than it looks from the development
server's output. A reviewer who sees `uvicorn --reload` or `flask run --debug` mentioned as the way
a service is *actually* run in any environment beyond a developer's laptop should treat that as an
immediate finding, not a minor note.
:::

## Common mistakes

- **Putting a destructive action behind `GET`.** Reserve `GET` for reads; use `POST`/`DELETE` for
  anything that changes state.
- **Trusting input without validating it,** especially in Flask, where nothing forces the check.
- **Returning a stack trace to the caller** on an unhandled error — useful in development, a
  information-disclosure risk in anything reachable outside a trusted network.
- **Running the development server in production.** Both `uvicorn --reload` and Flask's debug
  server are explicitly not designed for production traffic or load.
- **No health-check endpoint,** leaving a deployment platform (or a human) with no cheap way to ask
  "is this service actually up and able to do its job."

:::callout{kind=bank-context}
An internal API with no input validation and no authentication, reachable from more of the network
than intended, is a recurring category of finding in internal penetration tests — usually not
because anyone decided to skip these, but because "quick internal tool" never got the second pass
that a customer-facing service would automatically get. Scale matters less than reachability: "only
internal people can call it" is rarely as narrow as it sounds once you check.
:::

## Putting it together

::::exercise{id=ex-design-endpoint type=design title="Design an endpoint for a balance lookup"}
Sketch an endpoint that returns an account's balance given an account ID in the URL. What HTTP
method? What should happen if the account doesn't exist? What should happen if the account ID in
the URL is obviously malformed (wrong length, wrong characters)? Where does validation happen in
each case?
:::solution
Method: `GET /accounts/{account_id}/balance` — this is a read with no side effect, so `GET` is
correct. Malformed account ID (wrong format entirely): validate the path parameter's shape before
doing any lookup and return `400 Bad Request` — this is a client error about the request itself, not
about the data. Well-formed but non-existent account ID: attempt the lookup, and if nothing is
found, return `404 Not Found` — a distinct case from a malformed request, and one callers need to
be able to tell apart programmatically (retry-worthy vs. not). In FastAPI, the ID-format check can
often be expressed directly in the path type/pattern so it's rejected before your function body
runs at all; in Flask, that check has to be written explicitly at the top of the function.
:::
::::
