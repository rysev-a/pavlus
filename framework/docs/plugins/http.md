# http

Sends HTTP requests. Every request has an **id**, which is also how it is
cancelled: starting a request with the id of a running one cancels the old one,
so "the latest request wins" needs no state in the application.

```ts
import {
  createHttpPlugin,
  httpEffector as http,
} from "@pavlus/frontend/plugins/http";

createApp({ app, plugins: [store, createHttpPlugin()] });
```

## Effectors

```ts
http.request({
  id: "users",
  url: "/api/users?q=ann",
  onSuccess: "loaded",
  onError: "failed",
})

http.request({
  id: "save",
  method: "POST",
  url: "/api/users",
  body: { name: "Ann" },            // objects are sent as JSON
  onSuccess: "saved",
  onError: "saveFailed",
})

http.cancel("users")
```

| Effect | Fields | Meaning |
|---|---|---|
| `request` | `id`, `url`, `onSuccess`, `onError`, `method?`, `headers?`, `body?`, `responseType?` | Send a request. |
| `cancel` | `id` | Cancel the running request `id`. |

- `method` defaults to `GET`. `headers` is a plain object.
- `body`: a string is sent as it is; anything else is `JSON.stringify`-ed and
  `content-type: application/json` is added unless you set one.
- `responseType`: `"json"` (default) or `"text"`. A body that is not valid JSON
  gives `data: null`.

## Messages sent back

| When | Message |
|---|---|
| 2xx response | `{ id: onSuccess, payload: { status, data } }` |
| other status | `{ id: onError, payload: { status, error: statusText, data } }` |
| network failure | `{ id: onError, payload: { error: message } }` |
| **cancelled or replaced** | **nothing** |

A cancelled request never produces a message, not even an error, and the
answer of a replaced request that still arrives is ignored. A request that
finished is forgotten, so its id can be reused.

```ts
// debounced search: only the answer to the last query matters
searchFire: (msg) => [http.request({ id: "search", url: `/api/users?q=${msg.payload}`, onSuccess: "found", onError: "searchFailed" })],
```

## Plugin API and options

```ts
const plugin = createHttpPlugin({ fetch })   // default: globalThis.fetch
plugin.pending();                            // ids of requests in flight
```

`dispose()` aborts everything in flight.

## In tests

```ts
const plugin = createHttpPlugin({
  fetch: (async () => ({ ok: true, status: 200, statusText: "OK", json: async () => [] })) as unknown as typeof fetch,
});
```

The fake only needs `ok`, `status`, `statusText` and `json()` / `text()`. To
test cancelling, return a promise that resolves later and check that no
message arrives.
