/**
 * The application root: two halves in one shell. The public site (the
 * original teamUP: the home, the project catalog, the blog, the members and
 * the about page) wears its header and footer; the signed-in app lives under
 * `/app` and wears the app shell. Each page is a routed child that owns its
 * slice of the state and paints itself.
 */
import {
  type Children,
  Component,
  type ComponentCtx,
  type Effect,
  type Message,
  type Routing,
  viewOf,
} from "@pavlus/frontend";
import {
  httpEffector as http,
  routerEffector as router,
  storeEffector as store,
  timeEffector as time,
} from "@pavlus/frontend/plugins";
import { DomPlugin } from "@pavlus/frontend/plugins/dom";
import { AboutPage } from "./about/about.ts";
import { AdminPage } from "./admin/admin.ts";
import view from "./app.pavlus";
import { BlogPage } from "./blog/blog.ts";
import { BlogPostPage } from "./blog-post/blog-post.ts";
import { ChatPage } from "./chat/chat.ts";
import { FriendsPage } from "./friends/friends.ts";
import { ProjectsHubPage } from "./projects-hub/hub.ts";
import { HomePage } from "./home/home.ts";
import { LoginPage } from "./login/login.ts";
import { MemberPage } from "./member/member.ts";
import { ModerationPage } from "./moderation/moderation.ts";
import { MyProfilePage } from "./my-profile/my-profile.ts";
import { MembersPage } from "./members/members.ts";
import { NotFoundPage } from "./not-found/not-found.ts";
import { ProfessionsPage } from "./professions/professions.ts";
import { ProjectPage } from "./project/project.ts";
import { ProjectNewPage } from "./project-new/project-new.ts";
import { PersonPage } from "./person/person.ts";
import { ProjectPublicPage } from "./project-public/project-public.ts";
import { ProjectsPage } from "./projects/projects.ts";
import { SettingsPage } from "./settings/settings.ts";
import { AuthRecoveryPage } from "./recovery/recovery.ts";
import { SignupPage } from "./signup/signup.ts";
import { SiteHeader } from "./site/header.ts";
import type { AppState, Me } from "./state.ts";
import { WelcomePage } from "./welcome/welcome.ts";

/** The path the signed-in app starts at. */
export const APP_BASE = "/app";

export class App extends Component<AppState> {
  view = view;

  private readonly home = new HomePage();
  private readonly about = new AboutPage();
  private readonly projects = new ProjectsPage();
  private readonly projectPublic = new ProjectPublicPage();
  private readonly blog = new BlogPage();
  private readonly blogPost = new BlogPostPage();
  private readonly members = new MembersPage();
  private readonly member = new MemberPage();
  private readonly notFound = new NotFoundPage();

  private readonly login = new LoginPage();
  private readonly signup = new SignupPage();
  /** The account recovery: the three addresses of the original. */
  private readonly forgot = new AuthRecoveryPage();
  private readonly reset = new AuthRecoveryPage();
  private readonly verify = new AuthRecoveryPage();
  private readonly welcome = new WelcomePage();
  /** The cabinet (`/app/projects`): the three tabs of the original. */
  private readonly hub = new ProjectsHubPage("mine");
  private readonly hubActivity = new ProjectsHubPage("activity");
  private readonly hubMatch = new ProjectsHubPage("match");
  private readonly project = new ProjectPage();
  /** The person page (`/app/people/:slug`). */
  private readonly person = new PersonPage();
  private readonly projectNew = new ProjectNewPage();
  private readonly chat = new ChatPage();
  /** The same page for the address of a thread (`/app/messages/:id`). */
  private readonly chatThread = new ChatPage();
  /** The back office (the panel of the original's admin_ui). */
  private readonly admin = new AdminPage();
  private readonly adminRoles = new AdminPage();
  private readonly adminPermissions = new AdminPage();
  private readonly adminSessions = new AdminPage();
  private readonly adminTasks = new AdminPage();
  /** The profile editor (`/app/profile`). */
  private readonly myProfile = new MyProfilePage();
  private readonly settings = new SettingsPage();
  /** The moderation queue (`/app/moderation`). */
  private readonly moderation = new ModerationPage();
  /** The friends page (`/app/friends`). */
  private readonly friends = new FriendsPage();
  /** The professions page (`/app/professions`). */
  private readonly professions = new ProfessionsPage();

  /** The header of the public site (its own child: the burger menu). */
  private readonly header = new SiteHeader();

  /** The embedded children, by instance name (`header.…` goes to the header). */
  children: Children<AppState> = {
    header: {
      component: this.header,
      key: "site",
      props: (s) => ({ path: s.route?.path ?? "/" }),
    },
  };

  routing: Routing<AppState> = {
    // the public site (the original teamUP)
    "/": { component: this.home, key: "home", name: "home" },
    "/about": { component: this.about, key: "about", name: "about" },
    "/projects": {
      component: this.projects,
      key: "projects",
      name: "projects",
    },
    "/projects/:slug": {
      component: this.projectPublic,
      key: "projectPublic",
      name: "projectPublic",
    },
    "/blog": { component: this.blog, key: "blog", name: "blog" },
    "/blog/:pid": {
      component: this.blogPost,
      key: "blogPost",
      name: "blogPost",
    },
    "/users": { component: this.members, key: "members", name: "members" },
    "/users/:slug": {
      component: this.member,
      key: "member",
      name: "member",
    },
    // the signed-in app
    "/app": { component: this.welcome, key: "welcome", name: "welcome" },
    "/app/login": { component: this.login, key: "login", name: "login" },
    "/app/signup": { component: this.signup, key: "signup", name: "signup" },
    "/app/forgot": {
      component: this.forgot,
      key: "authRecovery",
      name: "forgot",
    },
    "/app/reset": {
      component: this.reset,
      key: "authRecovery",
      name: "reset",
    },
    "/app/verify": {
      component: this.verify,
      key: "authRecovery",
      name: "verify",
    },
    // before "/app/projects/:slug": the same length, so the first one wins
    "/app/projects/new": {
      component: this.projectNew,
      key: "projectNew",
      name: "projectNew",
    },
    // the cabinet's tabs (the original's routes)
    "/app/projects": {
      component: this.hub,
      key: "hub",
      name: "projectsHub",
    },
    "/app/projects/activity": {
      component: this.hubActivity,
      key: "hub",
      name: "projectsActivity",
    },
    "/app/projects/match": {
      component: this.hubMatch,
      key: "hub",
      name: "projectsMatch",
    },
    "/app/projects/:slug": {
      component: this.project,
      key: "project",
      name: "project",
    },
    "/app/messages": { component: this.chat, key: "chat", name: "chat" },
    "/app/messages/:id": {
      component: this.chatThread,
      key: "chat",
      name: "chatThread",
    },
    "/app/settings": {
      component: this.settings,
      key: "settings",
      name: "settings",
    },
    "/app/moderation": {
      component: this.moderation,
      key: "moderation",
      name: "moderation",
    },
    "/app/friends": {
      component: this.friends,
      key: "friends",
      name: "friends",
    },
    "/app/professions": {
      component: this.professions,
      key: "professions",
      name: "professions",
    },
    "/app/people/:slug": {
      component: this.person,
      key: "person",
      name: "person",
    },
    "/app/profile": {
      component: this.myProfile,
      key: "myProfile",
      name: "myProfile",
    },
    // the back office: every section is its own route (the original's)
    "/app/admin": { component: this.admin, key: "admin", name: "admin" },
    "/app/admin/roles": {
      component: this.adminRoles,
      key: "admin",
      name: "roles",
    },
    "/app/admin/permissions": {
      component: this.adminPermissions,
      key: "admin",
      name: "permissions",
    },
    "/app/admin/sessions": {
      component: this.adminSessions,
      key: "admin",
      name: "sessions",
    },
    "/app/admin/tasks": {
      component: this.adminTasks,
      key: "admin",
      name: "tasks",
    },
    // everything else
    "*": { component: this.notFound, key: "notFound", name: "notFound" },
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
      // the header of the public site: the language and the visitor
      http.request({
        id: "site",
        url: "/api/site",
        onSuccess: "site.loaded",
        onError: "site.failed",
      }),
    ];
  }

  /** The route changed: the shell writes which layout it wears. */
  routeChanged(msg: Message, _s: AppState, ctx: ComponentCtx): Effect[] {
    const path = (msg.payload as { path?: string })?.path ?? "";
    // the old addresses of the original: the skills form lives in the
    // professions now, and the cabinet moved from /app/startups to
    // /app/projects
    if (path === "/app/skills")
      return [router.navigate("/app/professions", { absolute: true })];
    if (path === "/app/startups" || path.startsWith("/app/startups/"))
      return [
        router.navigate(`/app/projects${path.slice("/app/startups".length)}`, {
          absolute: true,
        }),
      ];
    return [
      store.set("shell.app", path.startsWith(APP_BASE)),
      ...ctx.setRoute(msg.payload),
    ];
  }

  paint(msg: Message): Effect[] {
    const { prev, next } = msg.payload as { prev: AppState; next: AppState };
    return [DomPlugin.update(viewOf(this)!.diff(prev, next))];
  }

  "me.loaded"(msg: Message): Effect[] {
    const me = (msg.payload as { data: Me }).data;
    return [
      store.set("me", me, { onSuccess: "paint" }),
      // the nav's badge of the unread messages (the original polls it)
      http.request({
        id: "unread",
        url: "/api/chat/unread",
        onSuccess: "unread.loaded",
        onError: "unread.loaded",
      }),
      time.setInterval("unread", 10000, "unread.poll"),
    ];
  }

  /** A guest: the app pages send them to the login, the public ones stay. */
  "me.guest"(msg: Message, state: AppState): Effect[] {
    void msg;
    const effects: Effect[] = [store.set("me", null, { onSuccess: "paint" })];
    const path = state.route?.path ?? "";
    // the signup page is the one app page a guest may see: it is the way in
    const open = ["/app/login", "/app/signup"];
    if (path.startsWith(APP_BASE) && !open.includes(path)) {
      effects.push(router.navigate("/app/login", { absolute: true }));
    }
    return effects;
  }

  /** The poll of the nav's badge. */
  "unread.poll"(): Effect[] {
    return [
      http.request({
        id: "unread",
        url: "/api/chat/unread",
        onSuccess: "unread.loaded",
        onError: "unread.loaded",
      }),
    ];
  }

  "unread.loaded"(msg: Message): Effect[] {
    const count =
      (msg.payload as { data?: { count?: number } })?.data?.count ?? 0;
    return [store.set("shell.unread", count, { onSuccess: "paint" })];
  }

  /** The shell of the public site (the header and the footer). */
  "site.loaded"(msg: Message): Effect[] {
    // a merge, not a set: the burger of the header is the client's own state
    const site = msg.payload as {
      data: Omit<AppState["site"], "burger">;
    };
    return [store.merge("site", site.data, { onSuccess: "paint" })];
  }

  "site.failed"(): Effect[] {
    return [];
  }

  /** A click outside the burger: the menu closes. */
  closeMenu(_msg: Message, s: AppState): Effect[] {
    if (!s.site.burger) return [];
    return [store.set("site.burger", false, { onSuccess: "paint" })];
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
      router.navigate("/app/login", { absolute: true }),
    ];
  }
}

export const app = new App();
