# logger

Writes log entries to the console. Application code is pure, so even logging is
an effect.

```ts
import {
  createLoggerPlugin,
  loggerEffector as log,
} from "@pavlus/client/plugins/logger";

createApp({ app, plugins: [store, createLoggerPlugin()] });
```

## Effectors

```ts
log.debug("loading")
log.info("user removed", { id: 3 })      // the second argument is shown next to the message
log.warn("slow response", 2400)
log.error("could not save", error)
log.log("info", "same as log.info")      // level as an argument
```

| Effect | Fields | Meaning |
|---|---|---|
| `log` | `message`, `level?`, `data?` | Write an entry. `level` is `debug`, `info`, `warn` or `error`, default `info`. |

Entries go to the matching `console` method, `data` as a second argument when
present. The plugin sends no messages back.

## Logging every message of a component

`withLogging(component, label)` wraps a component and adds a `debug` entry for
each message it handles, with the payload and the effects it returned:

```ts
import { withLogging } from "@pavlus/client";

createApp({
  app: withLogging(dashboard, "dashboard"),
  plugins: [createStorePlugin(initialState), createLoggerPlugin()],
});
// [dashboard] users.select -> 1 effect(s)
```

The wrapper adds an effect, so the logger plugin must be in the list.

## Options

```ts
createLoggerPlugin({ sink })   // default: the global console
```

`sink` is an object with `debug`, `info`, `warn` and `error`.

## In tests

```ts
const calls: unknown[][] = [];
const plugin = createLoggerPlugin({ sink: { debug() {}, info: (...a) => calls.push(a), warn() {}, error() {} } });
plugin.handle(log.info("hi", 1), ctx);
expect(calls).toEqual([["hi", 1]]);
```
