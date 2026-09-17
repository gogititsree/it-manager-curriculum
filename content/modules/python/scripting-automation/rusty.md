---
title: "Scripting & Automation — refresher"
estimatedMinutes: 18
objectives:
  - "Re-anchor the shape of a production-grade automation script in ten minutes"
  - "Know what replaced pip/virtualenv and cron in current practice"
  - "Spot the gotchas that still catch experienced scripters"
status: ready
---

You've written automation scripts before — argparse, subprocess, cron, a virtualenv you remembered
to activate. The shape hasn't changed. What changed is the tooling around dependency management and
scheduling, and the bar for what counts as "production-ready" is higher than it used to be.

## What you probably remember

| Concept | One-line anchor |
| --- | --- |
| argparse | Standard-library CLI argument parsing: positional args, flags, `--help` for free. |
| subprocess | Call another program; pass args as a list, never `shell=True` with untrusted input. |
| requests | The default HTTP client; always set a timeout. |
| virtualenv + pip | Isolate a project's dependencies from the system Python and other projects. |
| cron | `* * * * *` schedule syntax; the classic Linux scheduler for unattended jobs. |
| logging module | Levels, timestamps, handlers; `print` for scripts you watch, `logging` for ones you don't. |

## What changed since

:::callout{kind=changed-since title="uv (2024) — fast, increasingly the default for envs and installs"}
`uv` (from Astral, the `ruff` linter's makers) replaces pip + virtualenv + pip-tools for most
day-to-day work, and is dramatically faster. `uv venv` creates an environment, `uv pip install` or
`uv add` installs, `uv run script.py` runs inside the project's environment without manually
activating it. If a repo has a `uv.lock`, that's what's happening. Plain `pip` and `venv` still
work everywhere and remain a completely reasonable choice — this is a "worth knowing exists," not
a "replace everything" — but expect to see `uv` in recent codebases.
:::

:::callout{kind=changed-since title="pipx for installing CLI tools globally"}
`pipx install some-tool` installs a Python command-line tool into its own isolated environment and
puts it on your `PATH`, without polluting (or being polluted by) any project's dependencies. This
replaced the old habit of `pip install --user` or, worse, `sudo pip install` for tools like
`black`, `ruff`, or internal CLIs.
:::

:::callout{kind=changed-since title="cron → workflow schedulers and managed cron"}
Plain `cron` on a box you manage still works and is still common for simple, single-machine jobs.
For anything with dependencies between steps, retries, or visibility requirements, teams have
largely moved to: CI-native scheduled jobs (a scheduled pipeline in GitHub Actions/GitLab CI),
container-orchestrator cron (Kubernetes `CronJob`), or a workflow orchestrator (Airflow, Dagster,
Prefect) when there's a real DAG of dependent steps. The question worth asking about any "it runs on
cron on a box" job: what happens when that box is rebuilt, and who finds out if the job silently
stops firing — a managed scheduler answers both better than a crontab entry nobody remembers exists.
:::

:::callout{kind=changed-since title="Structured logging and observability are now the default expectation"}
`print`-based scripts with no log levels were normal a decade ago for internal tooling. Current
practice expects `logging` at minimum, often JSON-structured logs shipped to a central aggregator,
because "the script that runs nightly with no output anyone watches" is now a recognised failure
mode, not just bad luck.
:::

:::manager
The practical read: a script using `pip install -r requirements.txt` into a manually-activated
`venv`, deployed via a hand-maintained crontab entry, still works and isn't wrong — but it's a sign
the team hasn't picked up tooling from the last couple of years, which often correlates with other
gaps (no retries, no structured logs, no idempotency). Worth a light-touch question, not an
automatic mark against them.
:::

## Gotchas that still bite

- **`shell=True` with any input you don't fully control** is still a command-injection hole. This
  did not go away; it's just less forgivable now that safe alternatives are well documented.
- **Missing timeouts on network calls** still hang scripts forever. This is the single most common
  cause of "the nightly job just never finished" tickets.
- **Retrying non-idempotent operations** (a POST that creates something) turns a transient blip into
  duplicate side effects. Check idempotency before adding a retry loop, every time.
- **Secrets in a `.env` file committed "temporarily"** — still the most common way a credential
  leaks into git history, where deleting the line later doesn't remove it from history.
- **A scheduled job with no alerting on failure.** Exit code 1 with nobody watching the scheduler's
  own failure notifications is silent failure with extra steps.

:::callout{kind=bank-context}
An unreviewed script quietly running in production on someone's personal cron entry, with
credentials nobody else has visibility into, is a specific and common finding in vendor/internal
risk assessments at banks. If you inherit a team, "show me everything currently running on a
schedule, and where" is a legitimate and useful first request.
:::

## Ten-minute drill

::::exercise{id=ex-modernise-script type=scenario title="Modernise an inherited automation script"}
You inherit a script: installed via `pip install -r requirements.txt` into a manually-activated
`venv`, triggered by a crontab entry on a shared jump box, using `print` for all output, with an API
key hardcoded near the top of the file. It has been running nightly, apparently without incident,
for two years. What do you change, in what order, and what do you leave alone?
:::solution
Order by risk, not by modernity: (1) move the hardcoded API key to a secrets manager or environment
variable immediately — this is an exposure, not a style issue, regardless of how long it's "worked";
(2) add logging in place of print and make sure failures exit non-zero, so you have visibility
before you change anything else; (3) once you can see what it's actually doing, decide on
scheduling — if the jump box is a known single point of failure, move it to a managed scheduler
(CI cron job or Kubernetes CronJob); if the box is fine and stable, leave cron alone, it isn't
broken. Leave the dependency tooling (`pip`/`venv`) alone unless you're touching the file anyway —
migrating to `uv` for its own sake, on a script that already works, is polish, not risk reduction.
The mistake to avoid is treating "this uses old tooling" as equally urgent as "this leaks a
credential" — they are not the same category of problem.
:::
::::
