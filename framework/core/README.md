# @pavlus/core

The isomorphic heart of [pavlus](../..): everything that must run identically
in a browser, in Node and in a worker.

- `types.ts` — the whole contract: `Message`, `Effect`, `Plugin`,
  `PluginContext`, `AppFn`.
- `app.ts` — `createApp`: the queue, one call to the app, effects to plugins,
  `onState` on state changes. `App.perform(effect)` applies one effect
  directly (mounting, devtools, tests).
- `handler.ts` — `toHandler`: a function is used as-is, an object with a
  `dispatch(message, state)` method (a frontend component, a backend
  controller) is wrapped structurally — neither package imports the other.
- `store.ts` — the pure store half: `Path`, `StoreEffect`, `StoreChange`,
  `getIn`, `applyChange`.

The frontend package (`@pavlus/frontend`) adds `mount` on top of `createApp`
and the stateful store plugin; the backend package (`@pavlus/backend`) adds
the per-request runtime and its server plugins. Both depend on this one, and
application code that only needs the contract can depend on it directly.
