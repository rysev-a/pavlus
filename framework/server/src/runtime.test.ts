import type { Effect, Message, Plugin } from "@pavlus/core";
import { describe, expect, it } from "vitest";
import { createTraceBuffer, reply, traceOf } from "./ctx.ts";
import { requestsEffector as rq } from "./plugins/requests/mod.ts";
import { createServerApp, type ServerPlugin } from "./runtime.ts";
import { fakeHttp } from "./testing/fakes.ts";

/** A pg-like plugin whose replies the test releases by hand. */
function slowPlugin(name = "pg") {
  const pending: { effect: Effect; ctx: any }[] = [];
  const cancelled: string[] = [];
  let dispatch!: (m: Message) => void;
  const p: ServerPlugin & {
    pending: typeof pending;
    cancelled: string[];
    release(i?: number, payload?: unknown): void;
    disposed: number;
    stopped: number;
  } = {
    name,
    pending,
    cancelled,
    disposed: 0,
    stopped: 0,
    init(c) {
      dispatch = c.dispatch;
    },
    handle(effect, c) {
      dispatch = c.dispatch;
      pending.push({ effect, ctx: c });
    },
    cancel(rid) {
      cancelled.push(rid);
    },
    release(i = 0, payload: unknown = { rows: [] }) {
      const { effect } = pending.splice(i, 1)[0]!;
      dispatch(reply(effect, { id: effect.replyTo as string, payload }));
    },
    dispose() {
      p.disposed++;
    },
    stop() {
      p.stopped++;
    },
  };
  return p;
}

const query = (replyTo: string): Effect => ({
  plugin: "pg",
  type: "query",
  sql: "select 1",
  replyTo,
  onError: "q.err",
});
const errs: unknown[] = [];
const quiet = (e: unknown) => void errs.push(e);

describe("ctx stamping and flow", () => {
  it("the reply arrives with the same rid", async () => {
    const http = fakeHttp();
    const pg = slowPlugin();
    const seen: Message[] = [];
    const app = createServerApp({
      plugins: [http, pg],
      onError: quiet,
      app: (m: Message) => {
        seen.push(m);
        if (m.id === "http.request") return [query("q.done")];
        if (m.id === "q.done")
          return [
            {
              plugin: "http",
              type: "respond",
              json: { rid: m.ctx!.rid, n: (m.payload as any).rows.length },
            },
          ];
        return [];
      },
    });
    const a = http.inject({ path: "/a" });
    const b = http.inject({ path: "/b" });
    expect(pg.pending).toHaveLength(2);
    // answer out of order: each answer still reaches its own request
    pg.release(1, { rows: [1, 2] });
    pg.release(0, { rows: [1] });
    const [ra, rb] = await Promise.all([a.done, b.done]);
    expect(ra.json).toEqual({ rid: a.rid, n: 1 });
    expect(rb.json).toEqual({ rid: b.rid, n: 2 });
    await Promise.resolve();
    await app.shutdown();
  });
  it("keeps state per request: the slice exists while the request lives", async () => {
    const http = fakeHttp();
    const states: unknown[] = [];
    const app = createServerApp({
      plugins: [http],
      onError: quiet,
      app: (m: Message, s: any) => {
        states.push(structuredClone(s.requests));
        if (m.id === "http.request")
          return [
            rq.set("step", 1),
            { plugin: "http", type: "respond", text: "ok" },
          ];
        return [];
      },
    });
    const r = http.inject();
    await r.done;
    await new Promise((r2) => setTimeout(r2, 5));
    expect(states[0]).toEqual({ [r.rid]: {} });
    expect(app.getState().requests).toEqual({});
    expect(app.stats().active).toBe(0);
    await app.shutdown();
  });
});

describe("cancellation", () => {
  const setup = (
    opts: Parameters<typeof createServerApp>[0] extends infer O
      ? Partial<O>
      : never = {},
  ) => {
    const http = fakeHttp({ deadlineMs: null });
    const pg = slowPlugin();
    const app = createServerApp({
      plugins: [http, pg],
      onError: quiet,
      app: (m: Message) => (m.id === "http.request" ? [query("q.done")] : []),
      ...opts,
    } as never);
    return { http, pg, app };
  };
  it("http.aborted cancels the plugins that hold work for the rid", async () => {
    const { http, pg, app } = setup();
    const r = http.inject();
    r.abort();
    await new Promise((r2) => setTimeout(r2, 5));
    expect(pg.cancelled).toEqual([r.rid]);
    expect(app.stats()).toMatchObject({ active: 0, timers: 0, cancels: 2 });
    // the late reply is discarded and counted
    pg.release(0);
    expect(app.stats().discarded).toBe(1);
    await app.shutdown();
  });
  it("request.done cancels and drops the slice", async () => {
    const { http, pg, app } = setup();
    const r = http.inject();
    app.dispatch({ id: "request.done", ctx: { rid: r.rid, conn: "http" } });
    await new Promise((r2) => setTimeout(r2, 5));
    expect(pg.cancelled).toEqual([r.rid]);
    expect(app.getState().requests).toEqual({});
    await app.shutdown();
  });
  it("ws.close cancels every rid of the connection", async () => {
    const pg = slowPlugin();
    const sink: ServerPlugin = { name: "ws", handle() {} };
    const app = createServerApp({
      plugins: [pg, sink],
      onError: quiet,
      app: (m: Message) => (m.id === "ws.message" ? [query("q.done")] : []),
    });
    const mk = (rid: string) => ({ rid, conn: "ws", connId: "c1" });
    app.dispatch({ id: "ws.message", ctx: mk("f1") });
    app.dispatch({ id: "ws.message", ctx: mk("f2") });
    expect(app.activeRids().sort()).toEqual(["f1", "f2"]);
    app.dispatch({ id: "ws.close", payload: { code: 1006 }, ctx: mk("c") });
    await new Promise((r2) => setTimeout(r2, 5));
    expect(pg.cancelled.sort()).toEqual(["f1", "f2"]);
    expect(app.activeRids()).toEqual([]);
    await app.shutdown();
  });
  it("the deadline dispatches request.timeout with the ctx and answers 504", async () => {
    const { http, pg, app } = setup({ limits: { requestTimeoutMs: 20 } });
    const r = http.inject();
    const res = await r.done;
    expect(res.status).toBe(504);
    await new Promise((r2) => setTimeout(r2, 5));
    expect(pg.cancelled).toEqual([r.rid]);
    expect(app.stats()).toMatchObject({ timeouts: 1, active: 0, timers: 0 });
    expect(traceOf(r.rid).map((e) => e.name)).toContain("request.timeout");
    await app.shutdown();
  });
  it("ctx.deadline wins and the app can handle request.timeout itself", async () => {
    const http = fakeHttp({ deadlineMs: 15 });
    const seen: Message[] = [];
    const app = createServerApp({
      plugins: [http],
      onError: quiet,
      app: (m: Message) => {
        seen.push(m);
        if (m.id === "request.timeout")
          return [
            { plugin: "http", type: "respond", status: 503, text: "slow" },
          ];
        return [];
      },
    });
    const res = await http.request();
    expect(res.status).toBe(503);
    expect(seen.find((m) => m.id === "request.timeout")!.ctx).toMatchObject({
      conn: "http",
    });
    await app.shutdown();
  });
  it("streams are long-lived: no deadline", async () => {
    const http = fakeHttp();
    const app = createServerApp({
      plugins: [http],
      onError: quiet,
      limits: { requestTimeoutMs: 15 },
      app: (m: Message) =>
        m.id === "http.request" ? [{ plugin: "http", type: "sse.start" }] : [],
    });
    const r = http.inject();
    await new Promise((r2) => setTimeout(r2, 40));
    expect(app.activeRids()).toEqual([r.rid]);
    expect(app.stats().timers).toBe(0);
    r.abort();
    await new Promise((r2) => setTimeout(r2, 5));
    expect(app.activeRids()).toEqual([]);
    await app.shutdown();
  });
});

describe("discarding", () => {
  it("drops and counts messages of finished rids, but not request.done", async () => {
    const http = fakeHttp();
    const handled: string[] = [];
    const app = createServerApp({
      plugins: [http],
      onError: quiet,
      app: (m: Message) => {
        handled.push(m.id);
        return m.id === "http.request"
          ? [{ plugin: "http", type: "respond", text: "x" }]
          : [];
      },
    });
    const r = http.inject();
    await r.done;
    await new Promise((r2) => setTimeout(r2, 5));
    app.dispatch({ id: "late", ctx: { rid: r.rid, conn: "http" } });
    app.dispatch({ id: "request.done", ctx: { rid: r.rid, conn: "http" } });
    expect(handled).toEqual(["http.request", "request.done"]);
    expect(app.stats().discarded).toBe(1);
    await app.shutdown();
  });
});

describe("error isolation", () => {
  it("a throwing handler yields request.error with ctx and a 500", async () => {
    const http = fakeHttp();
    const errors: unknown[] = [];
    const seen: Message[] = [];
    const app = createServerApp({
      plugins: [http],
      onError: (e) => errors.push(e),
      app: (m: Message) => {
        seen.push(m);
        if (m.id === "http.request") throw new Error("handler boom");
        return [];
      },
    });
    const res = await http.request();
    expect(res.status).toBe(500);
    expect(res.json).toEqual({ error: "internal_error" });
    const err = seen.find((m) => m.id === "request.error")!;
    expect(err.ctx).toMatchObject({ conn: "http" });
    expect(err.payload).toMatchObject({
      message: "handler boom",
      source: "app",
    });
    expect(errors).toHaveLength(1);
    // the process (and the app) still works
    const ok = createServerApp({
      plugins: [fakeHttp()],
      app: () => [],
      onError: quiet,
    });
    await ok.shutdown();
    await app.shutdown();
  });
  it("the app can answer request.error itself", async () => {
    const http = fakeHttp();
    const app = createServerApp({
      plugins: [http],
      onError: quiet,
      app: (m: Message) => {
        if (m.id === "http.request") throw new Error("x");
        if (m.id === "request.error")
          return [
            { plugin: "http", type: "respond", status: 418, text: "custom" },
          ];
        return [];
      },
    });
    expect((await http.request()).status).toBe(418);
    await app.shutdown();
  });
  it("a handler that also throws on request.error still gets the default answer", async () => {
    const http = fakeHttp();
    const app = createServerApp({
      plugins: [http],
      onError: quiet,
      app: () => {
        throw new Error("always");
      },
    });
    expect((await http.request()).status).toBe(500);
    await app.shutdown();
  });
  it("defaultResponder: false disables the 500", async () => {
    const http = fakeHttp({ deadlineMs: 20 });
    const app = createServerApp({
      plugins: [http],
      onError: quiet,
      defaultResponder: false,
      app: () => {
        throw new Error("x");
      },
    });
    const r = http.inject();
    await new Promise((r2) => setTimeout(r2, 40));
    expect(http.pending()).toEqual([r.rid]);
    await app.shutdown();
  });
  it("a throwing plugin turns into request.error, or onError of the effect", async () => {
    const http = fakeHttp();
    const bad: Plugin<any, any> = {
      name: "bad",
      handle() {
        throw new Error("plugin boom");
      },
    };
    const seen: Message[] = [];
    const app = createServerApp({
      plugins: [http, bad],
      onError: quiet,
      app: (m: Message) => {
        seen.push(m);
        if (m.id === "http.request")
          return [{ plugin: "bad", type: "x", onError: "bad.err" }];
        if (m.id === "bad.err")
          return [
            { plugin: "http", type: "respond", status: 502, json: m.payload },
          ];
        return [];
      },
    });
    const res = await http.request();
    expect(res.status).toBe(502);
    expect(res.json).toMatchObject({ message: "plugin boom" });
    await app.shutdown();

    const http2 = fakeHttp();
    const app2 = createServerApp({
      plugins: [http2, bad],
      onError: quiet,
      app: (m: Message) =>
        m.id === "http.request" ? [{ plugin: "bad", type: "x" }] : [],
    });
    expect((await http2.request()).status).toBe(500);
    await app2.shutdown();
  });
  it("an effect for an unknown plugin does not break the loop", async () => {
    const http = fakeHttp();
    const app = createServerApp({
      plugins: [http],
      onError: quiet,
      app: (m: Message) =>
        m.id === "http.request" ? [{ plugin: "nope", type: "x" }] : [],
    });
    expect((await http.request()).status).toBe(500);
    await app.shutdown();
  });
});

describe("message budget", () => {
  it("cuts off a looping rid with request.error", async () => {
    const http = fakeHttp();
    const errors: Message[] = [];
    const app = createServerApp({
      plugins: [http],
      onError: quiet,
      limits: { maxMessagesPerRid: 50 },
      app: (m: Message) => {
        if (m.id === "request.error") {
          errors.push(m);
          return [];
        }
        return [
          { plugin: "requests", type: "dispatch", message: { id: "loop" } },
        ];
      },
    });
    const res = await http.request();
    expect(res.status).toBe(500);
    expect(errors).toHaveLength(1);
    expect((errors[0]!.payload as any).code).toBe("message_budget");
    expect(app.stats().budgetExceeded).toBe(1);
    await new Promise((r) => setTimeout(r, 5));
    expect(app.stats().active).toBe(0);
    await app.shutdown();
  });
});

describe("auto settle (non-http rids)", () => {
  it("finishes when nothing is awaited, waits for replies otherwise", async () => {
    const pg = slowPlugin();
    const ws: ServerPlugin = { name: "ws", handle() {} };
    const app = createServerApp({
      plugins: [pg, ws],
      onError: quiet,
      app: (m: Message) => {
        if (m.id === "ws.message") return [query("q.done")];
        if (m.id === "q.done")
          return [{ plugin: "ws", type: "send", data: "hi" }];
        return [];
      },
    });
    const ctx = { rid: "f1", conn: "ws", connId: "c" };
    app.dispatch({ id: "ws.message", ctx });
    await Promise.resolve();
    expect(app.activeRids()).toEqual(["f1"]);
    pg.release();
    await new Promise((r) => setTimeout(r, 5));
    expect(app.activeRids()).toEqual([]);
    expect(pg.cancelled).toEqual(["f1"]);
    app.dispatch({
      id: "ws.open",
      ctx: { rid: "f2", conn: "ws", connId: "c" },
    });
    await new Promise((r) => setTimeout(r, 5));
    expect(app.activeRids()).toEqual([]);
    await app.shutdown();
  });
});

describe("shutdown", () => {
  it("stops plugins, drains in-flight work, disposes in reverse", async () => {
    const order: string[] = [];
    const mkp = (name: string): ServerPlugin => ({
      name,
      handle() {},
      stop: () => void order.push(`stop:${name}`),
      dispose: () => void order.push(`dispose:${name}`),
    });
    const http = fakeHttp();
    const app = createServerApp({
      plugins: [mkp("a"), mkp("b"), http],
      onError: quiet,
      app: (m: Message) =>
        m.id === "go" ? [] : m.id === "http.request" ? [] : [],
    });
    const r = http.inject();
    let done = false;
    const p = app.shutdown({ timeoutMs: 2000 }).then(() => (done = true));
    await new Promise((r2) => setTimeout(r2, 10));
    expect(app.closing).toBe(true);
    expect(done).toBe(false); // still waiting for the open request
    app.dispatch({ id: "request.done", ctx: { rid: r.rid, conn: "http" } });
    await p;
    expect(order.filter((x) => x.startsWith("stop:"))).toEqual([
      "stop:b",
      "stop:a",
    ]);
    expect(order.filter((x) => x.startsWith("dispose:"))).toEqual([
      "dispose:b",
      "dispose:a",
    ]);
    expect(app.stats()).toMatchObject({ active: 0, timers: 0, forced: 0 });
  });
  it("forces what is still in flight after the timeout", async () => {
    const http = fakeHttp();
    const pg = slowPlugin();
    const app = createServerApp({
      plugins: [http, pg],
      onError: quiet,
      app: (m: Message) => (m.id === "http.request" ? [query("q")] : []),
    });
    const r = http.inject();
    const t0 = Date.now();
    await app.shutdown({ timeoutMs: 30 });
    expect(Date.now() - t0).toBeGreaterThanOrEqual(25);
    expect(pg.cancelled).toEqual([r.rid]);
    expect(pg.disposed).toBe(1);
    expect(app.stats()).toMatchObject({ forced: 1, active: 0, timers: 0 });
    // idempotent
    await app.shutdown();
  });
  it("is immediate when idle", async () => {
    const app = createServerApp({ plugins: [], app: () => [], onError: quiet });
    const t0 = Date.now();
    await app.shutdown();
    expect(Date.now() - t0).toBeLessThan(100);
  });
});

describe("tracing and hooks", () => {
  it("records messages and effect types in order in a private buffer", async () => {
    const http = fakeHttp();
    const trace = createTraceBuffer();
    const steps: string[] = [];
    const app = createServerApp({
      plugins: [http],
      trace,
      onError: quiet,
      onStep: (m, effects) => steps.push(`${m.id}>${effects.length}`),
      app: (m: Message) =>
        m.id === "http.request"
          ? [{ plugin: "http", type: "respond", text: "x" }]
          : [],
    });
    const r = http.inject();
    await r.done;
    await new Promise((r2) => setTimeout(r2, 5));
    expect(trace.get(r.rid).map((e) => e.name)).toEqual([
      "http.request",
      "http.respond",
      "request.done",
      "finished:request.done",
    ]);
    expect(steps[0]).toBe("http.request>1");
    await app.shutdown();
  });
  it("routes http.request through the table", async () => {
    const http = fakeHttp();
    const app = createServerApp({
      plugins: [http],
      onError: quiet,
      routes: { "GET /hello/:name": "hello" },
      app: (m: Message) =>
        m.id === "hello"
          ? [
              {
                plugin: "http",
                type: "respond",
                json: (m.payload as any).params,
              },
            ]
          : [],
    });
    expect((await http.request({ path: "/hello/ann" })).json).toEqual({
      name: "ann",
    });
    expect((await http.request({ path: "/nope" })).status).toBe(404);
    await app.shutdown();
  });
});
