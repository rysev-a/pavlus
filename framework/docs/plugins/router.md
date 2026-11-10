# router

URL routing on top of the History API. The application learns about the
location as messages and changes it with effects; it never reads
`window.location`.

```ts
import {
  createRouterPlugin,
  routerEffector as router,
} from "@pavlus/client/plugins/router";

createApp({ app, plugins: [store, createRouterPlugin()] });
```

## Effectors

```ts
router.listen("route.changed")                     // report the location now and on every change
router.navigate("/users?page=2#top")               // push a history entry
router.navigate("/login", { replace: true })       // replace the current entry
router.navigate("/login", { absolute: true })      // from a routed child: do not add its base
router.back()
router.forward()
```

| Effect | Fields | Meaning |
|---|---|---|
| `listen` | `onChange` | Start reporting. Replies immediately with the current location. |
| `navigate` | `url`, `replace?`, `absolute?` | Go to `url`. From a routed child (see [routing](../routing.md)) a url is relative to the child's base unless `absolute` is set. |
| `back` | | `history.back()` |
| `forward` | | `history.forward()` |

### Messages sent back

`{ id: onChange, payload: { path, search, hash } }`

```ts
// at https://example.com/users?page=2#top
{ path: "/users", search: "?page=2", hash: "#top" }
```

It is sent when `listen` is handled, after every `navigate`, and when the user
goes back or forward in the browser (`popstate`). Calling `listen` again
replaces the previous listener.

```ts
init: () => [router.listen("route.changed")],
"route.changed": (msg) => [store.set("route", msg.payload)],
```

Then a template can switch on the route (`if route.path === "/users"`).

## Notes

- `navigate` only reports the new location when a `listen` is active.
- `pushState` does not fire any event by itself; the plugin dispatches a
  `popstate` after `navigate` so the listener hears about it.
- The URL is not parsed beyond `path`, `search` and `hash`. Matching routes and
  reading query parameters is application logic (pure functions of
  `route`).

## Options

```ts
createRouterPlugin({ window })   // default: the global window
```

`dispose()` removes the `popstate` listener.

## In tests

Use jsdom, which has a working `history`:

```ts
const plugin = createRouterPlugin();
plugin.handle(router.listen("route"), ctx);
plugin.handle(router.navigate("/users#top"), ctx);
// ctx.dispatch received { path: "/users", search: "", hash: "#top" }
```
