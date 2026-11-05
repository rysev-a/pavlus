import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { collector } from "../_reply.ts";
import { createFetchPlugin, fetchEffector as f } from "./mod.ts";

let server: Server;
let base: string;
const hits: Record<string, number> = {};

beforeAll(async () => {
  server = createServer((req, res) => {
    const url = new URL(req.url!, "http://x");
    const p = url.pathname;
    hits[p] = (hits[p] ?? 0) + 1;
    if (p === "/json") {
      res.setHeader("content-type", "application/json");
      return res.end(JSON.stringify({ a: 1, q: url.search }));
    }
    if (p === "/echo") {
      const chunks: Buffer[] = [];
      req.on("data", (c) => chunks.push(c));
      return req.on("end", () => {
        res.setHeader("content-type", "text/plain");
        res.end(
          `${req.method} ${req.headers["content-type"] ?? "-"} ${Buffer.concat(chunks)}`,
        );
      });
    }
    if (p === "/flaky") {
      if (hits[p]! < 3) {
        res.statusCode = 503;
        res.setHeader("retry-after", "0");
        return res.end("no");
      }
      return res.end("finally");
    }
    if (p === "/flaky-post") {
      res.statusCode = 503;
      return res.end("no");
    }
    if (p === "/slow") return void setTimeout(() => res.end("late"), 1000);
    if (p === "/big") return res.end(Buffer.alloc(100_000, 1));
    if (p === "/bin") return res.end(Buffer.from([0, 255, 1]));
    if (p === "/badjson") {
      res.setHeader("content-type", "application/json");
      return res.end("{oops");
    }
    if (p === "/404") {
      res.statusCode = 404;
      return res.end("nope");
    }
    res.end("ok");
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(
  () =>
    new Promise((r) => {
      server.closeAllConnections();
      server.close(r);
    }),
);

const pc = (dispatch: any): any => ({
  dispatch,
  getState: () => undefined,
  dispatchEffect() {},
});
async function call(effect: any, plugin = createFetchPlugin({ backoffMs: 1 })) {
  const c = collector();
  plugin.handle(
    { ...effect, ctx: effect.ctx ?? { rid: "r1" } },
    pc(c.dispatch),
  );
  const m = await c.next(["ok", "err"]);
  return { m, plugin };
}

describe("fetch plugin", () => {
  it("auto-parses json and keeps ctx; query", async () => {
    const { m } = await call(
      f.get(`${base}/json`, { replyTo: "ok", query: { x: 1, y: undefined } }),
    );
    expect(m.ctx).toEqual({ rid: "r1" });
    const r: any = m.payload;
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ a: 1, q: "?x=1" });
    expect(r.headers["content-type"]).toContain("json");
  });
  it("sends json bodies and text bodies", async () => {
    const a: any = (
      await call(f.post(`${base}/echo`, { replyTo: "ok", json: { z: 1 } }))
    ).m.payload;
    expect(a.body).toBe('POST application/json {"z":1}');
    const b: any = (
      await call(
        f.put(`${base}/echo`, {
          replyTo: "ok",
          body: "hi",
          headers: { "content-type": "text/x" },
        }),
      )
    ).m.payload;
    expect(b.body).toBe("PUT text/x hi");
  });
  it("parse modes", async () => {
    expect(
      (
        (await call(f.get(`${base}/bin`, { replyTo: "ok", parse: "buffer" }))).m
          .payload as any
      ).body,
    ).toEqual(Buffer.from([0, 255, 1]));
    expect(
      (
        (await call(f.get(`${base}/json`, { replyTo: "ok", parse: "text" }))).m
          .payload as any
      ).body,
    ).toContain('"a":1');
    expect(
      (
        (await call(f.get(`${base}/json`, { replyTo: "ok", parse: "none" }))).m
          .payload as any
      ).body,
    ).toBeUndefined();
    const e: any = (
      await call(f.get(`${base}/badjson`, { replyTo: "ok", onError: "err" }))
    ).m;
    expect(e.id).toBe("err");
    expect(e.payload.code).toBe("PARSE");
  });
  it("non-2xx is a reply with ok=false", async () => {
    const r: any = (await call(f.get(`${base}/404`, { replyTo: "ok" }))).m
      .payload;
    expect([r.status, r.ok, r.body]).toEqual([404, false, "nope"]);
  });
  it("retries idempotent methods on 503, not POST", async () => {
    const r: any = (await call(f.get(`${base}/flaky`, { replyTo: "ok" }))).m
      .payload;
    expect([r.status, r.attempts, r.body]).toEqual([200, 3, "finally"]);
    const before = hits["/flaky-post"] ?? 0;
    const p: any = (await call(f.post(`${base}/flaky-post`, { replyTo: "ok" })))
      .m.payload;
    expect(p.status).toBe(503);
    expect(hits["/flaky-post"]! - before).toBe(1);
  });
  it("retries network errors then reports NETWORK", async () => {
    const e: any = (
      await call(
        f.get("http://127.0.0.1:1/", {
          replyTo: "ok",
          onError: "err",
          retries: 1,
        }),
      )
    ).m;
    expect(e.id).toBe("err");
    expect(e.payload.code).toBe("NETWORK");
  });
  it("times out", async () => {
    const e: any = (
      await call(
        f.get(`${base}/slow`, {
          replyTo: "ok",
          onError: "err",
          timeoutMs: 50,
          retries: 0,
        }),
      )
    ).m;
    expect(e.payload.code).toBe("TIMEOUT");
  });
  it("respects ctx.deadline", async () => {
    const e: any = (
      await call({
        ...f.get(`${base}/slow`, { replyTo: "ok", onError: "err", retries: 0 }),
        ctx: { rid: "d", deadline: Date.now() + 50 },
      })
    ).m;
    expect(e.payload.code).toBe("TIMEOUT");
  });
  it("enforces the size limit", async () => {
    const e: any = (
      await call(
        f.get(`${base}/big`, { replyTo: "ok", onError: "err", maxBytes: 1000 }),
      )
    ).m;
    expect(e.payload.code).toBe("TOO_LARGE");
    const okr: any = (
      await call(f.get(`${base}/big`, { replyTo: "ok", parse: "buffer" }))
    ).m.payload;
    expect(okr.body.length).toBe(100_000);
  });
  it("cancel(rid) aborts and never replies", async () => {
    const plugin = createFetchPlugin();
    const c = collector();
    plugin.handle(
      {
        ...f.get(`${base}/slow`, { replyTo: "ok", onError: "err" }),
        ctx: { rid: "gone" },
      },
      pc(c.dispatch),
    );
    expect(plugin.inflight()).toBe(1);
    plugin.cancel("gone");
    await new Promise((r) => setTimeout(r, 100));
    expect(c.messages).toEqual([]);
    expect(plugin.inflight()).toBe(0);
  });
});
