---
title: "Frontend in Production: React, Data and Estimates"
estimatedMinutes: 40
objectives:
  - "Explain the React rendering model well enough to read a performance bug report"
  - "Distinguish client state, server state and URL state, and pick the right tool for each"
  - "Run an accessibility and performance check a manager can actually use in review"
  - "Give a credible answer for why frontend estimates slip, and what reduces the slip"
status: ready
---

You know what a component is and what state means. This lesson is about what breaks once a
component tree has real data, real users, and a delivery date attached to it.

## Where the basics break down

A component that renders once, with static props, is not where frontend cost lives. Cost lives in:
components that re-render more than necessary and make the UI feel sluggish; data that is fetched
naively and goes stale or duplicates requests; UI that works for a mouse-and-monitor user and locks
out anyone using a keyboard or screen reader; and estimates built by looking at a design mock-up
without accounting for the states the mock-up does not show. Each of these is a pattern with a name,
a fix, and a reason it keeps recurring on new teams.

## The React mental model: render is a function of state

React's core idea: the UI at any moment is a pure function of the current props and state. When
state changes, React re-runs the component function, computes a new description of the UI (the
virtual DOM), diffs it against the last one, and applies only the minimal real changes to the actual
DOM. You do not write "find this element and change its text" — you describe what the UI should look
like for the current data, and the framework figures out the delta.

The consequence that catches experienced engineers moving from imperative jQuery-style code: you
cannot "reach in and mutate" — `payment.status = 'SENT'` on an object already rendered does nothing
visible. State changes must go through the state-setting function (`setPayment(...)`) so React knows
to re-render. This is the single most common source of "I changed the data but the screen didn't
update" bugs from engineers new to the model.

:::engineer
```jsx
// Wrong: mutates state directly, React never knows to re-render
function markSent(payment) { payment.status = 'SENT'; }

// Right: create a new object, hand it to the setter
function markSent(payment, setPayment) {
  setPayment({ ...payment, status: 'SENT' });
}
```
React (and most state libraries built on the same idea) compares references, not deep contents, to
decide what changed. A new object reference is what triggers the diff.
:::

:::callout{kind=decision title="Why re-renders matter"}
Every state change re-runs the component and every child that receives new props. For a small
subtree this is invisible. For a table rendering thousands of rows, or a component tree many levels
deep, unnecessary re-renders are the most common cause of a UI that "feels slow" with no network
delay involved. Tools: `React.memo` to skip re-rendering a component when its props have not
meaningfully changed, and the `useMemo`/`useCallback` hooks to avoid creating new object/function
references on every render that would otherwise defeat that memoisation.
:::

:::manager
"The UI feels laggy" is rarely a network problem when the data is already loaded — it is usually a
re-render problem. Ask whether the team has profiled it (React DevTools has a built-in profiler)
before accepting "we need a rewrite" as the answer. Re-render problems are almost always fixable
locally.
:::

## Data fetching: client state, server state, URL state

Treat these as three different problems, because they fail differently:

- **Client state** — UI-only, never persisted (is this dropdown open). `useState` is enough.
- **Server state** — owned by the backend, cached in the browser, can go stale, can fail, can be
  loading, can be refetched. This is where most production bugs live.
- **URL state** — what page, what filter, what sort order. Belongs in the URL (query params), not
  in component state, so a link is shareable and the back button works.

Hand-rolling server state (fetch in `useEffect`, store in `useState`) reproduces the same bugs on
every screen: no de-duplication of identical in-flight requests, no cache, no retry, no way to
invalidate one query when a mutation elsewhere should update it. Libraries purpose-built for this —
TanStack Query (formerly React Query), SWR, or the data layer built into meta-frameworks like
Next.js and Remix — solve caching, staleness, retries and race conditions once, centrally.

:::engineer
```jsx
// Hand-rolled: no cache, no dedupe, a race condition if accountId changes quickly
useEffect(() => {
  fetch(`/api/accounts/${accountId}`).then(r => r.json()).then(setAccount);
}, [accountId]);

// With a server-state library: cache, dedupe, retry, staleness policy declared once
const { data: account, isLoading, error } = useQuery({
  queryKey: ['account', accountId],
  queryFn: () => fetchAccount(accountId),
  staleTime: 30_000,
});
```
The second version also cancels the stale request automatically if `accountId` changes before the
first one resolves — the hand-rolled version can show account B's data labelled as account A's if you
are not careful.
:::

:::manager
When a team proposes hand-rolling data fetching instead of using an established server-state
library, ask why. A justified reason exists sometimes (a tiny app, a constraint on dependencies in a
regulated environment). "We didn't know the library existed" is not a reason — it is a maintenance
cost the team will pay repeatedly, once per screen.
:::

## Accessibility: not a checkbox at the end

Accessibility (a11y) means the UI works with a keyboard alone, with a screen reader, and for users
with low vision or motor impairment. It is cheapest when built in from the component level and
expensive to retrofit, because retrofitting usually means restructuring markup that other components
already depend on.

The floor, not the ceiling: semantic HTML elements (`<button>` not `<div onClick>`), visible focus
states, labelled form fields, sufficient colour contrast, and a logical tab order. Most of this is
free if you use native HTML elements for their native purpose instead of rebuilding a button out of a
styled `<div>`.

:::engineer
```jsx
// Inaccessible: no keyboard support, no screen-reader semantics, no focus state
<div onClick={submit} className="btn">Submit</div>

// Accessible: keyboard, screen reader and focus come from the browser for free
<button onClick={submit} className="btn">Submit</button>
```
Automated tools (axe, Lighthouse's accessibility audit) catch the mechanical violations — missing
labels, contrast ratios, missing alt text. They do not catch whether the experience makes sense with
a screen reader; that needs an actual pass with one, or a specialist review.
:::

:::manager
Ask for an accessibility statement or audit result in the review, not just "have we tested it". For
customer-facing banking journeys, treat accessibility gaps the same as a functional defect, not a
polish item — many jurisdictions have legal requirements here (WCAG-referencing regulation), and
retrofitting late is expensive. Budget it into the estimate from the start, not the bug backlog.
:::

## Performance budgets

A **performance budget** is a numeric limit the team commits to and tests against: bundle size (e.g.
"no page ships more than 200KB of JavaScript"), time to interactive, or a Core Web Vitals threshold
(Largest Contentful Paint, Interaction to Next Paint, Cumulative Layout Shift — Google's current
metric set as of recent years; check the current names before quoting them, they have been renamed
before). Without a budget, bundle size only ever grows, because every added dependency looks small in
isolation.

:::engineer
```bash
# most bundlers can report bundle size and flag regressions in CI
npx vite-bundle-visualizer     # or webpack-bundle-analyzer, depending on the toolchain
```
CI can fail a build if a bundle exceeds its budget, the same way a test failure blocks a merge. This
is the mechanical enforcement; the budget number itself is a product/engineering decision based on
target devices and networks.
:::

:::manager
Ask what device and network the performance budget is set for. "Works fine on my laptop on office
wifi" is not evidence for how it performs on a mid-range phone on mobile data, which is a real
segment of most banks' retail customers.
:::

## Why frontend estimates slip

This is the honest management section. Frontend estimates slip more consistently than backend
estimates on the same team, and it is rarely because engineers are bad at estimating. Recurring,
identifiable causes:

- **The mock-up only shows the happy path.** Loading, empty, error, partial-data and permission-denied
  states are each real work and are almost never in the design file. A screen with five states can
  easily be triple the effort of "make it look like the mock-up".
- **Cross-browser and cross-device variance is invisible until QA.** A layout that is correct in
  Chrome on a laptop can break in Safari on iOS, especially around forms, date pickers and anything
  using newer CSS. This is far less severe than a decade ago but not zero.
- **State interactions multiply.** Two independent booleans are four states to handle; five are
  thirty-two. Complex forms and multi-step flows grow combinatorially, not linearly.
- **Shared components create hidden coupling.** Changing a component used in twelve places requires
  checking all twelve, even if the ticket only mentions one.
- **Design changes mid-build cost more than backend equivalents**, because visual and interaction
  decisions are easier for stakeholders to react to and revise once they see something real, and
  frontend is usually what stakeholders see first.

:::manager
Two things you can act on directly: (1) require every design handed to engineering to specify
loading/empty/error states, not just the happy path — this alone closes a large share of the gap; (2)
treat "the design changed after the ticket was estimated" as a re-estimate trigger, not scope creep
to be absorbed silently. Both are cheap process changes with a real effect on slip.
:::

## What good looks like

A review checklist for a frontend component or screen before it is called done:

- Every fetch has loading, error and empty states designed and implemented, not just success.
- State is categorised: what is local, what is server state (with a caching/staleness strategy), what
  belongs in the URL.
- Re-renders have been profiled for any list or table with non-trivial row counts.
- Keyboard navigation works end to end; interactive elements are native HTML elements or have the
  correct ARIA role; an automated a11y check runs in CI.
- The bundle size change for this feature is known and within budget.
- The component's tests cover more than the happy path: at least one failure and one boundary case.

## Exercises

::::exercise{id=ex-slow-list type=scenario title="The team reports a slow transaction list"}
A team tells you the transaction list screen "feels slow" after a recent change that added a new
column showing a running balance, computed client-side from all prior transactions. What do you ask,
and what are the two or three most likely causes given the description?
:::solution
Likely causes, in order of probability given "computed client-side from all prior transactions": (1)
the running-balance computation is O(n²) or otherwise re-computed from scratch on every render instead
of incrementally or memoised — ask if it is wrapped in `useMemo` keyed on the transaction list; (2)
adding the column caused every row to re-render on any state change elsewhere on the page, because the
row component is not memoised (`React.memo`) or because a new array/object reference is created every
render; (3) less likely but worth ruling out — the balance calculation was moved to the client from a
backend that used to provide it directly, turning a network cost into a CPU cost on every device,
including low-end ones. Ask to see the React DevTools profiler output before accepting any fix; it
will show which of these it actually is in under a minute.
:::
::::

::::exercise{id=ex-a11y-review type=reflect title="Retrofitting accessibility"}
Your team ships a payments dashboard built without accessibility in mind eighteen months ago. Legal
now requires it to meet WCAG 2.1 AA. Why is this materially more expensive now than if it had been
built in from the start, and what would you ask an engineering lead to do first?
:::
::::
