---
title: "Python Syntax — refresher"
estimatedMinutes: 18
objectives:
  - "Re-anchor Python vocabulary in ten minutes"
  - "Patch Python 2 habits to Python 3 and know what became idiomatic since"
  - "Spot the syntax gotchas that still catch experienced people"
status: ready
---

You wrote Python before — probably Python 2, probably a while ago. The core language is
recognisable. What changed is idiom: how strings work, how you annotate types, how you handle
paths, and a couple of things Python 2 let you get away with that Python 3 refuses outright. This
is a patch, not a rewrite.

## What you probably remember

| Concept | One-line anchor |
| --- | --- |
| Indentation is syntax | Blocks are defined by indentation, not braces; be consistent (spaces, not tabs). |
| Dynamic typing | A name labels a value; the value has a type, the name doesn't enforce one. |
| `list` / `dict` / `tuple` / `set` | Mutable ordered, mutable keyed, immutable ordered, unordered unique. |
| `def` and modules | Functions with `def`; a `.py` file is a module; `import` brings names into scope. |
| Comprehensions | `[x for x in xs if cond]` — a loop and filter as one expression. |
| Exceptions | `try` / `except SpecificError` / `finally`; avoid bare `except:`. |
| Duck typing | If it has the method you call, it works — no interface declaration required. |

## What changed since

:::callout{kind=changed-since title="Python 2 → 3 (2 hit end of life January 2020)"}
If you're touching anything still on Python 2, that is now a risk item on its own, not a style
choice — no security patches ship for it. The headline syntax changes: `print` is a function
(`print(x)`, not `print x`); `/` between integers does **true** division and returns a float
(`5 / 2 == 2.5`; use `5 // 2` for the old integer-division behaviour); strings are Unicode by
default (`str` is text, `bytes` is the old `str`) — this is the change that broke the most
migrations, anything touching file encoding or network bytes needs an explicit `.encode()` /
`.decode()`; `range()` returns a lazy sequence, not a list (`xrange` is gone because it's no longer
needed); dict methods like `.keys()` return views, not lists.
:::

:::callout{kind=changed-since title="f-strings (3.6, 2016) replaced .format() and % formatting"}
```python
name, balance = "Sam", 1250.5
f"{name} owes {balance:,.2f}"     # 'Sam owes 1,250.50' — this is now the default
```
`.format()` and `%` still work and you'll see both in older code, but new code should be f-strings
unless the format string itself is a runtime variable (rare, and worth a comment when it happens).
:::

:::callout{kind=changed-since title="pathlib (3.4, 2014) replaced os.path string joining"}
```python
from pathlib import Path
p = Path("data") / "2026" / "export.csv"   # / is overloaded to join paths
p.exists(); p.read_text(); p.parent
```
`os.path.join(...)` still works; `pathlib` is the idiomatic default now and is much harder to get
wrong on Windows vs. Linux path separators.
:::

:::callout{kind=changed-since title="Type hints (3.5, 2015) and the typing module"}
Optional static-ish typing, checked by `mypy`/`pyright`, ignored by the interpreter. Increasingly
expected in any codebase with more than one contributor. See the Intermediate lesson for how this
is actually used day to day.
:::

:::callout{kind=changed-since title="Dataclasses (3.7, 2018) replaced hand-rolled __init__ boilerplate"}
`@dataclass` generates `__init__`, `__repr__`, `__eq__` from typed fields. If you were writing
classes with ten lines of `self.x = x` assignments, that's now one decorator and a field list.
:::

:::callout{kind=changed-since title="match statement (3.10, 2021) — structural pattern matching"}
```python
match response.status_code:
    case 200:
        return response.json()
    case 404:
        raise NotFound()
    case code if code >= 500:
        raise ServerError(code)
    case _:
        raise UnexpectedStatus(code)
```
Not a `switch` clone — it can destructure, which is closer to what you'd have written with a chain
of `isinstance` checks before.
:::

:::callout{kind=changed-since title="Packaging: pip + virtualenv → still standard, but pyproject.toml is now the norm"}
`setup.py`, `requirements.txt` and manually-activated virtualenvs still work. `pyproject.toml` as a
single declarative file for dependencies and metadata is now the default for new projects. Faster
alternative tooling (`uv`, `pipx`) is covered in the scripting-automation topic — this lesson is
about the language, not the tooling around it.
:::

:::manager
The practical filter for reviewing an inherited Python codebase: if it still uses `print` as a
statement, `%`-formatting everywhere, or manual `os.path.join` chains, it predates 2018-ish idiom
and was probably not touched by anyone fluent in current Python recently. That's a maintenance and
hiring signal — the people you hire now will default to the newer idiom and find the old code
unfamiliar, not just unpolished.
:::

## Gotchas that still bite

- **Mutable default arguments** — `def f(x=[]):` shares one list across every call. This bit people
  in Python 2 and still bites people now; it was never fixed because fixing it would break too much.
- **Integer division silently changed.** Old Python 2 code ported without care can get subtly wrong
  numeric results (`/` now returns a float) rather than an error you'd notice.
- **Bytes vs. str.** Reading a file or a socket and getting `bytes` where you expected `str` (or
  vice versa) is the most common Python 3 migration bug. `TypeError: can't concat str to bytes` is
  the symptom.
- **`is` vs `==` still confused,** now compounded by small-integer and short-string caching making
  `is` appear to work by accident for small values and fail for larger ones.
- **Circular imports** get worse as codebases grow; still no built-in fix, only restructuring
  (move the shared code to a third module, or import inside the function).

:::callout{kind=bank-context}
An old script still running on Python 2 in production is a live finding for most internal audit or
vendor-risk reviews now — unsupported runtime, no security patches, and usually no one left who can
safely touch it. If you inherit a team, ask directly: "is anything we run still on Python 2?" It is
a more common answer than people expect.
:::

## Ten-minute drill

::::exercise{id=ex-py2-to-py3 type=code title="Patch a Python 2 script to modern Python 3"}
Update this script to current idiom: fix anything that would fail on Python 3, then modernise the
string formatting and path handling.

```python
import os

def report(name, balance):
    print "%s: %.2f" % (name, balance)
    path = os.path.join("reports", name + ".txt")
    f = open(path, "w")
    f.write("%s\n" % balance)
    f.close()

report("acct-1", 1250.5)
```
:::solution
```python
from pathlib import Path

def report(name: str, balance: float) -> None:
    print(f"{name}: {balance:.2f}")
    path = Path("reports") / f"{name}.txt"
    path.write_text(f"{balance}\n")

report("acct-1", 1250.5)
```
Changes: `print` as a function call; f-strings instead of `%` formatting; `pathlib` instead of
`os.path.join` and manual open/write/close (`Path.write_text` opens, writes and closes in one call
— also removes the leaked-handle risk if `write` had raised); type hints added since this is now a
function other code will call. Behaviourally identical, but this is code someone fluent in current
Python would write without thinking, and code someone else can maintain without translating it
first.
:::
::::
