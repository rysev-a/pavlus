# Ownership

Every effect, computed, event listener, provider, error catcher and `root` is an **owner**, and owners form a tree. Disposing an owner disposes its children first, then runs its own cleanups in reverse registration order. Re-running an effect disposes whatever the previous run created.

The result: nothing needs to be unsubscribed by hand, and leaks are structurally hard.

```ts
import { root, effect, onCleanup } from "maximus";

const dispose = root((dispose) => {
  effect(() => {
    const timer = setInterval(tick, 1000);
    onCleanup(() => clearInterval(timer)); // runs before the next run and on dispose
  });
  return dispose;
});
dispose(); // effect stopped, interval cleared
```

## The tree

```
render() root
 └─ Counter component's owner
     ├─ binding effect (text node)
     ├─ binding effect (class)
     ├─ event listener (cleanup unregisters it)
     └─ show() region
         └─ branch owner  (rebuilt when truthiness flips; old one disposed)
             └─ ...
```

- `render(fn, container)` creates a root and returns its `dispose`, which removes the nodes too.
- `show`, `match`, `each` (per row) and `errorBoundary` create child owners per branch/row; leaving a branch or removing a row disposes everything beneath it, including listeners and `onCleanup` callbacks.
- `root(fn)` is **detached**: it is not disposed when the surrounding owner is, but it still resolves context and error handlers through its lookup parent. Use it for long-lived things created from inside something short-lived.

## Cleanup

`onCleanup(fn)` registers on the current owner (and is ignored when there is none, so call it where an owner exists: component bodies, effects, `root`). Typical uses are timers, observers, sockets, global listeners:

```ts
function Clock() {
  const now = signal(Date.now());
  const id = setInterval(() => now.set(Date.now()), 1000);
  onCleanup(() => clearInterval(id)); // component body: owned by wherever Clock is rendered
  return html`<time>${() => new Date(now()).toLocaleTimeString()}</time>`;
}
```

A throwing cleanup does not stop the others; the first error goes to the parent's error handler.

For leak tests, `debugStats()` returns live `{ owners, links }` counters, and `subscriberCount(signal)` the number of observers. After `dispose()` the counters return to their previous values; see [testing](../testing.md#leak-tests).

## Crossing async boundaries

The current owner is ambient state, set while code runs synchronously. After an `await`, a timer callback or an event it is gone. Capture and restore:

```ts
function Loader() {
  const owner = getOwner();           // capture synchronously
  fetch("/api").then((res) => {
    runWithOwner(owner, () => {       // restore: context, cleanup and errors work again
      onCleanup(() => {/* ... */});
      const theme = Theme.use();
    });
  });
}
```

`runWithOwner` runs untracked and routes anything thrown to the owner's error handlers.

## Context

Context rides on the owner tree, so it reaches effects and components created later under the provider.

```ts
import { createContext } from "maximus";

const Theme = createContext<"light" | "dark">("light");

Theme.provide("dark", () => App()); // everything created inside sees "dark"
const theme = Theme.use();          // nearest provided value or the default; needs an active owner
```

Context values are not reactive by themselves. To make one reactive, provide a signal: `createContext<Signal<Theme>>(...)`. The [dark mode recipe](../recipes.md#6-dark-mode-with-context) shows this.

## Errors

```ts
import { catchError } from "maximus";

const view = catchError(() => risky(), (err) => report(err));
```

`catchError` runs `fn` in a new owner that carries the handler.

- A **synchronous throw** from `fn` is passed to the handler and the partially built result is disposed.
- An error thrown **later** by an effect, an event handler, or a cleanup created under it is routed to the **nearest** handler up the owner chain.
- A handler that throws escalates to the next handler up.
- With **no handler**, the error is thrown: synchronously for an effect's first run, otherwise from `flushSync` (after the queue drained).

`errorBoundary(fallback, view)` in `maximus/dom` is built on `catchError`; it adds `reset()`, handles sync render errors in the same pass (no empty flash), and also catches event-handler errors. Template safety violations (`onclick=`, `javascript:` URLs) are thrown as ordinary errors and land there too.

## Named owners and devtools

`createOwner(parent, "name")` makes a named owner; `signal(v, { name })` names a signal. Names appear in the `path` of devtools events (`globalThis.__MAXIMUS__`, see `installDevtools`). With no listener nothing is allocated.
