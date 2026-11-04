# serviceworker

Service worker lifecycle, page-side Cache Storage, notifications, and (the connectivity half) online/offline.
Everything is injectable: `createServiceWorkerPlugin({ serviceWorker, caches, Notification, navigator, eventTarget, Request, Response })`.
Missing APIs (SSR, old browsers) make each effect reply `onError` with `{ code: "UNSUPPORTED", message }`
(`observe` and `online` degrade silently; `online` reports once).

Errors are always `SwError = { code: 'UNSUPPORTED' | 'NOT_REGISTERED' | 'FAILED', message }`.
`SwState = { phase: 'installing'|'waiting'|'active'|'redundant'|'none', installing, waiting, active, redundant, scope, updateFound, controller, event? }`
(`phase` is the newest worker; `event` tells why `observe` emitted: `init | updatefound | statechange | controllerchange`).

Registrations are named: `register`'s `id` (default `"default"`); other effects take `registration?` to pick one, and
fall back to `navigator.serviceWorker.getRegistration()` when the id is unknown. The worker script type of `register`
is called `workerType` because `type` names the effect.

## Lifecycle

| Effect        | Fields                                                                                  | Replies                                                                                                                     |
| ------------- | --------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `register`    | `id?`, `script`, `scope?`, `workerType?`, `updateViaCache?`, `onSuccess?`, `onError?`   | `SwState`                                                                                                                   |
| `unregister`  | `scope?` or `registration?`, `onSuccess?`, `onError?`                                   | `boolean`                                                                                                                   |
| `update`      | `registration?`, replies                                                                | `SwState`                                                                                                                   |
| `skipWaiting` | `registration?`, replies                                                                | `true` if a waiting worker got `{type:"SKIP_WAITING"}`, else `false`                                                        |
| `postMessage` | `data`, `target?` (`active` default, `waiting`, `installing`), `registration?`, replies | `true`                                                                                                                      |
| `observe`     | `id`, `registration?`, `onChange?`, `onMessage?`                                        | `onChange`: `SwState` on init, updatefound, every worker statechange and controllerchange; `onMessage`: the worker's `data` |
| `unobserve`   | `id`                                                                                    |                                                                                                                             |
| `ready`       | `onSuccess`, `onError?`                                                                 | `SwState` once a worker is active                                                                                           |

`observe` may be started before `register`: it attaches when the registration appears.

## Connectivity

| Effect            | Fields           | Replies                                                                  |
| ----------------- | ---------------- | ------------------------------------------------------------------------ |
| `online`          | `id`, `onChange` | `boolean`: `navigator.onLine` now, then on each `online`/`offline` event |
| `unobserveOnline` | `id`             |                                                                          |

## Cache Storage (from the page, no worker code)

| Effect        | Fields                                                                                                      | Replies                                                                                         |
| ------------- | ----------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `cachePut`    | `cache`, `url` or `request` (string or `{url, method?, headers?}`), `response?` `{body, status?, headers?}` | `true`. Without `response` the request is fetched and stored. Object bodies are stored as JSON. |
| `cacheMatch`  | `cache`, `url`, `ignoreSearch?`, `onSuccess`, `onError?`                                                    | `{status, headers, body: string}` or `null`                                                     |
| `cacheDelete` | `cache`, `url?`                                                                                             | `boolean`. Without `url` deletes the whole cache.                                               |
| `cacheKeys`   | `cache?`                                                                                                    | URLs in the cache, or all cache names                                                           |
| `cacheClear`  | `cache?`                                                                                                    | count. Empties one cache, or deletes every cache.                                               |

## Notifications

`notificationPermission {onSuccess, onError?}` replies `'granted'|'denied'|'default'` (calls `Notification.requestPermission()`).
`notify {title, options?, registration?, onSuccess?, onError?}` calls `registration.showNotification`.

## Generating the worker

`workerSource({ precache, strategy, version, prefix? })` returns the source text of a small service worker:
precache on install (never auto-skipWaiting), delete other `<prefix>-*` caches on activate then claim clients and
broadcast `{type:"ACTIVATED", version}`, GET-only routing by `"cache-first" | "network-first" | "stale-while-revalidate"`
(or `{default, routes: [{pattern: <RegExp source>, strategy}]}`), only `ok` responses are cached.
Messages: `{type:"SKIP_WAITING"}` skips waiting, `{type:"GET_VERSION"}` answers `{type:"VERSION", version}`, anything else is
relayed to all other clients (they receive it through `observe`'s `onMessage`).

```ts
// vite.config.ts (or any build step)
import { workerSource } from "@service-laboratory/pavlus/plugins/serviceworker";
this.emitFile({
  type: "asset",
  fileName: "sw.js",
  source: workerSource({
    version: "2024-05-01",
    precache: ["/", "/app.js"],
    strategy: "stale-while-revalidate",
  }),
});
```

## Example app

```ts
import { serviceWorkerEffector as sw } from "@service-laboratory/pavlus/plugins/serviceworker";

const app = (msg, state) => {
  switch (msg.id) {
    case "boot":
      return [
        sw.register({ script: "/sw.js", onError: "swFailed" }),
        sw.observe({ id: "sw", onChange: "swState", onMessage: "swMessage" }),
        sw.online({ id: "net", onChange: "netChanged" }),
      ];
    case "swState": // show "update available" when a new worker waits
      return [
        store.set(
          "updateReady",
          msg.payload.phase === "waiting" && msg.payload.controller,
        ),
      ];
    case "applyUpdate":
      return [sw.skipWaiting()]; // reload on the following controllerchange (event: "controllerchange")
    case "netChanged":
      return [store.set("online", msg.payload)];
    case "saveOffline":
      return [
        sw.cachePut({
          cache: "user",
          url: "/api/me",
          response: { body: state.me },
        }),
      ];
    case "swFailed":
      return [log.warn(msg.payload.message)];
  }
  return [];
};
```
