# postgres plugin

Plugin `pg` (node-postgres pool). All effects reply to `replyTo` / `onError` with the effect's `ctx`.

```ts
const plugin = createPostgresPlugin({
  url: process.env.DATABASE_URL,
  config: { max: 10 },
  defaultTimeoutMs: 10_000,
});
```

| effect           | fields                                    | reply                                            |
| ---------------- | ----------------------------------------- | ------------------------------------------------ |
| `pg.query`       | `sql, params, tx?, timeoutMs?`            | `{rows, rowCount, fields: [{name, dataTypeID}]}` |
| `pg.tx.begin`    | `isolation?, readOnly?`                   | `{tx}`                                           |
| `pg.tx.commit`   | `tx`                                      | `{tx}`                                           |
| `pg.tx.rollback` | `tx`                                      | `{tx}` (unknown tx is not an error)              |
| `pg.migrate`     | `dir` or `steps: [{name, sql}]`, `table?` | `{applied, skipped}`                             |

Errors arrive at `onError` as `{code, message, detail?, constraint?, table?, column?, schema?}`; `code` is the SQLSTATE (`23505` unique violation, `57014` timeout/cancel). Plugin-level codes: `PAVLUS_NO_TX`. If an effect has no `onError` the error goes to the message `pg.error`.

```ts
import { pgEffector as pg, sql } from "pavlus-server/plugins/postgres/mod.ts";

case "http.request": return [pg.query(sql`select * from users where id = ${id}`, { replyTo: "gotUser", onError: "dbFailed" })];

// transaction as a message flow
case "transfer":   return [pg.begin({ replyTo: "txStarted" })];
case "txStarted":  return [pg.query(sql`update acc set bal = bal - ${n} where id = ${a}`, { tx: msg.payload.tx, replyTo: "debited" })];
case "debited":    return [pg.commit(state.requests[rid].tx, { replyTo: "done" })];
```

- **sql**: `sql\`... ${value} ...\``turns every value into`$n`; identifiers via `sql.id("schema.table")`; `sql.list([..])`, `sql.join([..], " and ")`, nested `sql`fragments;`sql.unsafe(text)` is the only way to embed raw text.
- **Timeouts**: min of `timeoutMs`, `defaultTimeoutMs` and `ctx.deadline`. On expiry the backend is cancelled (`pg_cancel_backend` over a second pool connection) and the reply is `57014`. A deadline already in the past fails without touching the database.
- **cancel(rid)**: running queries of the rid are cancelled and their replies discarded; transactions it left open are rolled back and the client goes back to the pool. `dispose()` rolls back everything.
- **Migrations**: steps run in order, one transaction each, recorded in `schema_migrations` (name, applied_at); a session advisory lock makes concurrent boots safe. `dir` reads `*.sql` sorted by name.
- **Metrics**: `plugin.metrics()` -> `{total, idle, waiting, queries, errors, timeouts, cancelled, txOpen, txBegun, txCommitted, txRolledBack}`.

Tests (`postgres.test.ts`) run against `DATABASE_URL` (default `postgres://admin@127.0.0.1:54329/postgres`) in a throwaway schema, and are skipped when the database is unreachable.
