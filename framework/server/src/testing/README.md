# testing

`import { ... } from "@pavlus/server/testing"`

- `flow(handler, { state?, routes? })` -> `{ send(msg), state, log }`: runs the handler, stamps the message ctx onto the effects like the runtime, and moves `state.requests` / `state.shared` with the `requests` effects.
- `scenario(handler, steps, opts?)` plays a whole flow with no I/O:
  ```ts
  scenario(app, [
    { send: { id: "http.request", payload: {...}, ctx: { rid: "r1", conn: "http" } } },
    { expect: [{ plugin: "pg", type: "query", sql: /from users/ }],      // partial match, exact count
      reply: { payload: { rows: [{ id: 7 }] } } },                       // answers effects[from ?? first] with the same ctx, id defaults to replyTo
    { expect: [{ plugin: "http", type: "respond", status: 200 }] },
    { state: { requests: { r1: { userId: "7" } } } },
  ]);
  ```
  `exact: false` matches a subsequence, `error: {...}` answers `onError` instead, `from` picks the effect. Patterns: plain values, `RegExp` for strings, predicates, partial objects, exact arrays (`matches`/`mismatch` are exported). A failure names the step and prints the effects.
- `fakeHttp({ etag?, deadlineMs? })` plugin (name `http`): `await fake.request({ method, path, query, headers, body })` -> `{ status, headers, body, text, json, chunks, events, streamed, closed }`; `inject()` also returns `{ rid, abort() }` (dispatches `http.aborted`); it dispatches `request.done` after a response like the real one and builds responses with the same `normalizeRespond`.
- `fakeWs()` plugin (name `ws`): `connect()` -> client with `send`, `close`, `next()`, `received`, `rooms`; implements send/broadcast/join/leave/close.
- `request(target, { method, path, headers, body, agent })` real-socket client for a plugin, `{port}` or a URL; `connectWs(target, path, { headers, protocols, autoPong })` hand-rolled websocket client (masked frames, `sendText/sendBinary/sendFragmented/ping/close/raw`, `messages`, `next()`, `closeFrame`).

The same handler runs unchanged against the fakes and the real plugins (see `testing.test.ts`, "parity").
