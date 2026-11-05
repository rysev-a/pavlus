import { existsSync } from "node:fs";
import net from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { collector } from "../_reply.ts";
import { createRedisPlugin, redisEffector as r } from "./mod.ts";
import {
  type TestRedis,
  redisServerBinary,
  startTestRedis,
} from "./testserver.ts";

const have =
  redisServerBinary() !== undefined || existsSync("/usr/bin/redis-server");

describe.skipIf(!have)("redis plugin (real redis-server)", () => {
  let srv: TestRedis;
  let plugin: ReturnType<typeof createRedisPlugin>;
  const c = collector();
  const pc: any = {
    dispatch: c.dispatch,
    getState: () => undefined,
    dispatchEffect() {},
  };
  const run = async (effect: any, ctx: any = { rid: "r1" }, id = "ok") => {
    plugin.handle({ ...effect, ctx }, pc);
    return c.next([id, "err"]);
  };
  const val = async (effect: any, ctx?: any) =>
    (await run(effect, ctx)).payload as any;

  beforeAll(async () => {
    srv = await startTestRedis();
    plugin = createRedisPlugin({
      url: srv.url + "/0",
      reconnect: { minMs: 20, maxMs: 100 },
      commandTimeoutMs: 2000,
    });
    plugin.init!(pc);
    await plugin.ready();
  });
  afterAll(async () => {
    plugin?.dispose?.();
    await srv?.stop();
  });

  it("replies keep the ctx of the effect", async () => {
    const m = await run(r.set("k1", "v", { replyTo: "ok" }), {
      rid: "x",
      connId: "y",
    });
    expect(m.ctx).toEqual({ rid: "x", connId: "y" });
    expect(m.payload).toBe("OK");
  });

  it("typed string helpers", async () => {
    expect(await val(r.get("nope", { replyTo: "ok" }))).toBeNull();
    expect(await val(r.set("s", "1", { replyTo: "ok", nx: true }))).toBe("OK");
    expect(await val(r.set("s", "2", { replyTo: "ok", nx: true }))).toBeNull();
    expect(
      await val(r.set("s", "3", { replyTo: "ok", xx: true, ex: 100 })),
    ).toBe("OK");
    expect(await val(r.get("s", { replyTo: "ok" }))).toBe("3");
    const ttl = await val(r.ttl("s", { replyTo: "ok" }));
    expect(ttl).toBeGreaterThan(90);
    expect(await val(r.set("p", "x", { replyTo: "ok", px: 5000 }))).toBe("OK");
    expect(await val(r.incr("n", { replyTo: "ok" }))).toBe(1);
    expect(await val(r.incrBy("n", 9, { replyTo: "ok" }))).toBe(10);
    expect(await val(r.decr("n", { replyTo: "ok" }))).toBe(9);
    expect(await val(r.expire("n", 100, { replyTo: "ok" }))).toBe(true);
    expect(await val(r.expire("missing", 100, { replyTo: "ok" }))).toBe(false);
    expect(await val(r.del(["n", "s", "p"], { replyTo: "ok" }))).toBe(3);
    expect(await val(r.mset({ a: "1", b: "2" }, { replyTo: "ok" }))).toBe("OK");
    expect(await val(r.mget(["a", "zz", "b"], { replyTo: "ok" }))).toEqual([
      "1",
      null,
      "2",
    ]);
  });

  it("hashes, lists, sets, sorted sets", async () => {
    expect(await val(r.hset("h", { a: "1", b: 2 }, { replyTo: "ok" }))).toBe(2);
    expect(await val(r.hset("h", "c", "3", { replyTo: "ok" }))).toBe(1);
    expect(await val(r.hget("h", "b", { replyTo: "ok" }))).toBe("2");
    expect(await val(r.hgetall("h", { replyTo: "ok" }))).toEqual({
      a: "1",
      b: "2",
      c: "3",
    });
    expect(await val(r.hgetall("nohash", { replyTo: "ok" }))).toEqual({});
    expect(await val(r.rpush("l", ["a", "b"], { replyTo: "ok" }))).toBe(2);
    expect(await val(r.lpush("l", "z", { replyTo: "ok" }))).toBe(3);
    expect(await val(r.lrange("l", 0, -1, { replyTo: "ok" }))).toEqual([
      "z",
      "a",
      "b",
    ]);
    expect(await val(r.lpop("l", { replyTo: "ok" }))).toBe("z");
    expect(await val(r.rpop("l", { replyTo: "ok" }))).toBe("b");
    expect(await val(r.sadd("set", ["x", "y", "x"], { replyTo: "ok" }))).toBe(
      2,
    );
    expect((await val(r.smembers("set", { replyTo: "ok" }))).sort()).toEqual([
      "x",
      "y",
    ]);
    expect(
      await val(
        r.zadd(
          "z",
          [
            { score: 2, member: "two" },
            { score: 1, member: "one" },
          ],
          { replyTo: "ok" },
        ),
      ),
    ).toBe(2);
    expect(await val(r.zrange("z", 0, -1, { replyTo: "ok" }))).toEqual([
      "one",
      "two",
    ]);
    expect(
      await val(r.zrange("z", 0, -1, { replyTo: "ok", withScores: true })),
    ).toEqual([
      { member: "one", score: 1 },
      { member: "two", score: 2 },
    ]);
  });

  it("errors: redis error codes, wrong arguments", async () => {
    await run(r.set("str", "x", { replyTo: "ok" }));
    const e = await val(r.lpush("str", "a", { replyTo: "ok", onError: "err" }));
    expect(e.code).toBe("WRONGTYPE");
    const u = await val(
      r.cmd(["NOSUCHCMD"], { replyTo: "ok", onError: "err" }),
    );
    expect(u.code).toBe("ERR");
    const bad = await val({ ...r.cmd([], { replyTo: "ok", onError: "err" }) });
    expect(bad.message).toContain("empty");
  });

  it("eval and evalsha", async () => {
    const script =
      "return {KEYS[1], ARGV[1], redis.call('INCRBY', KEYS[1], ARGV[2])}";
    expect(
      await val(r.eval(script, ["ev"], ["a", 5], { replyTo: "ok" })),
    ).toEqual(["ev", "a", 5]);
    const sha = await val(r.cmd(["SCRIPT", "LOAD", script], { replyTo: "ok" }));
    expect(
      await val(r.evalsha(sha, ["ev"], ["b", 2], { replyTo: "ok" })),
    ).toEqual(["ev", "b", 7]);
  });

  it("binary safe values and utf8, large values", async () => {
    const bin = Buffer.from([0, 255, 13, 10, 1, 2]);
    await run(r.set("bin", bin, { replyTo: "ok" }));
    expect(await val(r.get("bin", { replyTo: "ok", binary: true }))).toEqual(
      bin,
    );
    await run(r.set("u", "héllo ✓", { replyTo: "ok" }));
    expect(await val(r.get("u", { replyTo: "ok" }))).toBe("héllo ✓");
    const big = Buffer.alloc(3_000_000);
    for (let i = 0; i < big.length; i++) big[i] = i % 251;
    await run(r.set("big", big, { replyTo: "ok" }));
    const back = await val(r.get("big", { replyTo: "ok", binary: true }));
    expect(back.equals(big)).toBe(true);
  });

  it("pipelining: many commands in flight keep order", async () => {
    const n = 2000;
    const ids = Array.from({ length: n }, (_, i) => `p${i}`);
    for (let i = 0; i < n; i++)
      plugin.handle(
        { ...r.incr("pl", { replyTo: ids[i]! }), ctx: { rid: "pipe" } },
        pc,
      );
    const got = await Promise.all(ids.map((id) => c.next(id)));
    expect(got.map((m) => m.payload)).toEqual(
      Array.from({ length: n }, (_, i) => i + 1),
    );
  });

  it("redis.pipeline and redis.multi", async () => {
    const p = await val(
      r.pipeline(
        [
          ["SET", "pk", "1"],
          ["INCR", "pk"],
          ["LPUSH", "pk", "x"],
          ["GET", "pk"],
        ],
        { replyTo: "ok" },
      ),
    );
    expect(p.results[0]).toEqual({ ok: true, value: "OK" });
    expect(p.results[1]).toEqual({ ok: true, value: 2 });
    expect(p.results[2].ok).toBe(false);
    expect(p.results[2].error.code).toBe("WRONGTYPE");
    expect(p.results[3]).toEqual({ ok: true, value: "2" });

    const m = await val(
      r.multi(
        [
          ["SET", "mk", "5"],
          ["INCR", "mk"],
          ["GET", "mk"],
        ],
        { replyTo: "ok" },
      ),
    );
    expect(m.results.map((x: any) => x.value)).toEqual(["OK", 6, "6"]);
    const mfail = await val(
      r.multi([["SET", "mk", "5"], ["NOSUCHCMD"]], {
        replyTo: "ok",
        onError: "err",
      }),
    );
    expect(mfail.code).toBe("ERR");
    // the connection is not left inside MULTI
    expect(await val(r.get("mk", { replyTo: "ok" }))).toBe("6");
    const mrt = await val(
      r.multi(
        [
          ["SET", "mk", "1"],
          ["LPUSH", "mk", "x"],
        ],
        { replyTo: "ok" },
      ),
    );
    expect(mrt.results[1].ok).toBe(false);
  });

  it("per-command timeout (blocking pop) and the connection keeps working", async () => {
    const t0 = Date.now();
    const e = await val(
      r.cmd(["BLPOP", "emptylist", 3], {
        replyTo: "ok",
        onError: "err",
        timeoutMs: 100,
      }),
    );
    expect(e.code).toBe("TIMEOUT");
    expect(Date.now() - t0).toBeLessThan(1500);
    // the timed-out slot is still ahead in the queue; the next command waits for it (3s) but must not get its reply
    await run(r.set("after", "yes", { replyTo: "ok", timeoutMs: 6000 }));
    expect(await val(r.get("after", { replyTo: "ok" }))).toBe("yes");
  }, 15000);

  it("ctx.deadline shortens the timeout", async () => {
    const e = await val(
      r.cmd(["BLPOP", "emptylist2", 0.3], { replyTo: "ok", onError: "err" }),
      { rid: "dl", deadline: Date.now() + 80 },
    );
    expect(e.code).toBe("TIMEOUT");
  }, 10000);

  it("cancel(rid) drops pending replies of that rid only", async () => {
    plugin.handle(
      {
        ...r.cmd(["BLPOP", "emptylist3", 0.5], {
          replyTo: "gone",
          onError: "err",
        }),
        ctx: { rid: "dead" },
      },
      pc,
    );
    plugin.handle(
      {
        ...r.cmd(["PING"], { replyTo: "alive", timeoutMs: 5000 }),
        ctx: { rid: "live" },
      },
      pc,
    );
    plugin.cancel("dead");
    expect((await c.next("alive")).payload).toBe("PONG");
    await new Promise((res) => setTimeout(res, 900));
    expect(c.messages.filter((m) => m.id === "gone" || m.id === "err")).toEqual(
      [],
    );
  }, 10000);

  it("pub/sub: dispatches with the subscribing ctx; unsubscribe; patterns; cancel(rid)", async () => {
    const sub = await run(
      r.subscribe("news", { onMessage: "gotNews", replyTo: "ok" }),
      { rid: "ws1", connId: "c1" },
    );
    expect(sub.payload).toEqual({ subscribed: "news" });
    await run(
      r.psubscribe("alerts.*", { onMessage: "gotAlert", replyTo: "ok" }),
      { rid: "ws1", connId: "c1" },
    );
    expect(await val(r.publish("news", "hello", { replyTo: "ok" }))).toBe(1);
    const m = await c.next("gotNews");
    expect(m.payload).toEqual({ channel: "news", message: "hello" });
    expect(m.ctx).toEqual({ rid: "ws1", connId: "c1" });
    await val(r.publish("alerts.cpu", "hot", { replyTo: "ok" }));
    const a = await c.next("gotAlert");
    expect(a.payload).toEqual({
      channel: "alerts.cpu",
      message: "hot",
      pattern: "alerts.*",
    });

    // second subscriber to the same channel, different connection
    await run(r.subscribe("news", { onMessage: "gotNews2", replyTo: "ok" }), {
      rid: "ws2",
      connId: "c2",
    });
    await val(r.publish("news", "two", { replyTo: "ok" }));
    expect(((await c.next("gotNews")).payload as any).message).toBe("two");
    expect((await c.next("gotNews2")).ctx).toEqual({
      rid: "ws2",
      connId: "c2",
    });

    // cancel ws2's request: its subscription goes away, ws1 keeps receiving
    plugin.cancel("ws2");
    await val(r.publish("news", "three", { replyTo: "ok" }));
    expect(((await c.next("gotNews")).payload as any).message).toBe("three");
    await new Promise((res) => setTimeout(res, 50));
    expect(c.messages.find((x) => x.id === "gotNews2")).toBeUndefined();

    // unsubscribe from another frame (same connId, other rid)
    await run(r.unsubscribe("news", { replyTo: "ok" }), {
      rid: "frame9",
      connId: "c1",
    });
    expect(await val(r.publish("news", "four", { replyTo: "ok" }))).toBe(0);
    expect(plugin.metrics().subscriptions).toBe(1); // the pattern
    plugin.cancel("ws1");
    expect(plugin.metrics().subscriptions).toBe(0);
    expect(await val(r.publish("alerts.x", "y", { replyTo: "ok" }))).toBe(0);
  });

  it("binary pub/sub", async () => {
    await run(
      r.subscribe("bch", { onMessage: "gotB", replyTo: "ok", binary: true }),
    );
    const bin = Buffer.from([0, 1, 255]);
    await val(r.publish("bch", bin, { replyTo: "ok" }));
    expect(((await c.next("gotB")).payload as any).message).toEqual(bin);
    plugin.cancel("r1");
  });

  it("metrics", () => {
    const m = plugin.metrics();
    expect(m.status).toBe("ready");
    expect(m.commands).toBeGreaterThan(50);
    expect(m.timeouts).toBeGreaterThanOrEqual(2);
  });
});

describe.skipIf(!have)("redis connection management", () => {
  it("reconnects with backoff, queues commands while down, resubscribes", async () => {
    const srv = await startTestRedis();
    const c = collector();
    const pc: any = {
      dispatch: c.dispatch,
      getState: () => undefined,
      dispatchEffect() {},
    };
    const plugin = createRedisPlugin({
      url: srv.url,
      reconnect: { minMs: 20, maxMs: 80 },
      commandTimeoutMs: 5000,
    });
    plugin.init!(pc);
    await plugin.ready();
    plugin.handle(
      {
        ...r.subscribe("ch", { onMessage: "m", replyTo: "sub" }),
        ctx: { rid: "s" },
      },
      pc,
    );
    await c.next("sub");

    await srv.stop();
    await new Promise((res) => setTimeout(res, 100));
    // issued while down: waits in the offline queue
    plugin.handle(
      { ...r.set("q", "queued", { replyTo: "set" }), ctx: { rid: "a" } },
      pc,
    );
    await new Promise((res) => setTimeout(res, 150));
    expect(plugin.metrics().queued).toBe(1);
    await srv.start();
    expect((await c.next("set", 5000)).payload).toBe("OK");
    expect(plugin.metrics().reconnects).toBeGreaterThan(0);
    plugin.handle({ ...r.get("q", { replyTo: "got" }), ctx: { rid: "a" } }, pc);
    expect((await c.next("got")).payload).toBe("queued");

    // the subscriber reconnected and subscribed again
    await new Promise((res) => setTimeout(res, 300));
    plugin.handle(
      { ...r.publish("ch", "back", { replyTo: "pub" }), ctx: { rid: "a" } },
      pc,
    );
    expect((await c.next("pub")).payload).toBe(1);
    expect(((await c.next("m")).payload as any).message).toBe("back");
    plugin.dispose?.();
    await srv.stop();
  }, 20000);

  it("in-flight commands fail with CONNECTION when the server dies", async () => {
    const srv = await startTestRedis();
    const c = collector();
    const pc: any = {
      dispatch: c.dispatch,
      getState: () => undefined,
      dispatchEffect() {},
    };
    const plugin = createRedisPlugin({
      url: srv.url,
      reconnect: { minMs: 20, maxMs: 50 },
    });
    plugin.init!(pc);
    await plugin.ready();
    plugin.handle(
      {
        ...r.cmd(["BLPOP", "nothing", 5], { replyTo: "ok", onError: "err" }),
        ctx: { rid: "a" },
      },
      pc,
    );
    await new Promise((res) => setTimeout(res, 50));
    await srv.stop();
    const e = await c.next(["ok", "err"]);
    expect(e.id).toBe("err");
    expect((e.payload as any).code).toBe("CONNECTION");
    plugin.dispose?.();
  }, 10000);

  it("auth and select via url; wrong password is a fatal, reported error", async () => {
    const srv = await startTestRedis(["--requirepass", "s3cr3t!"]);
    const c = collector();
    const pc: any = {
      dispatch: c.dispatch,
      getState: () => undefined,
      dispatchEffect() {},
    };
    const good = createRedisPlugin({
      url: `redis://:${encodeURIComponent("s3cr3t!")}@127.0.0.1:${srv.port}/2`,
    });
    good.init!(pc);
    await good.ready();
    good.handle(
      { ...r.set("dbk", "2", { replyTo: "a" }), ctx: { rid: "g" } },
      pc,
    );
    await c.next("a");
    // key landed in db 2
    expect(await good.client.call(["CLIENT", "INFO"])).toContain("db=2");
    good.dispose?.();

    const bad = createRedisPlugin({
      url: `redis://:wrong@127.0.0.1:${srv.port}`,
    });
    bad.init!(pc);
    await expect(bad.ready()).rejects.toThrow(/WRONGPASS|invalid/i);
    bad.handle(
      { ...r.get("x", { replyTo: "ok", onError: "err" }), ctx: { rid: "b" } },
      pc,
    );
    expect(((await c.next(["ok", "err"])).payload as any).code).toBe(
      "CONNECTION",
    );
    bad.dispose?.();

    const no = createRedisPlugin({ url: `redis://127.0.0.1:${srv.port}` });
    no.init!(pc);
    no.handle(
      { ...r.get("x", { replyTo: "ok", onError: "err" }), ctx: { rid: "n" } },
      pc,
    );
    expect(((await c.next(["ok", "err"])).payload as any).code).toBe("NOAUTH");
    no.dispose?.();
    await srv.stop();
  }, 15000);

  it("RESP3 via ?protocol=3", async () => {
    const srv = await startTestRedis();
    const c = collector();
    const pc: any = {
      dispatch: c.dispatch,
      getState: () => undefined,
      dispatchEffect() {},
    };
    const p = createRedisPlugin({ url: srv.url + "?protocol=3" });
    p.init!(pc);
    await p.ready();
    p.handle(
      { ...r.hset("h3", { a: "1" }, { replyTo: "x" }), ctx: { rid: "1" } },
      pc,
    );
    await c.next("x");
    p.handle(
      { ...r.cmd(["HGETALL", "h3"], { replyTo: "y" }), ctx: { rid: "1" } },
      pc,
    );
    expect((await c.next("y")).payload).toEqual({ a: "1" }); // RESP3 map
    p.handle({ ...r.hgetall("h3", { replyTo: "z" }), ctx: { rid: "1" } }, pc);
    expect((await c.next("z")).payload).toEqual({ a: "1" });
    p.dispose?.();
    await srv.stop();
  }, 10000);

  it("connect failure with maxAttempts reports CONNECTION", async () => {
    const dead = net.createServer();
    await new Promise<void>((res) => dead.listen(0, "127.0.0.1", res));
    const port = (dead.address() as net.AddressInfo).port;
    await new Promise((res) => dead.close(res));
    const c = collector();
    const pc: any = {
      dispatch: c.dispatch,
      getState: () => undefined,
      dispatchEffect() {},
    };
    const p = createRedisPlugin({
      url: `redis://127.0.0.1:${port}`,
      reconnect: { minMs: 5, maxMs: 10, maxAttempts: 3 },
    });
    p.init!(pc);
    p.handle(
      { ...r.get("x", { replyTo: "ok", onError: "err" }), ctx: { rid: "n" } },
      pc,
    );
    const e = await c.next(["ok", "err"]);
    expect((e.payload as any).code).toBe("CONNECTION");
    p.dispose?.();
  }, 10000);
});
