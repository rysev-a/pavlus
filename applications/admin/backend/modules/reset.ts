// Reset (module): rebuilds the demo data. The statements are read once at boot
// (db/reset.ts) and passed in, so the handlers stay pure — they only chain the
// db steps and count what came back.

import {
  db,
  httpEffector,
  oneOf,
  type ServerState,
  sql,
} from "@pavlus/backend";
import type { Effect, Message } from "@pavlus/frontend";

/** schema.sql, seed.sql, seed-users.sql — in order, as statements. */
export function createResetModule(resetSql: string[]) {
  return function handle(
    msg: Message,
    _state: ServerState,
  ): Effect[] | undefined {
    switch (msg.id) {
      case "app.reset":
        return [
          db.execute({
            id: "reset.schema",
            errorId: "reset.failed",
            query: sql.unsafe(resetSql[0] ?? ""),
          }),
        ];

      case "reset.schema.onSuccess":
        return [
          db.execute({
            id: "reset.seed",
            errorId: "reset.failed",
            query: sql.unsafe(resetSql[1] ?? ""),
          }),
        ];

      case "reset.seed.onSuccess":
        return [
          db.execute({
            id: "reset.users",
            errorId: "reset.failed",
            query: sql.unsafe(resetSql[2] ?? ""),
          }),
        ];

      case "reset.users.onSuccess":
        return [
          db.select({
            id: "reset.count",
            errorId: "reset.failed",
            query: sql`SELECT count(*)::int AS id FROM users`,
          }),
        ];

      case "reset.count.onSuccess":
        return [
          httpEffector.makeResponse(200, {
            reset: true,
            users: oneOf<{ id: number }>(msg)?.id ?? 0,
          }),
        ];

      case "reset.failed":
        return [httpEffector.makeResponse(500, { error: "internal error" })];
    }
    return undefined;
  };
}
