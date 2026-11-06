// The application: one pure function. Each module answers the messages of its
// routes and returns undefined for the others, so the modules compose with a
// loop. The wiring (server.ts) hands it to createServerApp; flow-fetch.ts runs
// the same function in-process for the server render.

import type { ServerState } from "@pavlus/backend";
import type { Effect, Message } from "@pavlus/frontend";
import { createResetModule } from "./modules/reset.ts";
import { handle as mod_pages } from "./modules/pages.ts";
import { handle as mod_roles } from "./modules/roles.ts";
import { handle as mod_users } from "./modules/users.ts";

/** The pure application. `resetSql`: the statements `POST /api/reset` runs. */
export function createAdminApp(resetSql: string[]) {
  const modules = [
    mod_users,
    mod_roles,
    createResetModule(resetSql),
    mod_pages,
  ];
  return (msg: Message, state: ServerState): Effect[] => {
    for (const handle of modules) {
      const effects = handle(msg, state);
      if (effects) return effects;
    }
    return [];
  };
}

export type AdminApp = ReturnType<typeof createAdminApp>;
