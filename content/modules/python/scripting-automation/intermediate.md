---
title: "Automation in Production: CLIs Other People Can Run"
estimatedMinutes: 45
objectives:
  - "Replace print-based scripts with structured logging, retries and proper secrets handling"
  - "Design a script that fails safely and tells someone when it does"
  - "Package a script so someone other than its author can install and run it"
  - "Run a review checklist against an automation pull request"
status: ready
---

A script that works when its author runs it is a demo. A script that runs unattended, on a
schedule, handling real failures, and that a different engineer can debug at 3am without calling
the author — that's automation. This lesson is about closing that gap.

## Where the basics break down

`print()` statements disappear into a terminal no one is watching. A bare `try/except` around the
whole script turns every failure into silence. A hardcoded path or credential means the script only
runs on the machine it was written on. None of these show up when you write and test the script
yourself — they all show up three months later when it runs unattended and something is different:
a file is missing, an API is slow, a credential rotated.

:::manager
The review question that separates a script from production automation: "if this fails at 3am, who
finds out, and how long does it take them?" If the honest answer is "someone notices the report
didn't arrive, eventually," that's not automation — it's a manual process with extra steps.
:::

:::engineer
Concretely, the gap between "runs when I test it" and "safe unattended" is usually five things:
structured logging instead of print, a considered retry policy instead of none or infinite, secrets
from a manager instead of a literal, a non-zero exit code on failure, and idempotency so a re-run
after a crash doesn't duplicate work. The rest of this lesson is one section per item.
:::

## Logging, not print

The standard library's `logging` module gives you levels, timestamps, and — critically — a way to
route output differently in different environments without changing the code.

```python
import logging

logger = logging.getLogger(__name__)
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)

logger.info("starting reconciliation run", extra={"batch_id": batch_id})
logger.warning("record %s missing currency, defaulting to GBP", record_id)
logger.error("failed to write output file", exc_info=True)   # includes the traceback
```

:::engineer
For anything feeding a log aggregator, structured (JSON) logging is worth the setup cost:
```python
import logging, json

class JsonFormatter(logging.Formatter):
    def format(self, record):
        return json.dumps({"level": record.levelname, "msg": record.getMessage(), "logger": record.name})

handler = logging.StreamHandler()
handler.setFormatter(JsonFormatter())
logging.getLogger().addHandler(handler)
```
This is what lets someone search "all failed reconciliation runs for account X" instead of grepping
free text.
:::

:::callout{kind=decision title="print vs logging vs a metrics system"}
- `print` — fine for a script you run interactively and read yourself, never for anything scheduled.
- `logging` — the default for anything unattended: what happened, in order, with severity.
- A metrics/alerting system (counters, dashboards, paging) — for "is this healthy right now,"
  layered on top of logs, not a replacement for them.
:::

:::manager
"We have logs" is not the same as "someone would notice a failure." Logs answer "what happened"
after someone goes looking; alerting answers "did something go wrong" without anyone having to ask.
A scheduled script needs both — logs for the postmortem, an alert for the page.
:::

## Retries and backoff

Network calls and external systems fail transiently. The question is not whether to retry, but how:
naive retries can turn a brief blip into a thundering herd against a struggling system.

```python
import time
import requests

def get_with_retry(url: str, attempts: int = 3, base_delay: float = 0.5) -> requests.Response:
    for attempt in range(1, attempts + 1):
        try:
            response = requests.get(url, timeout=10)
            response.raise_for_status()
            return response
        except (requests.ConnectionError, requests.Timeout, requests.HTTPError) as exc:
            if attempt == attempts:
                raise
            delay = base_delay * (2 ** (attempt - 1))    # exponential backoff: 0.5s, 1s, 2s...
            logger.warning("attempt %d failed (%s), retrying in %.1fs", attempt, exc, delay)
            time.sleep(delay)
```

:::engineer
The `tenacity` library covers this more completely (retry on specific exceptions, jitter, max
elapsed time) and is worth pulling in rather than hand-rolling once a script has more than one
retry site. Only retry on errors that are actually transient — retrying a 400 Bad Request just
repeats the same failure three times slower.
:::

:::callout{kind=gotcha title="Retrying a non-idempotent call"}
Retrying a GET is safe. Retrying a POST that creates a payment is not, unless the API supports an
idempotency key or the operation is naturally safe to repeat. Check what you're retrying before you
wrap it in a retry loop.
:::

:::manager
"We added retries" is not automatically a reliability improvement — ask what happens when a
downstream system is genuinely down, not just briefly slow. Three retries with backoff against a
system that's down for an hour just delays the failure a few seconds and adds load; the alert still
needs to fire.
:::

## Secrets handling

A credential in source control is a credential that's compromised the moment the repository is
cloned, forked, or leaked — and git history doesn't forget even after you delete the line.

```python
import os

# Minimum bar: environment variables, not a literal in the file
api_token = os.environ["INTERNAL_API_TOKEN"]     # KeyError if unset — fails loudly, which is correct

# Better: a secrets manager, fetched at runtime, never written to disk or logs
import boto3
secret = boto3.client("secretsmanager").get_secret_value(SecretId="internal-api-token")["SecretString"]
```

:::manager
The review question here is simple and non-negotiable: **where does the credential come from, and
is it in the diff?** `git log -p | grep -i "password\|token\|secret"` across a repository's history
is a sobering exercise to run once on any codebase you've just inherited.
:::

:::engineer
Never log a secret, even at debug level — a token printed to a log that ships to a shared
aggregator is exposed just as thoroughly as one committed to source control. Scrub known secret
field names (`token`, `password`, `authorization`) in any structured log formatter as a backstop.
:::

:::callout{kind=bank-context}
Bank environments almost always have an approved secrets manager (Vault, cloud provider secrets
service, or an internal equivalent). A script reading a credential from an environment variable set
by a deployment pipeline that itself pulls from the secrets manager is fine. A script reading a
credential from a `.env` file checked into the repo is an incident waiting to be found by whoever
runs the next dependency scan.
:::

## Making scripts safe to run unattended

A script meant to run on a schedule needs to handle: partial failure (log it, continue if safe,
exit non-zero so the scheduler's alerting fires), being run twice (idempotency — does running it
again cause duplicate side effects), and configuration that varies by environment.

```python
import sys

def main() -> int:
    try:
        run()
    except Exception:
        logger.exception("run failed")   # logs full traceback at ERROR
        return 1
    return 0

if __name__ == "__main__":
    sys.exit(main())
```

:::engineer
Idempotency in practice: instead of "append a row," use "upsert keyed by a natural or generated id"
so a re-run after a partial failure doesn't duplicate data. For file outputs, write to a temp path
and rename into place atomically, so a crash mid-write never leaves a half-written file where a
consumer expects a complete one.
:::

:::manager
"Is it safe to just re-run it?" should have a documented, confident answer for every scheduled
script — not a shrug. If the honest answer is "we've never had to," that's untested, not safe, and
it's worth finding out before the day someone has to.
:::

## Packaging so someone else can run it

A script that only runs because of packages installed by hand on one engineer's laptop is not
automation, it's a demo with extra steps. `pyproject.toml` plus a lockfile makes the dependency set
reproducible; a console script entry point makes it installable as a real command.

```toml
[project]
name = "reconciler"
version = "0.1.0"
dependencies = ["requests>=2.31", "tenacity>=8.2"]

[project.scripts]
reconcile = "reconciler.cli:main"
```

After `pip install .`, anyone gets a `reconcile` command on their `PATH` — no "remember to add this
directory to your PYTHONPATH" instructions in a README that goes stale.

:::engineer
A lockfile (`uv.lock`, or a hash-pinned `requirements.txt` via `pip-compile`) records the exact
resolved version of every dependency, direct and transitive, so `pip install` reproduces the same
environment on any machine — not just "a version that satisfies the ranges in pyproject.toml,"
which can silently drift over time as new releases are published.
:::

:::manager
"Works on my machine" for a script usually traces to one of: no lockfile (different package
versions installed elsewhere), a hardcoded local path, or an assumption about an environment
variable that's set in the author's shell profile and nowhere else. All three are fixable, and all
three are exactly what to ask about before accepting a script as team-owned rather than
one-person-owned.
:::

## What good looks like

A review checklist for an automation script going into scheduled production use:

- Logs at appropriate levels; nothing important only visible via `print`.
- Network calls have timeouts and a considered retry strategy (idempotent calls only).
- Secrets come from environment variables or a secrets manager — never literals, never in the diff.
- Exits non-zero on failure so the scheduler's alerting actually fires.
- Idempotent, or explicitly documented as not safe to re-run.
- Dependencies are pinned/locked; installable as a package, not "copy these files and run."
- Someone other than the author has read it and could debug a failure without asking them.

## Exercises

::::exercise{id=ex-harden-script type=scenario title="The team proposes a nightly billing-export script"}
A script exports the day's billing records to a partner via an internal HTTP API, using `print` for
status, no retries, a hardcoded API key, and it's currently only ever run manually from one
engineer's laptop. The team wants to put it on a nightly cron job. What do you require before
sign-off, and what would you accept as a fast-follow rather than a blocker?
:::solution
Blockers, before it goes on a schedule unattended: hardcoded API key must move to a secrets
manager/environment variable (a scheduled job with a leaked, unrotatable-without-a-redeploy key is
a real incident risk); `print` must become `logging` so failures are visible somewhere other than
one terminal; the script must exit non-zero on failure so the scheduler's monitoring can page
someone. Reasonable fast-follows: retry logic with backoff (a single transient network blip failing
the whole nightly run is a nuisance, not a crisis, as long as failure is visible and someone can
re-run it manually); packaging as an installable command rather than a loose file (matters more once
more than one person needs to run or modify it). The line is: anything that turns a failure into
silence, or a credential into an exposure, blocks; anything that's about convenience or resilience
to rare transient errors can follow once the job is live and monitored.
:::
::::

::::exercise{id=ex-add-retry type=code title="Add safe retry logic"}
This function calls a partner API to check a payment's status. Add retry with exponential backoff
for transient errors only, and make sure it never retries a definitively-failed payment status.

```python
def check_payment_status(payment_id: str) -> str:
    response = requests.get(f"https://partner.example/payments/{payment_id}", timeout=10)
    response.raise_for_status()
    return response.json()["status"]
```
:::solution
```python
def check_payment_status(payment_id: str, attempts: int = 3) -> str:
    url = f"https://partner.example/payments/{payment_id}"
    for attempt in range(1, attempts + 1):
        try:
            response = requests.get(url, timeout=10)
            response.raise_for_status()
            return response.json()["status"]
        except (requests.ConnectionError, requests.Timeout) as exc:
            if attempt == attempts:
                raise
            delay = 0.5 * (2 ** (attempt - 1))
            logger.warning("status check failed (%s), retrying in %.1fs", exc, delay)
            time.sleep(delay)
        except requests.HTTPError as exc:
            # a 4xx/5xx from the partner is a definitive answer, not a network blip — don't retry it
            raise
```
The GET itself is safe to retry (it has no side effect on the payment); the distinction that
matters is connection/timeout errors (retry) versus an HTTP error response (don't — that's the
partner telling you something, not a network blip).
:::
::::
