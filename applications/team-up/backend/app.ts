// The application: one pure function. Each module is a class whose methods
// are the handlers of the messages with those ids (`"chat.send"(message,
// state)`); the function asks the modules in order, and the first one that
// has the method answers. The wiring (server.ts) hands it to createServerApp.

import type { ServerState } from "@pavlus/backend";
import { PagesAPI } from "@pavlus/backend";
import type { Effect, Message } from "@pavlus/core";
import { ApplicationsAPI } from "./api/applications.ts";
import { AuthAPI } from "./api/auth.ts";
import { ChatAPI } from "./api/chat.ts";
import { DirectoryAPI } from "./api/directory.ts";
import { FriendsAPI } from "./api/friends.ts";
import { MatchAPI } from "./api/match.ts";
import { ProfilesAPI } from "./api/profiles.ts";
import { ProjectsAPI } from "./api/projects.ts";

/** A handler method of a module: one message id, (message, state) => effects. */
type ModuleMethod = (
  message: Message,
  state: ServerState,
) => Effect | Effect[] | void;

/** The pure application — every flow of the port, plus the pages. */
export function createTeamUpApp() {
  const modules = [
    new AuthAPI(),
    new DirectoryAPI(),
    new ProfilesAPI(),
    new ProjectsAPI(),
    new MatchAPI(),
    new ApplicationsAPI(),
    new FriendsAPI(),
    new ChatAPI(),
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

export type TeamUpApp = ReturnType<typeof createTeamUpApp>;
