# ws plugin

`createWsServerPlugin({ http, maxPayload, heartbeatMs, closeTimeoutMs, path, subprotocols, origins, verify, maxConnections, backpressure })` implements RFC 6455 on the http plugin's server (`upgrade`), with a hand-written parser and encoder (`frame.ts`, no dependencies). No extensions (no permessage-deflate) are negotiated.

## Handshake

`GET` + `Upgrade: websocket` + `Connection: Upgrade` + version 13 + a 16-byte base64 key. Refusals: 400 (malformed), 426 (version), 403 (`origins` mismatch or `verify` false; requests without `Origin` are allowed), 404 (`path` mismatch), 503 (`maxConnections` or stopping). `subprotocols` is the server preference list; the first one the client offered is chosen.

## Messages (ctx = `{ rid, conn: "ws", connId }`, a fresh rid per message)

- `ws.open {path, query, headers, subprotocol, ip}`
- `ws.message {data, binary}` (`data` is a string for text frames, a `Buffer` for binary; fragments are reassembled, text is UTF-8 validated, limit `maxPayload` default 1 MiB -> close 1009)
- `ws.close {code, reason, clean}` (1006 when the peer vanished)

## Effects

`ws.send {connId?, data}` (connId defaults to `ctx.connId`; string -> text, bytes -> binary, other -> JSON text), `ws.broadcast {room?, data, except?}` (no room = everyone; `except` is a connId or a list), `ws.join {room}`, `ws.leave {room}`, `ws.close {code?, reason?}` (close handshake, destroyed after `closeTimeoutMs`), `ws.ping {data?}`.

## Robustness

- protocol errors (unmasked client frame, reserved bits, bad opcode, fragmented/oversize control frames, bad close code, invalid UTF-8) close with 1002/1007/1009 and are counted in `stats().protocolErrors`
- pings are answered with pongs; every `heartbeatMs` (30 s, 0 disables) each connection is pinged and one that did not send anything since the previous tick is destroyed (`culled`). One shared interval, running only while connections exist.
- backpressure: before a write, if the socket's pending bytes would exceed `backpressure.maxBufferedBytes` (1 MiB) the frame is dropped (`policy: "drop"`) or the connection is closed with 1013 (`policy: "close"`, default); both count in `dropped`
- rooms are removed with their last member; a closed connection leaves all rooms
- `stop()` closes every connection with 1001; `closed()` resolves when they are gone; `dispose()` removes the upgrade listener.
- `stats()`: `connections, rooms, timers, opened, messagesIn, messagesOut, dropped, culled, orphans, rejectedUpgrades, protocolErrors`.

Because every inbound frame has its own rid, a reply that arrives later (after a database round trip) is delivered to the connection in its `ctx.connId`; when the connection closes the runtime cancels the in-flight rids of that `connId`.
