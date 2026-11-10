// (b) The SAME `app` handler, end to end: real sockets, the real local
// Postgres and a real redis-server. Two server instances share the database
// and Redis, like two pods behind a load balancer. Skipped when either is
// unavailable.
import { request as httpRequest } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { connectWs } from "../../src/testing/mod.ts";
import {
  type Instance,
  type Stack,
  signupAndLogin,
  sleep,
  stackAvailable,
  startStack,
  waitFor,
} from "./testkit.ts";

const up = await stackAvailable();

/** A raw Server-Sent Events client. */
function sse(inst: Instance, token: string) {
  const events: { event: string; data: any }[] = [];
  let ended = false;
  const req = httpRequest({
    port: inst.port,
    host: "127.0.0.1",
    path: "/events",
    headers: { authorization: `Bearer ${token}` },
  });
  let buf = "";
  const status = new Promise<number>((resolve) =>
    req.on("response", (res) => {
      resolve(res.statusCode ?? 0);
      res.setEncoding("utf8");
      res.on("data", (chunk: string) => {
        buf += chunk;
        let i: number;
        while ((i = buf.indexOf("\n\n")) >= 0) {
          const block = buf.slice(0, i);
          buf = buf.slice(i + 2);
          const ev = /^event: (.*)$/m.exec(block)?.[1];
          const data = /^data: (.*)$/m.exec(block)?.[1];
          if (ev && data) events.push({ event: ev, data: JSON.parse(data) });
        }
      });
      res.on("end", () => (ended = true));
      res.on("close", () => (ended = true));
    }),
  );
  req.on("error", () => (ended = true));
  req.end();
  return {
    status,
    events,
    get ended() {
      return ended;
    },
    next: async (event: string, ms = 3000) => {
      await waitFor(() => events.some((e) => e.event === event), event, ms);
      return events.splice(
        events.findIndex((e) => e.event === event),
        1,
      )[0]!.data;
    },
    close: () => req.destroy(),
  };
}

describe.skipIf(!up)(
  "todo-api end to end (real sockets, Postgres, Redis)",
  () => {
    let stack: Stack;
    let A: Instance;
    let B: Instance;

    beforeAll(async () => {
      stack = await startStack();
      // two instances at once: the migrations race, the advisory lock serialises
      [A, B] = await Promise.all([stack.start(), stack.start()]);
    }, 30_000);
    afterAll(async () => {
      await stack?.stop();
    }, 30_000);

    /** Nothing is left running on this instance. */
    const settled = async (i: Instance) => {
      await waitFor(
        () =>
          i.server.stats().active === 0 &&
          i.server.stats().timers === 0 &&
          i.pg.metrics().txOpen === 0,
        "instance to settle",
      );
      const h = i.http.stats();
      expect(h.timers).toBe(0);
      expect(h.heartbeats).toBe(0);
      expect(i.pg.metrics().txOpen).toBe(0);
    };

    it("health: live, ready", async () => {
      expect((await A.api("GET", "/healthz")).json).toEqual({ status: "ok" });
      expect((await A.api("GET", "/readyz")).json).toEqual({
        status: "ready",
        checks: { pg: true, redis: true },
      });
    });

    it("signup, login, session, CRUD and the cache, across instances", async () => {
      const creds = { email: "Ann@Example.com", password: "s3cret-passw0rd" };
      const su = await A.api("POST", "/signup", { body: creds });
      expect(su.status).toBe(201);
      expect(su.json).toMatchObject({ user: { email: "ann@example.com" } });
      expect((await B.api("POST", "/signup", { body: creds })).status).toBe(
        409,
      );
      expect(
        (
          await A.api("POST", "/signup", {
            body: { email: "x", password: "1" },
          })
        ).status,
      ).toBe(422);

      const bad = await A.api("POST", "/login", {
        body: { email: "ann@example.com", password: "wrong wrong" },
      });
      const ghost = await A.api("POST", "/login", {
        body: { email: "ghost@example.com", password: "wrong wrong" },
      });
      expect([bad.status, ghost.status]).toEqual([401, 401]);
      expect(bad.json).toEqual(ghost.json); // no user enumeration

      const login = await A.api("POST", "/login", { body: creds });
      expect(login.status).toBe(200);
      const { token } = login.json as { token: string };
      expect(String(login.headers["set-cookie"])).toContain(`sid=${token}`);

      // the session is in Redis with a TTL: instance B accepts it too
      const ttl = await A.redis.client.call(["TTL", `sess:${token}`]);
      expect(Number(ttl)).toBeGreaterThan(3000);
      expect((await B.api("GET", "/me", { token })).json).toMatchObject({
        user: { email: "ann@example.com" },
      });
      // ... and the cookie works as well as the bearer token
      expect(
        (await B.api("GET", "/me", { headers: { cookie: `sid=${token}` } }))
          .status,
      ).toBe(200);
      expect((await A.api("GET", "/me")).status).toBe(401);

      const mk = async (title: string) =>
        (await A.api("POST", "/todos", { token, body: { title } })).json as {
          todo: { id: number; position: number; title: string };
        };
      const t1 = await mk("buy milk");
      const t2 = await mk("write tests");
      const t3 = await mk("ship");
      expect([t1.todo.position, t2.todo.position, t3.todo.position]).toEqual([
        1, 2, 3,
      ]);

      // read-through cache: miss, then hit, a write invalidates
      const l1 = await A.api("GET", "/todos", { token });
      expect(l1.headers["x-cache"]).toBe("miss");
      const l2 = await B.api("GET", "/todos", { token });
      expect(l2.headers["x-cache"]).toBe("hit");
      expect(l2.json).toEqual(l1.json);
      const patch = await B.api("PATCH", `/todos/${t1.todo.id}`, {
        token,
        body: { done: true },
      });
      expect(patch.json).toMatchObject({
        todo: { done: true, title: "buy milk" },
      });
      const l3 = await A.api("GET", "/todos", { token });
      expect(l3.headers["x-cache"]).toBe("miss");
      expect((l3.json as any).todos[0]).toMatchObject({ done: true });

      expect(
        (await A.api("GET", `/todos/${t2.todo.id}`, { token })).status,
      ).toBe(200);
      expect((await A.api("GET", "/todos/99999", { token })).status).toBe(404);
      expect((await A.api("GET", "/todos/abc", { token })).status).toBe(422);
      expect(
        (await A.api("PATCH", `/todos/${t2.todo.id}`, { token, body: {} }))
          .status,
      ).toBe(422);
      expect(
        (await A.api("DELETE", `/todos/${t3.todo.id}`, { token })).status,
      ).toBe(204);
      expect(
        (await A.api("DELETE", `/todos/${t3.todo.id}`, { token })).status,
      ).toBe(404);

      // routing answers for the app: 404 and 405 never reach it
      expect((await A.api("GET", "/nope")).status).toBe(404);
      expect((await A.api("PUT", "/todos", { token })).status).toBe(405);

      // logout kills the session everywhere
      expect((await A.api("POST", "/logout", { token })).status).toBe(204);
      expect((await B.api("GET", "/me", { token })).status).toBe(401);
      await settled(A);
      await settled(B);
    });

    it("reorder is a transaction: renumbers, or rolls back and leaves everything as it was", async () => {
      const ann = await signupAndLogin(A, "reorder-a@example.com");
      const bob = await signupAndLogin(B, "reorder-b@example.com");
      const ids = async (token: string, inst = A) =>
        ((await inst.api("GET", "/todos", { token })).json as any).todos.map(
          (t: any) => t.id,
        );
      const mk = async (token: string, title: string) =>
        (
          (await A.api("POST", "/todos", { token, body: { title } }))
            .json as any
        ).todo.id as number;
      const [a1, a2, a3] = [
        await mk(ann.token, "a1"),
        await mk(ann.token, "a2"),
        await mk(ann.token, "a3"),
      ];
      const b1 = await mk(bob.token, "b1");

      const before = A.pg.metrics();
      const ok = await A.api("POST", "/todos/reorder", {
        token: ann.token,
        body: { ids: [a3, a1, a2] },
      });
      expect(ok.status).toBe(200);
      expect(await ids(ann.token)).toEqual([a3, a1, a2]);
      expect(A.pg.metrics().txCommitted).toBe(before.txCommitted + 1);

      // somebody else's id in the list: rolled back, 404, order untouched
      const mid = A.pg.metrics();
      const foreign = await A.api("POST", "/todos/reorder", {
        token: ann.token,
        body: { ids: [a1, a2, a3, b1] },
      });
      expect(foreign.status).toBe(404);
      expect(foreign.json).toMatchObject({ error: { code: "unknown_todo" } });
      expect(await ids(ann.token)).toEqual([a3, a1, a2]);
      expect(await ids(bob.token, B)).toEqual([b1]);
      const after = A.pg.metrics();
      expect(after.txRolledBack).toBe(mid.txRolledBack + 1);
      expect(after.txCommitted).toBe(mid.txCommitted);
      expect(after.txOpen).toBe(0);

      expect(
        (
          await A.api("POST", "/todos/reorder", {
            token: ann.token,
            body: { ids: [1, 1] },
          })
        ).status,
      ).toBe(422);
      await settled(A);
    });

    it("SSE: a write on instance A reaches a stream held on instance B (Redis pub/sub)", async () => {
      const eve = await signupAndLogin(A, "sse@example.com");
      const other = await signupAndLogin(A, "sse-other@example.com");
      const stream = sse(B, eve.token);
      expect(await stream.status).toBe(200);
      expect(await stream.next("ready")).toEqual({ userId: eve.id });
      expect(B.redis.metrics().subscriptions).toBe(1);

      const made = await A.api("POST", "/todos", {
        token: eve.token,
        body: { title: "from A" },
      });
      const todo = (made.json as any).todo;
      expect(await stream.next("todo.created")).toMatchObject({
        type: "todo.created",
        todo: { id: todo.id, title: "from A" },
      });
      await B.api("PATCH", `/todos/${todo.id}`, {
        token: eve.token,
        body: { done: true },
      });
      expect(await stream.next("todo.updated")).toMatchObject({
        todo: { done: true },
      });
      await A.api("DELETE", `/todos/${todo.id}`, { token: eve.token });
      expect(await stream.next("todo.deleted")).toEqual({
        type: "todo.deleted",
        id: todo.id,
      });

      // somebody else's changes do not leak into this stream
      await A.api("POST", "/todos", {
        token: other.token,
        body: { title: "not yours" },
      });
      await sleep(100);
      expect(stream.events).toEqual([]);

      // unauthenticated streams are refused
      expect((await A.api("GET", "/events")).status).toBe(401);

      // the client leaves: subscription, timers and heartbeats are released
      stream.close();
      await waitFor(() => B.redis.metrics().subscriptions === 0, "unsubscribe");
      await settled(B);
    });

    it("websocket chat: join, history from Postgres, broadcast across the room", async () => {
      const u1 = await signupAndLogin(A, "chat1@example.com");
      const u2 = await signupAndLogin(B, "chat2@example.com");
      const q = (t: string, room = "lobby") =>
        `/ws/chat?room=${room}&token=${t}`;

      const c1 = await connectWs({ port: A.port }, q(u1.token));
      expect(JSON.parse((await c1.next()).data as string)).toEqual({
        type: "history",
        messages: [],
      });
      c1.sendText(JSON.stringify({ text: "hello room" }));
      const echoed = JSON.parse((await c1.next()).data as string);
      expect(echoed).toMatchObject({
        type: "message",
        message: { email: "chat1@example.com", text: "hello room" },
      });

      // a second user on the OTHER instance gets history from Postgres
      const c2 = await connectWs({ port: B.port }, q(u2.token));
      const hist = JSON.parse((await c2.next()).data as string);
      expect(hist.messages).toHaveLength(1);
      expect(hist.messages[0].text).toBe("hello room");
      // in-room broadcast reaches clients of the same instance only (ws rooms
      // are per process); here both are checked on their own instance
      c2.sendText(JSON.stringify({ text: "hi from B" }));
      expect(JSON.parse((await c2.next()).data as string).message.text).toBe(
        "hi from B",
      );

      // another room is a different history; bad frames and bad tokens
      const other = await connectWs({ port: A.port }, q(u1.token, "other"));
      expect(JSON.parse((await other.next()).data as string).messages).toEqual(
        [],
      );
      c1.sendText("not json");
      expect(JSON.parse((await c1.next()).data as string)).toMatchObject({
        type: "error",
      });
      const stranger = await connectWs({ port: A.port }, q("nope"));
      await stranger.closed;
      expect(stranger.closeFrame?.code).toBe(4401);

      // two clients on the same instance see each other
      const c3 = await connectWs({ port: A.port }, q(u2.token));
      await c3.next(); // history (2 messages now)
      expect(JSON.parse((await c1.next()).data as string)).toEqual({
        type: "joined",
        user: "chat2@example.com",
      });
      c3.sendText(JSON.stringify({ text: "same box" }));
      for (const c of [c1, c3])
        expect(JSON.parse((await c.next()).data as string).message.text).toBe(
          "same box",
        );
      c3.close();
      expect(JSON.parse((await c1.next()).data as string)).toEqual({
        type: "left",
        user: "chat2@example.com",
      });

      for (const c of [c1, c2, other]) c.close();
      await waitFor(
        () => A.ws.stats().connections + B.ws.stats().connections === 0,
        "ws closed",
      );
      await settled(A);
      await settled(B);
    });

    it("50 interleaved logged-in clients each see only their own todos", async () => {
      const N = 50;
      const results = await Promise.all(
        Array.from({ length: N }, async (_, i) => {
          const inst = i % 2 ? A : B; // sessions and cache are shared via Redis
          const { token } = await signupAndLogin(inst, `c${i}@example.com`);
          for (let j = 0; j < 4; j++) {
            const r = await inst.api("POST", "/todos", {
              token,
              body: { title: `u${i}-t${j}` },
            });
            expect(r.status).toBe(201);
          }
          const other = i % 2 ? B : A;
          const l = (await other.api("GET", "/todos", { token })).json as {
            todos: { title: string; position: number }[];
          };
          const again = (await inst.api("GET", "/todos", { token }))
            .json as typeof l;
          return {
            i,
            titles: l.todos.map((t) => t.title),
            again: again.todos.map((t) => t.title),
          };
        }),
      );
      for (const { i, titles, again } of results) {
        expect(titles).toEqual([0, 1, 2, 3].map((j) => `u${i}-t${j}`));
        expect(again).toEqual(titles);
      }
      await settled(A);
      await settled(B);
      // the concurrency shows in the numbers: no rid leaked, no discarded replies we did not expect
      expect(A.server.stats().errors).toBe(0);
      expect(B.server.stats().errors).toBe(0);
    }, 30_000);

    it("a client that hangs up mid-query cancels the query; no leaked tx or timers", async () => {
      const before = A.pg.metrics();
      const aborted = A.http.stats().aborted;
      const req = httpRequest({
        port: A.port,
        host: "127.0.0.1",
        path: "/slow?ms=20000",
      });
      req.on("error", () => {});
      req.end();
      await waitFor(
        () => A.pg.metrics().queries > before.queries,
        "query start",
      );
      await waitFor(
        async () =>
          (
            await stack.admin.query(
              "select count(*)::int n from pg_stat_activity where query like '%pg_sleep%' and state = 'active' and pid <> pg_backend_pid()",
            )
          ).rows[0].n === 1,
        "pg_sleep running",
      );
      req.destroy(); // the client goes away

      await waitFor(
        () => A.pg.metrics().cancelled > before.cancelled,
        "query cancelled",
      );
      await waitFor(() => A.http.stats().aborted > aborted, "abort seen");
      await settled(A);
      const running = await stack.admin.query(
        "select count(*)::int n from pg_stat_activity where query like '%pg_sleep%' and state = 'active' and pid <> pg_backend_pid()",
      );
      expect(running.rows[0].n).toBe(0); // Postgres really stopped sleeping
      expect(A.server.stats().cancels).toBeGreaterThan(0);
      // and the app saw it: a structured log line with the rid
      expect(
        stack.logs.some((l) => l.msg === "client went away" && l.rid),
      ).toBe(true);
    });

    it("per-IP rate limiting in Redis: INCR + EXPIRE, 429 with Retry-After, per client", async () => {
      const R = await stack.start({
        trustProxy: 1,
        config: { rateLimit: { limit: 3, windowSec: 30 } },
      });
      const hit = (ip: string) =>
        R.api("GET", "/me", { headers: { "x-forwarded-for": ip } });
      const codes: number[] = [];
      for (let i = 0; i < 5; i++)
        codes.push((await hit("198.51.100.1")).status);
      expect(codes).toEqual([401, 401, 401, 429, 429]); // 401: counted, then refused by auth
      const limited = await hit("198.51.100.1");
      expect(limited.json).toMatchObject({ error: { code: "rate_limited" } });
      const retry = Number(limited.headers["retry-after"]);
      expect(retry).toBeGreaterThan(0);
      expect(retry).toBeLessThanOrEqual(30);
      // the counter lives in Redis and carries a TTL
      expect(
        Number(await R.redis.client.call(["GET", "rl:198.51.100.1"])),
      ).toBeGreaterThanOrEqual(6);
      expect(
        Number(await R.redis.client.call(["TTL", "rl:198.51.100.1"])),
      ).toBeGreaterThan(0);
      // another client is unaffected; health checks are not counted at all
      expect((await hit("198.51.100.2")).status).toBe(401);
      for (let i = 0; i < 6; i++)
        expect(
          (
            await R.api("GET", "/healthz", {
              headers: { "x-forwarded-for": "198.51.100.1" },
            })
          ).status,
        ).toBe(200);
    });

    it("request timeout: the deadline answers 504 and cancels the query", async () => {
      const T = await stack.start({ requestTimeoutMs: 300 });
      const t0 = Date.now();
      const r = await T.api("GET", "/slow?ms=20000");
      expect(r.status).toBe(504);
      expect(r.json).toMatchObject({ error: { code: "timeout" } });
      expect(Date.now() - t0).toBeLessThan(2000);
      await waitFor(
        () => T.pg.metrics().timeouts + T.pg.metrics().cancelled > 0,
        "query cancelled",
      );
      await settled(T);
      // a fast request on the same instance still works
      expect((await T.api("GET", "/slow?ms=10")).json).toEqual({ sleptMs: 10 });
    });

    it("graceful shutdown: drain -> not ready, streams end, in-flight finishes, then closed", async () => {
      const D = await stack.start();
      const user = await signupAndLogin(D, "drain@example.com");
      const stream = sse(D, user.token);
      await stream.next("ready");
      const inflight = D.api("GET", "/slow?ms=500"); // still running when we stop

      await sleep(100);
      D.drain(); // what main.ts does on SIGTERM
      const ready = await D.api("GET", "/readyz");
      expect(ready.status).toBe(503);
      expect(ready.json).toMatchObject({ error: { code: "draining" } });
      await waitFor(() => stream.ended, "stream to end");

      const stopping = D.server.shutdown({ timeoutMs: 5000 });
      expect((await inflight).json).toEqual({ sleptMs: 500 }); // not cut off
      await stopping;
      expect(D.server.stats().forced).toBe(0);
      expect(D.server.stats().active).toBe(0);
      await expect(D.api("GET", "/healthz")).rejects.toThrow(); // listener is gone
    });

    it("structured logs: every line of a request carries its rid", async () => {
      const r = await A.api("POST", "/signup", {
        body: { email: "logs@example.com", password: "long enough pw" },
      });
      const rid = String(r.headers["x-request-id"]);
      const mine = stack.logs.filter((l) => l.rid === rid);
      expect(mine.map((l) => l.msg)).toEqual(["signup", "response"]);
      expect(mine[1]).toMatchObject({ route: "auth.signup", status: 201 });
      // the password never reaches a log line
      expect(JSON.stringify(stack.logs)).not.toContain("long enough pw");
    });
  },
);
