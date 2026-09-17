---
title: "Data Handling with pandas"
estimatedMinutes: 35
objectives:
  - "Explain what a DataFrame is and how it differs from a spreadsheet"
  - "Read a CSV or Excel file, filter rows, and compute a groupby summary"
  - "Read a small pandas script and say what data it produces"
status: ready
---

If someone on your team turns a CSV export into a number for a status deck, there is a very good
chance pandas did the work in between. This lesson starts from zero — you may never have used it,
or only touched it years ago in a very different form. Either way, this is the foundation the
Intermediate lesson builds on.

## Why this exists

Spreadsheets are the default tool for "look at some data" because everyone can open one. They stop
working the moment the data doesn't fit on screen, needs to be combined with another source, or
needs to be reproduced correctly every month without someone manually redoing the same clicks.
pandas is Excel's logic — filter, sort, group, summarise — expressed as code: repeatable, reviewable
in a pull request, and able to handle a file too large to open comfortably in a spreadsheet
application.

:::manager
The management case for pandas over "someone's Excel macro": a script is versioned, reviewable, and
runs the same way every time. An Excel workbook with hidden formulas and manual steps is a single
point of failure that lives in one person's head and one person's laptop.
:::

:::engineer
```python
import pandas as pd

df = pd.read_csv("transactions.csv")
print(df.head())          # first 5 rows
print(df.shape)            # (rows, columns)
print(df.dtypes)           # the type pandas inferred for each column
```
:::

## What is a DataFrame

A **DataFrame** is a table: rows and named, typed columns, held in memory. Think of it as a
spreadsheet with a name for the whole sheet and one consistent data type per column — pandas infers
types (`int64`, `float64`, `object` for text, `datetime64` for dates) when it reads the data in. A
single column, pulled out on its own, is a **Series** — a DataFrame is really a collection of
Series that share an index.

```python
df["amount"]                # a Series: one column
df[["amount", "currency"]]  # a DataFrame: a subset of columns
df.iloc[0]                  # a Series: the first row, by position
df.loc[df["amount"] > 0]    # a DataFrame: rows matching a condition
```

:::engineer
The **index** is a label for each row — by default just 0, 1, 2..., but it can be set to something
meaningful (a date, an account ID) with `df.set_index("account_id")`, which changes how `.loc[]`
looks rows up.
:::

:::manager
When reviewing a data pipeline, ask what the index is. A DataFrame indexed on a meaningful key
(account ID, date) supports fast, correct joins; one left on the default integer index is a common
source of silent bugs when rows get reordered or filtered upstream.
:::

## Reading data in

pandas reads most formats you'll encounter: CSV, Excel, JSON, and directly from a database query.
Writing back out is the mirror image — `df.to_csv("out.csv", index=False)`,
`df.to_excel("out.xlsx", index=False)`. The `index=False` matters: without it, pandas writes its
row index as an extra unnamed first column, which is rarely what the person receiving the file
wants.

```python
df = pd.read_csv("export.csv")
df = pd.read_excel("report.xlsx", sheet_name="Q1")
df = pd.read_csv("export.csv", parse_dates=["transaction_date"])   # parse a column as dates on read
```

:::manager
Asking "where did this number come from" should have a one-command answer: which file, which
sheet, which filter. If the honest answer involves "I copied some cells into a new sheet first,"
that manual step is exactly where reproducibility and audit trail quietly disappear, and it is the
kind of gap a short pandas script closes for good.
:::

:::engineer
`read_csv` has options worth knowing early: `dtype={"account_id": str}` (stop pandas guessing a
column of IDs is numeric and stripping leading zeros — a classic first bug), `na_values=["N/A", ""]`
(what counts as missing), and `usecols=[...]` (read only the columns you need, faster on wide files).
:::

## Filtering and selecting

Boolean indexing is the core pattern: write a condition, get a Series of `True`/`False`, use it to
select rows.

```python
failed = df[df["status"] == "FAILED"]
large_gbp = df[(df["amount"] > 10_000) & (df["currency"] == "GBP")]   # & not `and`, parentheses required
recent = df[df["transaction_date"] >= "2026-01-01"]
```

:::callout{kind=gotcha title="`&` and `|`, not `and`/`or`"}
Combining conditions on a DataFrame uses `&` and `|` with each condition in parentheses, not Python's
`and`/`or`. This is the single most common first error — `and`/`or` don't work element-wise across a
whole column and will raise a confusing error.
:::

:::engineer
`.loc[]` combines row filtering and column selection in one call, and is the safer habit to build
from the start: `df.loc[df["status"] == "FAILED", ["account_id", "amount"]]` filters rows and picks
columns in one step, and avoids a class of "did I just modify a copy or the original" warnings that
plain `df[...]` chaining can trigger.
:::

:::manager
A filter condition buried three lines above the line that uses it, in a notebook cell that's been
edited five times, is a common reason a number in a report can't be explained six weeks later. Ask
whether the filter that produced a figure is visible in the same place as the figure, not
reconstructed from memory.
:::

## Missing values

Real exports have gaps: a field the source system didn't populate, a row from before a column
existed. pandas represents a missing value as `NaN` (for numeric columns) or `None`/`NaT` for
other types, and most arithmetic and comparisons quietly propagate it rather than raising an error.

```python
df["amount"].isna().sum()          # how many rows are missing this field
df.dropna(subset=["amount"])       # drop rows missing amount
df["amount"].fillna(0)             # or: treat missing as zero — only if that's actually correct
```

:::engineer
`fillna` is a decision, not a default: filling a missing balance with `0` is reasonable for a
"total transactions" report and actively wrong for "average account balance," where it would drag
the average down for no real reason. Check what a missing value *means* in the source system before
choosing how to handle it.
:::

:::manager
"How many rows did we drop, and why" is a question every summary derived from real data should be
able to answer. A report that silently drops or zero-fills missing values without anyone deciding
that was the right call is a common, quiet source of a number that's wrong in a way nobody notices
until someone asks for the underlying detail.
:::

## Groupby: the answer to "summarise this by category"

`groupby` is how "total amount by currency" or "count of failed transactions per day" gets
computed — split the data into groups, apply a summary function, combine the results.

```python
df.groupby("currency")["amount"].sum()
df.groupby("status")["amount"].agg(["count", "sum", "mean"])
df.groupby(["currency", "status"])["amount"].sum()      # multiple grouping keys
```

:::engineer
```python
summary = df.groupby("currency")["amount"].sum().reset_index()
# reset_index() turns the grouped result back into a plain DataFrame with "currency" as a column
# instead of the index — usually what you want before exporting or charting
```
:::

:::manager
"Turn this CSV into a number for the status deck" is almost always a `groupby` plus a sum or count.
When someone tells you a report "took hours to put together by hand," a few lines of pandas doing
exactly that filter-and-summarise is very often the fix, and it's worth asking whether the report
is reproducible next month without redoing the manual work.
:::

## Common mistakes

- **`and`/`or` instead of `&`/`|`** when combining filter conditions — raises an error or silently
  does the wrong thing.
- **Letting pandas guess the type of an ID column,** turning `"00123"` into the integer `123` and
  losing leading zeros. Set `dtype=str` on read for anything that is an identifier, not a number.
- **Chained assignment** (`df[df.x > 0]["y"] = 1`) — pandas may warn `SettingWithCopyWarning`
  because it isn't clear whether you're modifying the original data. Use `.loc[]`:
  `df.loc[df.x > 0, "y"] = 1`.
- **Not checking for missing values** before summing or comparing — a column with `NaN` silently
  changes the result of arithmetic and comparisons in ways that are easy to miss.
- **Opening a large file in Excel to "just take a quick look"** when pandas would read and filter
  it in seconds without the application hanging.

:::callout{kind=bank-context}
The moment a CSV contains customer names, account numbers or other PII, a pandas script processing
it is subject to the same data-handling rules as the system it came from — where it's saved, who
can run the script, whether intermediate files get cleaned up. "It's just an export for a chart" is
not an exemption; it's usually exactly the kind of copy that data-handling controls exist to catch.
:::

## Putting it together

::::exercise{id=ex-summarise-csv type=code title="Turn a transactions export into a summary"}
Given a DataFrame `df` with columns `account_id`, `amount`, `currency`, `status`, write pandas code
to produce a table of total amount by currency, for transactions with `status == "COMPLETED"` only.

```python
# df has columns: account_id, amount, currency, status
```
:::solution
```python
completed = df[df["status"] == "COMPLETED"]
summary = completed.groupby("currency")["amount"].sum().reset_index()
summary.columns = ["currency", "total_amount"]
print(summary)
```
Filter first, then group — grouping before filtering would include failed/pending transactions in
the total. `reset_index()` and renaming the columns makes the result a clean table ready to export
or paste into a report, rather than a Series with a slightly awkward name.
:::
::::
