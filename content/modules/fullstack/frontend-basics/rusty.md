---
title: "Frontend Basics — jQuery to components, refreshed"
estimatedMinutes: 18
objectives:
  - "Map jQuery-era patterns onto their component-era equivalents"
  - "Name the tooling shifts since roughly 2015 that changed how frontend teams work"
  - "Spot the three mistakes experienced-but-rusty engineers make reviewing modern frontend code"
status: ready
---

You shipped real UI with jQuery, maybe some Backbone or plain server-rendered templates (JSP, ASP,
PHP). The underlying browser model has not changed: HTML, CSS, JS, DOM, events. What changed is the
architecture wrapped around it. This is the fast version.

## What you probably remember

| Concept | One-line anchor |
| --- | --- |
| jQuery selection | `$('#id')` finds a DOM element already rendered by the server, then you mutate it. |
| Page-at-a-time | Each URL is a full server-rendered HTML page; navigation is a full reload. |
| AJAX | `$.ajax(...)` fetches data and patches a fragment of the existing page without reloading it. |
| Event delegation | `$('table').on('click', 'tr', fn)` to handle clicks on rows added later. |
| Global state | Usually a handful of global variables or data attributes stashed on DOM nodes. |
| CSS | Hand-written stylesheets, specificity wars, `!important` as a last resort. |

## What changed since

:::callout{kind=changed-since title="The unit of work: page → component (roughly 2013 onward)"}
React (2013), and later Vue and Angular's modern versions, replaced "the server renders a page, JS
patches it" with "JS owns the render of a component tree, describing UI as a function of state." You
no longer select an existing element and mutate it — you change state and let the framework redraw.
Direct DOM manipulation (`$('#balance').text(newValue)`) is now confined to framework internals or
escape hatches (`ref`s), not everyday code.
:::

:::callout{kind=changed-since title="Package management and bundling (npm era, mature by ~2015-2018)"}
Frontend dependencies are managed like backend ones now: `package.json`, a lockfile, `npm`/`pnpm`/
`yarn install`. A bundler (webpack historically; Vite/esbuild/Turbopack more recently, mainstream from
around 2021) combines and transpiles source into what a browser can run. There is no equivalent of
"just include jquery.js with a script tag" for a real application anymore, though CDN script tags
still work for simple pages.
:::

:::callout{kind=changed-since title="TypeScript is now the default for serious frontend work"}
Static typing over JavaScript, mainstream in frontend since roughly 2018-2020. Catches an entire
category of "undefined is not a function" bugs at build time instead of in production. Expect most
new codebases you review to be TypeScript, not plain JavaScript.
:::

:::callout{kind=changed-since title="Server-state libraries replaced hand-rolled AJAX caching"}
Where jQuery-era code called `$.ajax` per interaction with no shared cache, current code typically
uses a server-state library (TanStack Query, SWR) or a meta-framework's built-in data layer (Next.js,
Remix) to cache, dedupe and invalidate requests centrally. See the Intermediate lesson for what this
buys you.
:::

:::callout{kind=changed-since title="Meta-frameworks and rendering strategy"}
Where a page's HTML is generated is now an explicit architectural choice, not a given: client-side
rendering (the old React default, ship a blank HTML shell and JS builds the page), server-side
rendering (render HTML per request, closer to the old model but with a component framework), and
static generation (render at build time) are all live options, chosen per page based on SEO,
performance and data freshness needs. Frameworks like Next.js, Remix and Astro exist specifically to
manage this choice. If a team says "we render server-side", ask whether they mean the old page-per-
request model or SSR-of-a-component-tree — they look similar in the network tab but are built very
differently.
:::

:::engineer
```jsx
// jQuery era: find it, mutate it
$('#balance').text(formatMoney(newBalance));

// Component era: change state, framework redraws
const [balance, setBalance] = useState(0);
setBalance(newBalance);
// ... elsewhere in the same component's return: <span>{formatMoney(balance)}</span>
```
:::

:::manager
The practical review implication: if a design doc talks about "which page does X" the way you would
have in 2010, ask for the component breakdown instead. Team structure and code ownership now usually
follow component boundaries and shared libraries ("design systems"), not URL routes.
:::

## Gotchas that still bite

- **Reaching for direct DOM manipulation out of habit.** `document.getElementById` inside a React
  component to "just fix" something is almost always a sign the state model is being bypassed, and it
  will get silently overwritten on the next re-render.
- **Global mutable state as a reflex.** The instinct to stash a value somewhere globally (a module-
  level variable, `window.foo`) reappears under pressure. It breaks the same way it always did, just
  inside a component tree instead of a page.
- **Assuming "it renders once, like a page load."** Components re-render repeatedly in response to any
  state change anywhere above them in the tree. Code with a side effect in the render body (not inside
  `useEffect`) that assumed "this runs once" causes duplicate network calls or worse.
- **Not accounting for the states a jQuery-era screen never had to show explicitly** — a
  server-rendered page arrived fully formed or with a spinner GIF; a component-era screen has
  loading/error/stale states as first-class, testable states. Reviewers who skip past them because
  "the page loads fine" miss real gaps.
- **CSS specificity fights are mostly gone in component-scoped styling** (CSS Modules, styled-
  components, Tailwind), but a codebase mixing old global stylesheets with new scoped ones can still
  produce the exact bugs you remember. Ask which model a given codebase actually uses.

:::callout{kind=bank-context}
If you are reviewing a modernisation business case ("rewrite the jQuery frontend"), the real
justification is rarely "jQuery is old" — it still works and is still maintained. The justification is
usually maintainability at team scale (component reuse, typed contracts, testability) and the talent
market (harder to hire for large unstructured jQuery codebases than for React/Vue/Angular). Ask for
that argument explicitly rather than accepting "modernise" as self-justifying.
:::

## Ten-minute drill

::::exercise{id=ex-migrate-snippet type=code title="Read the component-era equivalent"}
Here is jQuery-era code that shows/hides a "reverse payment" confirmation and disables the button
while the request is in flight. Describe, in prose or JSX, the component-era equivalent: what state
variables exist, and what triggers each transition.

```javascript
$('#reverse-btn').on('click', function () {
  $('#confirm-dialog').show();
});
$('#confirm-yes').on('click', function () {
  $('#reverse-btn').prop('disabled', true);
  $.post('/api/reverse', { id: paymentId }, function () {
    $('#confirm-dialog').hide();
    $('#reverse-btn').prop('disabled', false);
    location.reload();
  });
});
```
:::solution
State: `confirming` (boolean, dialog visibility), `submitting` (boolean, request in flight). No
manual DOM show/hide or `disabled` attribute juggling — the button's `disabled` prop and the dialog's
presence are both derived directly from state.

```jsx
function ReverseButton({ paymentId, onReversed }) {
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function confirm() {
    setSubmitting(true);
    await postReverse(paymentId);
    setSubmitting(false);
    setConfirming(false);
    onReversed();                 // caller re-fetches or updates state; no full page reload
  }

  return (
    <>
      <button disabled={submitting} onClick={() => setConfirming(true)}>Reverse</button>
      {confirming && <ConfirmDialog onConfirm={confirm} disabled={submitting} />}
    </>
  );
}
```
Note there is no `location.reload()` equivalent — the parent is told via `onReversed` to update its
own state (or invalidate a server-state query), so only the affected part of the UI redraws. A full
reload inside component-era code is almost always a bug, not a shortcut.
:::
::::
