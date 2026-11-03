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
  toHandler,
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
});
