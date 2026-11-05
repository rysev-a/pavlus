# Stores

A **store** is a deeply reactive plain object. Where a signal holds one value, a store holds a tree, and tracks reads and writes per property, so `state.user.name = "b"` updates only the bindings that read `user.name`.

```ts
import { createStore, produce, reconcile, unwrap } from "maximus";

const state = createStore({ user: { name: "a" }, todos: [] as { id: number; text: string }[] });

effect(() => console.log(state.user.name)); // subscribes to user.name only
state.user.name = "b";                      // logs "b"
state.todos.push({ id: 1, text: "x" });     // does not wake the effect above
```

## How it works

- `createStore(obj)` returns a `Proxy`. The object you pass is the **backing storage, not a copy**: mutate it only through the proxy afterwards.
- A read inside a computation lazily creates one signal per object+key and subscribes to it. Reads outside a computation create nothing.
- Writing notifies exactly the readers of that key. Structure readers (`Object.keys`, `in`, `for...in`, spread, array `length`) are notified when keys are added or removed.
- Array mutators (`push pop shift unshift splice sort reverse fill copyWithin`) run batched and untracked.
- Only plain objects and arrays are made reactive. Class instances, `Date`, `Map`, `Set`, and frozen objects are stored as opaque values.
- Assigning a store proxy into a store stores the raw object (no proxy-in-proxy).

## produce

Several mutations as one batched step; returns the store:

```ts
produce(state, (s) => {
  s.todos.push({ id: 2, text: "y" });
  s.user.name = "c";
}); // effects run once
```

## reconcile

Replace data with a new snapshot by changing **only what differs**, which keeps rows and bindings of unchanged data alive:

```ts
reconcile(state.todos, serverTodos, { key: "id" }); // match array items by id
reconcile(state, nextState);
```

`target` is a store, an array or an object; `key` is a property name or a function. Use it for server responses and for undo/redo restores ([recipe](../recipes.md#8-undoredo-with-a-store)).

## unwrap

`unwrap(store)` returns the raw object behind a proxy (identity for anything else), for `structuredClone`, `JSON.stringify` of large data, or passing to code that must not see proxies. `isStore(v)` tests.

## Stores with lists

```ts
each(
  () => state.todos,
  (t) => t.id,
  (todo) => html`<li class=${() => (todo().done ? "done" : "")}>${() => todo().text}</li>`,
);
```

`item()` returns the store proxy of that element, so toggling `todo().done = true` re-runs only that row's class binding; `each` itself reconciles only when the array's structure changes.

## Signals vs stores

| | signal | store |
| --- | --- | --- |
| granularity | one value | one binding per property |
| update style | `set` / `update` (immutable) | assignment / mutators (mutable syntax) |
| best for | scalars, UI state, derived values | domain data: lists of records, nested forms |

Both can be mixed freely; a store property read inside `computed` is tracked like a signal.

## Caveats

- Do not mutate the original object after passing it to `createStore`; the proxy cannot see it.
- Reading a store outside a computation returns current values but does not subscribe.
- Computeds that read a store hold their subscriptions until their owner is disposed, like any computed.
