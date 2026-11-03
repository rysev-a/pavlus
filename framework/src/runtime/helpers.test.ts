import { describe, expect, test } from "vitest";
import {
  asView,
  diffKeyedList,
  joinClasses,
  type KeyedListOps,
  sameValues,
  setAttr,
  toAttr,
  toText,
} from "./helpers.ts";

describe("value helpers", () => {
  test("toText: nothing for null, undefined and false", () => {
    expect([null, undefined, false, 0, "", "a", true, 5].map(toText)).toEqual([
      "",
      "",
      "",
      "0",
      "",
      "a",
      "true",
      "5",
    ]);
  });

  test("toAttr: null removes, true is empty, the rest is a string", () => {
    expect([null, undefined, false, true, 0, "x"].map(toAttr)).toEqual([
      null,
      null,
      null,
      "",
      "0",
      "x",
    ]);
  });

  test("joinClasses skips empty names and gives null for none", () => {
    expect(joinClasses(["a", "", null, false, "b"])).toBe("a b");
    expect(joinClasses(["", null])).toBeNull();
  });

  test("setAttr leaves absent attributes out", () => {
    const attrs: Record<string, string> = {};
    setAttr(attrs, "a", "1");
    setAttr(attrs, "b", null);
    expect(attrs).toEqual({ a: "1" });
  });

  test("sameValues: identical, or arrays with identical elements", () => {
    const o = {};
    expect(sameValues(o, o)).toBe(true);
    expect(sameValues([o, 1], [o, 1])).toBe(true);
    expect(sameValues([o], [{}])).toBe(false);
    expect(sameValues([1], [1, 2])).toBe(false);
    expect(sameValues({}, {})).toBe(false);
  });

  test("asView: a view, a component with a view, nothing, or an error", () => {
    const view = { render: () => [], diff: () => [] };
    expect(asView(view)).toBe(view);
    expect(asView({ view })).toBe(view);
    expect(asView(null)).toBeNull();
    expect(asView(undefined)).toBeNull();
    expect(() => asView({ nope: 1 })).toThrow(/needs a view/);
  });
});

describe("diffKeyedList", () => {
  /** Records the operations as readable strings. */
  function run(prev: string[], next: string[]): string[] {
    const log: string[] = [];
    const ops: KeyedListOps = {
      remove: (key) => log.push(`remove ${key}`),
      insert: (index, before) =>
        log.push(`insert ${next[index]} before ${before}`),
      move: (key, before) => log.push(`move ${key} before ${before}`),
      common: (p, n) => log.push(`common ${prev[p]}->${n}`),
    };
    diffKeyedList(prev, next, (key) => `start:${key}`, "end", ops);
    return log;
  }

  test("removes first, then inserts from the end, then common items", () => {
    expect(run(["a", "b", "c"], ["a", "c", "d"])).toEqual([
      "remove b",
      "insert d before end",
      "common a->0",
      "common c->1",
    ]);
  });

  test("a reordered list moves items instead of rebuilding them", () => {
    const log = run(["a", "b", "c"], ["c", "a", "b"]);
    expect(log.some((l) => l.startsWith("move"))).toBe(true);
    expect(
      log.filter((l) => l.startsWith("insert") || l.startsWith("remove")),
    ).toEqual([]);
    // simple, not minimal: a rotation costs a move per displaced item
    expect(log.filter((l) => l.startsWith("move")).length).toBeLessThanOrEqual(
      2,
    );
  });

  test("an unchanged list only reports common items", () => {
    expect(run(["a", "b"], ["a", "b"])).toEqual(["common a->0", "common b->1"]);
  });

  test("duplicate keys are an error that names the key", () => {
    expect(() => run(["a", "a"], [])).toThrow(/duplicate key a/);
    expect(() => run([], ["b", "b"])).toThrow(/duplicate key b/);
  });
});
