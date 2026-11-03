# ws

WebSocket connections, by **id**. The plugin keeps the sockets; the
application only sees messages.

```ts
import {
  createWsPlugin,
  wsEffector as ws,
} from "@service-laboratory/pavlus/plugins/ws";

createApp({ app, plugins: [store, createWsPlugin()] });
```

## Effectors

```ts
ws.connect({
  id: "chat",
  url: "wss://example.com/chat",
  onOpen: "chat.opened",
  onMessage: "chat.received",
  onClose: "chat.closed",
  onError: "chat.failed",
})

ws.send("chat", { text: "hi" })         // objects are sent as JSON
ws.send("chat", "ping")                  // strings as they are
ws.close("chat", 1000, "bye")            // code and reason are optional
```

| Effect | Fields | Meaning |
|---|---|---|
| `connect` | `id`, `url`, `onMessage`, `onOpen?`, `onClose?`, `onError?` | Open connection `id`. |
| `send` | `id`, `data` | Send on connection `id`. |
| `close` | `id`, `code?`, `reason?` | Close connection `id`. |

Connecting with the id of an **open connection closes the old one first**
(reconnect). The replaced socket sends no `onClose` message.

### Messages sent back

| When | Message |
|---|---|
| the connection opens | `{ id: onOpen }` |
| a frame arrives | `{ id: onMessage, payload }`. A text frame that is valid JSON is parsed; anything else is the raw data. |
| the connection closes | `{ id: onClose, payload: { code, reason } }`; the id is forgotten |
| an error | `{ id: onError }` |

`onOpen`, `onClose` and `onError` are optional: leave them out to ignore those
events.

## Errors

`send` for an id that has no connection **throws** (`pavlus/ws: no
connection "chat"`). Send only after `onOpen`, and stop sending after
`onClose`; keep a `connected` flag in the state if you need to.

## Plugin API and options

```ts
const plugin = createWsPlugin({ create })   // create(url) → socket; default: new WebSocket(url)
plugin.connections();                        // ids of open or connecting sockets
```

`dispose()` closes every socket without sending messages.

## In tests

`create` returns anything shaped like `SocketLike`: `send`, `close` and the
`onopen` / `onmessage` / `onclose` / `onerror` properties. Call those
properties yourself to simulate the server:

```ts
const socket = { sent: [] as string[], send(d: string) { this.sent.push(d); }, close() {},
                 onopen: null, onmessage: null, onclose: null, onerror: null };
const plugin = createWsPlugin({ create: () => socket });
plugin.handle(ws.connect({ id: "c", url: "x", onMessage: "got" }), ctx);
socket.onmessage!({ data: '{"a":1}' });          // → { id: "got", payload: { a: 1 } }
```
