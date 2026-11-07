/**
 * The application root: a shell with a nav and an outlet. Each page is a
 * routed child that owns its slice of the state and paints itself; the shell
 * owns the route and the session (`mounted` starts the router and asks
 * /api/auth/me; a 401 answers "guest", and every page but the login one
 * redirects there).
 */
import {
  Component,
  type Effect,
  type Message,
  type Routing,
  viewOf,
} from "@pavlus/frontend";
import {
  httpEffector as http,
  routerEffector as router,
  storeEffector as store,
} from "@pavlus/frontend/plugins";
import { DomPlugin } from "@pavlus/frontend/plugins/dom";
import view from "./app.pavlus";
import { ChatPage } from "./chat/chat.ts";
import { FeedPage } from "./feed/feed.ts";
import { LoginPage } from "./login/login.ts";
import { ProfilePage } from "./profile/profile.ts";
import { ProjectPage } from "./project/project.ts";
import type { AppState, Me } from "./state.ts";

export class App extends Component<AppState> {
  view = view;

  private readonly login = new LoginPage();
  private readonly feed = new FeedPage();
  private readonly project = new ProjectPage();
  private readonly chat = new ChatPage();
  private readonly profile = new ProfilePage();

  routing: Routing<AppState> = {
    "/login": { component: this.login, key: "login", name: "login" },
    "/": { component: this.feed, key: "feed", name: "feed" },
    "/projects/:slug": {
      component: this.project,
      key: "project",
      name: "project",
    },
    "/chat": {
      component: this.chat,
      key: "chat",
      name: "chat",
      props: (s) => ({ meId: s.me ? s.me.id : 0 }),
    },
    "/people/:slug": {
      component: this.profile,
      key: "profile",
      name: "profile",
    },
  };

  mounted(): Effect[] {
    return [
      router.listen("routeChanged"),
      http.request({
        id: "me",
        url: "/api/auth/me",
        onSuccess: "me.loaded",
        onError: "me.guest",
      }),
    ];
  }

  paint(msg: Message): Effect[] {
    const { prev, next } = msg.payload as { prev: AppState; next: AppState };
    return [DomPlugin.update(viewOf(this)!.diff(prev, next))];
  }

  "me.loaded"(msg: Message): Effect[] {
    const me = (msg.payload as { data: Me }).data;
    return [store.set("me", me, { onSuccess: "paint" })];
  }

  "me.guest"(): Effect[] {
    return [
      store.set("me", null, { onSuccess: "paint" }),
      router.navigate("/login"),
    ];
  }

  /** The login page succeeded (a parent observes its messages): the cookie is
   * set, so ask who it belongs to — the page itself navigates. */
  "login.ok"(): Effect[] {
    return [
      http.request({
        id: "me",
        url: "/api/auth/me",
        onSuccess: "me.loaded",
        onError: "me.guest",
      }),
    ];
  }

  /** The avatar button: the dropdown opens and closes. */
  toggleMenu(msg: Message, s: AppState): Effect[] {
    void msg;
    return [store.set("shell.menu", !s.shell.menu, { onSuccess: "paint" })];
  }

  /** The nav's sign-out: back to the login page. */
  signOut(): Effect[] {
    return [
      http.request({
        id: "logout",
        url: "/api/auth/logout",
        method: "POST",
        onSuccess: "signedOut",
        onError: "signedOut",
      }),
    ];
  }

  signedOut(): Effect[] {
    return [
      store.set("me", null, { onSuccess: "paint" }),
      router.navigate("/login"),
    ];
  }
}

export const app = new App();
