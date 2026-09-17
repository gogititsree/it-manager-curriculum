---
title: "Scripting & Automation"
estimatedMinutes: 35
objectives:
  - "Explain what a CLI script, argparse, subprocess and requests each do"
  - "Read a script that reads files, calls another program, and calls an HTTP API"
  - "Recognise the difference between a one-off script and something safe to run unattended"
status: ready
---

Most of what your SREs and platform engineers automate — restarting a service, pulling a report,
calling an internal API, moving files between systems — starts life as a Python script. This lesson
covers the four building blocks nearly every automation script is made of: reading arguments,
touching files, calling other programs, and calling HTTP APIs.

## Why this exists

A script is different from an application: it usually has one job, runs from a command line or a
schedule, and is expected to fail loudly rather than silently. The gap between "a script that works
when I run it" and "a script safe to hand to on-call" is most of what separates a junior automation
effort from something a platform team will actually rely on — and it's a gap you'll be asked to
judge in reviews long before you'd write the script yourself.

:::manager
When someone says "I automated it with a script," ask three things: what happens when it fails
halfway through, who gets told, and can it be run twice safely (is it **idempotent**). Those three
answers separate a tool from a liability.
:::

:::engineer
```python
#!/usr/bin/env python3
"""Restart a service and report the result. Usage: restart.py <service-name>"""
import sys

def main() -> int:
    if len(sys.argv) != 2:
        print("usage: restart.py <service-name>", file=sys.stderr)
        return 2
    service = sys.argv[1]
    print(f"restarting {service}...")
    return 0

if __name__ == "__main__":
    sys.exit(main())
```
The shebang line lets it run as `./restart.py` on Linux/macOS. `sys.exit(main())` returns the exit
code to the shell — `0` for success, non-zero for failure, which is how schedulers and pipelines
know whether the step worked.
:::

## Command-line arguments with argparse

Reading `sys.argv` by hand works for one argument. Real scripts take options, flags and help text —
that's what the standard library's `argparse` module is for.

```python
import argparse

parser = argparse.ArgumentParser(description="Restart a named service")
parser.add_argument("service", help="name of the service to restart")
parser.add_argument("--dry-run", action="store_true", help="print what would happen, don't do it")
parser.add_argument("--timeout", type=int, default=30, help="seconds to wait")
args = parser.parse_args()

print(args.service, args.dry_run, args.timeout)
```

Running `restart.py --help` now prints usage automatically. Running it with a missing required
argument prints an error and exits with a non-zero code — for free.

:::engineer
`argparse` also supports subcommands (`restart.py service start`, `restart.py service stop`) via
`add_subparsers()`, which is how most real internal CLIs are structured once they do more than one
thing.
:::

:::manager
`--dry-run` is one of the cheapest safety features a script can have and one of the most often
skipped. In a review, if a script changes production state (restarts something, deletes files,
calls a payments API) and has no dry-run mode, that's a legitimate blocker, not a nitpick — it's
the difference between "I tested this safely" and "I tested this in production."
:::

## Working with files

Reading and writing files is the most common thing an automation script does. `pathlib` (mentioned
briefly here, covered fully as part of core syntax) is the modern way to work with paths.

```python
from pathlib import Path

log_dir = Path("/var/log/myapp")
for log_file in log_dir.glob("*.log"):          # every .log file in the directory
    text = log_file.read_text()
    if "ERROR" in text:
        print(f"{log_file.name} has errors")
```

:::engineer
```python
import csv

with open("accounts.csv", newline="") as f:
    reader = csv.DictReader(f)          # each row becomes a dict keyed by header
    for row in reader:
        print(row["account_id"], row["balance"])
```
`csv.DictReader` handles quoting and delimiters correctly — hand-parsing CSV with `.split(",")` is
a reliable source of bugs the moment a field contains a comma or a quote.
:::

:::manager
"The script processes files in this directory" is worth a follow-up: what happens if a file is
missing, half-written by another process, or has the wrong format? A script that assumes every file
it finds is well-formed will eventually meet one that isn't, usually without anyone watching.
:::

## Running other programs with subprocess

A script often needs to call another program — `git`, a deployment tool, the operating system's own
utilities. The standard library's `subprocess` module does this safely.

```python
import subprocess

result = subprocess.run(
    ["git", "status", "--short"],
    capture_output=True,
    text=True,
    check=True,           # raises CalledProcessError if the command exits non-zero
)
print(result.stdout)
```

:::callout{kind=warning title="Never build a shell command by string concatenation"}
```python
# DANGEROUS: if service comes from user input, this is a command-injection hole
subprocess.run(f"systemctl restart {service}", shell=True)

# SAFE: arguments are passed as a list, never interpreted by a shell
subprocess.run(["systemctl", "restart", service])
```
Passing a list (no `shell=True`) means the arguments are handed straight to the program, not parsed
by a shell — a semicolon or backtick in `service` can't inject a second command.
:::

:::manager
`shell=True` in a subprocess call is one of the highest-value things to spot in a script review.
It's not automatically wrong (sometimes you genuinely need shell features like pipes), but it needs
a very good reason and, if the input isn't fully controlled by the script's author, it's a security
finding, not a style comment.
:::

:::engineer
`subprocess.run` also returns the exit code (`result.returncode`) even without `check=True`, which
matters when a non-zero exit is an expected outcome you want to branch on rather than treat as an
error — for example, a command that returns 1 to mean "no matches found" rather than "something
broke." Set a `timeout=` here too: a called program that hangs blocks your script exactly like a
hung network call does.
:::

## Environment variables and configuration

A script that runs on a schedule, or on someone else's machine, cannot rely on values that only
exist in the author's own shell. **Environment variables** are the usual way to pass configuration
and credentials into a script without hardcoding them.

```python
import os

api_url = os.environ.get("API_URL", "https://api.default.local")   # falls back to a default
timeout = int(os.environ.get("TIMEOUT_SECONDS", "30"))
```

:::engineer
`os.environ["X"]` raises `KeyError` if `X` isn't set — the right choice for anything required, since
a script that silently proceeds with a missing required value fails in a more confusing way later.
`os.environ.get("X", default)` is for genuinely optional settings.
:::

:::manager
"It only runs on my laptop" is almost always this: a value set once in a personal shell profile and
never written down anywhere else. Ask where a script's configuration comes from before accepting it
as something the team, not one person, can run.
:::

## Calling HTTP APIs with requests

`requests` (not in the standard library, but close to universal — `pip install requests`) is the
default way Python scripts call HTTP APIs.

```python
import requests

response = requests.get(
    "https://internal-api.bank.local/accounts/12345",
    headers={"Authorization": f"Bearer {token}"},
    timeout=10,             # never call a network API without a timeout
)
response.raise_for_status()      # raises if the status code is 4xx/5xx
data = response.json()
```

:::engineer
`timeout=` is not optional in anything meant to run unattended: without it, a hung network call
blocks a script forever. `raise_for_status()` turns an HTTP error into a Python exception instead of
letting a script silently continue with a 404's error body as if it were data.
:::

:::callout{kind=bank-context}
A script that calls an internal API with a hardcoded bearer token committed to the repository is a
finding in almost any code review process at a bank, not a hypothetical — it happens constantly
because it's the easiest thing to write first. Secrets handling is covered properly in the
Intermediate lesson; for now, know that "works" and "safe to merge" are different bars.
:::

:::manager
A script that calls an external or partner API is now something your organisation depends on being
available and correct, even though "just a script" doesn't sound like it. Ask what happens to
downstream processes if that call fails, and whether anyone would notice if it started silently
failing every time.
:::

## Common mistakes

- **No timeout on network calls.** A hung request means a hung script, forever, with no error.
- **Swallowing errors with a bare `except:`** so the script "never crashes" — and never tells anyone
  it failed either.
- **Building shell commands from strings** with `shell=True`, opening the door to command injection.
- **Hardcoding paths, hostnames or secrets** instead of taking them as arguments, environment
  variables, or config.
- **No dry-run mode** on anything that changes state, making every test run a production change.

## Putting it together

::::exercise{id=ex-cli-script type=design title="Sketch a log-cleanup script"}
Design (in prose, or Python if you prefer) a script that deletes log files older than 7 days from a
directory given on the command line. It runs nightly via a scheduler. What arguments does it take?
What does it do on an error partway through? Does it need a dry-run mode?
:::solution
Arguments: the directory (positional), `--days` (default 7), `--dry-run` (default off, prints what
would be deleted without deleting), `--pattern` (default `*.log`) so it isn't hardcoded to one log
naming scheme. On an error deleting one file (permissions, file in use), it should log the failure
and continue with the rest rather than crashing the whole run — one bad file shouldn't stop 999
successful cleanups. It should exit non-zero if *any* deletion failed, so a scheduler's failure
alerting fires, even though it made partial progress. Dry-run is essential here: the first time this
runs against a real log directory, you want to see the list of files it would delete before it
actually deletes anything.
:::
::::
