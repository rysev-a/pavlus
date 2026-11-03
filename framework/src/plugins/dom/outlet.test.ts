// @vitest-environment jsdom
import { describe, expect, test } from "vitest";
import { compileToView } from "../../compiler/mod.ts";
import { Component } from "../../component/mod.ts";
import type { Routing } from "../../routing/mod.ts";
import { mountView } from "../../testing/mod.ts";

// The pages: each is a component with a view (or a bare view).
const usersView = compileToView(
  `ul.users
  for u in users key u.id
    li.user(@click=pick(u.id)) {u.name}`,
);
const rolesView = compileToView(`p.roles {roles.length} roles`);
const homeView = compileToView(`h1.home {title}`);
const aboutView = compileToView(`p.about about`);
const detailView = compileToView(`p.detail item {route.params.id}`);
const missingView = compileToView(`p.missing no page at {route.path}`);

const dashboardView = compileToView(
  `section.dashboard
  p.base {route.base}
  +outlet`,
);
const shellView = compileToView(
  `nav
  a.link(href="/") home
main
  +outlet
footer {title}`,
);

class Users extends Component {
  view = usersView;
}
class Roles extends Component {
  view = rolesView;
}
class Home extends Component {
  view = homeView;
}
class Dashboard extends Component {
  view = dashboardView;
  routing: Routing = {
    "/": { component: new Users(), key: "users", name: "users" },
    "/roles": { component: new Roles(), key: "roles" },
  };
}
class Shell extends Component {
  view = shellView;
  routing: Routing = {
    "/": { component: new Home(), name: "home" },
    "/about": { view: aboutView },
    "/dashboard": { component: new Dashboard(), key: "dashboard" },
    "/items/:id": { view: detailView },
    "*": { view: missingView },
  };
}
const shell = new Shell();

interface State {
  route: { path: string; search: string; hash: string } | null;
  title: string;
  dashboard: {
    users: { users: { id: number; name: string }[] };
    roles: { roles: string[] };
  };
}

const state = (path: string | null, over: Partial<State> = {}): State => ({
  route: path === null ? null : { path, search: "", hash: "" },
  title: "T",
  dashboard: {
    users: {
      users: [
        { id: 1, name: "Ann" },
        { id: 2, name: "Bob" },
      ],
    },
    roles: { roles: ["admin", "viewer"] },
  },
  ...over,
});

const page = (path: string | null): string => {
  const h = mountView(shell, state(path));
  const html = h.root.querySelector("main")?.textContent ?? null;
  h.unmount();
  return html as string;
};

describe("+outlet renders the page the route matches", () => {
  test("each route, nested levels, params and the fallback", () => {
    expect(page("/")).toBe("T");
    expect(page("/about")).toBe("about");
    expect(page("/dashboard")).toBe("/dashboardAnnBob");
    expect(page("/dashboard/roles")).toBe("/dashboard2 roles");
    expect(page("/items/42")).toBe("item 42");
    expect(page("/nope")).toBe("no page at /nope");
  });

  test("the child's base is what the dashboard sees; nothing without a route", () => {
    expect(page("/dashboard/roles")).toContain("/dashboard");
    const h = mountView(shell, state(null));
    expect(h.root.querySelector("main")?.children.length).toBe(0);
    h.unmount();
  });

  test("a bare view as the root (no component to read `routing` from) is a clear error", () => {
    const view = compileToView(`main\n  +outlet`);
    expect(() => mountView(view, state("/"))).toThrow(/routing/);
  });

  test("events carry the whole prefix: shell > dashboard > users", () => {
    const h = mountView(shell, state("/dashboard"));
    (h.root.querySelectorAll(".user")[1] as HTMLElement).click();
    expect(h.messages[0]).toMatchObject({
      id: "dashboard.users.pick",
      payload: 2,
    });
    h.unmount();
  });
});

describe("an outlet inside an embedded child", () => {
  // A panel is embedded like any child (static or dynamic); its own template
  // has the outlet, so the embed has to hand it the panel's component.
  const panelView = compileToView(`section.panel\n  +outlet`);
  class Panel extends Component {
    view = panelView;
    routing: Routing = {
      "/": { view: aboutView },
      "/roles": { component: new Roles(), key: "roles" },
    };
  }
  const panel = new Panel();

  test("a static embed finds the child's component in `children`", () => {
    const hostView = compileToView(
      `import Panel from "./panel.pavlus"\nmain\n  +Panel#panel(route=route ...dashboard)`,
      {
        components: { Panel: panelView },
      },
    );
    class StaticHost extends Component {
      view = hostView;
      children = { panel: { component: panel } };
    }
    const host = new StaticHost();
    const h = mountView(host, state("/roles"));
    expect(h.root.querySelector(".panel .roles")?.textContent).toBe("2 roles");
    h.set(state("/"));
    expect(h.root.querySelector(".panel .about")?.textContent).toBe("about");
    expect(h.root.querySelector(".roles")).toBeNull();
    h.unmount();
  });

  test("a dynamic embed uses the component value itself", () => {
    const hostView = compileToView(
      `main\n  +{panelComponent}#panel(route=route ...dashboard)`,
    );
    class DynamicHost extends Component {
      view = hostView;
    }
    const host = new DynamicHost();
    const withPanel = (path: string) => ({
      ...state(path),
      panelComponent: panel,
    });
    const h = mountView(host, withPanel("/roles"));
    expect(h.root.querySelector(".panel .roles")?.textContent).toBe("2 roles");
    h.set(withPanel("/"));
    expect(h.root.querySelector(".panel .about")?.textContent).toBe("about");
    h.unmount();
  });
});

describe("changing the route", () => {
  test("another page: the old one is cleared and the new one inserted", () => {
    const patches = shellView.diff(state("/"), state("/about"), "", "", shell);
    expect(patches.map((p) => p.op)).toEqual(["clear", "insert"]);
  });

  test("the same page: only what changed inside it is patched", () => {
    const next = state("/", { title: "T2" });
    const patches = shellView.diff(state("/"), next, "", "", shell);
    expect(patches.map((p) => p.op)).toEqual(["text", "text"]); // <h1> and <footer>
  });

  test("switching the inner page keeps the outer one in the DOM", () => {
    const h = mountView(shell, state("/dashboard"));
    const section = h.root.querySelector(".dashboard");
    h.set(state("/dashboard/roles"));
    expect(h.root.querySelector(".dashboard")).toBe(section); // not rebuilt
    expect(h.root.querySelector(".roles")?.textContent).toBe("2 roles");
    expect(h.root.querySelector(".users")).toBeNull();
    h.unmount();
  });

  test("leaving and unmounting release every listener", () => {
    const h = mountView(shell, state("/dashboard"));
    expect(h.dom.stats().listeners).toBe(2);
    h.set(state("/about"));
    expect(h.dom.stats().listeners).toBe(0);
    h.set(state("/dashboard"));
    expect(h.dom.stats().listeners).toBe(2);
    h.unmount();
    expect(h.dom.stats()).toEqual({ mounts: 0, nodes: 0, listeners: 0 });
  });
});

describe("diff equals a fresh render (random routes and state)", () => {
  const paths = [
    "/",
    "/about",
    "/dashboard",
    "/dashboard/roles",
    "/dashboard/zzz",
    "/items/1",
    "/items/2",
    "/nope",
    null,
  ];
  const rng = (seed: number) => () =>
    (seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32;

  test("300 sequences", () => {
    const r = rng(77);
    const pick = <T>(xs: T[]): T => xs[Math.floor(r() * xs.length)];
    const randomState = (): State =>
      state(pick(paths), {
        title: pick(["A", "B"]),
        dashboard: {
          users: {
            users: Array.from({ length: Math.floor(r() * 4) }, (_, i) => ({
              id: i + Math.floor(r() * 3) * 10,
              name: pick(["x", "y", "z"]),
            })).filter(
              (u, i, all) => all.findIndex((v) => v.id === u.id) === i,
            ),
          },
          roles: {
            roles: Array.from({ length: Math.floor(r() * 3) }, () => "r"),
          },
        },
      });
    for (let run = 0; run < 300; run++) {
      let current = randomState();
      const h = mountView(shell, current);
      for (let step = 0; step < 6; step++) {
        const next = randomState();
        h.set(next);
        const fresh = mountView(shell, next);
        expect(h.root.innerHTML, `run ${run} step ${step}`).toBe(
          fresh.root.innerHTML,
        );
        fresh.unmount();
        current = next;
      }
      h.unmount();
      expect(h.dom.stats(), `run ${run}`).toEqual({
        mounts: 0,
        nodes: 0,
        listeners: 0,
      });
    }
  });
});
