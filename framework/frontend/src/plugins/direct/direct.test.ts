// @vitest-environment jsdom
import { describe, expect, test } from "vitest";
import { compileToView } from "../../compiler/mod.ts";
import { Component } from "../../component/mod.ts";
import { createApp } from "../../core/mod.ts";
import type { Message, PluginContext } from "../../core/types.ts";
import {
  compileDirectTemplate,
  compileDirectToView,
} from "../../direct/mod.ts";
import type { DirectView } from "../../direct/runtime.ts";
import type { Routing } from "../../routing/mod.ts";
import type { View } from "../../runtime/vnode.ts";
import { mountView } from "../../testing/mod.ts";
import { pavlus } from "../../vite/mod.ts";
import { storeEffector } from "../store/helpers.ts";
import { createStorePlugin } from "../store/mod.ts";
import { createDirectDomPlugin, renderToString } from "./mod.ts";
import { mountDirect } from "./testing.ts";

/* ----------------------------------------------------------------- helpers */

/** Markers and block anchors are comments; the rest must be identical. */
const norm = (html: string): string => html.replace(/<!--[\s\S]*?-->/g, "");

function rng(seed: number): () => number {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
}

const shuffle = <T>(r: () => number, xs: T[]): T[] => {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

interface Twin<S = any> {
  vdom: View<S>;
  direct: DirectView<S>;
}

/** The same source compiled by both pipelines; imports are twins too. */
function twin<S = any>(
  src: string,
  imports: Record<string, Twin> = {},
): Twin<S> {
  const v: Record<string, View> = {};
  const d: Record<string, DirectView> = {};
  for (const [k, t] of Object.entries(imports)) {
    v[k] = t.vdom;
    d[k] = t.direct;
  }
  return {
    vdom: compileToView<S>(src, { components: v }),
    direct: compileDirectToView<S>(src, { components: d }),
  };
}

/**
 * Runs a state sequence through both pipelines and asserts the DOM (without
 * comments) is the same after every step. Returns nothing; throws on a diff.
 */
function agree<S>(
  t: Twin<S>,
  states: S[],
  states2: S[] = states,
  label = "",
): void {
  const a = mountView(t.vdom, states[0]);
  const b = mountDirect<S>(t.direct, states2[0]);
  expect(norm(b.root.innerHTML), `${label} step 0`).toBe(
    norm(a.root.innerHTML),
  );
  for (let i = 1; i < states.length; i++) {
    a.set(states[i]);
    b.set(states2[i]);
    expect(norm(b.root.innerHTML), `${label} step ${i}`).toBe(
      norm(a.root.innerHTML),
    );
  }
  expect(b.errors).toEqual([]);
  a.unmount();
  b.unmount();
  expect(b.root.innerHTML).toBe("");
  expect(b.dom.stats()).toEqual({ mounts: 0, listeners: 0 });
}

/** Clicks every element matching `sel` in both and compares the messages. */
function sameClicks(
  a: Element,
  b: Element,
  am: unknown[],
  bm: unknown[],
  sel: string,
) {
  am.length = 0;
  bm.length = 0;
  a.querySelectorAll<HTMLElement>(sel).forEach((e) => e.click());
  b.querySelectorAll<HTMLElement>(sel).forEach((e) => e.click());
  const strip = (ms: any[]) => ms.map((m) => [m.id, m.payload, m.event?.type]);
  expect(strip(bm)).toEqual(strip(am));
}

/* ------------------------------------------------------ the dashboard (dom.test.ts) */

const DASHBOARD = `
div.dashboard
  h1.dashboard-title {title}
  if showUsers
    div.users
      h2 Users ({users.length})
      ul.users__list
        for user in users key user.id
          if user.isVisible
            li.users__item(class:admin=user.admin)
              a.users__item-link(href=user.url) {user.name}
              button.users__item-remove(@click=removeUser(user)) x
  else if showShop
    div.shop-menu
      h1 Shop menu
      for p, i in products
        span.product {i}:{p}
  else
    p nothing
  footer {prefix}{count}
`;

interface User {
  id: number;
  name: string;
  url: string;
  isVisible: boolean;
  admin: boolean;
}
interface DState {
  title: string;
  showUsers: boolean;
  showShop: boolean;
  users: User[];
  products: string[];
  prefix: string;
  count: number;
}

function randomDashboard(r: () => number, prev?: DState): DState {
  const pick = <T>(xs: T[]): T => xs[Math.floor(r() * xs.length)];
  const mutate = (u: User): User =>
    r() < 0.7
      ? u
      : {
          ...u,
          name: pick(["a", "b", "c"]),
          isVisible: r() < 0.7,
          admin: r() < 0.3,
        };
  let users: User[];
  if (prev && r() < 0.8) {
    users = prev.users.filter(() => r() < 0.8).map(mutate);
    for (let i = 0; i < Math.floor(r() * 3); i++) {
      const id = Math.floor(r() * 12);
      if (!users.some((u) => u.id === id))
        users.splice(Math.floor(r() * (users.length + 1)), 0, {
          id,
          name: pick(["x", "y"]),
          url: `/u/${id}`,
          isVisible: r() < 0.7,
          admin: r() < 0.3,
        });
    }
    if (r() < 0.3) users = shuffle(r, users);
  } else {
    const ids = [
      ...new Set(
        Array.from({ length: Math.floor(r() * 6) }, () => Math.floor(r() * 12)),
      ),
    ];
    users = ids.map((id) => ({
      id,
      name: pick(["x", "y"]),
      url: `/u/${id}`,
      isVisible: r() < 0.7,
      admin: r() < 0.3,
    }));
  }
  return {
    title: prev && r() < 0.7 ? prev.title : pick(["A", "B"]),
    showUsers: r() < 0.6,
    showShop: r() < 0.5,
    users,
    products: Array.from({ length: Math.floor(r() * 4) }, () =>
      pick(["p", "q"]),
    ),
    prefix: pick(["#", "$"]),
    count: Math.floor(r() * 3),
  };
}

describe("differential: direct vs vdom, same template, same states", () => {
  test("dashboard (if / else if / nested keyed for / unkeyed for / class toggle / attrs)", () => {
    const t = twin<DState>(DASHBOARD);
    const r = rng(42);
    for (let run = 0; run < 200; run++) {
      const states = [randomDashboard(r)];
      for (let i = 0; i < 6; i++) states.push(randomDashboard(r, states[i]));
      agree(t, states, states, `run ${run}`);
    }
  });

  test("events dispatch the same messages, with the payload of the CURRENT state", () => {
    const t = twin<DState>(DASHBOARD);
    const r = rng(7);
    let state = randomDashboard(r);
    const a = mountView(t.vdom, state);
    const b = mountDirect<DState>(t.direct, state);
    for (let step = 0; step < 50; step++) {
      state = randomDashboard(r, state);
      a.set(state);
      b.set(state);
      sameClicks(a.root, b.root, a.messages, b.messages, ".users__item-remove");
    }
  });

  test("arrow functions in expressions (filter / map / shadowing)", () => {
    const t = twin<{
      users: { id: number; name: string; active: boolean }[];
      n: number;
    }>(
      `ul
  for u in users.filter(u => u.active) key u.id
    li {u.id}:{u.name}:{users.map(x => x.id).join("+")}:{n}`,
    );
    const users = (over: Record<number, boolean> = {}): {
      id: number;
      name: string;
      active: boolean;
    }[] =>
      [1, 2, 3]
        .map((id) => ({
          id,
          name: `u${id}`,
          active: over[id] ?? id !== 2,
        }))
        // exercise reordering too: keyed diff with an arrow upstream
        .sort((a, b) => (a.id === b.id ? 0 : (a.id % 2) - (b.id % 2) || a.id - b.id));
    agree(
      t,
      [
        { users: users(), n: 0 },
        { users: users({ 1: false }), n: 1 },
        { users: users({ 3: false }), n: 2 },
        { users: [], n: 3 },
        { users: users({ 2: true }), n: 4 },
      ],
      undefined,
      "arrows",
    );
  });

  const ROW = twin<{ id: number; label: string; on: boolean }>(
    `li.row(class:on=on @click=pick(id))
  span {label}
  button(@click.stop=drop(id)) x`,
  );
  const LIST = twin(
    `import Row from "./row.pavlus"
ul.list
  for it in items key it.id
    +Row#row(id=it.id label=it.label on={it.id === sel})`,
    { Row: ROW },
  );
  const PLAIN = twin(`p.plain {items.length} items ({title})`);
  const NUMBERED = twin(
    `ol.numbered
  for it, i in items key it.id
    li {i}:{it.label}`,
  );
  const FOOTER = twin(`footer {text}`);
  const PAGE = twin(
    `import List from "./list.pavlus"
import Footer from "./footer.pavlus"
div.page
  h1 {title}
  if show
    +List#list(items=items sel=sel)
  else
    p none
  +{Alt}#alt(items=items title=title)
  +Footer#footer(text="count: {items.length}")`,
    { List: LIST, Footer: FOOTER },
  );

  interface Item {
    id: number;
    label: string;
  }
  interface PState {
    title: string;
    show: boolean;
    sel: number;
    items: Item[];
    alt: "plain" | "numbered" | "plainComp" | "numberedComp" | "none" | "undef";
  }
  const altOf = (k: PState["alt"], side: "vdom" | "direct"): unknown => {
    const pl = PLAIN[side];
    const nu = NUMBERED[side];
    return {
      plain: pl,
      numbered: nu,
      plainComp: { view: pl },
      numberedComp: { view: nu },
      none: null,
      undef: undefined,
    }[k];
  };

  function randomPage(r: () => number, prev?: PState): PState {
    const pick = <T>(xs: T[]): T => xs[Math.floor(r() * xs.length)];
    let items: Item[] =
      prev && r() < 0.8
        ? prev.items
            .filter(() => r() < 0.8)
            .map((i) => (r() < 0.8 ? i : { ...i, label: pick(["a", "b"]) }))
        : [];
    for (let k = 0; k < Math.floor(r() * 3); k++) {
      const id = Math.floor(r() * 10);
      if (!items.some((i) => i.id === id))
        items.splice(Math.floor(r() * (items.length + 1)), 0, {
          id,
          label: pick(["x", "y"]),
        });
    }
    if (r() < 0.2) items = shuffle(r, items);
    return {
      title: prev && r() < 0.7 ? prev.title : pick(["T1", "T2"]),
      show: r() < 0.6,
      sel: Math.floor(r() * 10),
      items,
      alt: pick([
        "plain",
        "numbered",
        "plainComp",
        "numberedComp",
        "none",
        "undef",
      ] as const),
    };
  }

  test("embeds: static in a loop and an if, dynamic swaps, spread-less props", () => {
    const r = rng(2024);
    for (let run = 0; run < 150; run++) {
      const states = [randomPage(r)];
      for (let i = 0; i < 7; i++) states.push(randomPage(r, states[i]));
      agree(
        PAGE,
        states.map((s) => ({ ...s, Alt: altOf(s.alt, "vdom") })) as any,
        states.map((s) => ({ ...s, Alt: altOf(s.alt, "direct") })) as any,
        `run ${run}`,
      );
    }
  });

  test("events keep the whole prefix through nested embeds, after updates and swaps", () => {
    const r = rng(11);
    let s = { ...randomPage(r), show: true };
    const mk = (side: "vdom" | "direct") => ({ ...s, Alt: altOf(s.alt, side) });
    const a = mountView(PAGE.vdom, mk("vdom"));
    const b = mountDirect<any>(PAGE.direct, mk("direct"));
    for (let step = 0; step < 60; step++) {
      s = { ...randomPage(r, s), show: r() < 0.8 };
      a.set(mk("vdom"));
      b.set(mk("direct"));
      sameClicks(a.root, b.root, a.messages, b.messages, ".row");
      sameClicks(a.root, b.root, a.messages, b.messages, ".row button");
      if (s.show && s.items.length) {
        expect(b.messages.at(-1)!.id).toBe("list.row.drop");
      }
    }
  });

  test("spread props and a dynamic embed's component are the child's owner", () => {
    const CHILD = twin(`b.c {a}-{b}-{c}`);
    const HOST = twin(
      `import Child from "./c.pavlus"
section
  +Child#kid(a=1 ...rest b="over" )`,
      { Child: CHILD },
    );
    const states = [
      { rest: { b: "x", c: "y" } },
      { rest: { b: "x", c: "z" } },
      { rest: null },
      { rest: { a: 9 } },
    ];
    agree(HOST, states as any);
  });

  test("random keyed shuffles, reversals, inserts and removals (identity of kept rows survives)", () => {
    const T = twin<{ rows: { id: number; v: string }[] }>(
      `table
  for r in rows key r.id
    tr(@click=hit(r.id))
      td {r.id}
      td.v {r.v}`,
    );
    const r = rng(99);
    for (let run = 0; run < 150; run++) {
      const n = Math.floor(r() * 40);
      let rows = Array.from({ length: n }, (_, i) => ({ id: i, v: "a" }));
      const states = [{ rows }];
      const b0 = mountDirect<any>(T.direct, { rows });
      for (let step = 0; step < 6; step++) {
        const before = new Map(
          [...b0.root.querySelectorAll("tr")].map((tr) => [
            tr.firstElementChild!.textContent,
            tr,
          ]),
        );
        const mode = Math.floor(r() * 6);
        if (mode === 0) rows = shuffle(r, rows);
        else if (mode === 1) rows = [...rows].reverse();
        else if (mode === 2)
          rows = [
            ...rows,
            ...Array.from({ length: Math.floor(r() * 5) }, (_, i) => ({
              id: 1000 + step * 10 + i,
              v: "n",
            })),
          ];
        else if (mode === 3)
          rows = rows.slice(0, Math.max(0, rows.length - Math.floor(r() * 5)));
        else if (mode === 4)
          rows = shuffle(
            r,
            rows.filter(() => r() < 0.7),
          ).concat(rows.length ? [{ id: 5000 + step, v: "i" }] : []);
        else rows = rows.map((x) => (r() < 0.2 ? { ...x, v: "c" } : x));
        states.push({ rows });
        b0.set({ rows });
        // moved rows are the same DOM nodes, not recreated
        for (const tr of b0.root.querySelectorAll("tr")) {
          const was = before.get(tr.firstElementChild!.textContent);
          if (was) expect(tr).toBe(was);
        }
      }
      b0.unmount();
      agree(T, states as any, states as any, `run ${run}`);
    }
  });

  test("unkeyed lists go by index; nested loops; shadowed names", () => {
    const T = twin(
      `div
  for x, i in xs
    p {i}={x}
    for x in x.ys
      b {x}`,
    );
    const r = rng(5);
    const mk = () => ({
      xs: Array.from({ length: Math.floor(r() * 4) }, (_, i) => ({
        toString: () => `x${i}`,
        ys: Array.from({ length: Math.floor(r() * 3) }, () =>
          Math.floor(r() * 3),
        ),
      })),
    });
    agree(T, Array.from({ length: 30 }, mk) as any);
  });

  test("attributes, boolean attributes, class lists, interpolated attributes", () => {
    const T = twin(
      `div.box(class="a {x}" id=id title="t-{n}" hidden=h data-k="static")
  a.link(class:on=on class:big=big href=url) go
  input(disabled=off name="n")
  button.b(class:p=p) b`,
    );
    const r = rng(8);
    const pick = <T>(xs: T[]): T => xs[Math.floor(r() * xs.length)];
    const mk = () => ({
      x: pick(["", "y", "z"]),
      id: pick([null, "i1", undefined]),
      n: pick([0, 1, "two"]),
      h: pick([true, false, null]),
      on: r() < 0.5,
      big: r() < 0.5,
      url: pick(["/a", "/b", null, false]),
      off: pick([true, false]),
      p: r() < 0.5,
    });
    agree(T, Array.from({ length: 60 }, mk) as any);
  });
});

/* ------------------------------------------------------------------ outlet */

describe("+outlet and embedded components behave like the vdom pipeline", () => {
  function routes(side: "vdom" | "direct") {
    const c = (src: string): any =>
      side === "vdom" ? compileToView(src) : compileDirectToView(src);
    const usersView = c(`ul.users
  for u in users key u.id
    li.user(@click=pick(u.id)) {u.name}`);
    const rolesView = c(`p.roles {roles.length} roles`);
    const homeView = c(`h1.home {title}`);
    const aboutView = c(`p.about about`);
    const detailView = c(`p.detail item {route.params.id}`);
    const missingView = c(`p.missing no page at {route.path}`);
    const dashboardView = c(`section.dashboard
  p.base {route.base}
  +outlet`);
    const shellView = c(`nav
  a.link(href="/") home
main
  +outlet
footer {title}`);
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
    return new Shell();
  }
  const state = (path: string | null, title = "T") => ({
    route: path === null ? null : { path, search: "", hash: "" },
    title,
    dashboard: {
      users: {
        users: [
          { id: 1, name: "Ann" },
          { id: 2, name: "Bob" },
        ],
      },
      roles: { roles: ["admin", "viewer"] },
    },
  });

  test("every route, nested levels, params, fallback, and route changes", () => {
    const vShell = routes("vdom");
    const dShell = routes("direct");
    const paths = [
      "/",
      "/about",
      "/dashboard",
      "/dashboard/roles",
      "/items/42",
      "/nope",
      null,
      "/dashboard",
      "/items/7",
      "/",
    ];
    const a = mountView(vShell as any, state(paths[0]));
    const b = mountDirect<any>(dShell as any, state(paths[0]));
    for (const [i, p] of paths.entries()) {
      a.set(state(p, `T${i}`));
      b.set(state(p, `T${i}`));
      expect(norm(b.root.innerHTML), p ?? "null").toBe(norm(a.root.innerHTML));
      sameClicks(a.root, b.root, a.messages, b.messages, ".user");
    }
    expect(b.errors).toEqual([]);
    b.unmount();
    expect(b.dom.stats()).toEqual({ mounts: 0, listeners: 0 });
  });

  test("events carry the whole prefix: shell > dashboard > users", () => {
    const b = mountDirect<any>(routes("direct") as any, state("/dashboard"));
    (b.root.querySelectorAll(".user")[1] as HTMLElement).click();
    expect(b.messages[0]).toMatchObject({
      id: "dashboard.users.pick",
      payload: 2,
    });
    b.unmount();
  });

  test("a bare view as the root has no routing: a clear error", () => {
    const v = compileDirectToView(`main\n  +outlet`);
    expect(() => mountDirect<any>(v, state("/"))).toThrow(/routing/);
  });

  test("a static embed finds the child's component in `children`, a dynamic one is its own owner", () => {
    const panelView: any = compileDirectToView(`section.panel\n  +outlet`);
    const about: any = compileDirectToView(`p.about about`);
    class Panel extends Component {
      view = panelView;
      routing: Routing = { "/": { view: about } };
    }
    const panel = new Panel();
    const dyn = compileDirectToView<any>(`main\n  +{panel}#panel(route=route)`);
    const b = mountDirect<any>(dyn, {
      panel,
      route: { path: "/", search: "", hash: "" },
    });
    expect(norm(b.root.innerHTML)).toBe(
      '<main><section class="panel"><p class="about">about</p></section></main>',
    );
    b.unmount();
  });
});

/* -------------------------------------------------------------- the plugin */

describe("the direct dom plugin", () => {
  const view = compileDirectToView<{ count: number }>(`p {count}`);

  function plugin(state: { count: number }) {
    let current = state;
    const dom = createDirectDomPlugin();
    const ctx: PluginContext<{ count: number }> = {
      dispatch() {},
      getState: () => current,
      dispatchEffect() {},
    };
    dom.init!(ctx);
    return {
      dom,
      ctx,
      root: () => document.createElement("div"),
      set(next: { count: number }) {
        current = next;
      },
    };
  }

  test("a bare mount ignores onState; update repaints; followState follows", () => {
    const h = plugin({ count: 1 });
    const a = h.root();
    const b = h.root();
    document.body.append(a, b);
    h.dom.handle({ plugin: "dom", type: "mount", target: a, view }, h.ctx);
    h.dom.handle(
      { plugin: "dom", type: "mount", target: b, view, followState: true },
      h.ctx,
    );
    h.set({ count: 2 });
    h.dom.onState!({ count: 2 }, h.ctx);
    expect(a.textContent).toBe("1");
    expect(b.textContent).toBe("2");
    h.dom.handle(
      {
        plugin: "dom",
        type: "update",
        prev: { count: 1 },
        next: { count: 3 },
        target: a,
      },
      h.ctx,
    );
    expect(a.textContent).toBe("3");
    expect(b.textContent).toBe("2");
    h.dom.handle(
      { plugin: "dom", type: "update", prev: { count: 1 }, next: { count: 4 } },
      h.ctx,
    );
    expect(a.textContent + b.textContent).toBe("44");
    expect(() =>
      h.dom.handle(
        { plugin: "dom", type: "update", prev: 0, next: 0, target: "#ghost" },
        h.ctx,
      ),
    ).toThrow(/nothing mounted/);
    h.dom.dispose!();
    expect(a.innerHTML + b.innerHTML).toBe("");
  });

  test("onMounted is dispatched once the view is in the DOM", () => {
    const sent: string[] = [];
    const dom = createDirectDomPlugin();
    const root = document.createElement("div");
    document.body.appendChild(root);
    const ctx: PluginContext<any> = {
      dispatch: (m) => sent.push(m.id + ":" + root.textContent),
      getState: () => ({ count: 5 }),
      dispatchEffect() {},
    };
    dom.init!(ctx);
    dom.handle(
      { plugin: "dom", type: "mount", target: root, view, onMounted: "ready" },
      ctx,
    );
    expect(sent).toEqual(["ready:5"]);
  });

  test("an update asked for during an update is queued, not nested", () => {
    let depth = 0;
    let maxDepth = 0;
    const seen: string[] = [];
    const v = compileDirectToView<any>(`p {read(n)}`);
    const dom = createDirectDomPlugin();
    const root = document.createElement("div");
    document.body.appendChild(root);
    const ctx: PluginContext<any> = {
      dispatch() {},
      getState: () => s0,
      dispatchEffect() {},
    };
    const second = { n: 2, read: (n: number) => (seen.push(`read ${n}`), n) };
    const first = {
      n: 1,
      read: (n: number) => {
        depth++;
        maxDepth = Math.max(maxDepth, depth);
        // e.g. a focus handler that dispatches a message that repaints
        dom.handle(
          { plugin: "dom", type: "update", prev: first, next: second },
          ctx,
        );
        depth--;
        return n;
      },
    };
    const s0 = { n: 0, read: (n: number) => n };
    dom.init!(ctx);
    dom.handle({ plugin: "dom", type: "mount", target: root, view: v }, ctx);
    dom.handle({ plugin: "dom", type: "update", prev: s0, next: first }, ctx);
    expect(maxDepth).toBe(1);
    expect(seen).toEqual(["read 2"]);
    expect(root.textContent).toBe("2");
  });

  test("unmount removes nodes and every listener, also with nested blocks", () => {
    const t = twin<DState>(DASHBOARD);
    const r = rng(3);
    for (let i = 0; i < 100; i++) {
      const b = mountDirect<DState>(t.direct, {
        ...randomDashboard(r),
        showUsers: true,
      });
      b.set(randomDashboard(r));
      b.unmount();
      expect(b.dom.stats()).toEqual({ mounts: 0, listeners: 0 });
      expect(b.root.innerHTML).toBe("");
      b.root.remove();
    }
  });

  test("mounting a vdom view is a clear error; remounting replaces", () => {
    const vdom = compileToView(`p x`);
    const dom = createDirectDomPlugin();
    const root = document.createElement("div");
    const ctx: PluginContext<any> = {
      dispatch() {},
      getState: () => ({}),
      dispatchEffect() {},
    };
    dom.init!(ctx);
    expect(() =>
      dom.handle(
        { plugin: "dom", type: "mount", target: root, view: vdom as any },
        ctx,
      ),
    ).toThrow(/direct/);
    dom.handle(
      {
        plugin: "dom",
        type: "mount",
        target: root,
        view: compileDirectToView(`p a`),
      },
      ctx,
    );
    dom.handle(
      {
        plugin: "dom",
        type: "mount",
        target: root,
        view: compileDirectToView(`p b`),
      },
      ctx,
    );
    expect(norm(root.innerHTML)).toBe("<p>b</p>");
    expect(dom.stats().mounts).toBe(1);
  });

  test("renderToString", () => {
    const v = compileDirectToView<any>(
      `ul\n  for x in xs\n    li {x}\n  if f\n    i yes`,
    );
    expect(renderToString(v, { xs: ["a", "<b>"], f: true })).toBe(
      "<ul><li>a</li><li>&lt;b&gt;</li><i>yes</i></ul>",
    );
  });

  test("inline svg: the skeleton creates elements in the SVG namespace", () => {
    const v = compileDirectToView<{ on: boolean; xs: number[] }>(
      `svg.icon(viewBox="0 0 10 10")
  circle.main(r="4")
  if on
    circle.extra(r="1")
  for x in xs key x
    circle.dot(cx={x})`,
    );
    const h = mountDirect(v, { on: false, xs: [1] });
    const SVG = "http://www.w3.org/2000/svg";
    for (const el of h.root.querySelectorAll("svg, circle"))
      expect(el.namespaceURI).toBe(SVG);
    h.set({ on: true, xs: [1, 2] });
    for (const el of h.root.querySelectorAll(".extra, .dot"))
      expect(el.namespaceURI).toBe(SVG);
    h.unmount();
  });
});

/* ------------------------------------------------------------ form controls */

describe("form controls", () => {
  test("value, checked and selected are properties, so typing then updating works", () => {
    const v = compileDirectToView<{ q: string; on: boolean; pick: string }>(
      `div
  input.q(value=q)
  input.c(type="checkbox" checked=on)
  select.s(value=pick)
    for o in opts
      option(value=o selected={o === pick}) {o}`,
    );
    const view2 = compileDirectToView<any>(`div
  input.q(value=q)
  input.c(type="checkbox" checked=on)
  select.s
    option(value="a" selected={pick === "a"}) a
    option(value="b" selected={pick === "b"}) b`);
    void v;
    const h = mountDirect<any>(view2, { q: "a", on: false, pick: "a" });
    const q = h.root.querySelector(".q") as HTMLInputElement;
    const c = h.root.querySelector(".c") as HTMLInputElement;
    const s = h.root.querySelector(".s") as HTMLSelectElement;
    expect(q.value).toBe("a");
    expect(s.value).toBe("a");
    q.value = "typed";
    c.checked = true;
    h.set({ q: "typed", on: true, pick: "b" });
    expect(s.value).toBe("b");
    h.set({ q: "", on: false, pick: "a" });
    expect(q.value).toBe("");
    expect(c.checked).toBe(false);
    expect(s.value).toBe("a");
    h.set({ q: "from state", on: true, pick: "b" });
    expect(q.value).toBe("from state");
    expect(c.checked).toBe(true);
    expect(s.value).toBe("b");
  });

  test("a select whose options come from a loop keeps its value; disabled toggles", () => {
    const v = compileDirectToView<any>(
      `div
  select.s(value=pick)
    for o in opts
      option(value=o) {o}
  button.go(disabled=busy) go`,
    );
    const h = mountDirect<any>(v, {
      opts: ["a", "b", "c"],
      pick: "b",
      busy: true,
    });
    const s = h.root.querySelector(".s") as HTMLSelectElement;
    const go = h.root.querySelector(".go") as HTMLButtonElement;
    expect(s.value).toBe("b");
    expect(go.disabled).toBe(true);
    h.set({ opts: ["a", "b", "c"], pick: "c", busy: false });
    expect(s.value).toBe("c");
    expect(go.disabled).toBe(false);
    expect(go.hasAttribute("disabled")).toBe(false);
  });

  test("input events carry the live value and checked state", () => {
    const v = compileDirectToView<any>(`input.q(@input=typed value=q)`);
    const h = mountDirect<any>(v, { q: "" });
    const q = h.root.querySelector(".q") as HTMLInputElement;
    q.value = "hello";
    q.dispatchEvent(new Event("input", { bubbles: true }));
    expect(h.messages[0]).toMatchObject({
      id: "typed",
      event: { type: "input", value: "hello" },
    });
  });
});

/* ---------------------------------------------------------------- robustness */

describe("robustness", () => {
  test("data never becomes markup or script", () => {
    const evil = `<img src=x onerror="alert(1)">`;
    const v = compileDirectToView<any>(
      `div
  p.t {s}
  a.l(href=u title=s data-x=s) link
  img.i(src=u)`,
    );
    const h = mountDirect<any>(v, { s: evil, u: "javascript:alert(1)" });
    expect(h.root.querySelector("img[onerror]")).toBeNull();
    expect(h.root.querySelector(".t")!.textContent).toBe(evil);
    expect(h.root.querySelector("p")!.children.length).toBe(0);
    const a = h.root.querySelector(".l")!;
    expect(a.getAttribute("title")).toBe(evil);
    expect(a.getAttribute("href")).toBe("about:blank");
    expect(h.root.querySelector(".i")!.getAttribute("src")).toBe("about:blank");
    h.set({ s: "x", u: " JaVa\tScRiPt:alert(1)" });
    expect(a.getAttribute("href")).toBe("about:blank");
    h.set({ s: "x", u: "/ok?a=1&b=2" });
    expect(a.getAttribute("href")).toBe("/ok?a=1&b=2");
  });

  test("an event handler attribute cannot be bound to data; srcdoc neither", () => {
    expect(() => compileDirectToView(`button(onclick=code) x`)).toThrow(
      /@event/,
    );
    expect(() => compileDirectToView(`iframe(srcdoc=html)`)).toThrow(/code/);
    // a static one is the author's own text
    expect(() => compileDirectToView(`button(onclick="go()") x`)).not.toThrow();
  });

  test("an error in one binding is reported; the other bindings still update", () => {
    const v = compileDirectToView<any>(
      `div
  p.a {boom(n)}
  p.b {n}
  p.c(title=n) {n}`,
    );
    const boom = (n: number) => {
      if (n === 2) throw new Error("bad binding");
      return `ok${n}`;
    };
    const h = mountDirect<any>(v, { n: 1, boom });
    expect(h.root.querySelector(".a")!.textContent).toBe("ok1");
    h.set({ n: 2, boom });
    expect(h.errors.map((e) => (e as Error).message)).toEqual(["bad binding"]);
    expect(h.root.querySelector(".a")!.textContent).toBe("ok1"); // kept, not corrupted
    expect(h.root.querySelector(".b")!.textContent).toBe("2");
    expect(h.root.querySelector(".c")!.getAttribute("title")).toBe("2");
    h.set({ n: 3, boom });
    expect(h.root.querySelector(".a")!.textContent).toBe("ok3");
  });

  test("a throwing event payload is reported and sends nothing", () => {
    const v = compileDirectToView<any>(`button(@click=go(f())) x`);
    const h = mountDirect<any>(v, {
      f: () => {
        throw new Error("nope");
      },
    });
    (h.root.querySelector("button") as HTMLElement).click();
    expect(h.messages).toEqual([]);
    expect(h.errors).toHaveLength(1);
  });

  test("duplicate keys are reported and the list is left as it was", () => {
    const v = compileDirectToView<any>(`ul\n  for x in xs key x\n    li {x}`);
    const h = mountDirect<any>(v, { xs: ["a", "b"] });
    h.set({ xs: ["a", "b", "b"] });
    expect(h.errors).toHaveLength(1);
    expect(norm(h.root.innerHTML)).toBe("<ul><li>a</li><li>b</li></ul>");
    h.set({ xs: ["b", "a", "c"] });
    expect(norm(h.root.innerHTML)).toBe(
      "<ul><li>b</li><li>a</li><li>c</li></ul>",
    );
  });

  test("lists accept null, undefined and non-arrays as empty", () => {
    const v = compileDirectToView<any>(`ul\n  for x in xs\n    li {x}`);
    const h = mountDirect<any>(v, { xs: ["a"] });
    for (const xs of [
      null,
      undefined,
      5,
      "ab".split(""),
      false,
      new Set([1, 2]),
    ])
      h.set({ xs });
    expect(norm(h.root.innerHTML)).toBe("<ul><li>1</li><li>2</li></ul>");
  });

  test("text that looks like template syntax or entities is plain text", () => {
    const v = compileDirectToView<any>(`p {s}`);
    const h = mountDirect<any>(v, { s: "&amp; <b>{x}</b>" });
    expect(h.root.querySelector("p")!.textContent).toBe("&amp; <b>{x}</b>");
  });

  test("the skeleton is built with DOM calls: HTML parser quirks do not apply", () => {
    // `<p>` containing a `<div>` or a nested `<a>` would be restructured by innerHTML.
    const v = compileDirectToView<any>(`p\n  div {a}\n  a\n    a {a}`);
    const h = mountDirect<any>(v, { a: "x" });
    expect(norm(h.root.innerHTML)).toBe("<p><div>x</div><a><a>x</a></a></p>");
  });

  test("the generated module has the documented shape", () => {
    const code = compileDirectTemplate(
      `import X from "./x.pavlus"\np {a}\n+X#x(a=a)`,
    );
    expect(code).toContain('from "@pavlus/frontend/direct/runtime"');
    expect(code).toContain("export default { create, meta };");
    expect(code).not.toMatch(/\bdiff\b|\brender\b|innerHTML/);
  });

  test("an import named like a generated identifier is refused", () => {
    expect(() =>
      compileDirectTemplate(`import UNSET from "./x.pavlus"\n+UNSET#x`),
    ).toThrow(/reserved/);
  });
});

/* ------------------------------------------------------------- integration */

describe("swapping the plugin in an app", () => {
  test("createApp with createDirectDomPlugin: events, store, repaint on state change", () => {
    class Counter extends Component<{ n: number }> {
      view = compileDirectToView<{ n: number }>(
        `button.b(@click=inc) clicked {n}`,
      ) as any;
      updateDomOnStateChange = true;
      inc(_m: Message, s: { n: number }) {
        return [storeEffector.set("n", s.n + 1)];
      }
    }
    const root = document.createElement("div");
    document.body.appendChild(root);
    const dom = createDirectDomPlugin();
    const app = createApp({
      app: new Counter(),
      plugins: [createStorePlugin({ n: 0 }), dom],
      mount: root,
    });
    const b = root.querySelector(".b") as HTMLElement;
    expect(b.textContent).toBe("clicked 0");
    b.click();
    b.click();
    expect(root.querySelector(".b")).toBe(b); // patched in place
    expect(b.textContent).toBe("clicked 2");
    app.dispose();
    expect(dom.stats()).toEqual({ mounts: 0, listeners: 0 });
  });

  test("the root component owns its view: +outlet works through createApp", () => {
    const page: any = compileDirectToView(`p.page page {route.path}`);
    class Shell extends Component {
      view = compileDirectToView(`main\n  +outlet`) as any;
      routing: Routing = { "*": { view: page } };
      mounted() {
        return [];
      }
    }
    const root = document.createElement("div");
    document.body.appendChild(root);
    const app = createApp({
      app: new Shell(),
      plugins: [
        createStorePlugin({ route: { path: "/x", search: "", hash: "" } }),
        createDirectDomPlugin(),
      ],
      mount: root,
    });
    expect(norm(root.innerHTML)).toBe(
      '<main><p class="page">page /x</p></main>',
    );
    app.dispose();
  });

  test("the vite plugin compiles to the direct module with target: direct", () => {
    const plugin = pavlus({ target: "direct" });
    const out = plugin.transform.call(
      {
        error: (m: string): never => {
          throw new Error(m);
        },
      },
      "p {a}",
      "/x/a.pavlus",
    )!;
    expect(out.code).toContain("direct/runtime");
    expect(out.code).toContain("export default { create, meta };");
    const vdom = pavlus().transform.call(
      {
        error: (m: string): never => {
          throw new Error(m);
        },
      },
      "p {a}",
      "/x/a.pavlus",
    )!;
    expect(vdom.code).toContain("export default { render, diff, meta };");
  });
});

describe("per-binding pre-checks and meta.deps", () => {
  test("a calling binding is skipped while its inputs are unchanged", () => {
    let calls = 0;
    const fmt = (n: number): string => {
      calls++;
      return `#${n}`;
    };
    const v = compileDirectToView<any>(`div
  p.a {fmt(n)}
  p.b {other}`);
    const h = mountDirect<any>(v, { n: 1, other: "x", fmt });
    expect(h.root.querySelector(".a")!.textContent).toBe("#1");
    expect(calls).toBe(1);
    // a sibling input changed: the block runs, the calling binding does not
    h.set({ n: 1, other: "y", fmt });
    expect(calls).toBe(1);
    expect(h.root.querySelector(".a")!.textContent).toBe("#1");
    expect(h.root.querySelector(".b")!.textContent).toBe("y");
    // its own input changed: it recomputes
    h.set({ n: 2, other: "y", fmt });
    expect(calls).toBe(2);
    expect(h.root.querySelector(".a")!.textContent).toBe("#2");
  });

  test("a pre-checked binding agrees with the vdom pipeline", () => {
    const T = twin(`div
  p.a {name.toUpperCase()}
  p.b {note}`);
    const states = [
      { name: "ada", note: "x" },
      { name: "ada", note: "y" },
      { name: "bob", note: "y" },
    ];
    agree(T, states as any, states as any, "pre-checked");
  });

  test("meta.deps lists what every binding reads", () => {
    const v = compileDirectToView<any>(`ul
  for u in users key u.id
    li(class:on=u.done) {u.name.toLowerCase()}
  p.n {users.length}`);
    const meta = v.meta!;
    const rows = meta.deps as Record<string, unknown>[];
    expect(rows).toContainEqual({
      line: 2,
      of: "for u",
      reads: ["users"],
      checked: false,
    });
    expect(rows).toContainEqual({
      line: 3,
      of: "<li> class",
      reads: ["u"],
      checked: false,
    });
    expect(rows).toContainEqual({
      line: 3,
      of: "text",
      reads: ["u"],
      checked: true,
    });
    expect(rows).toContainEqual({
      line: 4,
      of: "text",
      reads: ["users"],
      checked: false,
    });
  });
});
