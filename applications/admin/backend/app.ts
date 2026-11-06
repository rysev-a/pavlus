// The application: one pure function. Each module is a class whose methods
// are the handlers of the messages with those ids (`"users.list"(message,
// state)`); the function below asks the modules in order, and the first one
// that has the method answers. The wiring (server.ts) hands it to
// createServerApp; the flow fetch (the framework's) runs the same function
// in-process for the server render.

import type { ServerState } from "@pavlus/backend";
import { PagesAPI } from "@pavlus/backend";
import type { Effect, Message } from "@pavlus/core";
import { ResetAPI } from "./api/reset/reset.ts";
import { RolesAPI } from "./api/roles/roles.ts";
import { UsersAPI } from "./api/users/users.ts";

/** A handler method of a module: one message id, (message, state) => effects. */
type ModuleMethod = (
  message: Message,
  state: ServerState,
) => Effect | Effect[] | void;

/** The pure application. `resetSql`: the statements `POST /api/reset` runs. */
export function createAdminApp(resetSql: string[]) {
  const modules = [
    new UsersAPI(),
    new RolesAPI(),
    new ResetAPI(resetSql),
    new PagesAPI(),
  ];
  return (msg: Message, state: ServerState): Effect[] => {
    for (const m of modules) {
      const fn = (m as unknown as Record<string, ModuleMethod>)[msg.id];
      if (typeof fn !== "function") continue;
      const out = fn.call(m, msg, state);
      if (out === undefined) return [];
      return Array.isArray(out) ? out : [out];
    }
    return [];
  };
}

export type AdminApp = ReturnType<typeof createAdminApp>;
