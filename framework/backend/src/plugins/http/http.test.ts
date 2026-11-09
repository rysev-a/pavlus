import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { Agent, get as httpGet } from "node:http";
import { connect } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Effect, Message, Plugin } from "@pavlus/core";
import { afterEach, describe, expect, it } from "vitest";
import { reply } from "../../ctx.ts";
import { createServerApp, type ServerPlugin } from "../../runtime.ts";
import { request } from "../../testing/net.ts";
import { clearCookie, parseCookies, serializeCookie } from "./cookies.ts";
import { createHttpServerPlugin, type HttpServerOptions } from "./mod.ts";

/** A plugin that answers after a delay, so replies interleave. */
function delayPlugin() {
  const cancelled: string[] = [];
  let live = 0;
  const timers = new Map<string, NodeJS.Timeout[]>();
  const p: ServerPlugin & { cancelled: string[]; live(): number } = {
    name: "delay",
    cancelled,
    live: () => live,
    handle(effect, ctx) {
      live++;
      const rid = effect.ctx!.rid as string;
      const t = setTimeout(() => {
        live--;
        timers.get(rid)?.splice(0);
        ctx.dispatch(
          reply(effect, {
            id: effect.replyTo as string,
            payload: effect.value,
          }),
        );
      }, effect.ms as number);
      timers.set(rid, [...(timers.get(rid) ?? []), t]);
    },
    cancel(rid) {
      cancelled.push(rid);
      for (const t of timers.get(rid) ?? []) {
        clearTimeout(t);
        live--;
      }
      timers.delete(rid);
    },
    dispose() {
      for (const l of timers.values()) l.forEach(clearTimeout);
    },
  };
  return p;
}

type Handler = (m: Message, state: any) => Effect[];
const respond = (e: Record<string, unknown>): Effect => ({
  plugin: "http",
  type: "respond",
  ...e,
});

const open: { shutdown(): Promise<unknown> }[] = [];
afterEach(async () => {
  await Promise.all(open.splice(0).map((a) => a.shutdown()));
});

async function boot(
  app: Handler,
  httpOpts: HttpServerOptions = {},
  extra: Plugin<any, any>[] = [],
  onMsg?: (m: Message) => void,
) {
  const http = createHttpServerPlugin({
    port: 0,
    host: "127.0.0.1",
    ...httpOpts,
  });
  const server = createServerApp({
    plugins: [http, ...extra],
    onError: () => {},
    app: (m: Message, s: any) => {
      onMsg?.(m);
      return app(m, s);
    },
  });
  open.push(server);
  await http.listening();
  return { http, server };
}

const raw = (
  port: number,
  data: string | Buffer[],
  opts: { end?: boolean } = {},
) =>
  new Promise<string>((resolve) => {
    const s = connect(port, "127.0.0.1");
    let out = "";
    s.on("data", (c) => (out += c));
    s.on("close", () => resolve(out));
    s.on("connect", () => {
      for (const d of Array.isArray(data) ? data : [data]) s.write(d);
      if (opts.end) s.end();
    });
    setTimeout(() => s.destroy(), 3000).unref();
  });

describe("request parsing", () => {
  const echo: Handler = (m) =>
    m.id === "http.request" ? [respond({ json: m.payload })] : [];

  it("gives method, path, query, headers, cookies and ip", async () => {
    const { http } = await boot(echo);
    const r = await request(http, {
      path: "/a/b?x=1&x=2&y=%20z&__proto__=1",
      headers: { cookie: "sid=abc; theme=dark%20blue", "x-test": "1" },
    });
    const p = r.json as any;
    expect(p).toMatchObject({
      method: "GET",
      path: "/a/b",
      query: { x: ["1", "2"], y: " z" },
      cookies: { sid: "abc", theme: "dark blue" },
      params: {},
      ip: "127.0.0.1",
    });
    expect(p.headers["x-test"]).toBe("1");
    expect(Object.keys(p.query)).not.toContain("__proto__");
  });

  it("parses json, urlencoded, text and raw bodies", async () => {
    const { http } = await boot(echo);
    const j = await request(http, { method: "POST", body: { a: [1, 2] } });
    expect((j.json as any).body).toEqual({ a: [1, 2] });
    const u = await request(http, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: "a=1&a=2&b=x+y",
    });
    expect((u.json as any).body).toEqual({ a: ["1", "2"], b: "x y" });
    const t = await request(http, {
      method: "POST",
      headers: { "content-type": "text/plain" },
      body: "héllo",
    });
    expect((t.json as any).body).toBe("héllo");
  });

  it("hands over unknown content types as a Buffer", async () => {
    let got: unknown;
    const { http } = await boot((m) => {
      if (m.id !== "http.request") return [];
      got = (m.payload as any).body;
      return [respond({ status: 204 })];
    });
    await request(http, {
      method: "POST",
      headers: { "content-type": "application/octet-stream" },
      body: Buffer.from([1, 2, 3]),
    });
    expect(Buffer.isBuffer(got)).toBe(true);
    expect([...(got as Buffer)]).toEqual([1, 2, 3]);
  });

  it("answers 400 for invalid json without involving the app", async () => {
    const seen: string[] = [];
    const { http } = await boot(echo, {}, [], (m) => seen.push(m.id));
    const r = await request(http, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{nope",
    });
    expect(r.status).toBe(400);
    expect(r.json).toEqual({ error: "invalid_json" });
    expect(seen).toEqual(["http.listening"]);
  });

  it("trusts X-Forwarded-For only when asked", async () => {
    const h = { "x-forwarded-for": "9.9.9.9, 10.0.0.1" };
    const a = await boot(echo);
    expect(((await request(a.http, { headers: h })).json as any).ip).toBe(
      "127.0.0.1",
    );
    const b = await boot(echo, { trustProxy: true });
    expect(((await request(b.http, { headers: h })).json as any).ip).toBe(
      "10.0.0.1",
    );
    const c = await boot(echo, { trustProxy: 2 });
    expect(((await request(c.http, { headers: h })).json as any).ip).toBe(
      "9.9.9.9",
    );
  });
});

describe("limits", () => {
  it("413 on a declared and on an undeclared (chunked) oversize body", async () => {
    const seen: string[] = [];
    const { http } = await boot(
      () => [respond({ text: "ok" })],
      { limits: { bodyBytes: 100 } },
      [],
      (m) => seen.push(m.id),
    );
    const a = await request(http, { method: "POST", body: "x".repeat(500) });
    expect(a.status).toBe(413);
    const chunked = await raw(
      http.port,
      "POST / HTTP/1.1\r\nHost: x\r\nTransfer-Encoding: chunked\r\nContent-Type: text/plain\r\n\r\n" +
        `${(300).toString(16)}\r\n${"y".repeat(300)}\r\n0\r\n\r\n`,
    );
    expect(chunked).toMatch(/^HTTP\/1.1 413/);
    expect(seen).not.toContain("http.request");
    await new Promise((r) => setTimeout(r, 20));
    expect(http.stats()).toMatchObject({ conns: 0, timers: 0 });
  });

  it("408 when the body is too slow, and no timer is left", async () => {
    const { http } = await boot(() => [respond({ text: "ok" })], {
      limits: { bodyTimeoutMs: 80 },
    });
    const out = await raw(
      http.port,
      "POST / HTTP/1.1\r\nHost: x\r\nContent-Length: 50\r\nContent-Type: text/plain\r\n\r\nonly-a-bit",
    );
    expect(out).toMatch(/^HTTP\/1.1 408/);
    await new Promise((r) => setTimeout(r, 20));
    expect(http.stats()).toMatchObject({ conns: 0, timers: 0 });
  });

  it("431 on an oversize header block", async () => {
    const { http } = await boot(() => [respond({ text: "ok" })], {
      limits: { maxHeaderBytes: 1024 },
    });
    const out = await raw(
      http.port,
      `GET / HTTP/1.1\r\nHost: x\r\nX-Big: ${"a".repeat(4000)}\r\n\r\n`,
    );
    expect(out).toMatch(/^HTTP\/1.1 431/);
  });

  it("slowloris: a client that never finishes its headers is cut", async () => {
    const { http } = await boot(() => [respond({ text: "ok" })], {
      limits: {
        headersTimeoutMs: 100,
        receiveTimeoutMs: 200,
        checkIntervalMs: 30,
      },
    });
    const t0 = Date.now();
    const out = await raw(http.port, "GET / HTTP/1.1\r\nHost: x\r\nX-Slow: a");
    expect(Date.now() - t0).toBeLessThan(2500);
    expect(out === "" || /408/.test(out)).toBe(true);
    await until(() => http.stats().socketsOpen === 0);
  });
});

describe("respond", () => {
  it("json / text / html / redirect / status / headers / cookies", async () => {
    const { http } = await boot((m) => {
      if (m.id !== "http.request") return [];
      switch ((m.payload as any).path) {
        case "/json":
          return [
            respond({ status: 201, json: { a: 1 }, headers: { "x-a": "1" } }),
          ];
        case "/text":
          return [respond({ text: "hi" })];
        case "/html":
          return [respond({ html: "<b>x</b>" })];
        case "/redir":
          return [respond({ redirect: "/json" })];
        case "/redir301":
          return [respond({ redirect: { url: "/json", status: 301 } })];
        case "/empty":
          return [respond({ status: 204 })];
        case "/cookie":
          return [
            { plugin: "http", type: "header", name: "x-pre", value: "1" },
            respond({
              text: "c",
              cookies: {
                sid: "a b",
                pref: {
                  value: "1",
                  maxAge: 60,
                  httpOnly: false,
                  sameSite: "Strict",
                  secure: true, // explicit wins over the request-derived default
                },
              },
            }),
          ];
        case "/inject":
          return [
            respond({
              text: "x",
              headers: { "x-bad": "a\r\nSet-Cookie: pwn=1" },
            }),
          ];
      }
      return [];
    });
    const j = await request(http, { path: "/json" });
    expect(j).toMatchObject({ status: 201, json: { a: 1 } });
    expect(j.headers["content-type"]).toBe("application/json; charset=utf-8");
    expect(j.headers["x-a"]).toBe("1");
    expect(j.headers["x-content-type-options"]).toBe("nosniff");
    expect(
      (await request(http, { path: "/text" })).headers["content-type"],
    ).toMatch(/text\/plain/);
    expect(
      (await request(http, { path: "/html" })).headers["content-type"],
    ).toMatch(/text\/html/);
    const rd = await request(http, { path: "/redir" });
    expect(rd.status).toBe(302);
    expect(rd.headers.location).toBe("/json");
    expect((await request(http, { path: "/redir301" })).status).toBe(301);
    expect((await request(http, { path: "/empty" })).body.length).toBe(0);
    const c = await request(http, { path: "/cookie" });
    expect(c.headers["x-pre"]).toBe("1");
    // plain http: no Secure unless explicit (Safari drops Secure over http,
    // even on localhost)
    expect(c.headers["set-cookie"]).toEqual([
      "sid=a%20b; Path=/; HttpOnly; SameSite=Lax",
      "pref=1; Path=/; Max-Age=60; Secure; SameSite=Strict",
    ]);
    // header injection becomes a 500 (request.error), not a split response
    const bad = await request(http, { path: "/inject" });
    expect(bad.status).toBe(500);
    expect(bad.headers["set-cookie"]).toBeUndefined();
  });

  it("cookie Secure follows the request: https proxies yes, plain http no", async () => {
    const { http } = await boot(
      (m) =>
        m.id === "http.request"
          ? [
              respond({
                text: "c",
                cookies: {
                  sid: "1",
                  forced: { value: "1", secure: true },
                },
              }),
            ]
          : [],
      { trustProxy: true },
    );
    const plain = await request(http, { path: "/" });
    expect(plain.headers["set-cookie"]).toEqual([
      "sid=1; Path=/; HttpOnly; SameSite=Lax",
      "forced=1; Path=/; HttpOnly; Secure; SameSite=Lax",
    ]);
    const proxied = await request(http, {
      path: "/",
      headers: { "x-forwarded-proto": "https" },
    });
    expect(proxied.headers["set-cookie"]).toEqual([
      "sid=1; Path=/; HttpOnly; Secure; SameSite=Lax",
      "forced=1; Path=/; HttpOnly; Secure; SameSite=Lax",
    ]);
    // without trustProxy the header is just a client lie
    const { http: strict } = await boot((m) =>
      m.id === "http.request"
        ? [respond({ text: "c", cookies: { sid: "1" } })]
        : [],
    );
    const lied = await request(strict, {
      path: "/",
      headers: { "x-forwarded-proto": "https" },
    });
    expect(String(lied.headers["set-cookie"])).not.toContain("Secure");
  });

  it("HEAD has headers and no body; ETag gives 304", async () => {
    const { http } = await boot(
      (m) =>
        m.id === "http.request"
          ? [respond({ json: { big: "x".repeat(50) } })]
          : [],
      { etag: true },
    );
    const head = await request(http, { method: "HEAD" });
    expect(head.status).toBe(200);
    expect(head.body.length).toBe(0);
    expect(Number(head.headers["content-length"])).toBeGreaterThan(10);
    const get = await request(http);
    const etag = String(get.headers.etag);
    expect(etag).toMatch(/^W\//);
    const cached = await request(http, { headers: { "if-none-match": etag } });
    expect(cached.status).toBe(304);
    expect(cached.body.length).toBe(0);
    const stale = await request(http, {
      headers: { "if-none-match": 'W/"nope"' },
    });
    expect(stale.status).toBe(200);
  });

  it("x-request-id: echoed when sane, minted otherwise, in ctx", async () => {
    const ids: unknown[] = [];
    const { http } = await boot((m) => {
      if (m.id === "http.request") ids.push(m.ctx);
      return m.id === "http.request" ? [respond({ text: "x" })] : [];
    });
    const a = await request(http, {
      headers: { "x-request-id": "client-id-1" },
    });
    expect(a.headers["x-request-id"]).toBe("client-id-1");
    const b = await request(http, {
      headers: { "x-request-id": "bad id\twith space" },
    });
    expect(String(b.headers["x-request-id"])).toMatch(/^[A-Za-z0-9_-]{12}$/);
    const c = await request(http);
    expect(c.headers["x-request-id"]).toBeTruthy();
    expect((ids[0] as any).requestId).toBe("client-id-1");
    expect((ids[0] as any).rid).not.toBe("client-id-1"); // the rid stays unguessable
  });

  it("a second respond for the same request is ignored and counted", async () => {
    const { http } = await boot((m) =>
      m.id === "http.request"
        ? [respond({ text: "one" }), respond({ text: "two" })]
        : [],
    );
    expect((await request(http)).text).toBe("one");
    expect(http.stats().doubleResponses).toBe(1);
  });

  it("downloads and files", async () => {
    const dir = await mkdtemp(join(tmpdir(), "pavlus-"));
    const file = join(dir, "data.csv");
    await writeFile(file, "a,b\n1,2\n");
    try {
      const { http } = await boot((m) => {
        if (m.id !== "http.request") return [];
        const p = (m.payload as any).path;
        if (p === "/dl")
          return [
            respond({
              body: "a,b",
              download: "naïve report.csv",
              headers: { "content-type": "text/csv" },
            }),
          ];
        if (p === "/file")
          return [
            { plugin: "http", type: "file", path: file, filename: "x.csv" },
          ];
        return [{ plugin: "http", type: "file", path: join(dir, "missing") }];
      });
      const dl = await request(http, { path: "/dl" });
      expect(dl.headers["content-disposition"]).toMatch(
        /^attachment; filename="na_ve report.csv"; filename\*=UTF-8''na%C3%AFve%20report.csv$/,
      );
      const f = await request(http, { path: "/file" });
      expect(f.text).toBe("a,b\n1,2\n");
      expect(f.headers["content-type"]).toMatch(/text\/csv/);
      expect(f.headers["content-length"]).toBe("8");
      expect((await request(http, { path: "/missing" })).status).toBe(404);
    } finally {
      await rm(dir, { recursive: true });
    }
  });
});

describe("abort and cleanup", () => {
  it("http.aborted when the client leaves early; plugins are cancelled; nothing leaks", async () => {
    const delay = delayPlugin();
    const seen: Message[] = [];
    const { http, server } = await boot(
      (m) =>
        m.id === "http.request"
          ? [
              {
                plugin: "delay",
                type: "later",
                ms: 5000,
                replyTo: "later",
                value: 1,
              },
            ]
          : [],
      {},
      [delay],
      (m) => seen.push(m),
    );
    const sock = connect(http.port, "127.0.0.1");
    await new Promise((r) => sock.on("connect", r));
    sock.write("GET /slow HTTP/1.1\r\nHost: x\r\n\r\n");
    await until(() => seen.some((m) => m.id === "http.request"));
    expect(delay.live()).toBe(1);
    sock.destroy();
    await until(() => seen.some((m) => m.id === "http.aborted"));
    const rid = seen.find((m) => m.id === "http.request")!.ctx!.rid;
    expect(seen.find((m) => m.id === "http.aborted")!.ctx!.rid).toBe(rid);
    await until(() => delay.cancelled.length === 1);
    expect(delay.cancelled).toEqual([rid]);
    expect(delay.live()).toBe(0);
    expect(http.stats()).toMatchObject({ conns: 0, timers: 0, aborted: 1 });
    expect(server.stats()).toMatchObject({ active: 0, timers: 0 });
    expect(server.getState().requests).toEqual({});
  });

  it("abort mid-upload never reaches the app and frees the body timer", async () => {
    const seen: string[] = [];
    const { http } = await boot(
      () => [respond({ text: "ok" })],
      {},
      [],
      (m) => seen.push(m.id),
    );
    const sock = connect(http.port, "127.0.0.1");
    await new Promise((r) => sock.on("connect", r));
    sock.write(
      "POST / HTTP/1.1\r\nHost: x\r\nContent-Length: 1000\r\nContent-Type: text/plain\r\n\r\npartial",
    );
    await until(() => http.stats().conns === 1 && http.stats().timers === 1);
    sock.destroy();
    await until(() => http.stats().conns === 0);
    expect(http.stats()).toMatchObject({ timers: 0, abortedEarly: 1 });
    expect(seen).toEqual(["http.listening"]);
  });

  it("request.done follows a finished response and clears the slice", async () => {
    const seen: string[] = [];
    const { http, server } = await boot(
      (m) => (m.id === "http.request" ? [respond({ text: "ok" })] : []),
      {},
      [],
      (m) => seen.push(m.id),
    );
    await request(http);
    await until(() => seen.includes("request.done"));
    await until(() => server.stats().active === 0);
    expect(server.getState().requests).toEqual({});
  });

  it("an unanswered request gets a 504 at its deadline", async () => {
    const { http } = await boot(() => [], { limits: { requestTimeoutMs: 50 } });
    const r = await request(http);
    expect(r.status).toBe(504);
  });
});

describe("keep-alive", () => {
  it("reuses one socket for sequential requests", async () => {
    const { http } = await boot((m) =>
      m.id === "http.request" ? [respond({ text: "x" })] : [],
    );
    const agent = new Agent({ keepAlive: true, maxSockets: 1 });
    for (let i = 0; i < 5; i++) await request(http, { agent });
    expect(http.stats().sockets).toBe(1);
    agent.destroy();
    await until(() => http.stats().socketsOpen === 0);
  });
});

describe("many concurrent requests", () => {
  it("interleaved flows are each answered to the right connection", async () => {
    const delay = delayPlugin();
    const { http, server } = await boot(
      (m, state) => {
        if (m.id === "http.request") {
          const p = m.payload as any;
          const n = Number(p.query.n);
          // 3 hops with a different random delay each; the answer must still find its socket
          return [
            { plugin: "requests", type: "req.set", path: "n", value: n },
            {
              plugin: "delay",
              type: "later",
              ms: 1 + ((n * 7) % 23),
              replyTo: "hop1",
              value: `a${n}`,
            },
          ];
        }
        const mine = state.requests[m.ctx!.rid as string];
        if (m.id === "hop1")
          return [
            {
              plugin: "delay",
              type: "later",
              ms: 1 + ((mine.n * 13) % 19),
              replyTo: "hop2",
              value: `${m.payload}b`,
            },
          ];
        if (m.id === "hop2")
          return [
            respond({ json: { n: mine.n, trail: m.payload, rid: m.ctx!.rid } }),
          ];
        return [];
      },
      {},
      [delay],
    );
    const agent = new Agent({ keepAlive: true, maxSockets: 64 });
    const N = 300;
    const results = await Promise.all(
      Array.from({ length: N }, (_, i) =>
        request(http, { path: `/?n=${i}`, agent }),
      ),
    );
    results.forEach((r, i) => {
      const j = r.json as any;
      expect(j.n).toBe(i);
      expect(j.trail).toBe(`a${i}b`);
    });
    expect(new Set(results.map((r) => (r.json as any).rid)).size).toBe(N);
    agent.destroy();
    await until(() => server.stats().active === 0);
    expect(server.getState().requests).toEqual({});
    expect(delay.live()).toBe(0);
    expect(server.stats().discarded).toBe(0);
    expect(http.stats()).toMatchObject({ conns: 0, timers: 0 });
  });
});

describe("streaming", () => {
  it("SSE: events arrive as they are sent, heartbeat flows, end finishes", async () => {
    const delay = delayPlugin();
    const { http } = await boot(
      (m) => {
        if (m.id === "http.request")
          return [
            { plugin: "http", type: "sse.start", heartbeatMs: 20 },
            {
              plugin: "http",
              type: "sse.send",
              event: "hello",
              data: { a: 1 },
              id: "1",
            },
            { plugin: "delay", type: "later", ms: 90, replyTo: "more" },
          ];
        if (m.id === "more")
          return [
            { plugin: "http", type: "sse.send", data: "line1\nline2" },
            { plugin: "http", type: "sse.end" },
          ];
        return [];
      },
      {},
      [delay],
    );
    const text = await new Promise<string>((resolve, reject) => {
      httpGet(
        { port: http.port, host: "127.0.0.1", path: "/events" },
        (res) => {
          expect(res.headers["content-type"]).toMatch(/text\/event-stream/);
          expect(res.headers["cache-control"]).toMatch(/no-cache/);
          let out = "";
          res.on("data", (c) => (out += c));
          res.on("end", () => resolve(out));
          res.on("error", reject);
        },
      );
    });
    expect(text).toContain('event: hello\nid: 1\ndata: {"a":1}\n\n');
    expect(text).toContain("data: line1\ndata: line2\n\n");
    expect(text).toContain(":hb\n\n");
    await until(
      () => http.stats().heartbeats === 0 && http.stats().conns === 0,
    );
    expect(http.stats().timers).toBe(0);
  });

  it("a client leaving an SSE stream aborts it and stops the heartbeat", async () => {
    const seen: Message[] = [];
    const { http } = await boot(
      (m) =>
        m.id === "http.request"
          ? [{ plugin: "http", type: "sse.start", heartbeatMs: 20 }]
          : [],
      {},
      [],
      (m) => seen.push(m),
    );
    await new Promise<void>((resolve) => {
      const req = httpGet(
        { port: http.port, host: "127.0.0.1", path: "/" },
        (res) => {
          res.once("data", () => {
            req.destroy();
            resolve();
          });
        },
      );
    });
    await until(() => seen.some((m) => m.id === "http.aborted"));
    expect(http.stats()).toMatchObject({ heartbeats: 0, timers: 0, conns: 0 });
  });

  it("stream.chunk with backpressure delivers every byte", async () => {
    const total = 4 * 1024 * 1024;
    const chunk = Buffer.alloc(64 * 1024, 7);
    const { http } = await boot(
      (m) =>
        m.id === "http.request"
          ? [
              {
                plugin: "http",
                type: "stream.start",
                contentType: "application/octet-stream",
                download: "big.bin",
              },
              ...Array.from({ length: total / chunk.length }, () => ({
                plugin: "http",
                type: "stream.chunk",
                data: chunk,
              })),
              { plugin: "http", type: "stream.end" },
            ]
          : [],
      { limits: { streamBufferBytes: 16 * 1024 * 1024 } },
    );
    const r = await request(http, { timeoutMs: 15000 });
    expect(r.body.length).toBe(total);
    expect(r.headers["content-disposition"]).toMatch(/big\.bin/);
  });

  it("a client that does not read is dropped once its buffer cap is hit", async () => {
    const chunk = Buffer.alloc(1024 * 1024, 1);
    const seen: Message[] = [];
    const { http } = await boot(
      (m) =>
        m.id === "http.request"
          ? [
              { plugin: "http", type: "stream.start" },
              ...Array.from({ length: 64 }, () => ({
                plugin: "http",
                type: "stream.chunk",
                data: chunk,
              })),
            ]
          : [],
      { limits: { streamBufferBytes: 2 * 1024 * 1024 } },
      [],
      (m) => seen.push(m),
    );
    const sock = connect(http.port, "127.0.0.1");
    await new Promise((r) => sock.on("connect", r));
    sock.pause(); // never read
    sock.write("GET / HTTP/1.1\r\nHost: x\r\n\r\n");
    await until(() => http.stats().slowConsumers === 1, 5000);
    await until(() => seen.some((m) => m.id === "http.aborted"));
    sock.destroy();
    expect(http.stats()).toMatchObject({ conns: 0, timers: 0 });
  });
});

describe("graceful close", () => {
  it("lets in-flight requests finish with Connection: close, refuses new ones", async () => {
    const delay = delayPlugin();
    const { http, server } = await boot(
      (m) => {
        if (m.id === "http.request")
          return [{ plugin: "delay", type: "later", ms: 120, replyTo: "go" }];
        if (m.id === "go") return [respond({ text: "finished" })];
        return [];
      },
      {},
      [delay],
    );
    const inflight = request(http);
    await until(() => delay.live() === 1);
    const down = server.shutdown({ timeoutMs: 3000 });
    const r = await inflight;
    expect(r.text).toBe("finished");
    expect(r.headers.connection).toBe("close");
    await down;
    await expect(request({ port: http.port })).rejects.toThrow();
    expect(http.server.listening).toBe(false);
    expect(server.stats()).toMatchObject({ active: 0, timers: 0, forced: 0 });
    expect(http.stats()).toMatchObject({ conns: 0, timers: 0, socketsOpen: 0 });
  });
});

describe("cookies helpers", () => {
  it("parse is lenient and first-wins", () => {
    expect(parseCookies('a=1; b="two"; a=3; bad; c=%zz')).toEqual({
      a: "1",
      b: "two",
      c: "%zz",
    });
    expect(parseCookies(undefined)).toEqual({});
  });
  it("serialize defaults are secure and validated", () => {
    expect(serializeCookie("a", "b c")).toBe(
      "a=b%20c; Path=/; HttpOnly; Secure; SameSite=Lax",
    );
    expect(
      serializeCookie("a", "1", {
        secure: false,
        httpOnly: false,
        sameSite: false,
        domain: "x.org",
        path: "/p",
        maxAge: 5.9,
        expires: new Date(0),
      }),
    ).toBe(
      "a=1; Domain=x.org; Path=/p; Max-Age=5; Expires=Thu, 01 Jan 1970 00:00:00 GMT",
    );
    expect(
      serializeCookie("a", "1", { secure: false, sameSite: "None" }),
    ).toContain("Secure; SameSite=None");
    expect(() => serializeCookie("a b", "1")).toThrow();
    expect(() =>
      serializeCookie("a", "1", { path: "/x\r\nSet-Cookie: y=1" }),
    ).toThrow();
    expect(clearCookie("a")).toMatch(
      /a=; Path=\/; Max-Age=0; Expires=Thu, 01 Jan 1970/,
    );
  });
});

async function until(cond: () => boolean, ms = 3000): Promise<void> {
  const t0 = Date.now();
  while (!cond()) {
    if (Date.now() - t0 > ms) throw new Error("until: timed out");
    await new Promise((r) => setTimeout(r, 5));
  }
}
