import { describe, expect, expectTypeOf, it } from "vitest";
import {
  buildPath,
  buildSearch,
  compareSegments,
  compilePattern,
  joinPatterns,
  matchSegments,
  parseQuery,
} from "./match.ts";
import type { ParamsOf } from "./match.ts";

const m = (pattern: string, path: string, cs = false) =>
  matchSegments(compilePattern(pattern, cs), path, cs);

describe("pattern matching", () => {
  it("matches static, param, optional and wildcard segments", () => {
    expect(m("/", "/")).toEqual({});
    expect(m("/users", "/users")).toEqual({});
    expect(m("/users", "/users/")).toEqual({});
    expect(m("/users", "/other")).toBeNull();
    expect(m("/users/:id", "/users/42")).toEqual({ id: "42" });
    expect(m("/users/:id", "/users")).toBeNull();
    expect(m("/users/:id", "/users/1/2")).toBeNull();
    expect(m("/users/:id?", "/users")).toEqual({});
    expect(m("/users/:id?", "/users/7")).toEqual({ id: "7" });
    expect(m("/a/:x?/b", "/a/b")).toEqual({});
    expect(m("/a/:x?/b", "/a/1/b")).toEqual({ x: "1" });
    expect(m("/files/*", "/files")).toEqual({ "*": "" });
    expect(m("/files/*", "/files/a/b.txt")).toEqual({ "*": "a/b.txt" });
    expect(m("/files/*rest", "/files/a/b")).toEqual({ rest: "a/b" });
    expect(m("*", "/anything/at/all")).toEqual({ "*": "anything/at/all" });
  });

  it("decodes params and tolerates malformed escapes", () => {
    expect(m("/u/:name", "/u/a%20b")).toEqual({ name: "a b" });
    expect(m("/u/:name", "/u/100%")).toEqual({ name: "100%" });
  });

  it("is case-insensitive for static segments unless asked", () => {
    expect(m("/Users", "/users")).toEqual({});
    expect(m("/Users", "/users", true)).toBeNull();
    expect(m("/Users", "/Users", true)).toEqual({});
  });

  it("rejects bad patterns", () => {
    expect(() => compilePattern("/a/:")).toThrow(/empty param/);
    expect(() => compilePattern("/a/*/b")).toThrow(/last segment/);
  });

  it("ranks static over dynamic over optional over wildcard", () => {
    const sort = (ps: string[]) =>
      ps
        .map((p) => ({ p, s: compilePattern(p) }))
        .sort((a, b) => compareSegments(a.s, b.s))
        .map((x) => x.p);
    expect(sort(["/*", "/users/:id", "/users/new", "/users/:id?"])).toEqual([
      "/users/new",
      "/users/:id",
      "/users/:id?",
      "/*",
    ]);
    expect(sort(["/a/*", "/a", "/a/:x?"])).toEqual(["/a", "/a/:x?", "/a/*"]);
  });
});

describe("paths and queries", () => {
  it("joins patterns", () => {
    expect(joinPatterns("", "/users")).toBe("/users");
    expect(joinPatterns("/users", ":id")).toBe("/users/:id");
    expect(joinPatterns("/users/", "/new")).toBe("/users/new");
    expect(joinPatterns("/x", undefined)).toBe("/x");
    expect(joinPatterns("", "")).toBe("/");
  });

  it("builds paths with encoding, optional and wildcard params", () => {
    expect(buildPath("/users/:id", { id: "a b" })).toBe("/users/a%20b");
    expect(buildPath("/users/:id?", {})).toBe("/users");
    expect(buildPath("/f/*", { "*": "a/b c" })).toBe("/f/a/b%20c");
    expect(buildPath("/f/*rest", {})).toBe("/f");
    expect(() => buildPath("/users/:id", {})).toThrow(/missing param "id"/);
  });

  it("parses and builds query strings", () => {
    expect(parseQuery("?a=1&b=x&b=y&c")).toEqual({
      a: "1",
      b: ["x", "y"],
      c: "",
    });
    expect(parseQuery("")).toEqual({});
    expect(
      buildSearch({ a: 1, b: ["x", "y"], c: null, d: undefined, e: false }),
    ).toBe("?a=1&b=x&b=y");
    expect(buildSearch({})).toBe("");
  });
});

describe("ParamsOf (types)", () => {
  it("infers params from the path string", () => {
    expectTypeOf<ParamsOf<"/users/:id">>().toEqualTypeOf<{ id: string }>();
    expectTypeOf<ParamsOf<"/a/:x/b/:y">>().toEqualTypeOf<{
      x: string;
      y: string;
    }>();
    expectTypeOf<ParamsOf<"/users/:id/:tab?">>().toEqualTypeOf<{
      id: string;
      tab?: string;
    }>();
    expectTypeOf<ParamsOf<"/files/*">>().toEqualTypeOf<{ "*": string }>();
    expectTypeOf<ParamsOf<"/files/*rest">>().toEqualTypeOf<{ rest: string }>();
    expectTypeOf<ParamsOf<"/static">>().toEqualTypeOf<{}>();
    expectTypeOf<ParamsOf<string>>().toEqualTypeOf<Record<string, string>>();
  });
});
