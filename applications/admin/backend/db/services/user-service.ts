// The users service: a static class whose methods build the db effects of the
// users flow. Each effect names its step (`id`) and its error handler
// (`errorId`); the step's answer arrives as `${id}.onSuccess` with the
// request's id stamped on it, so the API's continuation is the same request
// as the message that started it. Pure: no I/O happens here.

import { db, sql } from "@pavlus/backend";

/** One row of the list. `role` is the name; `role_id` feeds the edit form. */
export interface UserRow {
  id: number;
  name: string;
  email: string;
  role_id: number;
  role: string;
}

const COLS = sql`u.id, u.name, u.email, u.role_id, r.name AS role`;

/** What a save carries, parked in the request slice between the steps. */
export interface UserSave {
  name: string;
  email: string;
  roleId: number;
  /** PUT has one, POST creates. */
  id: number | null;
}

export class UserService {
  /** Everyone, oldest first. */
  static list() {
    return db.select({
      id: "users.list",
      errorId: "users.failed",
      query: sql`SELECT ${COLS} FROM users u
                  JOIN roles r ON r.id = u.role_id
                 ORDER BY u.id`,
    });
  }

  static byId(id: number) {
    return db.select({
      id: "users.get",
      errorId: "users.failed",
      query: sql`SELECT ${COLS} FROM users u
                  JOIN roles r ON r.id = u.role_id
                 WHERE u.id = ${id}`,
    });
  }

  /** The save's first step: does the role exist? */
  static roleExists(roleId: number) {
    return db.select({
      id: "users.roleCheck",
      errorId: "users.failed",
      query: sql`SELECT id FROM roles WHERE id = ${roleId}`,
    });
  }

  /** UPDATE when `save.id`, INSERT otherwise. */
  static write(save: UserSave) {
    return db.execute({
      id: "users.write",
      errorId: "users.failed",
      query: save.id
        ? sql`UPDATE users SET name = ${save.name}, email = ${save.email},
                 role_id = ${save.roleId}
            WHERE id = ${save.id} RETURNING id`
        : sql`INSERT INTO users (name, email, role_id)
            VALUES (${save.name}, ${save.email}, ${save.roleId})
            RETURNING id`,
    });
  }

  /** The saved user, joined with its role for the answer. */
  static fetch(id: number) {
    return db.select({
      id: "users.fetch",
      errorId: "users.failed",
      query: sql`SELECT ${COLS} FROM users u
                  JOIN roles r ON r.id = u.role_id
                 WHERE u.id = ${id}`,
    });
  }

  // What references the user goes first: sessions, orders, payments — the
  // delete is four steps because multi-statement SQL with params is not
  // possible through the extended protocol.

  static deleteSessions(id: number) {
    return db.execute({
      id: "users.deleteSessions",
      errorId: "users.failed",
      query: sql`DELETE FROM sessions WHERE user_id = ${id}`,
    });
  }

  static deleteOrders(id: number) {
    return db.execute({
      id: "users.deleteOrders",
      errorId: "users.failed",
      query: sql`DELETE FROM orders WHERE user_id = ${id}`,
    });
  }

  static deletePayments(id: number) {
    return db.execute({
      id: "users.deletePayments",
      errorId: "users.failed",
      query: sql`DELETE FROM payments WHERE user_id = ${id}`,
    });
  }

  static delete(id: number) {
    return db.execute({
      id: "users.delete",
      errorId: "users.failed",
      query: sql`DELETE FROM users WHERE id = ${id} RETURNING id`,
    });
  }
}
