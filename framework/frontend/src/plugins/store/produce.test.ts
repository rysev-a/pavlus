import { describe, expect, test } from "vitest";
import { commonRoot, produce, produceWithPaths } from "./produce.ts";

interface User {
  id: number;
  name: string;
  tags: string[];
}
interface State {
  title: string;
  users: User[];
  meta: { version: number; flags: Record<string, boolean> };
}

const state = (): State => ({
  title: "app",
  users: [
    { id: 1, name: "ada", tags: ["x"] },
    { id: 2, name: "bob", tags: ["y", "z"] },
  ],
  meta: { version: 1, flags: { dark: true } },
});

describe("produce: structural sharing", () => {
  test("a recipe that writes nothing returns the same reference", () => {
    const s = state();
    const next = produce(s, (d) => {
      d.users.length; // reads are free
    });
    expect(next).toBe(s);
  });

  test("a no-op write (same value) keeps the reference", () => {
    const s = state();
    expect(produce(s, (d) => void (d.title = "app"))).toBe(s);
  });

  test("fresh references along the written path, shared everywhere else", () => {
    const s = state();
    const next = produce(s, (d) => {
      d.users[0]!.name = "new";
    });
    expect(next).not.toBe(s);
    expect(next.users).not.toBe(s.users);
    expect(next.users[0]).not.toBe(s.users[0]);
    expect(next.users[0]!.name).toBe("new");
    // untouched branches share references with the previous state
    expect(next.users[1]).toBe(s.users[1]);
    expect(next.title).toBe(s.title);
    expect(next.meta).toBe(s.meta);
  });

  test("deep writes through several drafts", () => {
    const s = state();
    const next = produce(s, (d) => {
      d.meta.flags.dark = false;
      d.meta.version = 2;
    });
    expect(next.meta).not.toBe(s.meta);
    expect(next.meta.flags).not.toBe(s.meta.flags);
    expect(next.meta.flags.dark).toBe(false);
    expect(next.meta.version).toBe(2);
    expect(next.users).toBe(s.users); // untouched
  });

  test("two branches of one draft share the smaller one", () => {
    const s = state();
    const next = produce(s, (d) => {
      d.title = "other";
    });
    expect(next.title).toBe("other");
    expect(next.users).toBe(s.users);
    expect(next.meta).toBe(s.meta);
  });
});

describe("produce: arrays", () => {
  test("push copies the array, keeps the items", () => {
    const s = state();
    const next = produce(s, (d) => {
      d.users.push({ id: 3, name: "eve", tags: [] });
    });
    expect(next.users).not.toBe(s.users);
    expect(next.users.length).toBe(3);
    expect(next.users[0]).toBe(s.users[0]);
    expect(next.users[2]!.name).toBe("eve");
  });

  test("splice removes and keeps surviving items by reference", () => {
    const s = state();
    const next = produce(s, (d) => {
      d.users.splice(0, 1);
    });
    expect(next.users.length).toBe(1);
    expect(next.users[0]).toBe(s.users[1]);
  });

  test("nested array write inside an item", () => {
    const s = state();
    const next = produce(s, (d) => {
      d.users[1]!.tags.push("w");
    });
    expect(next.users[1]!.tags).not.toBe(s.users[1]!.tags);
    expect(next.users[1]!.tags).toEqual(["y", "z", "w"]);
    expect(next.users[1]).not.toBe(s.users[1]);
    expect(next.users[0]).toBe(s.users[0]);
  });

  test("length truncation", () => {
    const s = state();
    const next = produce(s, (d) => {
      d.meta.version = 1;
    });
    expect(produce(next, (d) => void (d.users.length = 0)).users).toEqual([]);
  });
});

describe("produce: reporting", () => {
  test("paths and the covering root of a single write", () => {
    const s = state();
    const r = produceWithPaths(s, (d) => {
      d.users[0]!.name = "new";
    });
    expect(r.changed).toBe(true);
    expect(r.paths).toContain("users.0.name");
    expect(r.root).toBe("users.0.name");
  });

  test("two writes in one item cover the item", () => {
    const s = state();
    const r = produceWithPaths(s, (d) => {
      const u = d.users[0]!;
      u.name = "new";
      u.id = 9;
    });
    expect(r.root).toBe("users.0");
  });

  test("writes in different top fields cover the root", () => {
    const s = state();
    const r = produceWithPaths(s, (d) => {
      d.title = "x";
      d.meta.version = 5;
    });
    expect(r.root).toBe("");
  });

  test("unchanged recipes report nothing", () => {
    const s = state();
    const r = produceWithPaths(s, (d) => {
      d.users.forEach((u) => u.name.length);
    });
    expect(r.changed).toBe(false);
    expect(r.paths).toEqual([]);
    expect(r.root).toBe("");
  });
});

describe("produce: guards", () => {
  test("a recipe may not return a value", () => {
    expect(() =>
      produce(state(), ((d: State) => d.title) as (d: State) => void),
    ).toThrow("must not return a value");
  });

  test("non-object state is rejected", () => {
    expect(() => produce(5 as never, () => {})).toThrow();
  });

  test("exotic values pass through by reference", () => {
    const s = { ...state(), when: new Date(0) };
    const next = produce(s, (d) => {
      d.title = "x";
      d.when.setTime(1000); // not drafted: the mutation leaks, by design
    });
    expect(next.when).toBe(s.when);
    expect(next.when.getTime()).toBe(1000);
  });
});

describe("commonRoot", () => {
  test("empty input", () => {
    expect(commonRoot([])).toBe("");
  });
  test("diverging prefixes fall back to the root", () => {
    expect(commonRoot(["a", "b.c"])).toBe("");
    expect(commonRoot(["a.b", "a.c"])).toBe("a");
  });
});
