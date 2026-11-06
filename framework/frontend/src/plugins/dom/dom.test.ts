// @vitest-environment jsdom
import { describe, expect, test } from "vitest";
import { compileToView } from "../../compiler/mod.ts";
import { mountView } from "../../testing/mod.ts";
import type { PluginContext } from "../../core/types.ts";
import { DomPlugin } from "./mod.ts";

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
interface State {
  title: string;
  showUsers: boolean;
  showShop: boolean;
  users: User[];
  products: string[];
  prefix: string;
  count: number;
}

/** Small deterministic PRNG so failures are reproducible. */
function rng(seed: number): () => number {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
}

function randomState(r: () => number, prev?: State): State {
  const pick = <T>(xs: T[]): T => xs[Math.floor(r() * xs.length)];
  const mutateUser = (u: User): User =>
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
    // evolve: keep some, drop some, add some, shuffle sometimes
    users = prev.users.filter(() => r() < 0.8).map(mutateUser);
    for (let i = 0; i < Math.floor(r() * 3); i++) {
      const id = Math.floor(r() * 12);
      if (!users.some((u) => u.id === id)) {
        users.splice(Math.floor(r() * (users.length + 1)), 0, {
          id,
          name: pick(["x", "y"]),
          url: `/u/${id}`,
          isVisible: r() < 0.7,
          admin: r() < 0.3,
        });
      }
    }
    if (r() < 0.3) users = [...users].sort(() => r() - 0.5);
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

describe("diff correctness (the main invariant)", () => {
  const view = compileToView<State>(DASHBOARD);

  test("applying diff(prev, next) equals rendering next from scratch", () => {
    const r = rng(42);
    for (let run = 0; run < 300; run++) {
      let state = randomState(r);
      const h = mountView(view, state);
      for (let step = 0; step < 6; step++) {
        const next = randomState(r, state);
        h.set(next);
        const fresh = mountView(view, next);
        expect(h.root.innerHTML, `run ${run} step ${step}`).toBe(
          fresh.root.innerHTML,
        );
        fresh.unmount();
        state = next;
      }
      h.unmount();
    }
  });

  test("the mounted DOM keeps working: events carry the current payload", () => {
    const r = rng(7);
    let state = randomState(r);
    const h = mountView(view, state);
    for (let step = 0; step < 50; step++) {
      state = randomState(r, state);
      h.set(state);
      h.messages.length = 0;
      h.root
        .querySelectorAll<HTMLElement>(".users__item-remove")
        .forEach((b) => b.click());
      const visible = state.showUsers
        ? state.users.filter((u) => u.isVisible)
        : [];
      expect(h.messages.map((m) => m.payload)).toEqual(visible);
    }
  });

  test("unmount removes every node and listener", () => {
    const r = rng(3);
    for (let i = 0; i < 100; i++) {
      const h = mountView(view, { ...randomState(r), showUsers: true });
      h.set(randomState(r));
      h.unmount();
      expect(h.dom.stats()).toEqual({ mounts: 0, nodes: 0, listeners: 0 });
      expect(h.root.innerHTML).toBe("");
      h.root.remove();
    }
  });
});

describe("minimal patches (task.md section 2.3)", () => {
  const view = compileToView<State>(DASHBOARD);
  const base: State = {
    title: "T",
    showUsers: true,
    showShop: false,
    users: [
      { id: 1, name: "a", url: "/1", isVisible: true, admin: false },
      { id: 2, name: "b", url: "/2", isVisible: false, admin: false },
    ],
    products: [],
    prefix: "",
    count: 0,
  };

  test("identical state produces no patches", () => {
    expect(view.diff(base, base)).toEqual([]);
    expect(view.diff(base, { ...base })).toEqual([]);
  });

  test("users change while showUsers is false: nothing happens", () => {
    const a = { ...base, showUsers: false };
    const b = { ...a, users: [...a.users, { ...a.users[0], id: 3 }] };
    // only the header count `Users ({users.length})` lives under the guard
    expect(view.diff(a, b)).toEqual([]);
  });

  test("showUsers false to true mounts the subtree from next only", () => {
    const patches = view.diff({ ...base, showUsers: false }, base);
    expect(patches.map((p) => p.op)).toEqual(["clear", "insert"]);
  });

  test("showUsers true to false only unmounts", () => {
    const patches = view.diff(base, { ...base, showUsers: false });
    expect(patches.map((p) => p.op)).toEqual(["clear", "insert"]); // users branch -> else branch
  });

  test("hidden user changing produces no patch for its DOM", () => {
    const next = {
      ...base,
      users: [base.users[0], { ...base.users[1], name: "renamed" }],
    };
    expect(view.diff(base, next)).toEqual([]);
  });

  test("a visible user's name changes: text patch + handler (payload is the user)", () => {
    const next = {
      ...base,
      users: [{ ...base.users[0], name: "zz" }, base.users[1]],
    };
    const patches = view.diff(base, next);
    expect(patches.map((p) => p.op).sort()).toEqual(["handler", "text"]);
    expect(patches.find((p) => p.op === "text")).toMatchObject({ text: "zz" });
  });

  test("removing a user from the list removes only that item", () => {
    const patches = view.diff(base, { ...base, users: [base.users[0]] });
    expect(patches.map((p) => p.op)).toEqual(["text", "remove"]); // users.length + the item
  });

  test("changed handler payload yields a handler patch, not DOM rebuild", () => {
    // new user object with the same data: the handler payload is a new reference
    const next = { ...base, users: [{ ...base.users[0] }, base.users[1]] };
    const patches = view.diff(base, next);
    expect(patches.map((p) => p.op)).toEqual(["handler"]);
  });
});

describe("form state", () => {
  test("value and checked are written as properties, so typing then patching works", () => {
    const v = compileToView<{ q: string; on: boolean }>(
      `div
  input.q(value=q)
  input.c(type="checkbox" checked=on)`,
    );
    const h = mountView(v, { q: "a", on: false });
    const q = h.root.querySelector(".q") as HTMLInputElement;
    const c = h.root.querySelector(".c") as HTMLInputElement;
    // the user types and ticks; the app records it in state (via messages)
    q.value = "typed";
    c.checked = true;
    h.set({ q: "typed", on: true });
    // later the app resets the form: attributes alone would not update the
    // now-dirty live values, properties must be written
    h.set({ q: "", on: false });
    expect(q.value).toBe("");
    expect(c.checked).toBe(false);
    h.set({ q: "from state", on: true });
    expect(q.value).toBe("from state");
    expect(c.checked).toBe(true);
  });
});

describe("the state does not paint (a mount follows only when told)", () => {
  const view = compileToView<{ count: number }>(`p {count}`);

  /** A dom plugin wired to a mutable `current`, without the full core. */
  function plugin(state: { count: number }) {
    let current = state;
    const dom = new DomPlugin();
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

  test("a mount paints once; an update paints when the app sends one", () => {
    const h = plugin({ count: 1 });
    const root = h.root();
    document.body.appendChild(root);
    h.dom.mount(root, view, { ctx: h.ctx });
    expect(root.textContent).toBe("1");
    h.set({ count: 2 });
    // nothing follows the state here: only the patches decide
    expect(root.textContent).toBe("1");
    h.dom.update(root, view.diff({ count: 1 }, { count: 2 }));
    expect(root.textContent).toBe("2");
    h.dom.unmount(root);
  });

  test("update applies what the component computed, without reading the state", () => {
    const h = plugin({ count: 1 });
    const root = h.root();
    document.body.appendChild(root);
    h.dom.mount(root, view, { ctx: h.ctx });
    // getState() says 9 — the plugin never looks: the patches decide.
    h.set({ count: 9 });
    h.dom.update(root, view.diff({ count: 1 }, { count: 2 }));
    expect(root.textContent).toBe("2");
    h.dom.unmount(root);
  });

  test("update with a target applies only to that mount", () => {
    const h = plugin({ count: 1 });
    const a = h.root();
    const b = h.root();
    document.body.append(a, b);
    h.dom.mount(a, view, { ctx: h.ctx });
    h.dom.mount(b, view, { ctx: h.ctx });
    const patches = view.diff({ count: 1 }, { count: 2 });
    h.dom.update(a, patches);
    expect(a.textContent).toBe("2");
    expect(b.textContent).toBe("1");
    h.dom.update(b, patches);
    expect(b.textContent).toBe("2");
    h.dom.unmount(a);
    h.dom.unmount(b);
  });

  test("update throws when nothing is mounted at the target", () => {
    const h = plugin({ count: 1 });
    expect(() =>
      h.dom.update("#ghost", view.diff({ count: 1 }, { count: 2 })),
    ).toThrow(/nothing mounted/);
  });
});
