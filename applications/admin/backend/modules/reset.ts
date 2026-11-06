// Reset (module): a class whose methods are the handlers of the messages with
// those ids. Rebuilds the demo data: the statements are read once at boot
// (db/reset.ts) and passed to the constructor, so the handlers stay pure —
// they only chain the db steps and count what came back.

import { db, httpEffector, oneOf, sql } from "@pavlus/backend";
import type { Effect, Message } from "@pavlus/core";

/** schema.sql, seed.sql, seed-users.sql — in order, as statements. */
export class ResetAPI {
  private readonly resetSql: string[];

  constructor(resetSql: string[]) {
    this.resetSql = resetSql;
  }

  "app.reset"(): Effect[] {
    return [
      db.execute({
        id: "reset.schema",
        errorId: "reset.failed",
        query: sql.unsafe(this.resetSql[0] ?? ""),
      }),
    ];
  }

  "reset.schema.onSuccess"(): Effect[] {
    return [
      db.execute({
        id: "reset.seed",
        errorId: "reset.failed",
        query: sql.unsafe(this.resetSql[1] ?? ""),
      }),
    ];
  }

  "reset.seed.onSuccess"(): Effect[] {
    return [
      db.execute({
        id: "reset.users",
        errorId: "reset.failed",
        query: sql.unsafe(this.resetSql[2] ?? ""),
      }),
    ];
  }

  "reset.users.onSuccess"(): Effect[] {
    return [
      db.select({
        id: "reset.count",
        errorId: "reset.failed",
        query: sql`SELECT count(*)::int AS id FROM users`,
      }),
    ];
  }

  "reset.count.onSuccess"(message: Message): Effect[] {
    return [
      httpEffector.makeResponse(200, {
        reset: true,
        users: oneOf<{ id: number }>(message)?.id ?? 0,
      }),
    ];
  }

  "reset.failed"(): Effect[] {
    return [httpEffector.makeResponse(500, { error: "internal error" })];
  }
}
