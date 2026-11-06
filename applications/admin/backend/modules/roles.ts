// Roles (module): the catalogue for the forms' select. Pure handlers.

import {
  db,
  httpEffector,
  rowsOf,
  type ServerState,
  sql,
} from "@pavlus/backend";
import type { Effect, Message } from "@pavlus/frontend";

export interface RoleRow {
  id: number;
  name: string;
  description: string;
  /** How many users have this role. */
  users: number;
}

export function handle(
  msg: Message,
  _state: ServerState,
): Effect[] | undefined {
  switch (msg.id) {
    case "roles.list":
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

    case "roles.list.onSuccess":
      return [httpEffector.makeResponse(200, rowsOf<RoleRow>(msg))];

    case "roles.failed":
      return [httpEffector.makeResponse(500, { error: "internal error" })];
  }
  return undefined;
}
