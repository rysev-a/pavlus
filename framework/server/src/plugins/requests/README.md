# requests plugin

The state slice of the server (a `StatefulPlugin`; `createServerApp` adds it for you and uses it as the app state).

`state = { requests: { [rid]: {...} }, shared: {...}, ...yourState }`

- the runtime opens `state.requests[rid]` with the first message of a rid and drops it when the rid finishes
- effects (all `plugin: "requests"`, builders in `requestsEffector`): `req.set(path, value)`, `req.merge(obj, path?)`, `req.clear()`, `shared.set(path, value)`, `shared.merge(obj, path?)`, `state.set(path, value)` (root, for your own keys), `dispatch(message)` (re-dispatch with the effect's ctx), `done()` (declare the request finished: dispatches `request.done`)
- `req.*` ignore a rid without a slice, so a late effect of a finished request cannot resurrect it
- `applyRequestsEffect(state, effect)` is the pure transition (the `flow` test helper uses it)
