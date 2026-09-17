---
title: "Python Syntax Essentials"
estimatedMinutes: 35
objectives:
  - "Read ordinary Python and say what a piece of code does without a reference"
  - "Explain why Python's dynamic typing is a design tradeoff, not a missing feature"
  - "Recognise the collection types and comprehensions that make Python code short"
  - "Know what a module and a virtual environment are for"
status: ready
---

You already know how to program. Python will feel familiar within an hour and will still surprise
you a week later, because most of its differences from the languages you know are deliberate
choices, not gaps. This lesson gives you enough syntax to read real Python — the kind your SREs and
data analysts actually write — without stumbling on the parts that look like nothing you've seen.

## Why this exists

Python is the bank's default language for glue: scripts that move files, call APIs, reshape data
and run on a schedule. It is not usually the language of the core ledger or the trading engine. It
is the language of "someone needed this done by Friday and it needs to keep running after they
leave." That combination — quick to write, expressive, and long-lived by accident — is exactly why
reading it matters to you. A script with no types, no tests and no owner is either automating a
manual process nobody trusted, or it is the process now, whether anyone signed off on that or not.

:::manager
When you inherit a team with Python scripts in production, the first question is not "is this good
code" — it's "does anyone still understand what this does, and can we run it without the person who
wrote it." Python's low barrier to entry means it accumulates fast and gets reviewed rarely.
:::

:::engineer
```python
# a complete, runnable Python file — no boilerplate, no class required
import sys

def greet(name: str) -> str:
    return f"Hello, {name}"

if __name__ == "__main__":
    print(greet(sys.argv[1] if len(sys.argv) > 1 else "world"))
```
Indentation is the block structure — there are no braces. The `if __name__ == "__main__":` guard is
idiomatic: it means "only run this when the file is executed directly, not when it's imported."
:::

## Types and variables

Python is **dynamically typed**: a variable name is just a label you attach to a value, and it can
be reattached to a value of a different type. There is no variable declaration. The value itself
knows its type; the variable does not restrict it.

```python
x = 5          # x labels an int
x = "five"     # now x labels a str — legal, and common enough to bite you
```

This is not the same as "untyped." Every value has a definite type at runtime (`type(x)` tells you),
and operations that mix incompatible types raise an exception immediately rather than silently
coercing. Python will not add a string and an integer for you.

:::engineer
Built-in scalar types: `int` (arbitrary precision — no overflow), `float`, `bool`, `str`, and
`None` (the null value; `None` is a singleton, compare with `is None`, not `== None`). Since Python
3.5 you can add **type hints** — optional annotations checked by external tools (`mypy`), not by
the interpreter at runtime:

```python
def apply_rate(balance: float, rate: float) -> float:
    return balance * (1 + rate)
```
Hints document intent and let tooling catch mistakes before code runs; they do not make Python
statically typed.
:::

:::manager
Type hints are the single highest-leverage thing you can ask a team to adopt on an inherited
codebase. They are non-breaking, incremental, and turn "what does this function expect" from a
question you ask in Slack into something your editor answers instantly. If a Python codebase has
zero type hints and is more than a few hundred lines, treat that as a maintainability debt, not a
style preference.
:::

## Collections: list, tuple, dict, set

Four built-in containers cover almost everything:

| Type | Ordered | Mutable | Duplicates | Typical use |
| --- | --- | --- | --- | --- |
| `list` | yes | yes | yes | a sequence you'll modify: `["EUR", "USD", "GBP"]` |
| `tuple` | yes | no | yes | a fixed-size record: `(53, "architect")` |
| `dict` | yes (insertion) | yes | keys unique | a lookup: `{"EUR": 1.0, "USD": 1.08}` |
| `set` | no | yes | no | membership tests, de-duplication |

```python
rates = {"EUR": 1.0, "USD": 1.08, "GBP": 0.86}
rates["CHF"] = 0.94          # add
del rates["GBP"]             # remove
"USD" in rates               # True — membership test, O(1)
list(rates.keys())           # ['EUR', 'USD', 'CHF']
```

:::engineer
Unpacking works on any of these and is used constantly in real code:
```python
name, age = "Sam", 53
first, *rest = [1, 2, 3, 4]      # first=1, rest=[2, 3, 4]
for currency, rate in rates.items():
    print(currency, rate)
```
:::

:::manager
Reading a diff that swaps a `list` for a `set` or a `dict` is a performance and correctness signal,
not a style change: it usually means someone found an `O(n)` membership check in a loop (a bug that
gets slower as data grows) and fixed it. Worth an approving comment, not a question.
:::

## Comprehensions and control flow

`if`/`elif`/`else` and `for`/`while` work as you'd expect, with one shape unique to Python: the
**comprehension** — building a collection in one expression instead of a loop with `.append()`.

```python
amounts = [12.50, -3.00, 45.10, -8.25]
positives = [a for a in amounts if a > 0]            # [12.5, 45.1]
total_by_flag = {a > 0: 0 for a in ()}                # (rarely written this way, shown for contrast)
squared = {a: a * a for a in positives}               # dict comprehension
```

A comprehension is not a different feature — it is a `for` loop and an `if` filter read left to
right, evaluating to a list, dict or set. Once you can read one, you can read most Python people
write.

:::engineer
```python
# equivalent, longer form — useful when learning to read the short form
positives = []
for a in amounts:
    if a > 0:
        positives.append(a)
```
Prefer the comprehension when the body is one expression. Fall back to a loop as soon as the logic
needs more than a filter and a transform — a comprehension that needs a comment to explain it has
gone too far.
:::

:::callout{kind=gotcha title="Truthiness"}
`if items:` is true when `items` is non-empty — empty list, dict, string, and `0` are all falsy.
This is idiomatic, not a bug, but it means `if x == 0:` and `if not x:` are not the same test when
`x` might be `None` or an empty collection.
:::

:::manager
A pull request with a dense, multi-clause comprehension and no comment is a reasonable place to ask
"can you talk me through this" in review — not because comprehensions are bad, but because a
reviewer who has to decode one line for two minutes gets less value from the review than one who
can read a four-line loop in five seconds. Density is not automatically quality.
:::

## Functions and modules

A function is defined with `def`; arguments can have defaults, and can be passed by position or by
name (`keyword arguments`). A **module** is just a `.py` file; a package is a directory of modules
with an `__init__.py` (optional since Python 3.3, but still common). `import` brings a module's
names into scope.

```python
# rates.py
DEFAULT_RATE = 1.0

def convert(amount: float, rate: float = DEFAULT_RATE) -> float:
    return round(amount * rate, 2)
```
```python
# main.py
import rates
rates.convert(100, rate=1.08)      # keyword argument — reads clearly at the call site
```

:::engineer
Dependencies are declared, not vendored, in most modern Python projects via `pyproject.toml`, and
installed into an isolated **virtual environment** so one project's package versions don't collide
with another's:
```bash
python -m venv .venv
source .venv/bin/activate        # .venv\Scripts\activate on Windows
pip install -r requirements.txt
```
:::

:::manager
"It works on my machine" in Python almost always means no virtual environment, or two projects
sharing one global set of package versions. Ask whether a repo has a `requirements.txt` or
`pyproject.toml` and whether CI installs into a clean environment before every run. If the answer is
"we install packages globally on the build box," that box is now a single point of failure that
nobody can safely touch.
:::

## Common mistakes

- **Mutable default arguments.** `def f(items=[]):` creates the list *once*, at function definition
  time, and every call without an argument shares it. Use `def f(items=None): items = items or []`.
- **Confusing `is` and `==`.** `is` checks identity (same object in memory); `==` checks equality.
  Use `is` only for `None`, `True`, `False`.
- **Off-by-one with slicing.** `items[0:3]` gives three items, indices 0–2; the end is exclusive.
- **Catching bare `except:`.** Swallows every error, including the ones you need to see (like
  `KeyboardInterrupt`). Catch specific exception types.
- **Indentation mixing tabs and spaces.** Python 3 rejects this outright, but copy-pasted code from
  mixed sources still causes it. Configure your editor to insert spaces.

:::callout{kind=bank-context}
A script that reads a spreadsheet of customer data into a `dict` and writes it back out is, from a
data-handling-controls point of view, the same as any other place PII is processed — it needs the
same access controls and retention rules as the source system, even though it's "just a script."
Nobody asks a one-off script for a data protection impact assessment, which is exactly the problem.
:::

## Putting it together

::::exercise{id=ex-read-python type=code title="Read and fix a small script"}
This script is meant to compute the total of positive transaction amounts from a list of
dictionaries, but it has three bugs. Find and fix them.

```python
def total_positive(transactions=[]):
    total = 0
    for t in transactions:
        if t["amount"] > 0
            total = total + t["amount"]
    return total

transactions = [{"amount": 100}, {"amount": -50}, {"amount": 25}]
print(total_positive(transactions))
```
:::solution
```python
def total_positive(transactions=None):
    transactions = transactions or []
    total = 0
    for t in transactions:
        if t["amount"] > 0:                 # missing colon
            total = total + t["amount"]
    return total

transactions = [{"amount": 100}, {"amount": -50}, {"amount": 25}]
print(total_positive(transactions))         # 125
```
Bugs: missing colon after the `if` (syntax error, would not run at all); mutable default argument
(latent bug — harmless here since the caller always passes a list, but a landmine for the next
caller who doesn't); otherwise correct. A reviewer should flag the mutable default even though it
doesn't fire in this example — the point is the pattern, not the symptom.
:::
::::
