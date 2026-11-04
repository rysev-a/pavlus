/**
 * The application root: a shell with an outlet and a routing table. Each page
 * is a routed child that owns its slice of the state and paints itself; the
 * shell only owns the route: `mounted` starts the router (its reports become
 * `routeChanged`, the default handler of a component with `routing`) and
 * loads the role catalogue, passed to the forms as a prop. A route change is
 * the shell's own write, so it paints in the shell's paint: the outlet's old
 * page goes, the new one renders.
 */
import {
  Component,
  type Effect,
  type Message,
  type Routing,
  viewOf,
} from "@service-laboratory/pavlus";
import {
  httpEffector as http,
  routerEffector as router,
  storeEffector as store,
} from "@service-laboratory/pavlus/plugins";
import { DomPlugin } from "@service-laboratory/pavlus/plugins/dom";
import view from "./app.pavlus";
import { UserEdit } from "./user-edit/user-edit.ts";
import { UserNew } from "./user-new/user-new.ts";
import { UserList } from "./user-list/user-list.ts";
import type { AppState, Role } from "./state.ts";

export class App extends Component<AppState> {
  view = view;

  /** The pages, each with its state key: `edit.x` reaches that page. */
  private readonly list = new UserList();
  private readonly editPage = new UserEdit();
  private readonly create = new UserNew();

  /** Which page shows at which path (the template's `+outlet`). */
  routing: Routing<AppState> = {
    "/": { component: this.list, key: "list", name: "list" },
    "/new": {
      component: this.create,
      key: "new",
      name: "new",
      props: (s) => ({ roles: s.roles }),
    },
    "/:id/edit": {
      component: this.editPage,
      key: "edit",
      name: "edit",
      props: (s) => ({ roles: s.roles }),
    },
  };

  /**
   * `createApp({ mount })` dispatches this once the shell is in the DOM: the
   * router starts reporting (the first report activates the first page), the
   * role catalogue loads once.
   */
  mounted(): Effect[] {
    return [
      router.listen("routeChanged"),
      http.request({
        id: "roles",
        url: "/api/roles",
        onSuccess: "roles.loaded",
        onError: "roles.failed",
      }),
    ];
  }

  /**
   * The shell's own paint: the answer of a shell-level write — the route, the
   * role catalogue — with the whole state before and after it. What the diff
   * sees reaching the outlet: another page clears and renders, the same page
   * diffs itself.
   */
  paint(msg: Message): Effect[] {
    const { prev, next } = msg.payload as {
      prev: AppState;
      next: AppState;
    };
    return [DomPlugin.update(viewOf(this)!.diff(prev, next))];
  }

  /** The role catalogue, loaded once; the forms read it as a prop. */
  "roles.loaded"(msg: Message): Effect[] {
    const roles = (msg.payload as { data: Role[] }).data;
    return [store.set("roles", roles)];
  }

  /** Nothing to show: the forms snapshot the roles they had on open. */
  "roles.failed"(): Effect[] {
    return [];
  }
}

export const app = new App();
