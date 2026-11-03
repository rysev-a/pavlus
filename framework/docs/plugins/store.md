# store

Holds the **application state** and a history of every change to it. It is the
only plugin the core asks for the state: `app(message, state)` receives the
store's current value, and when it changes the other plugins are told (the DOM
plugin re-renders).

```ts
import {
  createStorePlugin,
  storeEffector as store,
} from "@service-laboratory/pavlus/plugins/store";

const plugin = createStorePlugin({ user: { name: "Ann" }, todos: [] });
createApp({ app, plugins: [plugin /* , ... */] });

plugin.getState();   // the current state
plugin.history;      // every recorded change
```

## Effectors

```ts
store.set("user.name", "Bob")            // set a value, creating missing parents
store.merge("user", { age: 30 })         // shallow-merge into an object
store.remove("user.age")                 // remove a value or array element
store.undo()                             // revert the last change
store.undo(3)                            // revert the last 3
store.restoreTo(timestamp)               // revert everything after a time
```

| Effect | Fields | Meaning |
|---|---|---|
| `set` | `path`, `value` | Set the value at `path`. A root `path` (`""` or `[]`) replaces the whole state. |
| `merge` | `path`, `value` | Shallow-merge `value` into the object at `path` (an absent or non-object target becomes `{}` first). |
| `remove` | `path` | Remove the value. For an array element the array shrinks (later items shift). Removing something that is not there changes nothing. |
| `undo` | `steps?` | Revert the last `steps` (default 1) recorded changes, newest first. |
| `restoreTo` | `timestamp` | Revert recorded changes while the newest one is later than `timestamp`. |

A **path** is a dotted string (`"user.name"`, `"todos.0.done"`) or an array
(`["todos", 0, "done"]`). Numeric segments index arrays.

The store sends no messages back.

## State is immutable

Every change builds new objects along the path and **keeps the rest
identical** (structural sharing). Untouched branches are the same references,
so the compiled `diff` can skip them with a single `===`. Setting a value to
what it already is changes nothing and records nothing.

> Never mutate the state in place. The store (and `diff`) rely on `===`; an
> in-place mutation is invisible to them.

## History and `restoreEffect`

Each change is recorded as

```ts
{ timestamp, effect, restoreEffect }
```

`restoreEffect` is the effect that, applied to the state after `effect`,
brings back the state before it. It is computed when the change is applied:

| Change | `restoreEffect` |
|---|---|
| set/merge over an existing value | `set` of the old value |
| set/merge that created new keys | `remove` of the topmost key it created |
| change that adds or removes an **array element** | `set` of the whole old array (indices shift, so restoring one element would be wrong) |

`undo` and `restoreTo` apply `restoreEffect`s without recording anything, so
undoing never grows the history. History is capped (`maxHistory`, default
1000); the oldest entries are dropped first.

```ts
store.set("user", null)
// history[0].restoreEffect  →  store.set("user", { name: "Ann" })
```

## Plugin API and options

```ts
createStorePlugin(initial, {
  now: () => number,     // clock for timestamps, default Date.now
  maxHistory: number,    // default 1000
})
```

`getState()`, `history` (read only). `getIn(state, path)` and
`applyChange(state, change)` are exported pure functions if you need to read a
path or apply a change yourself.

## In tests

```ts
let t = 0;
const plugin = createStorePlugin({ n: 0 }, { now: () => ++t });
plugin.handle(store.set("n", 1), ctx);
plugin.handle(store.set("n", 2), ctx);
plugin.handle(store.restoreTo(1), ctx);   // back to n = 1
```
