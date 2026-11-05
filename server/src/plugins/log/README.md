# log plugin

Plugin `log`: structured logs and metrics.

```ts
import { logEffector as log } from "pavlus-server/plugins/log/mod.ts";
return [log.info("user created", { userId, password })]; // password -> "[REDACTED]"
```

- `log {level, msg, fields}`: one JSON line `{ts, level, msg, rid, connId, ...fields}`; `rid`/`connId` come from the effect's ctx. Fields never overwrite the core keys. Levels `trace debug info warn error fatal`, filtered by `level` (default `info`).
- Options: `pretty` (human readable), `sink(line, record)` (default stdout, stderr for warn and up), `now`, `redact` (extra key fragments, `replaceRedact` to replace the defaults), `metrics`.
- Redaction is by key, case/dash/underscore-insensitive substring: `password passwd secret token authorization cookie apikey privatekey creditcard cardnumber cvv`, at any depth. Cycles, Errors, Buffers, bigint and Dates are serialised safely.
- `metrics.inc {name, labels?, by?}`, `metrics.observe {name, value, labels?, buckets?}` (histogram), `metrics.get {replyTo}` replies the Prometheus text; `plugin.metricsText()` / `plugin.metrics` (a `Metrics` instance) for direct use.
- `plugin.log(level, msg, fields, ctx)` logs without an effect (for other plugins).
