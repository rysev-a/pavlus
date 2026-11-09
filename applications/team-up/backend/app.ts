// The application: one pure function. Each module is a class whose methods
// are the handlers of the messages with those ids (`"chat.send"(message,
// state)`); the function asks the modules in order, and the first one that
// has the method answers. The wiring (server.ts) hands it to createServerApp.

import type { ServerState } from "@pavlus/backend";
import { PagesAPI } from "@pavlus/backend";
import type { Effect, Message } from "@pavlus/core";
import { AccountAPI } from "./api/account.ts";
import { AdminAPI } from "./api/admin.ts";
import { ApplicationsAPI } from "./api/applications.ts";
import { AuthAPI } from "./api/auth.ts";
import { AuthRecoveryAPI } from "./api/auth-recovery.ts";
import { AvatarAPI } from "./api/avatar.ts";
import { BlogAPI } from "./api/blog.ts";
import { ChatAPI } from "./api/chat.ts";
import { DirectoryAPI } from "./api/directory.ts";
import { FriendsAPI } from "./api/friends.ts";
import { HubAPI } from "./api/hub.ts";
import { MatchAPI } from "./api/match.ts";
import { MembersAPI } from "./api/members.ts";
import { ModerationAPI } from "./api/moderation.ts";
import { SitePagesAPI } from "./api/pages.ts";
import { PeopleAPI } from "./api/people.ts";
import { ProfilesAPI } from "./api/profiles.ts";
import { ProjectsAPI } from "./api/projects.ts";
import { PublicProjectsAPI } from "./api/public-projects.ts";
import { SavedAPI } from "./api/saved.ts";
import { SiteAPI } from "./api/site.ts";
import { TasksAPI } from "./api/tasks.ts";
import { WelcomeAPI } from "./api/welcome.ts";

/** A handler method of a module: one message id, (message, state) => effects. */
type ModuleMethod = (
  message: Message,
  state: ServerState,
) => Effect | Effect[] | void;

/** The pure application — every flow of the port, plus the pages. */
export function createTeamUpApp() {
  const modules = [
    new AuthAPI(),
    new AuthRecoveryAPI(),
    new AccountAPI(),
    new AvatarAPI(),
    new DirectoryAPI(),
    new ProfilesAPI(),
    new ProjectsAPI(),
    new MatchAPI(),
    new ApplicationsAPI(),
    // the cabinet of the app (`/app/projects`) and the person page
    new HubAPI(),
    new PeopleAPI(),
    new FriendsAPI(),
    new ChatAPI(),
    // the public site (the original teamUP)
    new SiteAPI(),
    new SitePagesAPI(),
    new PagesAPI(),
    new BlogAPI(),
    new MembersAPI(),
    new PublicProjectsAPI(),
    // trust and safety: the reports, the blocks, the queue
    new ModerationAPI(),
    new SavedAPI(),
    // the back office: the members, the roles, the permissions, the sessions
    new AdminAPI(),
    // the tasks of the system (the original's `system_tasks`)
    new TasksAPI(),
    // the welcome page of the app
    new WelcomeAPI(),
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
