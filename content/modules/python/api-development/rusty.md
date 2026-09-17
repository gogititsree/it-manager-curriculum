---
title: "API Development — Flask-era knowledge, updated"
estimatedMinutes: 18
objectives:
  - "Re-anchor routes/JSON/validation vocabulary in ten minutes"
  - "Map Flask-era instincts onto FastAPI and pydantic v2"
  - "Spot the gotchas that still catch experienced API developers"
status: ready
---

You've built a REST-ish API in Python before, most likely with Flask, most likely without much
formal validation or async. The route-and-JSON model hasn't changed. What's different is the
default toolchain and how much a framework now does for you before your function even runs.

## What you probably remember

| Concept | One-line anchor |
| --- | --- |
| Route | A URL pattern plus HTTP method, mapped to a function. |
| `request` / `jsonify` | Flask's way to read the incoming request and return JSON. |
| Blueprints | Flask's way to split routes across modules as an app grows. |
| WSGI | The synchronous interface Flask (and most pre-async Python web frameworks) runs on. |
| Manual validation | Checking `request.get_json()` fields by hand, or with an extension like marshmallow. |
| `flask run` / `gunicorn` | Dev server for local work; gunicorn (WSGI) for anything resembling production. |

## What changed since

:::callout{kind=changed-since title="FastAPI became the default choice for new APIs"}
FastAPI generates request validation, response serialisation and interactive OpenAPI docs directly
from Python type hints and pydantic models — the manual validation and separate API-doc-writing
Flask required is now largely automatic. Flask is still current and actively maintained; it's no
longer the default first choice for a new API with external consumers, mainly because of this gap.
:::

:::callout{kind=changed-since title="pydantic v2: validation moved to a Rust core"}
pydantic (the validation library under FastAPI, also usable standalone) had a major version 2
rewrite for performance. If you see `@validator`, `.dict()`, `.parse_obj()`, or a `class Config:`
block, that's v1 idiom — current code uses `@field_validator`, `.model_dump()`,
`.model_validate()`, and `model_config = ConfigDict(...)`.
:::

:::callout{kind=changed-since title="async is now a first-class option, not a niche pattern"}
`async def` route handlers, an `async` HTTP client (`httpx` instead of `requests`), and async
database drivers are now routine for I/O-heavy services. This only pays off if the whole call chain
underneath is actually async — a blocking library call inside an `async def` handler blocks the
entire worker, which is a new and easy-to-miss failure mode that didn't exist in a purely
synchronous Flask app.
:::

:::callout{kind=changed-since title="OpenAPI (formerly Swagger) generation is now often automatic"}
Hand-maintained API documentation, or a Swagger YAML file kept manually in sync with the code, is
what Flask-era teams typically did. FastAPI generates the spec from the same type hints used for
validation, so the docs and the actual accepted request shape cannot drift apart the way hand-kept
documentation could.
:::

:::manager
The practical upshot for a review: a new Python API built on Flask with no formal validation
library and no generated contract isn't broken, but it's carrying costs — inconsistent validation,
documentation that can silently go stale — that a FastAPI-based service gets for free. Worth asking
why Flask was chosen, not assuming it was the wrong call; sometimes it's exactly right for a small
internal tool.
:::

## Gotchas that still bite

- **`GET` requests that mutate data** — as true now as it ever was, and still shows up in code
  reviews regularly.
- **Trusting `request.get_json()` (or its equivalent) without validation** — still the single
  biggest source of confusing 500 errors from malformed input, whichever framework it's written in.
- **Auth checked inline, differently, in every endpoint** — a pattern that reliably produces one
  endpoint where it was forgotten.
- **A blocking call inside `async def`,** new since async became common: it looks like it should be
  fast, and silently stalls every other concurrent request on that worker.
- **The dev server running in "production" because it happened to work** — `flask run` and
  `uvicorn --reload` are both explicit about not being for real traffic; that warning gets ignored
  under deadline pressure regardless of which framework it's attached to.

:::callout{kind=bank-context}
An internal API reachable beyond its intended audience, with no auth because "it's internal," is
one of the most common, least glamorous findings in an internal penetration test — and it is
exactly as true of a FastAPI service as it was of a Flask one. The framework upgrade does not fix
an authentication gap; only adding authentication does.
:::

## Ten-minute drill

::::exercise{id=ex-flask-to-fastapi type=code title="Translate a Flask endpoint to FastAPI with validation"}
Rewrite this Flask endpoint as FastAPI, adding proper validation for the request body (amount must
be positive, currency must be a 3-letter code) instead of the manual checks.

```python
from flask import Flask, request, jsonify

app = Flask(__name__)

@app.post("/accounts/<account_id>/transactions")
def create_transaction(account_id):
    data = request.get_json()
    if not data or "amount" not in data or "currency" not in data:
        return jsonify({"error": "amount and currency required"}), 400
    if data["amount"] <= 0:
        return jsonify({"error": "amount must be positive"}), 400
    # ... create the transaction ...
    return jsonify({"status": "created"}), 201
```
:::solution
```python
from fastapi import FastAPI
from pydantic import BaseModel, Field

app = FastAPI()

class TransactionIn(BaseModel):
    amount: float = Field(gt=0)
    currency: str = Field(min_length=3, max_length=3)

@app.post("/accounts/{account_id}/transactions", status_code=201)
def create_transaction(account_id: str, transaction: TransactionIn):
    # ... create the transaction ...
    return {"status": "created"}
```
The manual `if`/`return 400` checks are gone: FastAPI validates against `TransactionIn` before the
function runs, and returns a structured `422` automatically on invalid input — with a body telling
the caller exactly which field failed and why, which the hand-written Flask version didn't provide.
:::
::::
