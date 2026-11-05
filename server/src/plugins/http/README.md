# http plugin

`createHttpServerPlugin({ port, host, limits, trustProxy, etag, requestIdHeader })` is a `node:http` server. It mints the `rid`, dispatches `http.request` with `ctx = { rid, conn: "http", deadline, requestId }` and answers effects by finding the `ServerResponse` through `effect.ctx.rid`. `port: 0` picks an ephemeral port; `await http.listening()` gives the address (`http.port` too). `http.server` is the raw server (the ws plugin attaches to it).

## In

- `http.request` payload `{ method, path, query, headers, cookies, params: {}, body, ip }`
  - `path` is raw (the router percent-decodes), `query` is `{k: string | string[]}` (prototype-safe, max 1000 params)
  - `body` by content-type: `application/json` -> value, `x-www-form-urlencoded` -> object, `text/*` -> string, otherwise a `Buffer`; empty -> `undefined`
  - `ip` is the socket peer; with `trustProxy: true` the last `X-Forwarded-For` hop, with `trustProxy: N` the Nth from the right
- `http.aborted` (the client closed before the response finished), `request.done` (response finished), `http.listening {port, host}`, `http.listen_failed`.
- Refused by the plugin itself, the app never sees them: 400 (bad JSON, bad URL, bad Content-Length), 413 (declared or streamed body over `limits.bodyBytes`, default 1 MiB), 408 (body slower than `bodyTimeoutMs`, default 10 s), 431/400 (header block over `maxHeaderBytes`, default 16 KiB), 503 while shutting down. Slowloris: `headersTimeoutMs` (10 s) and `receiveTimeoutMs` (60 s) are Node's, `checkIntervalMs` tunes its sweep.

## Out

- `http.respond { status?, headers?, body? | json? | text? | html? | redirect?, cookies?, download?, etag? }`
  - `redirect: "/x"` or `{url, status}` (default 302); `cookies: { name: "v" | { value, maxAge, ... } }` or raw strings; `download: "name.csv"` adds `Content-Disposition` (RFC 5987 safe)
  - HEAD gets the headers (with `Content-Length`) and no body; `etag: true` (or the plugin option) adds a weak ETag to GET/HEAD 200 bodies and answers `304` on `If-None-Match`
  - header names/values with CR/LF throw -> `request.error` (never a split response); `X-Content-Type-Options: nosniff` and `X-Request-Id` are always set
  - a second respond for a rid is ignored and counted (`stats().doubleResponses`)
- `http.header {name, value}` adds a header to the response to come.
- `http.stream.start {status?, headers?, contentType?, download?}`, `http.stream.chunk {data}`, `http.stream.end`: backpressure-safe (`write()` false -> queue until `drain`; a client that lets the queue exceed `streamBufferBytes` (1 MiB) is destroyed and counted in `slowConsumers`; the app then sees `http.aborted`).
- `http.sse.start {heartbeatMs?, retry?, headers?}`, `http.sse.send {data, event?, id?, retry?}` (objects are JSON, multi-line strings become several `data:` lines), `http.sse.end`. A heartbeat comment `:hb` goes out every `sseHeartbeatMs` (15 s) when idle; the timer dies with the connection.
- `http.file {path, filename?, contentType?}` streams a file from disk (404 if missing).
- `http.close` destroys the connection.

## Lifecycle

- `cancel(rid)` (called by the runtime): ends a stream, or answers `504` if the request is over but nobody answered.
- `stop()` closes the listener and idle keep-alive sockets; in-flight responses finish with `Connection: close`. `closed()` resolves when the server closed. `dispose()` destroys what is left.
- `stats()`: `conns, timers, heartbeats, sockets, socketsOpen, requests, rejected, abortedEarly, aborted, doubleResponses, orphans, slowConsumers`; after traffic `conns`, `timers`, `heartbeats` must be 0.

`x-request-id`: an incoming value matching `[A-Za-z0-9._-]{1,128}` is echoed and kept in `ctx.requestId`; otherwise the rid is used. The `rid` itself is always server-minted (unguessable), a client can never pick or collide with it.

Cookies helpers: `parseCookies(header)`, `serializeCookie(name, value, opts)` (defaults `Path=/; HttpOnly; Secure; SameSite=Lax`; `SameSite=None` forces `Secure`; invalid names/attributes throw), `clearCookie(name)`.
