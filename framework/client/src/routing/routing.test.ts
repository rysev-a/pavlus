import { describe, expect, test } from "vitest";
import {
  asRoute,
  childEnv,
  matchPattern,
  matchRoute,
  resolveOutlet,
  routeName,
  routedState,
  type Route,
  type RouteSpec,
  type Routing,
} from "./mod.ts";

const at = (path: string, base = "", params = {}): Route => ({
  path,
  base,
  params,
  search: "",
  hash: "",
});

describe("routeName", () => {
  test("derived from the last static segment", () => {
    expect(routeName("/dashboard", {})).toBe("dashboard");
    expect(routeName("/admin/tasks", {})).toBe("tasks");
    expect(routeName("/users/:id", {})).toBe("users");
    expect(routeName("/", {})).toBe("index");
    expect(routeName("*", {})).toBe("fallback");
    expect(routeName("/:id", {})).toBe("id");
  });

  test("`name` wins", () => {
    expect(routeName("/", { name: "users" })).toBe("users");
  });
});

describe("matchPattern", () => {
  test('"/" matches only exactly', () => {
    expect(matchPattern("/", at("/"))?.route.path).toBe("/");
    expect(matchPattern("/", at("/x"))).toBeNull();
  });

  test("a prefix matches at a segment boundary and leaves the rest", () => {
    const m = matchPattern("/dashboard", at("/dashboard/roles"))!;
    expect(m.route).toMatchObject({ path: "/roles", base: "/dashboard" });
    expect(matchPattern("/dashboard", at("/dashboard"))?.route).toMatchObject({
      path: "/",
      base: "/dashboard",
    });
    expect(matchPattern("/dashboard", at("/dashboardx"))).toBeNull();
    expect(matchPattern("/dashboard/roles", at("/dashboard"))).toBeNull();
  });

  test("bases accumulate down the levels", () => {
    const outer = matchPattern("/admin", at("/admin/tasks/history"))!.route;
    const inner = matchPattern("/tasks", outer)!.route;
    expect(inner).toMatchObject({ path: "/history", base: "/admin/tasks" });
  });

  test(":name captures, decoded, and params of outer levels are kept", () => {
    const outer = matchPattern("/users/:id", at("/users/a%20b/edit"))!;
    expect(outer.params).toEqual({ id: "a b" });
    expect(outer.route).toMatchObject({ path: "/edit", params: { id: "a b" } });
    const inner = matchPattern("/edit", outer.route)!;
    expect(inner.route.params).toEqual({ id: "a b" });
  });

  test('"*" matches anything and leaves the path alone', () => {
    expect(matchPattern("*", at("/whatever/else"))?.route.path).toBe(
      "/whatever/else",
    );
  });
});

describe("matchRoute", () => {
  const spec = (name: string) => ({ name });
  const routing: Routing = {
    "/": spec("home"),
    "/dashboard": spec("dashboard"),
    "/dashboard/roles": spec("roles"),
    "*": spec("missing"),
  };

  test("the longest matching pattern wins", () => {
    expect(matchRoute(routing, at("/"))?.name).toBe("home");
    expect(matchRoute(routing, at("/dashboard"))?.name).toBe("dashboard");
    expect(matchRoute(routing, at("/dashboard/roles"))?.name).toBe("roles");
    expect(matchRoute(routing, at("/dashboard/other"))?.name).toBe("dashboard");
  });

  test('"*" only when nothing else matches; none without it', () => {
    expect(matchRoute(routing, at("/nope"))?.name).toBe("missing");
    const { "*": _fallback, ...strict } = routing;
    expect(matchRoute(strict, at("/nope"))).toBeNull();
  });

  test("declaration order breaks ties", () => {
    const tie: Routing = { "/a/:x": spec("first"), "/a/b": spec("second") };
    expect(matchRoute(tie, at("/a/b"))?.name).toBe("first");
  });
});

describe("routedState", () => {
  const spec: RouteSpec<{
    filter: string;
    dash: { n: number };
  }> = {
    key: "dash",
    props: (s) => ({ filter: s.filter }),
  };
  const st = { filter: "f", dash: { n: 1 } };
  const route = () => matchPattern("/dash", at("/dash"))!.route;

  test("the same state and route re-merge to the same object", () => {
    // `route()` builds a fresh route each call: equal by value is enough.
    expect(routedState(spec, st, route())).toBe(routedState(spec, st, route()));
  });

  test("another state, or another route, merges anew", () => {
    const a = routedState(spec, st, route());
    expect(routedState(spec, { ...st }, route())).not.toBe(a);
    const elsewhere = matchPattern("/dash", at("/dash", "/x"))!.route;
    expect(routedState(spec, st, elsewhere)).not.toBe(a);
  });

  test("props run only on a miss", () => {
    let calls = 0;
    const s2: RouteSpec<{ filter: string; dash: { n: number } }> = {
      key: "dash",
      props: (s) => {
        calls++;
        return { filter: s.filter };
      },
    };
    const r = route();
    routedState(s2, st, r);
    routedState(s2, st, r);
    expect(calls).toBe(1);
    routedState(s2, { ...st, filter: "g" }, r);
    expect(calls).toBe(2);
  });
});

describe("resolveOutlet", () => {
  const view = { render: () => [], diff: () => [] };
  const page = { view };

  test("needs a component with a routing table", () => {
    expect(() => resolveOutlet(undefined, { route: at("/") })).toThrow(
      /routing/,
    );
    expect(() => resolveOutlet({}, { route: at("/") })).toThrow(/routing/);
  });

  test("no route yet, or no match: nothing", () => {
    const env = { routing: { "/a": { component: page } } };
    expect(resolveOutlet(env, { route: null })).toBeNull();
    expect(resolveOutlet(env, {})).toBeNull();
    expect(resolveOutlet(env, { route: at("/b") })).toBeNull();
  });

  test("the child's view, name and state (slice + props + route)", () => {
    const env = {
      routing: {
        "/dash": {
          component: page,
          key: "dash",
          props: (s: { filter: string }) => ({ filter: s.filter }),
        },
      },
    };
    const m = resolveOutlet(env, {
      route: at("/dash/x"),
      filter: "f",
      dash: { n: 1 },
    })!;
    expect(m.view).toBe(view);
    expect(m.name).toBe("dash");
    expect(m.state).toEqual({
      n: 1,
      filter: "f",
      route: { path: "/x", base: "/dash", params: {}, search: "", hash: "" },
    });
  });

  test("a bare view entry, and a component without a view is an error", () => {
    expect(
      resolveOutlet({ routing: { "/": { view } } }, { route: at("/") })?.view,
    ).toBe(view);
    expect(() =>
      resolveOutlet(
        { routing: { "/": { component: {} } } },
        { route: at("/") },
      ),
    ).toThrow(/neither a view/);
  });
});

describe("childEnv and asRoute", () => {
  test("finds the component of an embed by name in children and in routing", () => {
    const a = { id: "a" };
    const b = { id: "b" };
    const env = {
      children: { a: { component: a } },
      routing: { "/b": { component: b } },
    };
    expect(childEnv(env, "a", {})).toBe(a);
    expect(childEnv(env, "b", {})).toBe(b);
    expect(childEnv(env, "zzz", {})).toBeUndefined();
    expect(childEnv(undefined, "a", {})).toBeUndefined();
  });

  test("asRoute fills what the router plugin does not report", () => {
    expect(asRoute({ path: "/x", search: "?a", hash: "#h" })).toEqual({
      path: "/x",
      base: "",
      params: {},
      search: "?a",
      hash: "#h",
    });
    expect(asRoute(null)).toBeNull();
  });
});
