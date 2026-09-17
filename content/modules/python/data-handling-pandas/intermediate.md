---
title: "pandas in Practice: From Export to Answer"
estimatedMinutes: 45
objectives:
  - "Join multiple sources correctly and know the row-count pitfalls that corrupt totals"
  - "Recognise tidy data and reshape untidy exports into it"
  - "Know when pandas is the wrong tool — and whether polars or SQL is the better answer"
  - "Turn a DataFrame into a chart fit for a status deck"
status: ready
---

You can filter and groupby. This lesson is about what breaks when the CSV isn't clean, the answer
needs two sources combined, or the file is bigger than your laptop's memory — and about the
increasingly common question of whether pandas is even the right tool for a given job.

## Where the basics break down

A single clean CSV with a `groupby` gets you a long way. Real work rarely stays that simple: two
exports need joining and the join silently drops or duplicates rows; a spreadsheet export has
merged header cells and totals rows mixed into the data; a "quick script" runs fine on a sample and
times out on the full monthly file. None of this shows up until the data or the deadline is real.

:::manager
The most expensive pandas bugs are the silent ones: a join that duplicates rows inflates a total
that gets read out in a meeting before anyone notices. Ask, for any number that came from a pandas
script: "did anyone check the row count before and after each join?"
:::

:::engineer
Concretely: `pd.merge` on a non-unique key silently multiplies rows instead of erroring; a wide
Excel export with merged header cells parses into `Unnamed: 0`-style column names that break a
naive `groupby`; and a script that works on a 10,000-row sample can hit real memory pressure on the
2-million-row monthly file, often from one unnoticed row-wise `.apply()`.
:::

## Joins: merge, and what can go wrong

`pd.merge` is pandas' join, with the same logic as a SQL join — `how="inner"`, `"left"`, `"right"`,
`"outer"`.

```python
transactions = pd.read_csv("transactions.csv")
accounts = pd.read_csv("accounts.csv")

joined = transactions.merge(accounts, on="account_id", how="left")
```

:::callout{kind=gotcha title="The row count changed and nobody meant it to"}
If `account_id` is not unique in `accounts` (say, one account appears twice due to a data quality
issue upstream), the merge silently **duplicates** matching rows in `transactions` — one row per
match. A left join that "should" preserve the row count of `transactions` doesn't. Check:
```python
assert len(joined) == len(transactions), "merge changed row count — check for duplicate keys"
```
This one-line habit catches a large fraction of real pandas bugs before they reach a report.
:::

:::engineer
`how="left"` keeps every row from the left table, filling unmatched columns with `NaN` — usually
what you want for "enrich transactions with account details, keep all transactions." `how="inner"`
drops rows with no match on either side — usually wrong for a report unless you explicitly want
only matched rows, and worth a comment explaining why when you do.
:::

:::manager
A merge's `how=` choice is a business decision disguised as a keyword argument: `"inner"` silently
drops transactions with no matching account, which might be exactly the data quality issue you
actually want the report to surface. Ask, when reviewing a join: was dropping unmatched rows a
deliberate choice, or the default nobody thought about?
:::

## Tidy data: one observation per row

**Tidy data** (a term from the R/pandas data-cleaning world): each variable is a column, each
observation is a row, each type of observation is one table. Exports from spreadsheets are often
the opposite — months as columns, subtotal rows mixed in with data rows.

```python
# untidy: one column per month
#   account_id | jan | feb | mar
# tidy: one row per (account, month) observation
melted = wide_df.melt(id_vars="account_id", var_name="month", value_name="balance")
```

:::callout{kind=decision title="Wide or long?"}
- Wide (months as columns) is easier for a human to eyeball in a spreadsheet.
- Long/tidy (one row per observation) is what `groupby`, joins, and most plotting expect.
- Default to tidy for anything you'll filter, join or aggregate; reshape to wide only at the final
  export/display step, with `.pivot()`.
:::

:::engineer
`.pivot()` is `.melt()`'s inverse: it takes long/tidy data and spreads one column's values back out
into separate columns, for the final export step: `long_df.pivot(index="account_id",
columns="month", values="balance")`. Reach for it last, not first.
:::

:::manager
An untidy export (subtotal rows mixed into data rows, merged header cells) is a common, quiet
source of a `groupby` that silently double-counts a subtotal as if it were another transaction. If a
number looks slightly too high, checking whether the source export has embedded subtotals is worth
five minutes before suspecting the code.
:::

## Performance: when pandas gets slow

pandas holds the whole DataFrame in memory and is fastest when you operate on whole columns
(**vectorised** operations) rather than looping row by row.

```python
# slow: a Python-level loop over every row
df["fee"] = df.apply(lambda row: row["amount"] * 0.01, axis=1)

# fast: vectorised — the multiplication happens on the whole column at once, in C
df["fee"] = df["amount"] * 0.01
```

:::engineer
`.apply()` with a row-wise lambda is the most common performance trap — it looks idiomatic but
falls back to a slow Python loop under the hood. Read column dtypes with `dtype=` on load rather
than converting after the fact; use `category` dtype for a column with few repeated string values
(currency codes, status flags) to cut memory substantially on large files.
:::

:::callout{kind=bank-context}
"The monthly reconciliation script used to take 20 minutes and now takes 3 hours" is very often
explained by data volume growth exposing a row-wise `.apply()` that was always there but only
recently slow enough to notice. Worth asking for a before/after row count when performance
complaints come in.
:::

:::manager
Performance complaints about a pandas script are a cheap diagnostic before anyone proposes a rewrite
in a different tool: ask for the row count, and whether the slow part is a row-wise `.apply()`.
Fixing one line is a different conversation, and a different cost, than "we need to migrate this to
polars."
:::

## polars, or plain SQL — when pandas is the wrong tool

pandas is not the only option, and for some jobs it's not the best one.

:::callout{kind=decision title="pandas vs polars vs SQL"}
- **The data already lives in a database and the operation is a filter/join/aggregate** — write
  SQL and let the database do it. Pulling millions of rows into Python to do what the database
  engine is built for is usually slower and adds a failure mode (the transfer itself).
- **The file is large (multi-GB) and pandas is slow or runs out of memory** — polars is a newer
  DataFrame library, similar API family, built for larger-than-fits-comfortably data and
  multi-core execution by default. Worth evaluating when pandas performance becomes a real problem,
  not before.
- **The data is a modest CSV/Excel export and the job is exploratory or one-off** — pandas remains
  the right default: the most documentation, the most Stack Overflow answers, the library every
  data-literate hire already knows.
:::

:::engineer
polars' API is intentionally similar but not identical — expressions and a lazy execution mode
(`pl.scan_csv(...).filter(...).collect()`) that lets it plan the whole computation before running
it, which is where a lot of its speed advantage on large files comes from. Worth a small prototype
on the actual slow job before committing a team to the migration.
:::

:::manager
This is a real build-vs-buy-style decision, not just a technology preference. If a team is
rewriting pandas scripts in polars, ask what the actual pain was (memory, speed, both) and whether
the same problem would disappear by pushing the aggregation into the database instead — that's
often the cheaper fix, with no new library to learn or support.
:::

## From DataFrame to status-deck chart

A DataFrame plotted directly is a debugging aid, not a deliverable. Producing something fit for a
deck usually means summarising first, then charting the summary — not plotting raw transaction-level
data.

```python
import matplotlib.pyplot as plt

summary = df.groupby("month")["amount"].sum()
summary.plot(kind="bar", title="Monthly transaction volume")
plt.savefig("monthly_volume.png", dpi=150, bbox_inches="tight")
```

:::engineer
`df.plot(...)` is a thin wrapper over matplotlib, fine for a quick look. For anything actually going
in front of people, more control over labels, a shared colour scheme and legible axis formatting
usually means dropping into matplotlib (or a charting library) directly rather than relying on the
one-line default.
:::

:::manager
A chart in a status deck should be traceable back to the exact filter and aggregation that produced
it, ideally by re-running one script. If the chart came from a number pasted in by hand after some
manual Excel manipulation, that provenance is gone, and the chart can't be trusted to reproduce next
month without redoing the manual work.
:::

## What good looks like

A review checklist for a pandas script producing a number that goes in a report:

- Row counts are checked after every join (`assert` or a printed count), not assumed.
- ID/account-number columns are read as strings, not numbers.
- Filtering happens before aggregation, and the filter condition is visible in the code, not lost
  in a notebook cell that got deleted.
- Anything looping row-by-row with `.apply(axis=1)` has a reason (genuinely row-dependent logic
  that can't vectorise), not just habit.
- The script is a `.py` file or a notebook with a clear "run all" path, not a sequence of manually
  re-ordered cells that only works in the author's head.

## Exercises

::::exercise{id=ex-join-review type=scenario title="The reconciliation total doesn't match"}
A colleague's pandas script joins a transactions export to an accounts export on `account_id` and
sums the amounts. The total is 8% higher than the source system reports. What do you ask them to
check first, and why?
:::solution
First question: is `account_id` unique in the accounts table? A duplicate account_id (same account
appearing twice, e.g. once per branch code in a badly deduplicated export) causes a `merge` to
duplicate every matching transaction row, inflating the sum by exactly however many transactions hit
the duplicated accounts. The check is one line:
`accounts["account_id"].duplicated().sum()` — if non-zero, that's very likely the whole bug. Second,
cheaper check regardless: compare `len(joined)` to `len(transactions)` before and after the merge;
if they differ and the join was meant to be a pure enrichment (`how="left"`), that mismatch is the
symptom, and the duplicate key is almost always the cause.
:::
::::

::::exercise{id=ex-vectorise type=code title="Vectorise a slow row-wise calculation"}
Rewrite this to avoid the row-wise `.apply()`, keeping the result identical: a 2% fee on amounts
over 1000, otherwise a flat 5.

```python
def fee(row):
    if row["amount"] > 1000:
        return row["amount"] * 0.02
    return 5

df["fee"] = df.apply(fee, axis=1)
```
:::solution
```python
import numpy as np

df["fee"] = np.where(df["amount"] > 1000, df["amount"] * 0.02, 5)
```
`np.where(condition, if_true, if_false)` is vectorised — it evaluates both branches over the whole
column at once instead of calling a Python function once per row. On a large DataFrame this is
routinely tens to hundreds of times faster than `.apply(axis=1)`, with no change in the result.
:::
::::
