import { describe, expect, it } from "vitest";
import type { Effect, Message } from "@service-laboratory/pavlus";
import { createServerApp } from "../runtime.ts";
import { reply } from "../ctx.ts";
import { requestsEffector as rq } from "../plugins/requests/mod.ts";
import { createHttpServerPlugin } from "../plugins/http/mod.ts";
import { createWsServerPlugin } from "../plugins/ws/mod.ts";
import {
  fakeHttp,
  fakeWs,
  flow,
  matches,
  request,
  scenario,
  connectWs,
} from "./mod.ts";

const respond = (e: Record<string, unknown>): Effect => ({
  plugin: "http",
  type: "respond",
  ...e,
});

// a small business flow: GET /users/:id -> redis cache -> postgres -> respond
const app = (m: Message, state: any): Effect[] => {
  const rid = m.ctx?.rid as string;
  switch (m.id) {
    case "http.request": {
      const { params } = m.payload as any;
      return [
        rq.set("userId", params.id),
        {
          plugin: "redis",
          type: "cmd",
          args: ["GET", `user:${params.id}`],
          replyTo: "cache",
          onError: "fail",
        },
      ];
    }
    case "cache":
      return m.payload
        ? [
            respond({
              json: JSON.parse(m.payload as string),
              headers: { "x-cache": "hit" },
            }),
          ]
        : [
            {
              plugin: "pg",
              type: "query",
              sql: "select * from users where id=$1",
              params: [state.requests[rid].userId],
              replyTo: "row",
              onError: "fail",
            },
          ];
    case "row": {
      const { rows } = m.payload as any;
      return rows.length
        ? [respond({ json: rows[0] })]
        : [respond({ status: 404, json: { error: "no user" } })];
    }
    case "fail":
      return [respond({ status: 502, json: m.payload })];
  }
  return [];
};
const ctx = { rid: "r1", conn: "http" };
const req = (id: string): Message => ({
  id: "http.request",
  payload: { method: "GET", path: `/users/${id}`, params: { id } },
  ctx,
});

describe("flow", () => {
  it("stamps ctx on effects and applies requests effects to the state", () => {
    const f = flow(app);
    const effects = f.send(req("7"));
    expect(effects.map((e) => e.ctx)).toEqual([ctx, ctx]);
    expect(f.state.requests.r1).toEqual({ userId: "7" });
    const next = f.send(reply(effects[1]!, { id: "cache", payload: null }));
    expect(next[0]).toMatchObject({ plugin: "pg", params: ["7"], ctx });
    expect(f.log).toHaveLength(2);
  });
  it("starts from given state and can route", () => {
    const f = flow(
      (m, s: any) => (m.id === "hello" ? [respond({ json: s.shared })] : []),
      {
        state: { shared: { a: 1 } },
        routes: { "GET /hi": "hello" },
      },
    );
    expect(
      f.send({
        id: "http.request",
        payload: { method: "GET", path: "/hi" },
        ctx,
      })[0],
    ).toMatchObject({ json: { a: 1 } });
    expect(
      f.send({
        id: "http.request",
        payload: { method: "GET", path: "/zz" },
        ctx,
      })[0],
    ).toMatchObject({ status: 404 });
  });
});

describe("scenario", () => {
  it("plays http -> redis -> pg -> respond with scripted replies", () => {
    const result = scenario(app, [
      { send: req("7") },
      {
        expect: [
          { type: "req.set" },
          { plugin: "redis", args: ["GET", "user:7"] },
        ],
        reply: { payload: null },
        from: 1,
      },
      {
        expect: [{ plugin: "pg", sql: /from users/, params: ["7"] }],
        reply: { payload: { rows: [{ id: 7, name: "ann" }] } },
      },
      {
        expect: [
          {
            plugin: "http",
            type: "respond",
            json: { name: "ann" },
            ctx: { rid: "r1" },
          },
        ],
      },
      { state: { requests: { r1: { userId: "7" } } } },
    ]);
    expect(result.effects[0]).toMatchObject({
      plugin: "http",
      type: "respond",
    });
  });
  it("cache hit short-circuits; errors go to onError", () => {
    scenario(app, [
      { send: req("1") },
      {
        expect: [{}, { plugin: "redis" }],
        from: 1,
        reply: { payload: '{"id":1}' },
      },
      { expect: [{ headers: { "x-cache": "hit" }, json: { id: 1 } }] },
    ]);
    scenario(app, [
      { send: req("1") },
      {
        expect: [{}, { plugin: "redis" }],
        from: 1,
        error: { code: "ECONNREFUSED", message: "down" },
      },
      { expect: [{ status: 502, json: { code: "ECONNREFUSED" } }] },
    ]);
  });
  it("non-exact expectations match a subsequence", () => {
    scenario(app, [
      { send: req("1") },
      { expect: [{ plugin: "redis" }], exact: false },
    ]);
  });
  it("fails loudly with the step and the effects", () => {
    expect(() =>
      scenario(app, [{ send: req("1") }, { expect: [{ plugin: "pg" }] }]),
    ).toThrow(/step 2.*expected 1 effect/s);
    expect(() =>
      scenario(app, [{ send: req("1") }, { expect: [{}, { plugin: "pg" }] }]),
    ).toThrow(/effect\[1\]\.plugin/);
    expect(() =>
      scenario(app, [
        { send: req("1") },
        { expect: [{}, {}], reply: { id: "x" }, from: 0 },
        { state: { requests: { r1: { userId: "nope" } } } },
      ]),
    ).toThrow(/state/);
    expect(() =>
      scenario(app, [
        { send: req("1") },
        { expect: [{}, {}], from: 0, error: "x" },
      ]),
    ).toThrow(/has no onError/);
  });
  it("matchers: regexp, predicate, partial, arrays", () => {
    expect(
      matches(
        { a: "hello", b: [1, 2], c: 1 },
        { a: /ell/, b: [1, (x: number) => x > 1] },
      ),
    ).toBe(true);
    expect(matches({ a: 1 }, { a: 2 })).toBe(false);
    expect(matches({ a: [1] }, { a: [1, 2] })).toBe(false);
    expect(matches("x", { a: 1 })).toBe(false);
  });
});

describe("fakeHttp", () => {
  it("serves requests through the real runtime, no sockets", async () => {
    const http = fakeHttp({ etag: true });
    const server = createServerApp({
      plugins: [http],
      onError: () => {},
      routes: { "GET /items/:id": "item", "POST /items": "create" },
      app: (m) => {
        if (m.id === "item")
          return [
            respond({
              json: {
                id: (m.payload as any).params.id,
                q: (m.payload as any).query.q,
              },
              cookies: { s: "1" },
            }),
          ];
        if (m.id === "create")
          return [respond({ status: 201, json: (m.payload as any).body })];
        return [];
      },
    });
    const r = await http.request({ path: "/items/9?q=x" });
    expect(r).toMatchObject({ status: 200, json: { id: "9", q: "x" } });
    expect(r.headers["set-cookie"]).toHaveLength(1);
    expect(r.headers.etag).toBeTruthy();
    expect(
      (
        await http.request({
          path: "/items/9?q=x",
          headers: { "If-None-Match": String(r.headers.etag) },
        })
      ).status,
    ).toBe(304);
    expect(
      await http.request({ method: "POST", path: "/items", body: { n: 1 } }),
    ).toMatchObject({ status: 201, json: { n: 1 } });
    expect((await http.request({ path: "/nope" })).status).toBe(404);
    expect((await http.request({ method: "PUT", path: "/items" })).status).toBe(
      405,
    );
    await server.shutdown();
  });
  it("aborts, streams and SSE", async () => {
    const http = fakeHttp();
    const seen: string[] = [];
    const server = createServerApp({
      plugins: [http],
      onError: () => {},
      app: (m) => {
        seen.push(m.id);
        if (m.id !== "http.request") return [];
        return (m.payload as any).path === "/sse"
          ? [
              { plugin: "http", type: "sse.start" },
              { plugin: "http", type: "sse.send", event: "e", data: { a: 1 } },
              { plugin: "http", type: "sse.send", data: "x\ny" },
              { plugin: "http", type: "sse.end" },
            ]
          : [];
      },
    });
    const sse = await http.request({ path: "/sse" });
    expect(sse.events).toEqual([
      { event: "e", data: '{"a":1}' },
      { data: "x\ny" },
    ]);
    expect(sse.streamed).toBe(true);
    const r = http.inject({ path: "/hang" });
    r.abort();
    const res = await r.done;
    expect(res.closed).toBe(true);
    await new Promise((x) => setTimeout(x, 5));
    expect(seen).toContain("http.aborted");
    expect(http.pending()).toEqual([]);
    await server.shutdown();
  });
});

describe("fakeWs", () => {
  it("connects, receives, broadcasts to rooms, closes", async () => {
    const wsf = fakeWs();
    const server = createServerApp({
      plugins: [wsf],
      onError: () => {},
      app: (m) => {
        const cid = m.ctx?.connId as string;
        if (m.id === "ws.open")
          return [{ plugin: "ws", type: "join", room: "r" }];
        if (m.id === "ws.message")
          return [
            {
              plugin: "ws",
              type: "broadcast",
              room: "r",
              data: (m.payload as any).data,
              except: cid,
            },
          ];
        return [];
      },
    });
    const a = wsf.connect();
    const b = wsf.connect();
    const c = wsf.connect();
    expect(wsf.members("r")).toHaveLength(3);
    a.send("hello");
    expect((await b.next()).data).toBe("hello");
    expect((await c.next()).data).toBe("hello");
    expect(a.received).toHaveLength(0);
    b.close(1000, "bye");
    expect(wsf.members("r")).toHaveLength(2);
    await server.shutdown();
  });
});

describe("the same handler runs against the fakes and the real plugins", () => {
  const handler = (m: Message): Effect[] => {
    if (m.id === "http.request") {
      const p = m.payload as any;
      return [
        respond({
          status: 200,
          json: { path: p.path, q: p.query, body: p.body, method: p.method },
        }),
      ];
    }
    if (m.id === "ws.message")
      return [
        { plugin: "ws", type: "send", data: `echo:${(m.payload as any).data}` },
      ];
    return [];
  };
  it("http parity", async () => {
    const fake = fakeHttp();
    const a = createServerApp({
      plugins: [fake],
      app: handler,
      onError: () => {},
    });
    const real = createHttpServerPlugin({ port: 0, host: "127.0.0.1" });
    const b = createServerApp({
      plugins: [real],
      app: handler,
      onError: () => {},
    });
    await real.listening();
    const sample = { method: "POST", path: "/p?q=1", body: { a: 1 } };
    const f = await fake.request(sample);
    const r = await request(real, sample);
    expect({
      status: f.status,
      json: f.json,
      ct: f.headers["content-type"],
    }).toEqual({
      status: r.status,
      json: r.json,
      ct: r.headers["content-type"],
    });
    await a.shutdown();
    await b.shutdown();
  });
  it("ws parity", async () => {
    const fake = fakeWs();
    const a = createServerApp({
      plugins: [fake],
      app: handler,
      onError: () => {},
    });
    const http = createHttpServerPlugin({ port: 0, host: "127.0.0.1" });
    const real = createWsServerPlugin({ http, heartbeatMs: 0 });
    const b = createServerApp({
      plugins: [http, real],
      app: handler,
      onError: () => {},
    });
    await http.listening();
    const fc = fake.connect();
    fc.send("x");
    const rc = await connectWs(http);
    rc.sendText("x");
    expect((await fc.next()).data).toBe((await rc.next()).data);
    rc.socket.destroy();
    await a.shutdown();
    await b.shutdown();
  });
});
