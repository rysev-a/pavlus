// Roles (api): a class whose methods are the handlers of the messages with
// those ids. The db work is RoleService's (db/services).

import { httpEffector, rowsOf } from "@pavlus/backend";
import type { Effect, Message } from "@pavlus/core";
import { type RoleRow, RoleService } from "../../db/services/role-service.ts";

export class RolesAPI {
  "roles.list"(): Effect[] {
    return [RoleService.list()];
  }

  "roles.list.onSuccess"(message: Message): Effect[] {
    return [httpEffector.makeResponse(200, rowsOf<RoleRow>(message))];
  }

  "roles.failed"(): Effect[] {
    return [httpEffector.makeResponse(500, { error: "internal error" })];
  }
}
