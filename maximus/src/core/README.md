# maximus/core

Fine-grained reactivity and ownership. No DOM, no dependencies.

```ts
import { signal, computed, effect, batch, untrack, root, onCleanup } from "maximus/core";
```

## Signals, computeds, effects

```ts
const count = signal(0);
count(); // read (subscribes the running computation)
count.set(1);
count.update((n) => n + 1);
count.peek(); // read without subscribing

const double = computed(() => count() * 2); // lazy, cached, glitch-free

const stop = effect(() => {
  console.log(count(), double());
  return () => console.log("cleanup before next run / on stop");
});
```

What you can rely on:

- **Glitch-free.** In a diamond (`a -> b, c -> d`) `d` runs once per change of `a` and never sees `b` new and `c` old.
- **No unnecessary work.** `signal.set` with an equal value (`Object.is`, or your `equals` option, or never with `equals: false`) notifies nobody; a computed whose new value equals the old one stops propagation, so effects downstream do not re-run.
- **Dynamic dependencies.** Dependencies are re-collected on every run: a branch not taken is not subscribed.
- **Ordering.** Effects run after the batch, ordered by creation (parents before children), so a parent that re-runs disposes its old children before they can run again.
- **Cycles fail loudly.** A computed that reads itself throws `circular dependency detected`; effects that keep re-triggering each other abort after 1000 rounds with an `effect cycle` error; writing a signal inside a computed throws.

### When do effects run?

| situation | when the effect runs |
| --- | --- |
| `effect(fn)` called at top level | `fn` runs **immediately**, once |
| `effect(fn)` called inside a `batch`, a `render`, or another effect's flush | first run is **deferred** to the end of it (so `onMount`-style code sees attached DOM) |
| a signal it read is written | queued; runs in a **microtask**, or right away at the end of the enclosing `batch` |
| `flushSync()` | runs everything queued now (re-entrant calls from inside an effect are ignored) |

`await tick()` resolves after the next flush. `renderEffect(fn)` is the same as `effect` but always runs first and synchronously at creation, and its updates run **before** user effects in a flush; the DOM layer uses it for bindings, so user effects always observe an up-to-date DOM.

```ts
batch(() => {
  a.set(1);
  b.set(2);
}); // dependents run once, here
untrack(() => a()); // read without subscribing
```

## Ownership

Every effect, computed, provider, error catcher and `root` is an **owner**. Disposing an owner disposes its children (first), then runs its cleanups in reverse order. Re-running an effect disposes what the previous run created. So there is nothing to unsubscribe by hand:

```ts
const dispose = root((dispose) => {
  effect(() => {
    const timer = setInterval(tick, 1000);
    onCleanup(() => clearInterval(timer));
  });
  return dispose;
});
dispose(); // effect stopped, interval cleared
```

- `root(fn)` makes a **detached** scope (it is not disposed with the surrounding owner) that still sees the surrounding context and error handlers.
- `getOwner()` / `runWithOwner(owner, fn)` carry ownership across `await` or callbacks: capture the owner synchronously, restore it later. `runWithOwner` runs untracked and routes thrown errors to the owner's handlers.
- `onCleanup(fn)` registers on the current owner (ignored when there is none).
- `onMount(fn)` runs once, untracked, after the current render/batch.

### Context

```ts
const Theme = createContext<"light" | "dark">("light");
Theme.provide("dark", () => view()); // everything created inside sees "dark"
Theme.use(); // nearest provided value, or the default; needs an active owner
```

Context rides on the owner tree, so it reaches effects and components created later (by `show`, `each`, ...) under the provider. After an `await`, use `runWithOwner`.

### Errors

```ts
catchError(() => risky(), (err) => report(err));
```

`catchError` runs `fn` in a new owner that carries the handler. A synchronous throw is passed to the handler (and the partial result is disposed); an error thrown later by any effect, event handler or cleanup created under it is routed to the **nearest** handler up the owner chain. A handler that throws escalates to the next one up. With no handler, the error is thrown: synchronously for an effect's first run, from `flushSync` (after the queue drained, so other effects still ran) otherwise. `errorBoundary` in `maximus/dom` is built on this.

## Suspense hook for async primitives

`registerPending(promise)` tells the nearest `suspense()` boundary that something is loading; `useSuspense()` returns its context (`{ register, pending }`) or `null`. Wave 2's `resource` and `lazy` use it. Rejections are not observed by the boundary: the resource surfaces its own error.

## Diagnostics and devtools

- `subscriberCount(signalOrComputed)` and `debugStats()` (`{ owners, links }` live counters) exist for leak tests: after `dispose()`, `debugStats()` returns to its previous value.
- `globalThis.__MAXIMUS__` is the devtools hook. With no listener nothing is allocated or emitted. `installDevtools().on(fn)` subscribes to `signal:write`, `computed:update`, `effect:run`, `owner:create`, `owner:dispose`, `error` (and `mount`/`unmount` from the DOM layer), each with an owner `path` of names (`createOwner(parent, "name")` names one). `signal(v, { name })` names signals.

## Notes and limits

- A computed is subscribed to its sources for as long as its owner lives. Create computeds inside the component/root that uses them (or dispose the root); a global computed that nobody reads keeps listening.
- Computeds are pure: reading or writing signals through `untrack` is allowed, creating effects inside is allowed (they are owned and re-created on re-run), writing tracked signals throws.
