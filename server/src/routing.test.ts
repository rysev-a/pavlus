import { describe, expect, it } from "vitest";
import { dispatchRoute, route, routed } from "./routing.ts";

const table = {
  "GET /": "home",
  "GET /users": "users.list",
  "POST /users": "users.create",
  "GET /users/:id": "users.get",
  "DELETE /users/:id": "users.delete",
  "GET /users/me": "users.me",
  "GET /users/:id/posts/:pid": "posts.get",
  "GET /files/*": "files.get",
  "GET /files/special/:name": "files.special",
};
const r = route(table);

describe("route", () => {
  it("matches static, params and wildcard", () => {
    expect(r.match("GET", "/")).toMatchObject({ kind: "match", id: "home" });
    expect(r.match("GET", "/users/42")).toMatchObject({
      id: "users.get",
      params: { id: "42" },
      pattern: "/users/:id",
    });
    expect(r.match("GET", "/users/1/posts/9")).toMatchObject({
      id: "posts.get",
      params: { id: "1", pid: "9" },
    });
    expect(r.match("GET", "/files/a/b/c.txt")).toMatchObject({
      id: "files.get",
      params: { "*": "a/b/c.txt" },
    });
  });
  it("ranks static > param > wildcard", () => {
    expect(r.match("GET", "/users/me")).toMatchObject({ id: "users.me" });
    expect(r.match("GET", "/files/special/x")).toMatchObject({
      id: "files.special",
      params: { name: "x" },
    });
    expect(r.match("GET", "/files/special")).toMatchObject({ id: "files.get" });
  });
  it("falls back to a lower-ranked route when the better one lacks the method", () => {
    const t = route({ "GET /a/me": "static", "POST /a/:x": "param" });
    expect(t.match("POST", "/a/me")).toMatchObject({ id: "param" });
  });
  it("404 and 405 with Allow", () => {
    expect(r.match("GET", "/nope")).toEqual({ kind: "not_found" });
    expect(r.match("GET", "/files")).toEqual({ kind: "not_found" });
    expect(r.match("PUT", "/users/1")).toEqual({
      kind: "method_not_allowed",
      allow: ["DELETE", "GET", "HEAD", "OPTIONS"],
    });
  });
  it("HEAD falls back to GET, OPTIONS is automatic", () => {
    expect(r.match("HEAD", "/users/3")).toMatchObject({
      id: "users.get",
      method: "GET",
      head: true,
    });
    expect(r.match("OPTIONS", "/users")).toEqual({
      kind: "options",
      allow: ["GET", "HEAD", "OPTIONS", "POST"],
    });
    const explicit = route({ "OPTIONS /x": "custom" });
    expect(explicit.match("OPTIONS", "/x")).toMatchObject({ id: "custom" });
  });
  it("percent-decodes segments after splitting", () => {
    expect(r.match("GET", "/users/a%20b")).toMatchObject({
      params: { id: "a b" },
    });
    expect(r.match("GET", "/users/a%2Fb")).toMatchObject({
      id: "users.get",
      params: { id: "a/b" },
    });
    expect(r.match("GET", "/users/%E0%A4%A")).toEqual({
      kind: "bad_request",
      reason: "malformed percent-encoding",
    });
  });
  it("ignores query and hash", () => {
    expect(r.match("GET", "/users/1?x=2#h")).toMatchObject({ id: "users.get" });
  });
  it("trailing slash policies", () => {
    expect(r.match("GET", "/users/")).toMatchObject({ id: "users.list" });
    const strict = route(
      { "GET /a": "a", "GET /b/": "b" },
      { trailingSlash: "strict" },
    );
    expect(strict.match("GET", "/a/")).toEqual({ kind: "not_found" });
    expect(strict.match("GET", "/b/")).toMatchObject({ id: "b" });
    expect(strict.match("GET", "/b")).toEqual({ kind: "not_found" });
    const redir = route({ "GET /a": "a" }, { trailingSlash: "redirect" });
    expect(redir.match("GET", "/a/")).toEqual({
      kind: "redirect",
      status: 308,
      location: "/a",
    });
    expect(redir.match("GET", "/zzz/")).toEqual({ kind: "not_found" });
  });
  it("rejects bad tables", () => {
    expect(() => route({ "GET /a": "x", "get /a": "y" })).toThrow(/duplicate/);
    expect(() => route({ "GET /a/*/b": "x" })).toThrow(/last/);
    expect(() => route({ nonsense: "x" })).toThrow(/bad route/);
  });
});

describe("dispatchRoute / routed", () => {
  const msg = (method: string, path: string) => ({
    id: "http.request",
    payload: { method, path, query: {}, params: {} },
    ctx: { rid: "r", conn: "http" },
  });
  it("rewrites the message of a match", () => {
    const out = dispatchRoute(r, msg("GET", "/users/5"));
    expect(out).toMatchObject({
      message: {
        id: "users.get",
        payload: { params: { id: "5" } },
        ctx: { rid: "r" },
      },
    });
  });
  it("answers 404/405/OPTIONS purely", () => {
    expect(dispatchRoute(r, msg("GET", "/x"))).toMatchObject({
      effects: [{ plugin: "http", type: "respond", status: 404 }],
    });
    expect(dispatchRoute(r, msg("PUT", "/users"))).toMatchObject({
      effects: [
        { status: 405, headers: { allow: "GET, HEAD, OPTIONS, POST" } },
      ],
    });
    expect(dispatchRoute(r, msg("OPTIONS", "/users"))).toMatchObject({
      effects: [{ status: 204 }],
    });
  });
  it("routed() returns a dispatch effect", () => {
    const h = routed(table);
    expect(h(msg("GET", "/users/1"))).toEqual([
      {
        plugin: "requests",
        type: "dispatch",
        message: expect.objectContaining({ id: "users.get" }),
      },
    ]);
    expect(h({ id: "other" })).toEqual([]);
    expect(h(msg("GET", "/zz"))[0]).toMatchObject({
      plugin: "http",
      status: 404,
    });
  });
});
