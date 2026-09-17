---
title: "pandas — refresher for the 0.x era"
estimatedMinutes: 18
objectives:
  - "Re-anchor DataFrame/Series vocabulary in ten minutes"
  - "Know what changed since pandas 0.x: .loc/.iloc, nullable types, faster backends"
  - "Spot the gotchas that still catch people who learned pandas years ago"
status: ready
---

If you used pandas at all, it was probably a 0.x release — before `.loc`/`.iloc` fully replaced the
old ambiguous indexers, before nullable integer types existed, and well before pandas 2.0. If you
never used it, the Beginner lesson is the right starting point; this refresher assumes the DataFrame
mental model is already there and focuses on what moved.

## What you probably remember

| Concept | One-line anchor |
| --- | --- |
| DataFrame / Series | A table, and a single named column pulled from it. |
| `read_csv` / `read_excel` | Load tabular data in; pandas infers a dtype per column. |
| Boolean indexing | `df[df.amount > 0]`; combine conditions with `&` / `\|`, each side in parentheses. |
| `groupby` | Split by key, apply a summary function, combine into a result. |
| `merge` | pandas' join; `how="left"/"inner"/"outer"`, watch row counts. |
| `NaN` | pandas' historical missing-value marker for numeric columns. |

## What changed since

:::callout{kind=changed-since title="ix is gone (removed in pandas 1.0, early 2020)"}
The old `.ix[]` indexer — which guessed whether you meant a label or a position, and was a
well-known source of subtle bugs — was deprecated for years and fully removed in pandas 1.0. Use
`.loc[]` (label-based) or `.iloc[]` (position-based) explicitly. If you see `.ix` in a codebase,
that code predates 2020 and hasn't been touched since.
:::

:::callout{kind=changed-since title="Nullable integer and other extension dtypes"}
In old pandas, a numeric column with any missing values silently became `float64` — an integer
column of account counts with one `NaN` turned every value into `1.0`, `2.0`, losing the "this is a
whole number" guarantee and sometimes breaking equality checks downstream. Nullable dtypes
(`Int64` with a capital I, `boolean`, nullable string) let a column hold missing values without that
silent upcast: `df["count"] = df["count"].astype("Int64")`.
:::

:::callout{kind=changed-since title="pandas 2.0 (2023): Arrow-backed dtypes and copy-on-write"}
pandas 2.0 added an option to back columns with Apache Arrow instead of NumPy, improving performance
and interoperability (including with polars) and adding better native support for missing values in
more types. It also introduced a copy-on-write mode that removes a lot of the ambiguity behind
`SettingWithCopyWarning`. Check which mode a given environment is running before assuming behaviour
— specifics are still settling, so if it matters, check the installed version rather than assuming.
:::

:::callout{kind=changed-since title="polars: a newer, different DataFrame library"}
Not a pandas version change, but relevant context: polars emerged as a fast, multi-core-by-default
alternative with a stricter, more predictable API (no chained-assignment ambiguity, no implicit
index). It's increasingly the answer when a pandas script gets slow on larger files rather than a
pandas performance-tuning exercise. See the Intermediate lesson's decision callout.
:::

:::manager
None of this changes what you'd ask in a review. It changes what "current idiom" looks like: a
script written by someone fluent today reads as string dtypes handled explicitly, `.loc`/`.iloc`
everywhere, no `.ix`, and an actual opinion about whether pandas is even the right tool for a large
file. A script still guessing with `.ix` or converting everything to `float64` by accident is
several years behind, which is a useful, low-drama thing to notice in a review.
:::

## Gotchas that still bite

- **Chained assignment** (`df[df.x > 0]["y"] = 1`) still produces ambiguous, sometimes-silently-wrong
  behaviour and a `SettingWithCopyWarning` in most versions. Use `.loc[mask, "y"] = 1`. This did not
  go away between 0.x and now; it's just as easy to write by accident today.
- **`&`/`|` instead of `and`/`or`**, with parentheses around each condition, is unchanged and still
  the most common first mistake, rusty or not.
- **Integer columns silently becoming floats** on any read with missing values, unless you
  explicitly opt into a nullable dtype.
- **Row-wise `.apply(axis=1)`** is exactly as tempting and exactly as slow as it was in 0.x —
  vectorised operations on whole columns are still the fast path.
- **Trusting a `merge`'s row count** without checking it — still the most common source of a
  quietly-wrong total, unrelated to version.

:::callout{kind=bank-context}
A script pinned to an old pandas 0.x release in a `requirements.txt` because "it works, don't touch
it" is worth a specific question: does it still receive security patches, and does anyone know why
it's pinned — genuine incompatibility, or nobody's tried upgrading it. Unpinned or ancient
scientific-Python dependencies are a common, unglamorous finding in dependency-risk reviews.
:::

## Ten-minute drill

::::exercise{id=ex-modernise-pandas type=code title="Modernise an old pandas snippet"}
Update this to current idiom: replace the deprecated indexer, fix the chained assignment, and make
sure the id column stays a string.

```python
df = pd.read_csv("accounts.csv")
df.ix[df.balance < 0, "flag"] = True
df[df["account_id"].str.len() < 5]["account_id"] = df["account_id"].str.zfill(5)
```
:::solution
```python
df = pd.read_csv("accounts.csv", dtype={"account_id": str})
df.loc[df["balance"] < 0, "flag"] = True
df.loc[df["account_id"].str.len() < 5, "account_id"] = df["account_id"].str.zfill(5)
```
Changes: `dtype={"account_id": str}` on read, so short numeric-looking IDs never lose leading zeros
in the first place; `.ix` replaced with `.loc` (label-based, unambiguous); the chained assignment on
the second line — which may or may not have actually modified `df`, depending on internals — replaced
with a single `.loc[mask, column] = value` that reliably modifies the original DataFrame.
:::
::::
