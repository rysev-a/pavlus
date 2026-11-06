// Roles (module): a class whose methods are the handlers of the messages with
// those ids — the catalogue for the forms' select. Pure handlers.

import { db, httpEffector, rowsOf, sql } from "@pavlus/backend";
import type { Effect, Message } from "@pavlus/core";

export interface RoleRow {
  id: number;
  name: string;
  description: string;
  /** How many users have this role. */
  users: number;
}

export class RolesAPI {
  "roles.list"(): Effect[] {
    return [
      db.select({
        id: "roles.list",
        errorId: "roles.failed",
        query: sql`SELECT r.id, r.name, r.description, count(u.id)::int AS users
                 FROM roles r
                 LEFT JOIN users u ON u.role_id = r.id
                 GROUP BY r.id
                 ORDER BY r.id`,
      }),
    ];
  }

  "roles.list.onSuccess"(message: Message): Effect[] {
    return [httpEffector.makeResponse(200, rowsOf<RoleRow>(message))];
  }

  "roles.failed"(): Effect[] {
    return [httpEffector.makeResponse(500, { error: "internal error" })];
  }
}
