---
title: "Python in Practice: Typing, Structure and Packaging"
estimatedMinutes: 40
objectives:
  - "Use type hints, dataclasses and context managers the way production code actually does"
  - "Explain the difference between a generator and a list, and why it matters at scale"
  - "Read a pyproject.toml and know what it's declaring"
  - "Run a review checklist against a Python pull request"
status: ready
---

You can read a Python script. This lesson is about the difference between a script and a piece of
software other people depend on: structure that survives a second author, resources that get
cleaned up, and a package other teams can actually install.

## Where the basics break down

A script that reads a file, transforms some data and prints a result does not need much structure.
The same script six months later, now imported by three other scripts, handling edge cases nobody
originally considered, and running on a schedule with no one watching it, needs discipline the
beginner syntax doesn't force on you. Python's flexibility — no required types, no required
classes, no required project layout — means nothing stops a team from skipping that discipline
until the outage that requires it.

:::manager
The tell in a codebase is uniformity of *absence*: no type hints anywhere, no tests anywhere, every
function taking and returning plain dicts. Each choice is defensible in isolation for a quick
script; all of them together, at scale, is a codebase where every change is a guess.
:::

:::engineer
The structural fixes this lesson covers, roughly in the order they tend to pay off: type hints on
public functions (catch mismatches before running), dataclasses instead of hand-rolled `__init__`
boilerplate, `with` blocks around anything that needs cleanup, generators for anything that could be
large, and a real `pyproject.toml` instead of ad hoc installs.
:::

## Type hints in practice

Beyond simple parameter and return annotations, the `typing` module (built into the standard
library) covers the shapes real code needs: optional values, unions, generics over containers, and
structural typing.

```python
from typing import Optional

def find_account(account_id: str) -> Optional["Account"]:
    ...

# Python 3.10+: the shorter union syntax
def find_account(account_id: str) -> "Account | None":
    ...
```

:::engineer
```python
from dataclasses import dataclass
from typing import Protocol

class PaymentRail(Protocol):          # structural typing: "anything with a send method"
    def send(self, payment: "Payment") -> "PaymentResult": ...

def process(rail: PaymentRail, payment: "Payment") -> "PaymentResult":
    return rail.send(payment)          # works with any object that has send(), no inheritance needed
```
Run `mypy` (or `pyright`) in CI to enforce hints; the interpreter itself ignores them at runtime,
so an unchecked codebase with hints is decoration, not a guarantee.
:::

:::callout{kind=decision title="How strict should typing be?"}
- New service, greenfield: type everything, run strict mypy in CI from day one — cheap now,
  expensive to retrofit.
- Inherited script going into production: type the public functions and anything touching money or
  PII first; leave internals for later.
- One-off analysis script that dies after the report ships: skip it. Match the cost to the
  lifespan.
:::

:::manager
"Do we run a type checker in CI" is a one-question way to gauge how seriously a team takes this.
Hints with no enforcement decay: nothing stops them from silently going stale as the code changes,
so treat unchecked type hints as documentation with an unverified expiry date.
:::

## Dataclasses over hand-rolled classes

`@dataclass` generates `__init__`, `__repr__` and `__eq__` from a list of typed fields — the
Python equivalent of the boilerplate a Java record removes.

```python
from dataclasses import dataclass, field

@dataclass(frozen=True)                 # frozen = immutable, like final fields
class Money:
    cents: int
    currency: str = "GBP"

    def __post_init__(self):
        if self.cents < 0:
            raise ValueError("negative amount")
```

:::manager
A hand-written `__init__` that just assigns every parameter to `self.x` with no `@dataclass` is a
sign of Python written by someone translating from a language with more ceremony. It's not wrong,
but it's a maintenance cost with no benefit — ask why, it's an easy improvement to suggest.
:::

:::engineer
`namedtuple` (older) and `TypedDict` (for dict-shaped data, e.g. JSON payloads) solve related but
different problems: `namedtuple` for a lightweight immutable tuple with named fields; `TypedDict`
for type-checking a dictionary's expected keys without changing it into an object.
:::

## Context managers: resources that clean up after themselves

A `with` block guarantees cleanup code runs even if the block raises an exception — the same job as
`try/finally`, written for the common case of "open something, use it, close it."

```python
with open("transactions.csv") as f:
    rows = f.readlines()
# file is closed here, even if the loop above raised

import contextlib

@contextlib.contextmanager
def timed(label: str):
    import time
    start = time.monotonic()
    try:
        yield
    finally:
        print(f"{label}: {time.monotonic() - start:.2f}s")

with timed("load"):
    load_data()
```

:::callout{kind=gotcha title="The resource nobody closes"}
Database connections, file handles and locks acquired without a `with` block (or an explicit
`try/finally`) leak under exceptions. This is the single most common cause of "the script works
fine, then fails after running for a few hours" in Python automation.
:::

:::engineer
`contextlib.contextmanager` turns a generator function into a context manager with almost no
boilerplate — the code before `yield` is the setup, the code in `finally` after it is the teardown.
For a class-based resource, implement `__enter__`/`__exit__` directly instead.
:::

:::manager
A code review question worth asking whenever you see `.close()`, `.release()` or similar called
explicitly at the end of a function body: what happens if an exception is raised on the line before
it? If the answer is "it doesn't get called," that's a leak waiting for the first unhappy path in
production.
:::

## Generators: lazy sequences

A function with `yield` instead of `return` produces a **generator**: values are computed one at a
time, on demand, instead of all at once in memory. This matters the moment "the CSV" becomes "the
50GB export."

```python
def read_large_csv(path):
    with open(path) as f:
        for line in f:
            yield line.strip().split(",")     # one row in memory at a time, not the whole file

for row in read_large_csv("transactions.csv"):
    process(row)
```

:::manager
"Why did the script that worked fine in testing run out of memory in production" is very often
"it loaded the whole file into a list where a generator would have streamed it." This is a question
worth asking in a design review for anything that processes exports: does this scale with a bigger
file, or does it scale with more RAM on the box?
:::

:::engineer
A generator can only be iterated once — `list(gen)` then a second `list(gen)` returns an empty
list, which surprises people used to lists. If something needs to be iterated more than once,
either materialise it deliberately (`items = list(gen)`) or write a function that returns a fresh
generator each time it's called.
:::

## Packaging basics

A modern Python project declares its dependencies and metadata in `pyproject.toml` — the
single-file replacement for the old `setup.py` / `requirements.txt` split.

```toml
[project]
name = "payment-reconciler"
version = "0.1.0"
requires-python = ">=3.11"
dependencies = ["requests>=2.31", "pydantic>=2.0"]

[project.scripts]
reconcile = "payment_reconciler.cli:main"      # installs a `reconcile` command
```

:::engineer
Standard layout puts importable code under `src/<package_name>/` (the "src layout"), which forces
tests to run against the installed package rather than accidentally against files in the current
directory — a common source of "passes locally, fails in CI."
:::

:::manager
A `pyproject.toml` with pinned dependency versions is a small file with an outsized effect on
whether "it works" is reproducible six months from now, on someone else's machine, after several
transitive dependency releases. Its absence is one of the cheapest things to flag in a review.
:::

## What good looks like

A review checklist for a Python pull request:

- Public functions and anything touching money, PII or external systems have type hints.
- No mutable default arguments; no bare `except:`.
- Anything that opens a file, connection or lock uses `with` or a guaranteed `finally`.
- Dependencies are pinned in `pyproject.toml` (or `requirements.txt` with hashes), not installed
  ad hoc on a box.
- Data that could be large is streamed (generator, chunked read) rather than loaded whole, unless
  it's provably small.
- There's at least one test that exercises the unhappy path, not just the demo input.

## Exercises

::::exercise{id=ex-review-script type=scenario title="The team proposes a scheduled reconciliation script"}
A junior engineer's pull request adds a script that loads a full day's transaction export
(potentially several GB) into a `list` of dicts, loops over it to find mismatches, and writes a
report. It runs as a cron job. No type hints, no tests. What do you ask for before approving?
:::solution
Ask, in rough priority order: (1) does this need to hold the whole file in memory, or can it stream
row by row with a generator — what happens when the export doubles in size next year; (2) what
happens on a malformed row or a missing field — does it crash the whole run or skip and log; (3)
where do credentials for whatever it reads/writes come from — hardcoded, environment variable, or a
secrets manager; (4) is there a test with a small sample file, including a bad row; (5) type hints
on the public functions so the next person doesn't have to read the whole file to know what a
function returns. You are not asking for a rewrite — you're asking for the four or five things that
turn "worked when I tested it" into "will still be running correctly in a year."
:::
::::

::::exercise{id=ex-generator-rewrite type=code title="Convert a list-based script to a generator"}
Rewrite this function so it does not hold the entire file in memory, while keeping its behaviour
identical.

```python
def failed_payments(path):
    lines = open(path).readlines()
    results = []
    for line in lines:
        record = line.strip().split(",")
        if record[2] == "FAILED":
            results.append(record)
    return results
```
:::solution
```python
def failed_payments(path):
    with open(path) as f:
        for line in f:
            record = line.strip().split(",")
            if record[2] == "FAILED":
                yield record
```
Callers that only need to iterate once (`for r in failed_payments(...): ...`) see no behaviour
change. A caller that needs a list can wrap it: `list(failed_payments(path))`. The `with` block also
fixes an unrelated leak in the original — `open(path).readlines()` never explicitly closes the file.
:::
::::
