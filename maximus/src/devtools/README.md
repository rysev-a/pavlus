# maximus/devtools

Everything here is built on the one integration point of the runtime: `globalThis.__MAXIMUS__`. With no listener the runtime allocates nothing; `installDevtools()` is the listener.

```ts
import { devtools } from "maximus"; // or: import { installDevtools, devtoolsPanel } from "maximus/devtools"

const dt = devtools.installDevtools({ limit: 1000 });
const count = signal(0, { name: "count", debug: true }); // named, and time-travelable

count.set(1);
dt.timeline(); // [{ seq, time, type: "signal:write", name: "count", value: 1, prev: 0, path: [...] }, ...]
dt.snapshot(); // { owners: [tree], ownerCount, signals: { count: 1 }, seen, kept }
devtools.timeTravel().back(); // count is 0 again

document.body.append(devtools.devtoolsPanel()); // the overlay
```

(The root `maximus` entry exposes this module as the `devtools` namespace because `core` already exports a lower-level `installDevtools` that only installs the hook object.)

## Timeline

A bounded list (default 1000 entries, oldest dropped) of every event the runtime emits: `signal:write` (name, value, previous value), `effect:run`, `computed:update`, `owner:create`/`owner:dispose`, `mount`/`unmount` (from `render`), `error`, and anything else emitted on the hook, e.g. `router:*` events (their fields land in `entry.detail`). `entries()` is a reactive copy that is refreshed on a timer (default 50 ms) only while something reads it; `flush()` publishes at once. `pause()`, `resume()`, `clear()`, `onEntry(fn)` and a `filter` option (e.g. skip `computed:update`) keep it quiet. Name a signal with `signal(v, { name })` to see it by name; unnamed owners appear as `#id`.

## Snapshot

`snapshot()` walks the live owner tree: `{ id, name, kind: "owner" | "computed" | "render" | "effect", children }` per root, the latest value of every named signal written since installation, and counters. Owners created before `installDevtools()` are unknown (install it first thing).

## Time travel

Signals created with `{ debug: true }` record their writes (previous value and a setter travel on the event). `timeTravel()` gives `entries()`, `position()`, `back(n)`, `forward(n)`, `goto(position)`, `present()`, `canBack()`, `canForward()`. Going back sets each signal to the value it had before that write, in reverse order, so combined states are restored exactly; readers update through the normal reactive graph. Travelling does not add history; a new write while in the past drops the redo branch. Only `debug` signals travel: derived values follow, but state kept in plain variables, stores or the DOM does not.

## Panel

`devtoolsPanel()` returns a small fixed overlay (timeline, a time-travel slider, owner count). Its own effects run under an owner named `maximus-devtools`, which the recorder ignores, so the panel does not feed itself. It is an ordinary view: `render(() => devtoolsPanel(), host)` or `document.body.append(devtoolsPanel())`.
