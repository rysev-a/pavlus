# Signals

## Mental model

A **signal** is a box holding a value. Reading the box inside a *computation* (a `computed`, an `effect`, or a DOM binding) records "this computation depends on this box". Writing the box schedules exactly those computations to run again. That is the whole model.

```ts
import { signal, computed, effect } from "maximus";

const count = signal(0);          // create
count();                          // read (tracked when inside a computation)
count.set(1);                     // write
count.update((n) => n + 1);       // write from the previous value
count.peek();                     // read without subscribing

const double = computed(() => count() * 2); // derived, lazy, cached
const stop = effect(() => {                 // side effect
  document.title = `n=${count()}`;
  return () => { /* runs before the next run and on stop */ };
});
```

There are three kinds of nodes:

| node | runs when | use for |
| --- | --- | --- |
| `signal` | never (it is a source) | state |
| `computed` | **read**, and only if a source really changed | derived values (pure) |
| `effect` | after sources changed (see [when effects run](#when-do-effects-run)) | the outside world: DOM, timers, storage, logging |

DOM bindings in templates are effects too (`renderEffect`), with one extra guarantee: they run *before* user effects in a flush, so your effects always see an up-to-date DOM.

Dependencies are re-collected on every run. A branch that is not taken is not subscribed:

```ts
effect(() => {
  if (enabled()) console.log(value()); // when `enabled` is false, `value` is not a dependency
});
```

### Equality

`set` with an equal value (`Object.is`) notifies nobody. Customise with `signal(v, { equals })`: a function `(a, b) => boolean`, or `false` to always notify (needed when you mutate an object in place and then call `set(sameObject)`).

```ts
const list = signal<number[]>([], { equals: false });
list().push(1);
list.set(list()); // notifies even though it is the same array
```

A computed whose new value equals its old one stops propagation: effects downstream do not re-run.

## Glitch-freedom

In a diamond `a -> b, a -> c, (b, c) -> d`, `d` never observes `b` updated and `c` stale.

```ts
const a = signal(1);
const b = computed(() => a() + 1);
const c = computed(() => a() * 10);
effect(() => console.log(b(), c()));  // logs "2 10"
a.set(2);                             // logs "3 20" once, never "3 10"
```

How: a write marks direct observers *dirty* and everything further downstream *check*. Computeds are pulled lazily: a `check` node first refreshes its sources and re-runs only if one of them really changed. Effects are queued and run after the write completes, ordered by creation id (parents before children), so a parent that re-runs disposes its old children before they get a chance to run on stale data.

## Batching

Several writes should produce one round of updates:

```ts
batch(() => {
  first.set("Ada");
  last.set("Lovelace");
}); // dependents run once, here, with both new values
```

`batch` nests; the flush happens when the **outermost** batch ends. Event handlers registered with `@event` are already wrapped in a `batch` (and untracked), so after `button.click()` returns, the DOM is current.

Reading a `computed` inside a batch always gives a fresh value; it is only *effects* that wait.

## untrack and peek

`untrack(fn)` runs `fn` without subscribing the current computation to what it reads. `signal.peek()` does the same for one signal.

```ts
effect(() => {
  const q = query();                       // tracked: re-run when the query changes
  const page = untrack(() => pageSignal()); // not tracked
  load(q, page);
});
```

Use it to break feedback loops: an effect that writes a signal it also reads re-triggers itself. After 1000 rounds in one flush Maximus aborts with `effect cycle detected`.

## When do effects run?

This is the part to know precisely. Three situations:

1. **First run.** `effect(fn)` called at top level (no `batch`, no `render`, no flush in progress) runs `fn` **synchronously, immediately**, once. Called *inside* a `batch`, a `render`, or while a flush is running, the first run is **deferred to the end of that**. This is why `effect` and `onMount` inside a component see attached DOM: `render` wraps the first render in a batch and flushes after the nodes are in the container.
2. **Later runs.** A write queues the dependent effects. They run in a **microtask**, or **synchronously at the end of the outermost `batch`** (so event handlers leave the DOM current), or whenever you call `flushSync()`.
3. **Ordering inside a flush.** Render effects (DOM bindings) first, then user effects, each queue ordered by creation. A flush repeats until nothing is queued.

```ts
const n = signal(0);
effect(() => console.log("n =", n()));  // prints "n = 0" now, synchronously
n.set(1);                               // nothing printed yet
await tick();                           // prints "n = 1" (microtask flush)

batch(() => { n.set(2); n.set(3); });   // prints "n = 3" when the batch ends
n.set(4); flushSync();                  // prints "n = 4" right now
```

| API | meaning |
| --- | --- |
| `flushSync()` | run everything queued now. Ignored if already flushing or inside a `batch` |
| `tick()` | a promise that resolves after the next flush (`Promise.resolve().then(flushSync)`) |
| `renderEffect(fn)` | like `effect` but always runs first and synchronously at creation; used by DOM bindings |
| `onMount(fn)` | `effect(() => untrack(fn))`: runs once, after the current render/batch; the returned function is a cleanup |

Unhandled errors: an effect that throws on its **first** run throws from `effect()`. A later failing run is reported from `flushSync` *after* the queue has drained, so one broken effect does not stop others. See [ownership: errors](./ownership.md#errors).

## Rules of thumb

- Derive with `computed`, not with an effect that writes another signal.
- Computeds are pure: writing a signal inside one throws. Reading through `untrack` is fine.
- A computed stays subscribed to its sources until its owner is disposed. Create computeds inside the component or `root` that uses them; a global computed nobody reads keeps listening for the lifetime of its sources.
- Do not destructure props or signal values in a component body and expect updates: `const { title } = props` reads once. Read where you use (`() => props.title`).
- Async code loses the tracking context after `await`. Read signals before the `await`, or wrap the continuation (`runWithOwner`, see [ownership](./ownership.md)).
