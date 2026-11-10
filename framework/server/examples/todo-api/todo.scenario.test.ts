// (a) The key flows of the app played with scripted replies: no network, no
// database, no Redis, no clock. Each `send` is a message, each `expect` is
// asserted on the effects the pure handler returned, each `reply` stands in
// for what a plugin would have answered (same ctx, so same rid).

import type { Message } from "@pavlus/core";
import { describe, expect, it } from "vitest";
import { flow, type Step, scenario } from "../../src/testing/mod.ts";
import { app } from "./app.ts";
import { type AppState, type Config, defaultConfig } from "./kit.ts";
import { routeTable } from "./routes.ts";

const ctx = { rid: "r1", conn: "http" };

function httpReq(
  method: string,
  path: string,
  o: {
    body?: unknown;
    headers?: Record<string, string>;
    ip?: string;
    query?: Record<string, string>;
  } = {},
): Message {
  return {
    id: "http.request",
    ctx,
    payload: {
      method,
      path,
      query: o.query ?? {},
      headers: o.headers ?? {},
      cookies: {},
      params: {},
      body: o.body,
      ip: o.ip ?? "203.0.113.9",
    },
  };
}

const opts = (config: Partial<Config> = {}) => ({
  routes: routeTable,
  state: {
    config: { ...defaultConfig, ...config },
    shared: { ready: true, dummyHash: "scrypt$16$8$1$c2FsdA$a2V5" },
  } as Partial<AppState>,
});

/** The first hits of a window: INCR answers 5, nobody is limited. */
const passRateLimit: Step[] = [
  {
    expect: [
      { type: "req.merge" },
      { plugin: "redis", args: ["INCR", /^rl:/] },
    ],
    reply: { payload: 5 },
    from: 1,
  },
];

const authed = { authorization: "Bearer tok123" };
const alice = JSON.stringify({ id: 7, email: "alice@example.com" });

describe("login", () => {
  it("success: lookup -> verify -> token -> redis session -> 200 with cookie", () => {
    const { state, effects } = scenario(
      app,
      [
        {
          send: httpReq("POST", "/login", {
            body: { email: "Alice@Example.com", password: "correct horse" },
          }),
        },
        ...passRateLimit,
        // login route: the password leaves the request body, a lookup starts
        {
          expect: [
            {
              type: "req.merge",
              value: { step: "lookup", email: "alice@example.com" },
            },
            { type: "req.set", path: ["http", "body"] },
            {
              plugin: "pg",
              sql: /from users where email = \$1/,
              params: ["alice@example.com"],
            },
          ],
          reply: {
            payload: {
              rows: [
                { id: 7, email: "alice@example.com", password_hash: "HASH" },
              ],
            },
          },
          from: 2,
        },
        {
          expect: [
            { type: "req.merge", value: { step: "verify" } },
            {
              plugin: "crypto",
              type: "verify",
              password: "correct horse",
              hash: "HASH",
            },
          ],
          reply: { payload: { ok: true } },
          from: 1,
        },
        {
          expect: [
            { type: "req.merge" },
            { plugin: "crypto", type: "randomToken" },
          ],
          reply: { payload: { token: "TOKEN" } },
          from: 1,
        },
        {
          expect: [
            { type: "req.merge" },
            {
              plugin: "redis",
              args: [
                "SET",
                "sess:TOKEN",
                alice.replace("{", "{").length
                  ? JSON.stringify({ id: 7, email: "alice@example.com" })
                  : "",
                "EX",
                3600,
              ],
            },
          ],
          reply: { payload: "OK" },
          from: 1,
        },
        {
          expect: [
            {
              plugin: "log",
              level: "info",
              msg: "login",
              fields: { userId: 7 },
            },
            {
              plugin: "http",
              type: "respond",
              status: 200,
              json: {
                token: "TOKEN",
                user: { id: 7, email: "alice@example.com" },
              },
              cookies: { sid: { value: "TOKEN", maxAge: 3600 } },
            },
            { plugin: "log", msg: "response" },
          ],
          exact: false,
        },
      ],
      opts(),
    );
    expect(effects.some((e) => e.plugin === "http")).toBe(true);
    // the password never sits in the state of the request
    expect(JSON.stringify(state.requests)).not.toContain("correct horse");
  });

  it("wrong password: 401 invalid_credentials, no token, no session", () => {
    const { effects } = scenario(
      app,
      [
        {
          send: httpReq("POST", "/login", {
            body: { email: "alice@example.com", password: "nope nope" },
          }),
        },
        ...passRateLimit,
        {
          expect: [
            { type: "req.merge" },
            { type: "req.set" },
            { plugin: "pg" },
          ],
          reply: {
            payload: {
              rows: [
                { id: 7, email: "alice@example.com", password_hash: "HASH" },
              ],
            },
          },
          from: 2,
        },
        {
          expect: [{ type: "req.merge" }, { plugin: "crypto", type: "verify" }],
          reply: { payload: { ok: false } },
          from: 1,
        },
        {
          expect: [
            {
              plugin: "log",
              level: "warn",
              fields: { reason: "bad_password" },
            },
            {
              plugin: "http",
              type: "respond",
              status: 401,
              json: { error: { code: "invalid_credentials" } },
            },
            { plugin: "log", msg: "response" },
          ],
        },
      ],
      opts(),
    );
    expect(effects.find((e) => e.plugin === "crypto")).toBeUndefined();
    expect(effects.find((e) => e.plugin === "redis")).toBeUndefined();
  });

  it("unknown email: verifies against the dummy hash, then the SAME 401", () => {
    scenario(
      app,
      [
        {
          send: httpReq("POST", "/login", {
            body: { email: "ghost@example.com", password: "whatever1" },
          }),
        },
        ...passRateLimit,
        {
          expect: [
            { type: "req.merge" },
            { type: "req.set" },
            { plugin: "pg" },
          ],
          reply: { payload: { rows: [] } },
          from: 2,
        },
        {
          // timing equalisation: a verify happens even though there is no user
          expect: [
            { type: "req.merge" },
            {
              plugin: "crypto",
              type: "verify",
              hash: "scrypt$16$8$1$c2FsdA$a2V5",
            },
          ],
          reply: { payload: { ok: true } }, // even a "valid" dummy never logs anyone in
          from: 1,
        },
        {
          expect: [
            { plugin: "log", fields: { reason: "no_user" } },
            {
              plugin: "http",
              status: 401,
              json: {
                error: {
                  code: "invalid_credentials",
                  message: "invalid email or password",
                },
              },
            },
            { plugin: "log" },
          ],
        },
      ],
      opts(),
    );
  });

  it("invalid input never reaches the database (422 with field errors)", () => {
    scenario(
      app,
      [
        {
          send: httpReq("POST", "/login", {
            body: { email: "", password: "" },
          }),
        },
        ...passRateLimit,
        {
          expect: [
            {
              plugin: "http",
              status: 422,
              json: {
                error: {
                  code: "validation",
                  details: { email: "required", password: "required" },
                },
              },
            },
            { plugin: "log" },
          ],
        },
      ],
      opts(),
    );
  });
});

describe("rate limiting (Redis INCR + EXPIRE)", () => {
  it("first hit arms the window with EXPIRE, then the request goes on", () => {
    scenario(
      app,
      [
        { send: httpReq("GET", "/healthz") }, // not limited
        {
          expect: [
            { type: "req.merge" },
            { plugin: "http", status: 200 },
            { plugin: "log" },
          ],
        },
        {
          send: {
            ...httpReq("POST", "/login", {
              body: { email: "a@b.co", password: "pppppppp" },
            }),
            ctx: { rid: "r2", conn: "http" },
          },
        },
        {
          expect: [
            { type: "req.merge" },
            { plugin: "redis", args: ["INCR", "rl:203.0.113.9"] },
          ],
          reply: { payload: 1 },
          from: 1,
        },
        {
          expect: [
            { type: "req.set", value: "arm" },
            { plugin: "redis", args: ["EXPIRE", "rl:203.0.113.9", 60] },
          ],
          reply: { payload: true },
          from: 1,
        },
        {
          expect: [
            { type: "req.merge" },
            { type: "req.set" },
            { plugin: "pg", sql: /users/ },
          ],
        },
      ],
      opts(),
    );
  });

  it("over the limit: 429 with Retry-After from the TTL, and nothing else runs", () => {
    const { effects } = scenario(
      app,
      [
        {
          send: httpReq("POST", "/login", {
            body: { email: "a@b.co", password: "pppppppp" },
          }),
        },
        {
          expect: [
            { type: "req.merge" },
            { plugin: "redis", args: ["INCR", "rl:203.0.113.9"] },
          ],
          reply: { payload: 4 },
          from: 1,
        },
        {
          expect: [
            { type: "req.set", value: "retry" },
            { plugin: "redis", args: ["TTL", "rl:203.0.113.9"] },
          ],
          reply: { payload: 42 },
          from: 1,
        },
        {
          expect: [
            { plugin: "log", level: "warn", msg: "rate limited" },
            {
              plugin: "http",
              type: "respond",
              status: 429,
              headers: { "retry-after": 42 },
              json: { error: { code: "rate_limited" } },
            },
            { plugin: "log", msg: "response" },
          ],
        },
      ],
      opts({ rateLimit: { limit: 3, windowSec: 60 } }),
    );
    expect(effects.map((e) => e.plugin)).not.toContain("pg");
  });

  it("a key without expiry (crash between INCR and EXPIRE) is healed", () => {
    const { effects } = scenario(
      app,
      [
        { send: httpReq("GET", "/me", { headers: authed }) },
        {
          expect: [{ type: "req.merge" }, { plugin: "redis" }],
          reply: { payload: 99 },
          from: 1,
        },
        {
          expect: [
            { type: "req.set" },
            { plugin: "redis", args: ["TTL", /^rl:/] },
          ],
          reply: { payload: -1 },
          from: 1,
        },
      ],
      opts({ rateLimit: { limit: 3, windowSec: 60 } }),
    );
    expect(effects).toContainEqual(
      expect.objectContaining({
        plugin: "redis",
        args: ["EXPIRE", "rl:203.0.113.9", 60],
      }),
    );
    expect(effects).toContainEqual(
      expect.objectContaining({ status: 429, headers: { "retry-after": 60 } }),
    );
  });

  it("Redis down: the limiter fails open (the request is served)", () => {
    scenario(
      app,
      [
        {
          send: httpReq("POST", "/login", {
            body: { email: "a@b.co", password: "pppppppp" },
          }),
        },
        {
          expect: [{ type: "req.merge" }, { plugin: "redis" }],
          error: { code: "CONNECTION", message: "down" },
          from: 1,
        },
        {
          expect: [
            { plugin: "log", level: "warn" },
            { type: "req.merge" },
            { type: "req.set" },
            { plugin: "pg" },
          ],
          exact: false,
        },
      ],
      opts(),
    );
  });
});

describe("sessions and the todo list cache", () => {
  const getTodos = (): Step[] => [
    { send: httpReq("GET", "/todos", { headers: authed }) },
    ...passRateLimit,
    {
      expect: [
        { type: "req.set" },
        { plugin: "redis", args: ["GET", "sess:tok123"] },
      ],
      reply: { payload: alice },
      from: 1,
    },
  ];

  it("no token: 401 without touching Redis sessions", () => {
    const { effects } = scenario(
      app,
      [
        { send: httpReq("GET", "/todos") },
        ...passRateLimit,
        {
          expect: [
            {
              plugin: "http",
              status: 401,
              json: { error: { code: "unauthenticated" } },
            },
            { plugin: "log" },
          ],
        },
      ],
      opts(),
    );
    expect(effects).toHaveLength(2);
  });

  it("unknown or expired session: 401", () => {
    scenario(
      app,
      [
        { send: httpReq("GET", "/me", { headers: authed }) },
        ...passRateLimit,
        {
          expect: [
            { type: "req.set" },
            { plugin: "redis", args: ["GET", "sess:tok123"] },
          ],
          reply: { payload: null },
          from: 1,
        },
        {
          expect: [
            {
              plugin: "http",
              status: 401,
              json: { error: { message: "session expired" } },
            },
            { plugin: "log" },
          ],
        },
      ],
      opts(),
    );
  });

  it("cache HIT: answered from Redis, Postgres is never asked", () => {
    const { effects } = scenario(
      app,
      [
        ...getTodos(),
        {
          expect: [
            { plugin: "redis", args: ["EXPIRE", "sess:tok123", 3600] }, // sliding session
            { type: "req.merge", value: { user: { id: 7 } } },
            { type: "req.set", value: "cache" },
            { plugin: "redis", args: ["GET", "cache:todos:7"] },
          ],
          reply: { payload: JSON.stringify([{ id: 1, title: "cached" }]) },
          from: 3,
        },
        {
          expect: [
            {
              plugin: "http",
              status: 200,
              headers: { "x-cache": "hit" },
              json: { todos: [{ id: 1, title: "cached" }] },
            },
            { plugin: "log" },
          ],
        },
      ],
      opts(),
    );
    expect(effects.some((e) => e.plugin === "pg")).toBe(false);
  });

  it("cache MISS: read-through. Postgres, then fill the cache while answering", () => {
    const rows = [{ id: 2, title: "from pg", done: false, position: 1 }];
    scenario(
      app,
      [
        ...getTodos(),
        {
          expect: [
            { plugin: "redis", args: ["EXPIRE", "sess:tok123", 3600] },
            { type: "req.merge" },
            { type: "req.set" },
            { plugin: "redis", args: ["GET", "cache:todos:7"] },
          ],
          reply: { payload: null },
          from: 3,
        },
        {
          expect: [
            { type: "req.set", value: "load" },
            {
              plugin: "pg",
              sql: /from todos where user_id = \$1/,
              params: [7],
            },
          ],
          reply: { payload: { rows } },
          from: 1,
        },
        {
          expect: [
            {
              plugin: "redis",
              args: ["SET", "cache:todos:7", JSON.stringify(rows), "EX", 30],
            },
            {
              plugin: "http",
              status: 200,
              headers: { "x-cache": "miss" },
              json: { todos: rows },
            },
            { plugin: "log" },
          ],
        },
      ],
      opts(),
    );
  });

  it("a broken cache degrades to Postgres instead of failing the read", () => {
    scenario(
      app,
      [
        ...getTodos(),
        {
          expect: [
            { plugin: "redis" },
            { type: "req.merge" },
            { type: "req.set" },
            { plugin: "redis", args: ["GET", "cache:todos:7"] },
          ],
          error: { code: "TIMEOUT", message: "slow" },
          from: 3,
        },
        {
          expect: [
            { plugin: "log", level: "warn" },
            { type: "req.set", value: "load" },
            { plugin: "pg" },
          ],
        },
      ],
      opts(),
    );
  });

  it("a write invalidates the cache and publishes the change in one pipeline", () => {
    const todo = { id: 3, title: "new", done: false, position: 4 };
    scenario(
      app,
      [
        {
          send: httpReq("POST", "/todos", {
            headers: authed,
            body: { title: "  new  " },
          }),
        },
        ...passRateLimit,
        {
          expect: [
            { type: "req.set" },
            { plugin: "redis", args: ["GET", "sess:tok123"] },
          ],
          reply: { payload: alice },
          from: 1,
        },
        {
          expect: [
            { plugin: "redis" },
            { type: "req.merge" },
            { type: "req.set" },
            { plugin: "pg", sql: /insert into todos/, params: [7, "new", 7] },
          ],
          reply: { payload: { rows: [todo] } },
          from: 3,
        },
        {
          expect: [
            { type: "req.merge", value: { step: "sync" } },
            {
              plugin: "redis",
              type: "pipeline",
              cmds: [
                ["DEL", "cache:todos:7"],
                [
                  "PUBLISH",
                  "todos:7",
                  JSON.stringify({ type: "todo.created", todo }),
                ],
              ],
            },
          ],
          reply: { payload: { results: [] } },
          from: 1,
        },
        {
          expect: [
            { plugin: "http", status: 201, json: { todo } },
            { plugin: "log" },
          ],
        },
      ],
      opts(),
    );
  });
});

describe("reorder: a transaction", () => {
  /** Up to the point where the transaction is open and the rows are locked. */
  const begin = (ids: number[]): Step[] => [
    {
      send: httpReq("POST", "/todos/reorder", {
        headers: authed,
        body: { ids },
      }),
    },
    ...passRateLimit,
    {
      expect: [
        { type: "req.set" },
        { plugin: "redis", args: ["GET", "sess:tok123"] },
      ],
      reply: { payload: alice },
      from: 1,
    },
    {
      expect: [
        { plugin: "redis" },
        { type: "req.merge" },
        { type: "req.merge" },
        { plugin: "pg", type: "tx.begin" },
      ],
      reply: { payload: { tx: "tx1" } },
      from: 3,
    },
    {
      expect: [
        { type: "req.merge", value: { step: "lock", tx: "tx1" } },
        {
          plugin: "pg",
          type: "query",
          tx: "tx1",
          sql: /for update/,
          params: [7, ids],
        },
      ],
      from: 1,
    },
  ];

  it("happy path: begin, lock, renumber, COMMIT, then invalidate + publish + 200", () => {
    scenario(
      app,
      [
        ...begin([3, 1, 2]),
        {
          expect: [{ type: "req.merge" }, { plugin: "pg", type: "query" }],
          exact: false,
          reply: { payload: { rows: [{ id: 3 }, { id: 1 }, { id: 2 }] } },
          from: 1,
        },
        {
          expect: [
            { type: "req.set", value: "renumber" },
            {
              plugin: "pg",
              type: "query",
              tx: "tx1",
              sql: /set position = o.ord/,
            },
          ],
          reply: { payload: { rows: [] } },
          from: 1,
        },
        {
          expect: [
            { type: "req.set", value: "commit" },
            { plugin: "pg", type: "tx.commit", tx: "tx1" },
          ],
          reply: { payload: { tx: "tx1" } },
          from: 1,
        },
        {
          expect: [
            { type: "req.merge", value: { step: "sync" } },
            { plugin: "redis", type: "pipeline" },
          ],
          reply: { payload: { results: [] } },
          from: 1,
        },
        {
          expect: [
            { plugin: "http", status: 200, json: { ids: [3, 1, 2] } },
            { plugin: "log" },
          ],
        },
      ],
      opts(),
    );
  });

  it("ids that are not all mine: ROLLBACK, then 404 (never renumbered, never committed)", () => {
    const { effects } = scenario(
      app,
      [
        ...begin([3, 1, 99]),
        // the lock found only 2 of the 3 rows
        {
          expect: [{ type: "req.merge" }, { plugin: "pg" }],
          exact: false,
          reply: { payload: { rows: [{ id: 3 }, { id: 1 }] } },
          from: 1,
        },
        {
          expect: [
            {
              type: "req.merge",
              value: { step: "rollback", pending: { status: 404 } },
            },
            { plugin: "pg", type: "tx.rollback", tx: "tx1" },
          ],
          reply: { payload: { tx: "tx1" } },
          from: 1,
        },
        {
          expect: [
            {
              plugin: "http",
              status: 404,
              json: { error: { code: "unknown_todo" } },
            },
            { plugin: "log" },
          ],
        },
      ],
      opts(),
    );
    expect(effects.some((e) => e.type === "tx.commit")).toBe(false);
  });

  it("an error in the middle (serialization failure): ROLLBACK, then 409 try again", () => {
    scenario(
      app,
      [
        ...begin([2, 1]),
        {
          expect: [{ type: "req.merge" }, { plugin: "pg" }],
          exact: false,
          reply: { payload: { rows: [{ id: 2 }, { id: 1 }] } },
          from: 1,
        },
        {
          expect: [
            { type: "req.set", value: "renumber" },
            { plugin: "pg", type: "query", tx: "tx1" },
          ],
          error: { code: "40001", message: "could not serialize access" },
          from: 1,
        },
        {
          expect: [
            { plugin: "log", level: "error", msg: "reorder failed" },
            {
              type: "req.merge",
              value: { step: "rollback", pending: { status: 409 } },
            },
            { plugin: "pg", type: "tx.rollback", tx: "tx1" },
          ],
          reply: { payload: { tx: "tx1" } },
          from: 2,
        },
        {
          expect: [
            {
              plugin: "http",
              status: 409,
              json: { error: { code: "conflict" } },
            },
            { plugin: "log" },
          ],
        },
      ],
      opts(),
    );
  });

  it("a late error after the rollback began is ignored (no second answer)", () => {
    const f = flow(app, opts());
    f.send(
      httpReq("POST", "/todos/reorder", {
        headers: authed,
        body: { ids: [1] },
      }),
    );
    // drive the slice by hand to the 'rollback' step
    f.state.requests.r1!.step = "rollback";
    const out = f.send({
      id: "todos.reorder.failed",
      ctx,
      payload: { code: "X", message: "late" },
    });
    expect(out).toEqual([]);
  });
});

describe("health", () => {
  it("readyz is 503 until boot finished, and 503 while draining", () => {
    for (const shared of [{}, { ready: true, draining: true }]) {
      const { effects } = scenario(app, [{ send: httpReq("GET", "/readyz") }], {
        routes: routeTable,
        state: { config: defaultConfig, shared } as Partial<AppState>,
      });
      expect(effects[1]).toMatchObject({ plugin: "http", status: 503 });
    }
  });
  it("readyz joins two parallel checks", () => {
    scenario(
      app,
      [
        { send: httpReq("GET", "/readyz") },
        {
          expect: [
            { type: "req.merge" },
            { type: "req.merge" },
            { plugin: "pg", sql: "select 1 as ok" },
            { plugin: "redis", args: ["PING"] },
          ],
          reply: { payload: { rows: [{ ok: 1 }] } },
          from: 2,
        },
        { expect: [{ type: "req.set", path: ["checks", "pg"] }] },
        {
          send: {
            id: "health.redisFailed",
            ctx,
            payload: { code: "CONNECTION", message: "down" },
          },
        },
        {
          expect: [
            { type: "req.set", value: "done" },
            {
              plugin: "http",
              status: 503,
              json: { status: "degraded", checks: { pg: true, redis: false } },
            },
            { plugin: "log" },
          ],
        },
      ],
      opts(),
    );
  });
});

describe("lifecycle", () => {
  it("a request deadline is answered 504 by the app", () => {
    scenario(
      app,
      [
        { send: { id: "request.timeout", ctx } },
        {
          expect: [
            { plugin: "log", level: "warn" },
            {
              plugin: "http",
              status: 504,
              json: { error: { code: "timeout" } },
            },
            { plugin: "log" },
          ],
        },
      ],
      opts(),
    );
  });
  it("a plugin error without onError becomes a logged 500", () => {
    scenario(
      app,
      [
        {
          send: {
            id: "redis.error",
            ctx,
            payload: { code: "ERR", message: "x" },
          },
        },
        {
          expect: [
            { plugin: "log", level: "error" },
            { plugin: "http", status: 500 },
            { plugin: "log" },
          ],
        },
      ],
      opts(),
    );
  });
  it("drain flips readiness and ends every open event stream", () => {
    const sseCtx = { rid: "s1", conn: "http" };
    const { effects } = scenario(
      app,
      [{ send: { id: "app.drain", ctx: { rid: "d", conn: "job" } } }],
      {
        state: {
          config: defaultConfig,
          shared: { ready: true, sse: { s1: sseCtx } },
        } as Partial<AppState>,
      },
    );
    expect(effects).toContainEqual(
      expect.objectContaining({ plugin: "http", type: "sse.end", ctx: sseCtx }),
    );
    expect(effects).toContainEqual(
      expect.objectContaining({
        type: "shared.set",
        path: "draining",
        value: true,
      }),
    );
  });
});
