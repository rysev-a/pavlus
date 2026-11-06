import { describe, expect, test } from "vitest";
import { createApp } from "../core/mod.ts";
import type { Message } from "../core/types.ts";
import { createStorePlugin } from "../plugins/store/mod.ts";
import {
  type Children,
  Component,
  type ComponentCtx,
  type ComponentFn,
  namespace,
  setComponentTrace,
  toHandler,
  viewOf,
} from "./mod.ts";

const set = (path: string, value: unknown) => ({
  plugin: "store",
  type: "set",
  path,
  value,
});

describe("a component is a class: each method is the handler of a message id", () => {
  test("handlers by id; unknown ids give no effects", () => {
    class Counter extends Component<{ n: number }> {
      init() {
        return [set("n", 0)];
      }
      inc(_m: Message, s: { n: number }) {
        return [set("n", s.n + 1)];
      }
    }
    const h = toHandler(new Counter());
    expect(h({ id: "init" }, { n: 5 })).toEqual([set("n", 0)]);
    expect(h({ id: "inc" }, { n: 5 })).toEqual([set("n", 6)]);
    expect(h({ id: "nope" }, { n: 5 })).toEqual([]);
  });

  test("`this`, `_helpers` and `#private` members work, and are not messages", () => {
    class Counter extends Component<{ n: number }> {
      step = 2;
      inc(_m: Message, s: { n: number }) {
        return [this._bump(s.n), ...this.#extra()];
      }
      _bump(n: number) {
        return set("n", n + this.step);
      }
      #extra() {
        return [set("extra", true)];
      }
    }
    const h = toHandler(new Counter());
    expect(h({ id: "inc" }, { n: 1 })).toEqual([
      set("n", 3),
      set("extra", true),
    ]);
    expect(h({ id: "_bump" }, { n: 1 })).toEqual([]);
    expect(h({ id: "#extra" }, { n: 1 })).toEqual([]);
  });

  test("a subclass overrides a handler and can call super", () => {
    class List extends Component {
      load() {
        return [set("status", "loading")];
      }
    }
    class Table extends List {
      override load() {
        return [...super.load(), set("sorted", true)];
      }
    }
    expect(toHandler(new Table())({ id: "load" }, {})).toEqual([
      set("status", "loading"),
      set("sorted", true),
    ]);
  });

  test("arrow-function fields are handlers too", () => {
    class Quick extends Component {
      tag = "q";
      go = () => [set("tag", this.tag)];
    }
    expect(toHandler(new Quick())({ id: "go" }, {})).toEqual([set("tag", "q")]);
  });

  test("a handler that does not return an array is reported by name", () => {
    class Bad extends Component {
      oops() {
        return set("x", 1) as never;
      }
    }
    expect(() => toHandler(new Bad())({ id: "oops" }, {})).toThrow(
      /handler "oops" must return an array/,
    );
  });

  test("names that are never messages: reserved members and what every object has", () => {
    class Page extends Component {
      view = { render: () => [], diff: () => [] };
      children: Children = {};
      ok() {
        return [set("ok", 1)];
      }
    }
    const h = toHandler(new Page());
    for (const id of [
      "toString",
      "constructor",
      "hasOwnProperty",
      "__proto__",
      "view",
      "children",
      "routing",
      "dispatch", // would recurse into itself
    ]) {
      expect(h({ id }, {}), id).toEqual([]);
    }
    expect(h({ id: "ok" }, {})).toEqual([set("ok", 1)]);
  });

  test("an instance gives the same handler every time; functions stay as they are", () => {
    const c = new (class extends Component {})();
    expect(toHandler(c)).toBe(toHandler(c));
    const f: ComponentFn = () => [set("x", 1)];
    expect(toHandler(f)).toBe(f);
  });

  test("createApp takes a component instance", () => {
    class Counter extends Component<{ n: number }> {
      inc(_m: Message, s: { n: number }) {
        return [set("n", s.n + 1)];
      }
    }
    const store = createStorePlugin({ n: 0 });
    const app = createApp<{ n: number }>({
      app: new Counter(),
      plugins: [store],
    });
    app.dispatch({ id: "inc" });
    app.dispatch({ id: "inc" });
    expect(store.getState().n).toBe(2);
  });
});

describe("anything that is not a component is refused, saying what to do", () => {
  const refuse = (c: unknown) => () => toHandler(c as ComponentFn);

  test("a plain object", () => {
    expect(refuse({ inc: () => [] })).toThrow(
      /plain object.*class that extends Component/,
    );
  });

  test("an instance of a class that does not extend Component", () => {
    class Loose {
      inc() {
        return [];
      }
    }
    expect(refuse(new Loose())).toThrow(
      /instance of Loose, which does not extend Component/,
    );
  });

  test("the class itself instead of an instance", () => {
    class Page extends Component {}
    expect(refuse(Page)).toThrow(
      /Page is a class: pass an instance \(new Page\(\)\)/,
    );
  });
});

describe("children", () => {
  interface Users {
    items: number[];
    filter?: string;
  }
  class UsersList extends Component<Users> {
    load() {
      return [
        set("items", []),
        {
          plugin: "http",
          type: "request",
          id: "u",
          onSuccess: "loaded",
          onError: "failed",
        },
      ];
    }
    loaded(m: Message) {
      return [set("items", m.payload)];
    }
    sees(_m: Message, s: Users) {
      return [set("seenFilter", s.filter)];
    }
  }

  interface Dash {
    filter: string;
    users: Users;
  }
  class Dashboard extends Component<Dash> {
    children: Children<Dash> = {
      users: {
        component: new UsersList(),
        key: "users",
        props: (s) => ({ filter: s.filter }),
      },
    };
    mounted(_m: Message, _s: Dash, { send }: ComponentCtx) {
      return send("users", "load");
    }
    "users.loaded"() {
      return [{ plugin: "logger", type: "log", message: "parent saw it" }];
    }
  }
  const h = toHandler(new Dashboard());
  const state: Dash = { filter: "ann", users: { items: [] } };

  test("ctx.send: the parent starts the child; paths and reply ids are namespaced", () => {
    expect(h({ id: "mounted" }, state)).toEqual([
      set("users.items", []),
      {
        plugin: "http",
        type: "request",
        id: "u",
        onSuccess: "users.loaded",
        onError: "users.failed",
      },
    ]);
  });

  test("messages with the child's prefix are routed; the parent can observe them too", () => {
    expect(h({ id: "users.loaded", payload: [1, 2] }, state)).toEqual([
      { plugin: "logger", type: "log", message: "parent saw it" }, // parent's own handler first
      set("users.items", [1, 2]),
    ]);
  });

  test("props are merged into the child's state", () => {
    expect(h({ id: "users.sees" }, state)).toEqual([
      set("users.seenFilter", "ann"),
    ]);
  });

  test("an unchanged base and props re-merge to the same object", () => {
    // The merged state is memoized: the `next` of one message is the very
    // object the child sees as `prev` on the next, so its diff can stop at
    // `prev === next`.
    const seen: unknown[] = [];
    class Child extends Component<Users> {
      sees(_m: Message, s: Users) {
        seen.push(s);
        return [];
      }
    }
    class Parent extends Component<Dash> {
      children: Children<Dash> = {
        users: {
          component: new Child(),
          key: "users",
          props: (s) => ({ filter: s.filter }),
        },
      };
    }
    const hp = toHandler(new Parent());
    const st: Dash = { filter: "ann", users: { items: [] } };
    hp({ id: "users.sees" }, st);
    hp({ id: "users.sees" }, st);
    expect(seen[0]).toBe(seen[1]);
    // a changed field merges anew
    hp({ id: "users.sees" }, { ...st, filter: "bob" });
    expect(seen[2]).not.toBe(seen[1]);
  });

  test("viewOf with props: an unchanged state diffs to no patches", () => {
    const seen: string[] = [];
    const view = {
      render: () => [],
      diff: (prev: unknown, next: unknown) => {
        seen.push(`${prev === next}`);
        return [];
      },
    } as unknown as NonNullable<Component["view"]>;
    class C extends Component<{ v: number; up: string }> {
      view = view;
    }
    const v = viewOf(new C(), {
      key: "n",
      props: (s: { n: { v: number }; up: string }) => ({ up: s.up }),
    })!;
    const st = { n: { v: 1 }, up: "u" };
    expect(v.diff(st, st)).toEqual([]); // same state: the top-level prune
    expect(seen).toEqual(["true"]);
    const next = { n: { v: 2 }, up: "u" };
    v.diff(st, next);
    expect(seen).toEqual(["true", "false"]); // a real change walks the diff
  });

  test("unknown child in send throws; other prefixes are ignored", () => {
    class Bad extends Component {
      go(_m: Message, _s: unknown, { send }: ComponentCtx) {
        return send("ghost", "x");
      }
    }
    expect(() => toHandler(new Bad())({ id: "go" }, {})).toThrow(
      /no child "ghost"/,
    );
    expect(h({ id: "other.thing" }, state)).toEqual([]);
  });

  test("select: the child follows a component that lives in the state", () => {
    class A extends Component {
      ping() {
        return [set("who", "a")];
      }
    }
    class B extends Component {
      ping() {
        return [set("who", "b")];
      }
    }
    class Parent extends Component<{ c: Component | null }> {
      children: Children<{ c: Component | null }> = {
        kid: { select: (s) => s.c, key: "kid" },
      };
    }
    const parent = toHandler(new Parent());
    expect(parent({ id: "kid.ping" }, { c: new A() })).toEqual([
      set("kid.who", "a"),
    ]);
    expect(parent({ id: "kid.ping" }, { c: new B() })).toEqual([
      set("kid.who", "b"),
    ]);
    expect(parent({ id: "kid.ping" }, { c: null })).toEqual([]);
  });

  test("nested children get nested prefixes", () => {
    class Row extends Component {
      remove() {
        return [{ plugin: "http", type: "request", onSuccess: "removed" }];
      }
    }
    class List extends Component {
      children: Children = { row: { component: new Row() } };
    }
    class Top extends Component {
      children: Children = { users: { component: new List() } };
    }
    expect(toHandler(new Top())({ id: "users.row.remove" }, {})).toEqual([
      { plugin: "http", type: "request", onSuccess: "users.row.removed" },
    ]);
  });

  test("namespace takes a function or a component", () => {
    class X extends Component {
      x() {
        return [{ plugin: "p", type: "t", replyTo: "r" }];
      }
    }
    const fn: ComponentFn = () => [{ plugin: "p", type: "t", replyTo: "r" }];
    for (const child of [new X(), fn]) {
      expect(namespace("c", child)({ id: "c.x" }, {})).toEqual([
        { plugin: "p", type: "t", replyTo: "c.r" },
      ]);
    }
  });

  test("the trace reports receive and emit per component path", () => {
    const events: string[] = [];
    setComponentTrace({
      receive: (path, m) => events.push(`receive ${path || "(root)"} ${m.id}`),
      emit: (path, m, e) =>
        events.push(`emit ${path || "(root)"} ${m.id} ${e.length}`),
    });
    try {
      class Row extends Component {
        remove() {
          return [{ plugin: "http", type: "request", onSuccess: "removed" }];
        }
      }
      class List extends Component {
        children: Children = { row: { component: new Row() } };
        "row.removed"() {
          return [set("done", true)];
        }
      }
      class Top extends Component {
        children: Children = { users: { component: new List() } };
      }
      expect(toHandler(new Top())({ id: "users.row.remove" }, {})).toHaveLength(
        1,
      );
      // root receives the full id; users receives the stripped one; the leaf
      // handles it; emit fires bottom-up with the boundary's output
      expect(events).toEqual([
        "receive (root) users.row.remove",
        "receive users row.remove",
        "receive users.row remove",
        "emit users.row remove 1",
        "emit users row.remove 1",
        "emit (root) users.row.remove 1",
      ]);
      // a message nobody handles still reports the receive chain
      events.length = 0;
      expect(toHandler(new Top())({ id: "nope" }, {})).toEqual([]);
      expect(events).toEqual(["receive (root) nope", "emit (root) nope 0"]);
    } finally {
      setComponentTrace(null);
    }
  });
});

describe("keyed children (each)", () => {
  interface User {
    id: number;
    name: string;
    starred?: boolean;
  }
  interface ListState {
    filter: string;
    byId: Record<string, User>;
  }
  const list: ListState = {
    filter: "stars-only",
    byId: {
      "7": { id: 7, name: "ann" },
      "12": { id: 12, name: "bob" },
    },
  };

  class Row extends Component<User> {
    star(_m: Message, s: User) {
      return [set("starred", !s.starred)];
    }
    save() {
      return [{ plugin: "http", type: "request", onSuccess: "saved" }];
    }
    deep() {
      return [{ plugin: "store", type: "set", path: ["a", "b"], value: 1 }];
    }
  }
  const row = namespace("row", new Row(), { each: "byId" });

  test("the child is ONE element of state[each], the one its key names", () => {
    const seen: User[] = [];
    class R extends Component<User> {
      star(_m: Message, s: User) {
        seen.push(s);
        return [];
      }
    }
    const r = namespace("row", new R(), { each: "byId" });
    expect(r({ id: "row.7.star" }, list)).toEqual([]);
    expect(r({ id: "row.12.star" }, list)).toEqual([]);
    // each row saw its own element, never the whole map
    expect(seen).toEqual([list.byId[7], list.byId[12]]);
  });

  test("store paths are rooted at <each>.<key>, string or array", () => {
    expect(row({ id: "row.7.star" }, list)).toEqual([
      set("byId.7.starred", true),
    ]);
    expect(row({ id: "row.7.deep" }, list)).toEqual([
      { plugin: "store", type: "set", path: ["byId", "7", "a", "b"], value: 1 },
    ]);
  });

  test("reply ids get the key back: row.<key>.saved", () => {
    expect(row({ id: "row.7.save" }, list)).toEqual([
      { plugin: "http", type: "request", onSuccess: "row.7.saved" },
    ]);
  });

  test("no key, a bare key, or a key with no element: dropped", () => {
    expect(row({ id: "row.star" }, list)).toEqual([]); // no key segment
    expect(row({ id: "row." }, list)).toEqual([]);
    expect(row({ id: "row.7" }, list)).toEqual([]); // a bare key
    expect(row({ id: "row.9.star" }, list)).toEqual([]); // no byId[9]
  });

  test("props merge into the keyed element, memoized like plain children", () => {
    const seen: (User & { filter: string })[] = [];
    class R extends Component<User & { filter: string }> {
      star(_m: Message, s: User & { filter: string }) {
        seen.push(s);
        return [];
      }
    }
    const r = namespace("row", new R(), {
      each: "byId",
      props: (s: ListState) => ({ filter: s.filter }),
    });
    r({ id: "row.7.star" }, list);
    r({ id: "row.7.star" }, list);
    expect(seen).toEqual([
      { id: 7, name: "ann", filter: "stars-only" },
      { id: 7, name: "ann", filter: "stars-only" },
    ]);
    expect(seen[0]).toBe(seen[1]); // same base, same fields: the same merge
  });

  test("a paint answer is sliced to the one element", () => {
    const seen: unknown[] = [];
    class R extends Component {
      paint(m: Message) {
        seen.push(m.payload);
        return [];
      }
    }
    const r = namespace("row", new R(), { each: "byId", scope: "/n1" });
    const next: ListState = {
      ...list,
      byId: { ...list.byId, "7": { ...list.byId[7], name: "anna" } },
    };
    r({ id: "row.7.paint", payload: { prev: list, next } }, list);
    expect(seen).toEqual([{ prev: list.byId[7], next: next.byId[7] }]);
  });

  test("a keyed child nests: a static grandchild under it", () => {
    class Username extends Component {
      focus() {
        return [set("focused", true)];
      }
    }
    class RowWithUsername extends Component<User & { username: string }> {
      children: Children = {
        username: { component: new Username(), key: "username" },
      };
    }
    const r = namespace("row", new RowWithUsername(), { each: "byId" });
    const st = { byId: { "7": { id: 7, name: "ann", username: "ann77" } } };
    expect(r({ id: "row.7.username.focus" }, st)).toEqual([
      set("byId.7.username.focused", true),
    ]);
  });

  test("ctx.send addresses one row through the parent", () => {
    class List extends Component<ListState> {
      children: Children<ListState> = {
        row: { component: new Row(), each: "byId" },
      };
      mounted(_m: Message, _s: ListState, { send }: ComponentCtx) {
        return send("row", "7.star");
      }
    }
    expect(toHandler(new List())({ id: "mounted" }, list)).toEqual([
      set("byId.7.starred", true),
    ]);
  });

  test("the trace path carries the key: row.7", () => {
    const events: string[] = [];
    setComponentTrace({
      receive: (path, m) => events.push(`receive ${path} ${m.id}`),
      emit: (path, m, e) => events.push(`emit ${path} ${m.id} ${e.length}`),
    });
    try {
      expect(row({ id: "row.7.star" }, list)).toHaveLength(1);
      expect(events).toEqual(["receive row.7 star", "emit row.7 star 1"]);
    } finally {
      setComponentTrace(null);
    }
  });

  test("each refuses key and select", () => {
    class R extends Component {}
    expect(() => namespace("row", new R(), { each: "byId", key: "x" })).toThrow(
      /each cannot be combined with key or select/,
    );
    expect(() =>
      namespace("row", new R(), { each: "byId", select: (s: ListState) => s }),
    ).toThrow(/each cannot be combined with key or select/);
  });
});
