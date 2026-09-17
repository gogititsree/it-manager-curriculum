---
title: "APIs in Practice: FastAPI, Flask and the Decisions Between Them"
estimatedMinutes: 45
objectives:
  - "Make the FastAPI-vs-Flask decision on real criteria, not familiarity"
  - "Use pydantic v2 for validation and settings, and know its performance story"
  - "Know when async actually helps a Python API and when it's dead weight"
  - "Read an OpenAPI spec and use it as a contract, not just documentation"
  - "Describe how auth middleware and deployment fit together for an internal service"
status: ready
---

You can read routes, JSON and basic validation. This lesson is about the decisions that determine
whether a Python API survives contact with real traffic, real auth requirements, and a real
deployment pipeline.

## Where the basics break down

A single-file Flask or FastAPI app with two endpoints doesn't need much thought. The same app with
twenty endpoints, three consumers who all want a guarantee the contract won't silently change,
authentication that isn't "check a hardcoded token," and a requirement to run without downtime
during a deploy — that's where framework choice, validation strategy and deployment approach stop
being implementation details and start being decisions with real cost if you get them wrong.

:::manager
Migrating a live API from one framework to another, or bolting validation on after the fact, is
expensive and risky compared to choosing well up front. This is worth real design-review time
before the first endpoint is written, not a retrofit.
:::

:::engineer
Concretely, the things that get harder as an API grows: hand-checked validation logic duplicated
(and drifting) across many endpoints; auth checks copy-pasted per route instead of centralised;
documentation maintained separately from the code, going stale the first time someone forgets to
update it; and a deployment that was "just run the dev server" now needing zero-downtime restarts.
:::

## FastAPI vs Flask: the actual decision

Both are legitimate, current choices. They are not interchangeable defaults — they optimise for
different things.

:::callout{kind=decision title="FastAPI or Flask?"}
- **FastAPI** — validation, serialisation and OpenAPI docs generated from type hints; native async
  support; the better default for a new API, especially one with external or semi-external
  consumers who need a reliable contract.
- **Flask** — smaller, more explicit, an enormous ecosystem of extensions built over many years;
  still the right choice for a simple internal tool, a team already deeply invested in Flask
  extensions, or where FastAPI's opinions (pydantic models, async-first patterns) are more
  ceremony than the job needs.
- **Neither is "wrong."** The failure mode is choosing based on which one someone already knows,
  without asking whether this API needs a validated, documented contract (lean FastAPI) or is a
  small internal utility that will never grow (Flask is fine, and simpler).
:::

:::engineer
```python
# FastAPI: the type hints ARE the validation and the docs
@app.post("/transactions")
def create(t: TransactionIn) -> TransactionOut: ...

# Flask: equivalent safety requires an explicit choice, e.g. marshmallow or pydantic used manually
@app.post("/transactions")
def create():
    data = TransactionSchema().load(request.get_json())   # raises on invalid input
    ...
```
Both are a handful of lines; the difference is whether validation is structural (FastAPI, from the
signature) or a decision the team has to make and enforce consistently (Flask).
:::

:::manager
If a team defaults to Flask for a new API purely out of familiarity, the question to ask is not
"why not FastAPI" — it's "who else calls this, and how do they know what a valid request looks
like." If the honest answer is "we'll tell them" or "there's a Confluence page," that's the gap
FastAPI's generated OpenAPI spec closes automatically.
:::

## pydantic v2: validation, and what changed

pydantic is the validation library FastAPI is built on, and is increasingly used standalone for
config and data validation outside web APIs entirely. Version 2 was a substantial rewrite (the
validation core moved to a Rust implementation) for performance, with some API changes from v1.

```python
from pydantic import BaseModel, Field, field_validator

class TransactionIn(BaseModel):
    amount: float = Field(gt=0)                  # must be strictly positive
    currency: str = Field(min_length=3, max_length=3)
    reference: str | None = None

    @field_validator("currency")
    @classmethod
    def currency_upper(cls, v: str) -> str:
        return v.upper()
```

:::engineer
v1-to-v2 migration notes worth knowing if you inherit older code: `@validator` became
`@field_validator`; `.dict()` became `.model_dump()`; `.parse_obj()` became `.model_validate()`;
config moved from an inner `Config` class to `model_config = ConfigDict(...)`. Most v1 code still
runs under a compatibility layer in recent versions, but new code should use v2 idiom directly.
:::

pydantic's `BaseSettings` (now in the separate `pydantic-settings` package) is also the standard way
to load typed, validated configuration from environment variables:

```python
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    database_url: str
    max_connections: int = 10

settings = Settings()          # reads DATABASE_URL, MAX_CONNECTIONS from the environment, validated
```

:::manager
`BaseSettings` failing fast at startup with a clear error ("database_url is required") if
configuration is missing is a small thing worth valuing in review: it turns a misconfigured
deployment into an immediate, obvious failure instead of a mysterious runtime error the first time
the missing setting is actually used.
:::

## async: when it actually helps

`async def` endpoints let a single process handle many concurrent requests while some of them are
waiting on I/O (a database call, an HTTP call to another service) — instead of one request blocking
a whole worker. This matters when a service spends most of its time waiting on other systems; it
does not speed up CPU-bound work at all.

```python
@app.get("/accounts/{account_id}")
async def get_account(account_id: str):
    async with httpx.AsyncClient() as client:
        response = await client.get(f"http://accounts-service/{account_id}")
        return response.json()
```

:::callout{kind=gotcha title="Blocking calls inside an async endpoint defeat the purpose"}
A synchronous library call (a non-async database driver, `requests` instead of `httpx`, plain
`time.sleep`) inside an `async def` route blocks the entire event loop, stalling every other request
being handled by that worker — often worse than not using async at all, because it's not obvious
from the code that it's happening. If you can't use an async-native client library for a call, run
it in a thread pool (`run_in_threadpool` / `asyncio.to_thread`) rather than calling it directly.
:::

:::engineer
A synchronous `def` route in FastAPI isn't wrong — FastAPI automatically runs it in a thread pool,
so it doesn't block the event loop either. The real decision is: I/O-bound and every library
involved has an async version → `async def` with those async clients. Anything else (CPU-bound, or
a library with no async support) → plain `def` and let FastAPI handle the threading.
:::

:::manager
"We made it async" is not automatically a performance win, and can be a regression if the code
underneath still blocks. The question worth asking in review: what is this endpoint actually waiting
on, and is every library in that call chain genuinely async? If not, async adds complexity without
the benefit it's supposed to buy.
:::

## OpenAPI: a contract, not just docs

FastAPI generates an OpenAPI (formerly Swagger) specification automatically from your route
definitions and pydantic models, available at `/openapi.json` and rendered at `/docs`. Flask doesn't
generate this for free — an extension or manual spec is needed.

:::engineer
The generated spec isn't just for humans browsing `/docs`: it's machine-readable and drives client
code generation (a consuming team generates a typed client instead of hand-writing HTTP calls),
contract testing (verify the API matches its documented shape before deploy), and API gateway
configuration in some setups.
:::

:::callout{kind=decision title="How much to invest in the OpenAPI contract"}
- Internal tool, one consumer, same team: the auto-generated docs are enough; don't over-invest.
- Multiple consuming teams, or anything crossing an org boundary: treat the OpenAPI spec as a
  reviewed artefact — a breaking change to it should get the same scrutiny as a breaking change to
  a database schema other teams depend on.
:::

:::manager
"Does the API documentation match what it actually does" used to require someone to check by hand
and was routinely wrong. With a generated spec, the question becomes "did the contract change
between this version and the last one" — a diffable, reviewable question, which is a meaningfully
different (and cheaper) thing to govern.
:::

## Auth middleware

Authentication (who is calling) and authorisation (what they're allowed to do) belong in a layer
that runs before your endpoint logic, applied consistently, not re-implemented per route.

```python
from fastapi import Depends, HTTPException, Header

def verify_token(authorization: str = Header(...)) -> str:
    if not authorization.startswith("Bearer "):
        raise HTTPException(401, "missing or malformed token")
    token = authorization.removeprefix("Bearer ")
    user = validate_token(token)          # check against your identity provider / token store
    if not user:
        raise HTTPException(401, "invalid token")
    return user

@app.get("/accounts/{account_id}")
def get_account(account_id: str, user: str = Depends(verify_token)):
    ...
```

:::engineer
FastAPI's `Depends` can also be applied once to an entire router (`APIRouter(dependencies=[...])`)
or the whole app, so new endpoints inherit the auth check by construction rather than by the author
remembering to add it. Flask achieves the equivalent with a `before_request` hook registered on a
blueprint.
:::

:::manager
"Every endpoint checks auth individually" is a pattern that guarantees one of them eventually
doesn't — usually the one added in a hurry. A shared dependency/middleware applied at the router or
app level, rather than copy-pasted into each function, is what a review should expect to see once
there's more than a couple of endpoints.
:::

:::callout{kind=bank-context}
Internal-only is not the same as unauthenticated. "It's behind the firewall" has been the wrong
security boundary for a long time — internal networks get breached, internal tools get called by
compromised internal systems, and audit expects to see who accessed what, which an unauthenticated
internal API cannot answer.
:::

## Deployment, briefly

Neither framework's development server is meant for production. The standard shape: an ASGI server
(`uvicorn`, often behind `gunicorn` for process management) for FastAPI, a WSGI server (`gunicorn`,
`waitress`) for Flask, run inside a container, behind a load balancer or ingress, with health-check
endpoints the platform polls to know whether to route traffic to an instance.

:::engineer
```bash
# FastAPI, production-style process manager
gunicorn main:app -k uvicorn.workers.UvicornWorker -w 4 --bind 0.0.0.0:8000
```
Deployment platforms, containers and rollout strategies are covered properly in
`fullstack/deployment` — the point here is just that "runs locally with `uvicorn --reload`" and
"deployed" are different bars, and the gap between them is a health check, a process manager, and a
platform to run it on.
:::

:::manager
"It's deployed" should mean: runs under a process manager, has a health check the platform actually
polls, and restarts without dropping in-flight requests. If a status update just says "it's live,"
those three are worth confirming explicitly rather than assuming.
:::

## What good looks like

A review checklist for a Python API going into shared use:

- Framework choice matches the actual need (validated contract with outside consumers → lean
  FastAPI; small internal tool → Flask is fine).
- Every input is validated at the edge — not trusted, not re-checked ad hoc three functions deep.
- Auth is a shared dependency/middleware, applied consistently, not per-endpoint.
- `async def` is only used where the code underneath is genuinely non-blocking end to end.
- There's a health-check endpoint, and the service doesn't run its development server in production.
- The API contract (OpenAPI spec, or equivalent for Flask) is something a consuming team could
  actually build against without asking you questions in Slack.

## Exercises

::::exercise{id=ex-framework-choice type=scenario title="The team proposes Flask for a new cross-team API"}
A team is building a new API that three other teams will consume, with a requirement for strict
input validation and a published contract. They propose Flask because "that's what we know." What
do you ask, and what would change your answer?
:::solution
Ask what specifically makes Flask the right fit here versus familiarity: does the team have a
mature, consistently-applied validation library already in use across their Flask services (if so,
the "no built-in validation" gap is already closed and Flask is a reasonable choice); is there
already a documented, enforced pattern for generating and maintaining an OpenAPI-equivalent spec for
their Flask APIs (if not, that's real work that FastAPI would give them for free). If neither
exists, the honest cost of Flask here isn't "Flask is worse" — it's "the team will need to build,
by hand and maintain over time, roughly what FastAPI provides out of the box," which is a real cost
to weigh against the ramp-up cost of learning FastAPI. If they already have solid validation and
contract tooling for Flask from other services, familiarity is a legitimate factor and the answer
can reasonably stay Flask.
:::
::::

::::exercise{id=ex-fix-blocking-async type=code title="Fix a blocking call inside an async endpoint"}
This endpoint is defined `async` but uses a blocking HTTP call, defeating the purpose. Fix it.

```python
import requests

@app.get("/rate/{currency}")
async def get_rate(currency: str):
    response = requests.get(f"http://rates-service/{currency}")   # blocking call inside async def
    return response.json()
```
:::solution
```python
import httpx

@app.get("/rate/{currency}")
async def get_rate(currency: str):
    async with httpx.AsyncClient() as client:
        response = await client.get(f"http://rates-service/{currency}")
        return response.json()
```
`requests` has no async support; calling it inside an `async def` blocks the event loop for the
duration of the call, stalling every other request the worker is handling. `httpx.AsyncClient`
performs the same HTTP call without blocking, `await`ing control back to the event loop while it
waits on the network.
:::
::::
