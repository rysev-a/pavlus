// Users (api): a class whose methods are the handlers of the users flow — the
// method's name is the message id. The db work is UserService's (db/services);
// here a handler validates the input, parks what a continuation needs in the
// request's own slice of the state (`state.requests[rid]`, pure `requests`
// effects — the same memory the class-controller driver uses), and turns the
// answers into http responses.

import {
  httpEffector,
  type HttpReq,
  idOf,
  oneOf,
  requestsEffector,
  rowsOf,
  type ServerState,
} from "@pavlus/backend";
import type { Effect, Message } from "@pavlus/core";
import {
  type UserRow,
  type UserSave,
  UserService,
} from "../../db/services/user-service.ts";

/** This request's slice: what the continuations need. */
const slice = (msg: Message, state: ServerState): Record<string, unknown> => {
  const rid = msg.ctx?.rid;
  return state.requests[typeof rid === "string" ? rid : ""] ?? {};
};

export class UsersAPI {
  "users.list"(): Effect[] {
    return [UserService.list()];
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
    return [requestsEffector.set("userId", id), UserService.byId(id)];
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
    const save: UserSave = {
      name,
      email,
      roleId,
      id: idOf(req.params) ?? null,
    };
    return [
      requestsEffector.merge({ save }),
      UserService.roleExists(save.roleId),
    ];
  }

  "users.roleCheck.onSuccess"(message: Message, state: ServerState): Effect[] {
    const save = slice(message, state).save as UserSave;
    if (!oneOf(message))
      return [
        httpEffector.makeResponse(400, { error: `no role ${save.roleId}` }),
      ];
    return [UserService.write(save)];
  }

  "users.write.onSuccess"(message: Message, state: ServerState): Effect[] {
    const saved = oneOf<{ id: number }>(message);
    if (!saved)
      return [
        httpEffector.makeResponse(404, {
          error: `no user ${(slice(message, state).save as UserSave).id}`,
        }),
      ];
    return [UserService.fetch(saved.id)];
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
    return [
      requestsEffector.set("deleteId", id),
      UserService.deleteSessions(id),
    ];
  }

  "users.deleteSessions.onSuccess"(
    message: Message,
    state: ServerState,
  ): Effect[] {
    const id = slice(message, state).deleteId as number;
    return [UserService.deleteOrders(id)];
  }

  "users.deleteOrders.onSuccess"(
    message: Message,
    state: ServerState,
  ): Effect[] {
    const id = slice(message, state).deleteId as number;
    return [UserService.deletePayments(id)];
  }

  "users.deletePayments.onSuccess"(
    message: Message,
    state: ServerState,
  ): Effect[] {
    const id = slice(message, state).deleteId as number;
    return [UserService.delete(id)];
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
