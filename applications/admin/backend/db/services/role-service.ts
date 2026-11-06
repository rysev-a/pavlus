// The roles service: the catalogue for the forms' select, with the user count
// per role. A static class whose methods build the db effects; pure.

import { db, sql } from "@pavlus/backend";

export interface RoleRow {
  id: number;
  name: string;
  description: string;
  /** How many users have this role. */
  users: number;
}

export class RoleService {
  static list() {
    return db.select({
      id: "roles.list",
      errorId: "roles.failed",
      query: sql`SELECT r.id, r.name, r.description, count(u.id)::int AS users
               FROM roles r
               LEFT JOIN users u ON u.role_id = r.id
               GROUP BY r.id
               ORDER BY r.id`,
    });
  }
}
