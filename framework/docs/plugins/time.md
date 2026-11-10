# time

Everything about time: the clock, timeouts and intervals. Application code
cannot call `Date.now()` or `setTimeout` (that would make it impure), so it asks
this plugin, and the answer comes back as a message. Every timer has an **id**
and can be restarted or cancelled by it.

```ts
import {
  createTimePlugin,
  timeEffector as time,
} from "@pavlus/client/plugins/time";

createApp({ app, plugins: [store, createTimePlugin()] });
```

## Effectors

```ts
time.now("clock.read")                           // → message clock.read, payload = ms since epoch
time.setTimeout("search", 300, "searchFire", q)  // fire once after 300 ms
time.setInterval("poll", 5000, "tick")           // fire every 5 s
time.cancel("search")                            // stop one timer
time.cancelAll()                                 // stop every timer
```

| Effect | Fields | Meaning |
|---|---|---|
| `now` | `replyTo` | Reply with the current time. |
| `setTimeout` | `id`, `ms`, `replyTo`, `payload?` | Send `replyTo` once, after `ms`. |
| `setInterval` | `id`, `ms`, `replyTo`, `payload?` | Send `replyTo` every `ms`. |
| `cancel` | `id` | Stop timer `id` (a timeout or an interval). |
| `cancelAll` | | Stop every timer. |

### Messages sent back

| Effect | Message |
|---|---|
| `now` | `{ id: replyTo, payload: <ms since epoch, a number> }` |
| `setTimeout` | `{ id: replyTo, payload }` once; the timer is then forgotten |
| `setInterval` | `{ id: replyTo, payload }` on every tick |

## Debouncing

Starting a timer with an id that is already running **cancels the running
one**. That is a debounce with no state in the application:

```ts
searchInput: (msg) => [
  store.set("search", msg.event?.value ?? ""),
  time.setTimeout("search", 300, "searchFire", msg.event?.value),   // restarts on every key
],
searchFire: (msg) => [http.request({ id: "search", url: `/api/users?q=${msg.payload}`, onSuccess: "found", onError: "failed" })],
```

While the user keeps typing, each key replaces the timer, so `searchFire` only
arrives 300 ms after the last one.

## "The time" in a pure function

Never read the clock in application code. To stamp something, ask for the time
and finish the work when the answer arrives:

```ts
save: () => [time.now("save.stamped")],
"save.stamped": (msg, state) => [store.set("draft.savedAt", msg.payload)],
```

The same message log then always gives the same effects.

## Plugin API and options

```ts
const plugin = createTimePlugin({
  now,            // default Date.now
  setTimeout, clearTimeout, setInterval, clearInterval,   // default: the globals
});
plugin.active();  // ids of timers running now
```

`dispose()` stops every timer.

## In tests

Pass a fake clock, or use `vi.useFakeTimers()` with the defaults:

```ts
vi.useFakeTimers();
app.dispatch({ id: "type", payload: "a" });
vi.advanceTimersByTime(50);
app.dispatch({ id: "type", payload: "ab" });    // restarts the timer
vi.advanceTimersByTime(300);                     // only "ab" fires
```
