import { describe, expect, it } from "vitest";
import { scenario } from "../../src/testing/mod.ts";
import { app, routes } from "./readme-app.ts";

const ctx = { rid: "r1", conn: "http" };

// #region test
describe("GET /users/:id", () => {
  it("loads the user, counts the view, answers", () => {
    scenario(
      app,
      [
        {
          send: {
            id: "http.request",
            ctx,
            payload: { method: "GET", path: "/users/7" },
          },
        },
        {
          expect: [
            { plugin: "pg", sql: /from users where id = \$1/, params: ["7"] },
          ],
          reply: { payload: { rows: [{ id: 7, name: "Ann" }] } },
        },
        {
          expect: [
            { type: "req.set" },
            { plugin: "redis", args: ["INCR", "views:7"] },
          ],
          reply: { payload: 42 },
          from: 1,
        },
        {
          expect: [
            {
              plugin: "http",
              type: "respond",
              json: { id: 7, name: "Ann", views: 42 },
            },
          ],
        },
      ],
      { routes },
    );
  });

  it("answers 503 and logs when Postgres is down", () => {
    scenario(
      app,
      [
        {
          send: {
            id: "http.request",
            ctx,
            payload: { method: "GET", path: "/users/7" },
          },
        },
        {
          expect: [{ plugin: "pg" }],
          error: { code: "ECONNREFUSED", message: "down" },
        },
        {
          expect: [
            { plugin: "log", level: "error" },
            { plugin: "http", status: 503 },
          ],
        },
      ],
      { routes },
    );
  });
});
// #endregion test

describe("the same app on real sockets", () => {
  it("runs unchanged against the fake plugins", async () => {
    const { createServerApp } = await import("../../src/mod.ts");
    const { fakeHttp } = await import("../../src/testing/mod.ts");
    const fake = fakeHttp();
    const db = {
      name: "pg",
      handle: (e: any, c: any) =>
        c.dispatch({
          id: e.replyTo,
          ctx: e.ctx,
          payload: { rows: [{ id: 7, name: "Ann" }] },
        }),
    };
    const kv = {
      name: "redis",
      handle: (e: any, c: any) =>
        c.dispatch({ id: e.replyTo, ctx: e.ctx, payload: 1 }),
    };
    const server = createServerApp({
      app,
      routes,
      plugins: [fake, db, kv, { name: "log", handle() {} }],
    });
    const res = await fake.request({ method: "GET", path: "/users/7" });
    expect(res.json).toEqual({ id: 7, name: "Ann", views: 1 });
    await server.shutdown();
  });
});
