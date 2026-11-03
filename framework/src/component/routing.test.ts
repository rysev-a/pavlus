import { describe, expect, test } from "vitest";
import type { Effect, Message } from "../core/types.ts";
import {
  type Children,
  Component,
  type ComponentCtx,
  toHandler,
} from "./mod.ts";
import { routerEffector as router } from "../plugins/router/helpers.ts";
import { storeEffector as store } from "../plugins/store/helpers.ts";
import type { Routing } from "../routing/mod.ts";

const eff = (type: string, extra: object = {}): Effect => ({
  plugin: "t",
  type,
  ...extra,
});
const view = { render: () => [], diff: () => [] };
/** What `enter` receives: the route the child got. */
const routeOf = (msg: { payload?: unknown }) =>
  msg.payload as { params: Record<string, string> };

// users and roles: the tabs of the dashboard
class Users extends Component {
  view = view;
  select(msg: Message) {
    return [store.set("selected", msg.payload)];
  }
  peek(_m: Message, s: { route: unknown }) {
    return [eff("route", { route: s.route })];
  }
  go() {
    return [router.navigate("/x")];
  }
  goAbsolute() {
    return [router.navigate("/x", { absolute: true })];
  }
  enter(msg: Message) {
    return [eff("users.enter", { params: routeOf(msg).params })];
  }
  leave() {
    return [eff("users.leave")];
  }
}
class Roles extends Component {
  view = view;
  enter() {
    return [eff("roles.enter")];
  }
  leave() {
    return [eff("roles.leave")];
  }
}
class Dashboard extends Component {
  view = view;
  routing: Routing = {
    "/": { component: new Users(), key: "users", name: "users" },
    "/roles": { component: new Roles(), key: "roles" },
  };
  tab(msg: Message) {
    return [router.navigate(msg.payload as string)];
  }
  enter() {
    return [eff("dashboard.enter")];
  }
  leave() {
    return [eff("dashboard.leave")];
  }
}
class Detail extends Component {
  view = view;
  enter(msg: Message) {
    return [eff("detail.enter", { id: routeOf(msg).params.id })];
  }
  leave() {
    return [eff("detail.leave")];
  }
}
class About extends Component {
  view = view;
  enter() {
    return [eff("about.enter")];
  }
}
class Header extends Component {
  ping() {
    return [eff("header.ping")];
  }
}
class Home extends Component {
  view = view;
}
class Shell extends Component {
  view = view;
  children: Children = { header: { component: new Header() } };
  routing: Routing = {
    "/": { component: new Home(), name: "home" },
    "/about": { component: new About() },
    "/dashboard": { component: new Dashboard(), key: "dashboard" },
    "/items/:id": { component: new Detail(), key: "item" },
    "*": { view },
  };
  routeChanged(msg: Message, _s: unknown, { setRoute }: ComponentCtx) {
    return setRoute(msg.payload);
  }
}
const shell = new Shell();
const handle = toHandler(shell);

const where = (path: string) => ({ path, search: "", hash: "" });
const state = (path: string) => ({
  route: { ...where(path), base: "", params: {} },
});

describe("routed children are children", () => {
  test("messages go down two levels; store paths and prefixes follow", () => {
    expect(
      handle({ id: "dashboard.users.select", payload: 5 }, state("/dashboard")),
    ).toEqual([store.set("dashboard.users.selected", 5)]);
  });

  test("regular children work next to routing", () => {
    expect(handle({ id: "header.ping" }, state("/"))).toEqual([
      eff("header.ping"),
    ]);
  });

  test("ctx.send reaches a routed child by its name", () => {
    class Parent extends Component {
      routing: Routing = {
        "/dashboard": { component: new Dashboard(), key: "dashboard" },
      };
      start(_m: Message, _s: unknown, { send }: ComponentCtx) {
        return send("dashboard", "tab", "/roles");
      }
    }
    expect(
      toHandler(new Parent())({ id: "start" }, state("/dashboard")),
    ).toEqual([router.navigate("/dashboard/roles", { absolute: true })]);
  });

  test("two children with one name are an error that says how to fix it", () => {
    class Clash extends Component {
      children: Children = { dashboard: { component: new Dashboard() } };
      routing: Routing = { "/dashboard": { component: new Dashboard() } };
    }
    expect(() => toHandler(new Clash())({ id: "x" }, {})).toThrow(
      /two children named "dashboard".*`name`/,
    );
  });
});

describe("the route a child sees", () => {
  test("`route` holds what is left below the child's base", () => {
    const route = (path: string) =>
      (
        handle({ id: "dashboard.users.peek" }, state(path))[0] as unknown as {
          route: unknown;
        }
      ).route;
    expect(route("/dashboard")).toEqual({
      path: "/",
      base: "/dashboard",
      params: {},
      search: "",
      hash: "",
    });
  });
});

describe("relative navigation", () => {
  test("a navigate from a routed child gets its base", () => {
    expect(
      handle({ id: "dashboard.tab", payload: "/roles" }, state("/dashboard")),
    ).toEqual([router.navigate("/dashboard/roles", { absolute: true })]);
  });

  test("a nested child is prefixed once with the whole base, not once per level", () => {
    expect(handle({ id: "dashboard.users.go" }, state("/dashboard"))).toEqual([
      router.navigate("/dashboard/x", { absolute: true }),
    ]);
  });

  test("`absolute` leaves the url alone", () => {
    expect(
      handle({ id: "dashboard.users.goAbsolute" }, state("/dashboard")),
    ).toEqual([router.navigate("/x", { absolute: true })]);
  });

  test('"/" means the child itself', () => {
    class Page extends Component {
      home() {
        return [router.navigate("/")];
      }
    }
    class Parent extends Component {
      routing: Routing = { "/dashboard": { component: new Page() } };
    }
    expect(
      toHandler(new Parent())({ id: "dashboard.home" }, state("/dashboard")),
    ).toEqual([router.navigate("/dashboard", { absolute: true })]);
  });
});

describe("setRoute: enter and leave", () => {
  const route = (path: string, extra: object = {}) => ({
    ...where(path),
    base: "",
    params: {},
    ...extra,
  });
  const change = (from: string | null, to: string) =>
    handle(
      { id: "routeChanged", payload: where(to) },
      from === null ? { route: null } : state(from),
    );

  test("the first location stores the route and enters the whole chain, top down", () => {
    expect(change(null, "/dashboard")).toEqual([
      store.set("route", route("/dashboard")),
      eff("dashboard.enter"),
      eff("users.enter", { params: {} }),
    ]);
  });

  test("switching a tab: the old child leaves, the new one enters, the parent stays", () => {
    expect(change("/dashboard", "/dashboard/roles").slice(1)).toEqual([
      eff("users.leave"),
      eff("roles.enter"),
    ]);
  });

  test("leaving a page: deepest first; then the new page enters", () => {
    expect(change("/dashboard/roles", "/about").slice(1)).toEqual([
      eff("roles.leave"),
      eff("dashboard.leave"),
      eff("about.enter"),
    ]);
  });

  test("the same page again, or a change only in search/hash: nothing", () => {
    expect(change("/about", "/about")).toEqual([
      store.set("route", route("/about")),
    ]);
    expect(
      handle(
        {
          id: "routeChanged",
          payload: { path: "/about", search: "?a=1", hash: "#h" },
        },
        state("/about"),
      ).slice(1),
    ).toEqual([]);
  });

  test("a leaf page re-enters when only its params change", () => {
    expect(change("/items/5", "/items/7").slice(1)).toEqual([
      eff("detail.enter", { id: "7" }),
    ]);
    expect(change("/items/5", "/items/5").slice(1)).toEqual([]);
  });

  test("an unknown path with a view-only fallback: leaves the old, enters nothing", () => {
    expect(change("/about", "/nope").slice(1)).toEqual([]);
    expect(change("/dashboard", "/nope").slice(1)).toEqual([
      eff("users.leave"),
      eff("dashboard.leave"),
    ]);
  });

  test("a page that is only a view has no handler, so entering it is harmless", () => {
    expect(change("/about", "/")).toEqual(
      [store.set("route", route("/"))].concat([]),
    );
  });
});

describe("defaults for messages nobody handles", () => {
  class Tabs extends Component {
    view = view;
    routing: Routing = { "/a": { view }, "*": { view } };
  }
  class Shell extends Component {
    view = view;
    routing: Routing = {
      "/": { view },
      "/tabs": { component: new Tabs(), key: "tabs" },
    };
  }
  const handle = toHandler(new Shell());
  const at = (path: string) => ({
    tabs: {},
    route: { ...where(path), base: "", params: {} },
  });

  test("`navigate` from a template becomes a relative router.navigate", () => {
    expect(handle({ id: "navigate", payload: "/about" }, at("/"))).toEqual([
      router.navigate("/about"),
    ]);
    // an embedded template (`+Header#header`) or a view-only page
    expect(handle({ id: "header.navigate", payload: "/x" }, at("/"))).toEqual([
      router.navigate("/x"),
    ]);
    expect(handle({ id: "index.navigate", payload: "/x" }, at("/"))).toEqual([
      router.navigate("/x"),
    ]);
  });

  test("inside a routed child the default navigate is relative to the child", () => {
    expect(handle({ id: "tabs.navigate", payload: "/a" }, at("/tabs"))).toEqual(
      [router.navigate("/tabs/a", { absolute: true })],
    );
    expect(
      handle({ id: "tabs.fallback.navigate", payload: "/" }, at("/tabs/nope")),
    ).toEqual([router.navigate("/tabs", { absolute: true })]);
  });

  test("a navigate without a url, or an unknown message, does nothing", () => {
    expect(handle({ id: "navigate" }, at("/"))).toEqual([]);
    expect(handle({ id: "whatever", payload: "/x" }, at("/"))).toEqual([]);
  });

  test("with `routing`: mounted listens, routeChanged sets the route", () => {
    expect(handle({ id: "mounted" }, at("/"))).toEqual([
      router.listen("routeChanged"),
    ]);
    const location = { path: "/tabs/a", search: "", hash: "" };
    expect(handle({ id: "routeChanged", payload: location }, at("/"))).toEqual([
      store.set("route", { ...location, base: "", params: {} }),
    ]);
  });

  test("without `routing` there is no router wiring", () => {
    class Leaf extends Component {
      view = view;
    }
    const leaf = toHandler(new Leaf());
    expect(leaf({ id: "mounted" }, {})).toEqual([]);
    expect(leaf({ id: "routeChanged", payload: {} }, {})).toEqual([]);
  });

  test("an own handler replaces the default", () => {
    class Custom extends Component {
      view = view;
      routing: Routing = { "/": { view } };
      navigate(msg: Message) {
        return [router.navigate(msg.payload as string, { replace: true })];
      }
      mounted() {
        return [eff("custom")];
      }
    }
    const h = toHandler(new Custom());
    expect(h({ id: "navigate", payload: "/x" }, at("/"))).toEqual([
      router.navigate("/x", { replace: true }),
    ]);
    expect(h({ id: "mounted" }, at("/"))).toEqual([eff("custom")]);
  });
});
