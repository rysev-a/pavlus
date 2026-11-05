# Testing

`maximus/testing` ships with the package. It works with any DOM (jsdom, happy-dom, a browser) and any runner; the examples use vitest with `environment: "jsdom"`.

```ts
// vite.config.ts
export default { test: { environment: "jsdom" } };
```

## API

| function | what it does |
| --- | --- |
| `mount(fn, { container? })` | renders `fn()` into a fresh `<div>` in `document.body` (or your container); returns `Mounted` |
| `Mounted.query(sel)` / `queryAll(sel)` | `querySelector` that **throws** with the current HTML when nothing matches / array of matches |
| `Mounted.text()` / `html()` | `textContent` / `innerHTML` without the framework's marker comments |
| `Mounted.unmount()` | disposes the render root and removes the container |
| `cleanup()` | unmounts everything mounted so far; call it from `afterEach` |
| `flush(ticks = 3)` | `async`: runs pending effects, lets promise continuations settle, runs effects again |
| `fire(el, type, init?)` | dispatches a bubbling, cancelable event of the right class; `value` / `checked` in `init` are assigned to the element first; returns the event (check `defaultPrevented`) |
| `waitFor(fn, { timeout = 1000, interval = 10 })` | retries `fn` until it returns without throwing (and not `false`); returns its value |

## A first test

```ts
import { afterEach, expect, it } from "vitest";
import { html, signal } from "maximus";
import { cleanup, fire, flush, mount } from "maximus/testing";

afterEach(cleanup);

it("counts", async () => {
  const count = signal(0);
  const t = mount(() => html`<button @click=${() => count.update((n) => n + 1)}>${count}</button>`);
  t.query("button").click();
  await flush();
  expect(t.text()).toBe("1");
});
```

Because event handlers are batched, the DOM is already current right after `click()` returns; `await flush()` is needed when the update goes through a microtask (a signal written from a promise, an effect chain, a timer you advanced).

## Events

```ts
fire(input, "input", { value: "ada" });             // sets input.value, dispatches InputEvent
fire(input, "keydown", { key: "Enter" });           // KeyboardEvent
fire(form, "submit").defaultPrevented;              // true when the handler used .prevent
fire(checkbox, "change", { checked: true });
```

Delegated handlers only fire for **connected** elements; `mount` always attaches to the document so this is automatic. If you render into a detached container yourself, use `@event.direct` or attach it.

## Timers and async

Use fake timers from your runner and flush after advancing:

```ts
vi.useFakeTimers();
await vi.advanceTimersByTimeAsync(300);
await flush();
```

For real async: `await waitFor(() => expect(t.text()).toBe("loaded"))`. It calls `flushSync` on each attempt.

## Leak tests

`debugStats()` returns `{ owners, links }`, live counters. After disposal they must return to their starting value:

```ts
import { debugStats, root } from "maximus";

it("does not leak", () => {
  const before = debugStats();
  const t = mount(() => App());
  t.unmount();
  expect(debugStats()).toEqual(before);
});
```

`subscriberCount(signal)` gives the number of observers of one signal.

## Testing logic without the DOM

Signals, computeds, effects and stores need no DOM:

```ts
const a = signal(1);
const double = computed(() => a() * 2);
a.set(2);
expect(double()).toBe(4);            // computed is pull-based: always fresh when read
```

Effects run on a microtask after a write; use `flushSync()` or `await tick()` to force them.

## Testing error handling

```ts
const t = mount(() => errorBoundary((err) => html`<p>failed: ${String(err)}</p>`, () => Broken()));
expect(t.text()).toContain("failed");
```

The recipes in this directory are all tested with these helpers: see `recipes/recipes.test.ts`.
