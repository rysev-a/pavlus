// Users (module): a class whose methods are the handlers of the users flow —
// the method's name is the message id. Pure: (message, state) => effects.
// Every db effect names its step (`id`) and its error handler (`errorId`); the
// step's answer arrives as `${id}.onSuccess`, with the request's id stamped on
// it, so a continuation is the same request as the message that started it.
//
// What one handler needs from the next (the id of the user being saved or
// deleted) is parked in the request's own slice of the state
// (`state.requests[rid]`) with pure `requests` effects — the same memory the
// class-controller driver uses.

import {
  db,
  httpEffector,
  type HttpReq,
  idOf,
  oneOf,
  requestsEffector,
  rowsOf,
  type ServerState,
  sql,
} from "@pavlus/backend";
import type { Effect, Message } from "@pavlus/core";

/** One row of the list. `role` is the name; `role_id` feeds the edit form. */
export interface UserRow {
  id: number;
  name: string;
  email: string;
  role_id: number;
  role: string;
}

const COLS = sql`u.id, u.name, u.email, u.role_id, r.name AS role`;

/** This request's slice: what the continuations need. */
const slice = (msg: Message, state: ServerState): Record<string, unknown> => {
  const rid = msg.ctx?.rid;
  return state.requests[typeof rid === "string" ? rid : ""] ?? {};
};

export class UsersAPI {
  "users.list"(): Effect[] {
    return [
      db.select({
        id: "users.list",
        errorId: "users.failed",
        query: sql`SELECT ${COLS} FROM users u
                    JOIN roles r ON r.id = u.role_id
                   ORDER BY u.id`,
      }),
    ];
  }

  "users.list.onSuccess"(message: Message): Effect[] {
    return [httpEffector.makeResponse(200, rowsOf<UserRow>(message))];
  }

  "users.get"(message: Message): Effect[] {
    const req = message.payload as HttpReq;
    const id = idOf(req.params);
    if (id === undefined)
      return [
        httpEffector.makeResponse(404, { error: `no user ${req.params.id}` }),
      ];
    return [
      requestsEffector.set("userId", id),
      db.select({
        id: "users.get",
        errorId: "users.failed",
        query: sql`SELECT ${COLS} FROM users u
                    JOIN roles r ON r.id = u.role_id
                   WHERE u.id = ${id}`,
      }),
    ];
  }

  "users.get.onSuccess"(message: Message, state: ServerState): Effect[] {
    const user = oneOf<UserRow>(message);
    return [
      user
        ? httpEffector.makeResponse(200, user)
        : httpEffector.makeResponse(404, {
            error: `no user ${slice(message, state).userId}`,
          }),
    ];
  }

  "users.save"(message: Message): Effect[] {
    const req = message.payload as HttpReq;
    const body = (req.body ?? {}) as Record<string, unknown>;
    const name =
      typeof body.name === "string" && body.name.trim()
        ? body.name.trim()
        : undefined;
    const email =
      typeof body.email === "string" && body.email.trim()
        ? body.email.trim()
        : undefined;
    const roleId = body.role_id;
    if (!name || !email || typeof roleId !== "number")
      return [
        httpEffector.makeResponse(400, {
          error: "a user needs a name, an email and a role_id",
        }),
      ];
    const id = idOf(req.params) ?? null; // PUT has one, POST creates
    return [
      requestsEffector.merge({ save: { name, email, roleId, id } }),
      db.select({
        id: "users.roleCheck",
        errorId: "users.failed",
        query: sql`SELECT id FROM roles WHERE id = ${roleId}`,
      }),
    ];
  }

  "users.roleCheck.onSuccess"(message: Message, state: ServerState): Effect[] {
    const save = slice(message, state).save as {
      name: string;
      email: string;
      roleId: number;
      id: number | null;
    };
    if (!oneOf(message))
      return [
        httpEffector.makeResponse(400, { error: `no role ${save.roleId}` }),
      ];
    return [
      db.execute({
        id: "users.write",
        errorId: "users.failed",
        query: save.id
          ? sql`UPDATE users SET name = ${save.name}, email = ${save.email},
                   role_id = ${save.roleId}
              WHERE id = ${save.id} RETURNING id`
          : sql`INSERT INTO users (name, email, role_id)
              VALUES (${save.name}, ${save.email}, ${save.roleId})
              RETURNING id`,
      }),
    ];
  }

  "users.write.onSuccess"(message: Message, state: ServerState): Effect[] {
    const saved = oneOf<{ id: number }>(message);
    if (!saved)
      return [
        httpEffector.makeResponse(404, {
          error: `no user ${(slice(message, state).save as { id: number | null }).id}`,
        }),
      ];
    return [
      db.select({
        id: "users.fetch",
        errorId: "users.failed",
        query: sql`SELECT ${COLS} FROM users u
                    JOIN roles r ON r.id = u.role_id
                   WHERE u.id = ${saved.id}`,
      }),
    ];
  }

  "users.fetch.onSuccess"(message: Message): Effect[] {
    return [httpEffector.makeResponse(200, oneOf<UserRow>(message))];
  }

  "users.delete"(message: Message): Effect[] {
    const req = message.payload as HttpReq;
    const id = idOf(req.params);
    if (id === undefined)
      return [
        httpEffector.makeResponse(404, { error: `no user ${req.params.id}` }),
      ];
    // What references the user goes first: sessions, orders, payments.
    return [
      requestsEffector.set("deleteId", id),
      db.execute({
        id: "users.deleteSessions",
        errorId: "users.failed",
        query: sql`DELETE FROM sessions WHERE user_id = ${id}`,
      }),
    ];
  }

  "users.deleteSessions.onSuccess"(
    message: Message,
    state: ServerState,
  ): Effect[] {
    const id = slice(message, state).deleteId as number;
    return [
      db.execute({
        id: "users.deleteOrders",
        errorId: "users.failed",
        query: sql`DELETE FROM orders WHERE user_id = ${id}`,
      }),
    ];
  }

  "users.deleteOrders.onSuccess"(
    message: Message,
    state: ServerState,
  ): Effect[] {
    const id = slice(message, state).deleteId as number;
    return [
      db.execute({
        id: "users.deletePayments",
        errorId: "users.failed",
        query: sql`DELETE FROM payments WHERE user_id = ${id}`,
      }),
    ];
  }

  "users.deletePayments.onSuccess"(
    message: Message,
    state: ServerState,
  ): Effect[] {
    const id = slice(message, state).deleteId as number;
    return [
      db.execute({
        id: "users.delete",
        errorId: "users.failed",
        query: sql`DELETE FROM users WHERE id = ${id} RETURNING id`,
      }),
    ];
  }

  "users.delete.onSuccess"(message: Message, state: ServerState): Effect[] {
    const gone = oneOf<{ id: number }>(message);
    return [
      gone
        ? httpEffector.makeResponse(200, { deleted: gone.id })
        : httpEffector.makeResponse(404, {
            error: `no user ${slice(message, state).deleteId}`,
          }),
    ];
  }

  /** Any db failure of the flow: the old server answered this same 500. */
  "users.failed"(): Effect[] {
    return [httpEffector.makeResponse(500, { error: "internal error" })];
  }
}
