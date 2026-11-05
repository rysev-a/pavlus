import { connect } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import type { Effect, Message, Plugin } from "@service-laboratory/pavlus";
import { reply } from "../../ctx.ts";
import { createServerApp, type ServerPlugin } from "../../runtime.ts";
import { connectWs } from "../../testing/net.ts";
import { createHttpServerPlugin } from "../http/mod.ts";
import { createWsServerPlugin, acceptKey, type WsOptions } from "./mod.ts";
import { encodeFrame, OP } from "./frame.ts";

type Handler = (m: Message, state: any) => Effect[];
const ws = (e: Record<string, unknown>): Effect =>
  ({ plugin: "ws", type: e.type as string, ...e }) as Effect;

const open: { shutdown(): Promise<unknown> }[] = [];
afterEach(async () => {
  await Promise.all(open.splice(0).map((a) => a.shutdown()));
});

async function boot(
  app: Handler,
  wsOpts: Partial<WsOptions> = {},
  extra: Plugin<any, any>[] = [],
  log?: Message[],
) {
  const http = createHttpServerPlugin({ port: 0, host: "127.0.0.1" });
  const wsp = createWsServerPlugin({ http, heartbeatMs: 0, ...wsOpts });
  const server = createServerApp({
    plugins: [http, wsp, ...extra],
    onError: () => {},
    app: (m, s) => {
      log?.push(m);
      return app(m, s);
    },
  });
  open.push(server);
  await http.listening();
  return { http, wsp, server };
}

async function until(cond: () => boolean, ms = 3000): Promise<void> {
  const t0 = Date.now();
  while (!cond()) {
    if (Date.now() - t0 > ms) throw new Error("until: timed out");
    await new Promise((r) => setTimeout(r, 5));
  }
}

function delayPlugin() {
  const p: ServerPlugin = {
    name: "delay",
    handle(effect, ctx) {
      setTimeout(
        () =>
          ctx.dispatch(
            reply(effect, {
              id: effect.replyTo as string,
              payload: effect.value,
            }),
          ),
        effect.ms as number,
      );
    },
  };
  return p;
}

describe("handshake", () => {
  it("computes the RFC example accept key", () => {
    expect(acceptKey("dGhlIHNhbXBsZSBub25jZQ==")).toBe(
      "s3pPLMBiTxaQ9kYGzzhZRbK+xOo=",
    );
  });
  it("upgrades, passes path/query/headers to ws.open and picks a subprotocol", async () => {
    const log: Message[] = [];
    const { http } = await boot(
      () => [],
      { subprotocols: ["chat.v2", "chat.v1"] },
      [],
      log,
    );
    const c = await connectWs(http, "/chat?room=lobby&x=1", {
      protocols: ["chat.v1", "other"],
      headers: { "x-t": "1" },
    });
    expect(c.headers["sec-websocket-protocol"]).toBe("chat.v1");
    await until(() => log.some((m) => m.id === "ws.open"));
    const open = log.find((m) => m.id === "ws.open")!;
    expect(open.payload).toMatchObject({
      path: "/chat",
      query: { room: "lobby", x: "1" },
      subprotocol: "chat.v1",
    });
    expect((open.payload as any).headers["x-t"]).toBe("1");
    expect(open.ctx).toMatchObject({ conn: "ws" });
    expect(typeof open.ctx!.connId).toBe("string");
    c.socket.destroy();
  });
  it("refuses bad handshakes", async () => {
    const { http } = await boot(() => [], {
      origins: ["https://app.example"],
      path: "/ws",
      verify: (r) => (r.headers["x-deny"] ? 401 : true),
    });
    await expect(
      connectWs(http, "/ws", { headers: { origin: "https://evil.example" } }),
    ).rejects.toMatchObject({ status: 403 });
    await expect(connectWs(http, "/other")).rejects.toMatchObject({
      status: 404,
    });
    await expect(
      connectWs(http, "/ws", { headers: { "x-deny": "1" } }),
    ).rejects.toMatchObject({ status: 401 });
    await expect(
      connectWs(http, "/ws", { headers: { "sec-websocket-version": "8" } }),
    ).rejects.toMatchObject({ status: 426 });
    await expect(
      connectWs(http, "/ws", { headers: { "sec-websocket-key": "short" } }),
    ).rejects.toMatchObject({ status: 400 });
    const ok = await connectWs(http, "/ws", {
      headers: { origin: "https://app.example" },
    });
    ok.socket.destroy();
    // no Origin (non-browser client) is allowed
    (await connectWs(http, "/ws")).socket.destroy();
  });
  it("max connections", async () => {
    const { http } = await boot(() => [], { maxConnections: 1 });
    const a = await connectWs(http);
    await expect(connectWs(http)).rejects.toMatchObject({ status: 503 });
    a.socket.destroy();
  });
});

describe("messages", () => {
  it("echoes text and binary, with a fresh rid per frame and the connId in ctx", async () => {
    const log: Message[] = [];
    const { http } = await boot(
      (m) => {
        if (m.id !== "ws.message") return [];
        const p = m.payload as any;
        return [
          ws({ type: "send", data: p.binary ? p.data : `echo:${p.data}` }),
        ];
      },
      {},
      [],
      log,
    );
    const c = await connectWs(http);
    c.sendText("a");
    c.sendText("b");
    c.sendBinary(Buffer.from([1, 2, 3]));
    expect(await c.next()).toEqual({ data: "echo:a", binary: false });
    expect(await c.next()).toEqual({ data: "echo:b", binary: false });
    const bin = await c.next();
    expect(bin.binary).toBe(true);
    expect([...(bin.data as Buffer)]).toEqual([1, 2, 3]);
    const msgs = log.filter((m) => m.id === "ws.message");
    expect(new Set(msgs.map((m) => m.ctx!.rid)).size).toBe(3);
    expect(new Set(msgs.map((m) => m.ctx!.connId)).size).toBe(1);
    c.socket.destroy();
  });
  it("fragmented messages arrive whole; JSON data is serialised", async () => {
    const { http } = await boot((m) =>
      m.id === "ws.message"
        ? [ws({ type: "send", data: { got: (m.payload as any).data } })]
        : [],
    );
    const c = await connectWs(http);
    c.sendFragmented(["he", "llo ", "wörld"]);
    expect(JSON.parse((await c.next()).data as string)).toEqual({
      got: "hello wörld",
    });
    c.socket.destroy();
  });
  it("answers pings with pongs; the server's ping gets a pong back", async () => {
    const { http, wsp } = await boot((m) =>
      m.id === "ws.message" ? [ws({ type: "ping", data: "srv" })] : [],
    );
    const c = await connectWs(http);
    c.ping("hi");
    await until(() => c.pongs.length === 1);
    expect(c.pongs[0]!.toString()).toBe("hi");
    c.sendText("go");
    await until(() => c.pings.length === 1);
    expect(c.pings[0]!.toString()).toBe("srv");
    c.socket.destroy();
    await until(() => wsp.stats().connections === 0);
  });
  it("an async reply to a frame lands on the right connection", async () => {
    const delay = delayPlugin();
    const { http, server } = await boot(
      (m) => {
        if (m.id === "ws.message")
          return [
            {
              plugin: "delay",
              type: "later",
              ms: 1 + Math.floor(Math.random() * 30),
              replyTo: "answer",
              value: (m.payload as any).data,
            },
          ];
        if (m.id === "answer")
          return [
            ws({ type: "send", data: `to:${m.ctx!.connId}:${m.payload}` }),
          ];
        return [];
      },
      {},
      [delay],
    );
    const clients = await Promise.all(
      Array.from({ length: 20 }, () => connectWs(http)),
    );
    clients.forEach((c, i) => {
      for (let k = 0; k < 5; k++) c.sendText(`c${i}m${k}`);
    });
    for (const [i, c] of clients.entries()) {
      const got: string[] = [];
      for (let k = 0; k < 5; k++)
        got.push(((await c.next()).data as string).split(":")[2]!);
      expect(got.sort()).toEqual([0, 1, 2, 3, 4].map((k) => `c${i}m${k}`));
    }
    clients.forEach((c) => c.socket.destroy());
    await until(() => server.stats().active === 0);
  });
  it("too big a message closes with 1009; a protocol error with 1002", async () => {
    const { http, wsp } = await boot(() => [], { maxPayload: 100 });
    const a = await connectWs(http);
    a.sendText("x".repeat(500));
    await a.closed;
    expect(a.closeFrame?.code).toBe(1009);
    const b = await connectWs(http);
    b.raw(encodeFrame({ opcode: OP.text, payload: Buffer.from("unmasked") })); // clients must mask
    await b.closed;
    expect(b.closeFrame?.code).toBe(1002);
    await until(() => wsp.stats().connections === 0);
    expect(wsp.stats().protocolErrors).toBe(2);
  });
});

describe("rooms", () => {
  it("join / broadcast with except / leave, and cleanup on close", async () => {
    const log: Message[] = [];
    const { http, wsp } = await boot(
      (m) => {
        const cid = m.ctx?.connId as string;
        if (m.id === "ws.open")
          return [ws({ type: "join", room: (m.payload as any).query.room })];
        if (m.id === "ws.message") {
          const d = (m.payload as any).data as string;
          if (d === "leave") return [ws({ type: "leave", room: "a" })];
          return [
            ws({
              type: "broadcast",
              room: "a",
              data: `${cid.slice(0, 3)}:${d}`,
              except: cid,
            }),
          ];
        }
        return [];
      },
      {},
      [],
      log,
    );
    const a1 = await connectWs(http, "/?room=a");
    const a2 = await connectWs(http, "/?room=a");
    const b1 = await connectWs(http, "/?room=b");
    await until(
      () => wsp.members("a").length === 2 && wsp.members("b").length === 1,
    );
    a1.sendText("hi");
    expect((await a2.next()).data).toMatch(/:hi$/);
    // sender excluded, other room untouched
    await new Promise((r) => setTimeout(r, 30));
    expect(a1.messages).toHaveLength(0);
    expect(b1.messages).toHaveLength(0);
    a2.sendText("leave");
    await until(() => wsp.members("a").length === 1);
    a1.sendText("again");
    await new Promise((r) => setTimeout(r, 30));
    expect(a2.messages).toHaveLength(0);
    a1.socket.destroy();
    a2.socket.destroy();
    b1.socket.destroy();
    await until(() => wsp.stats().connections === 0);
    expect(wsp.stats().rooms).toBe(0);
    expect(wsp.stats().timers).toBe(0);
  });
  it("broadcast without a room reaches everyone", async () => {
    const { http, wsp } = await boot((m) =>
      m.id === "ws.message" ? [ws({ type: "broadcast", data: "all" })] : [],
    );
    const cs = await Promise.all([
      connectWs(http),
      connectWs(http),
      connectWs(http),
    ]);
    await until(() => wsp.connections().length === 3);
    cs[0]!.sendText("x");
    for (const c of cs) expect((await c.next()).data).toBe("all");
    cs.forEach((c) => c.socket.destroy());
  });
});

describe("closing", () => {
  it("client close handshake -> ws.close message with code and reason", async () => {
    const log: Message[] = [];
    const { http, wsp } = await boot(() => [], {}, [], log);
    const c = await connectWs(http);
    c.close(4001, "bye");
    await c.closed;
    expect(c.closeFrame?.code).toBe(4001);
    await until(() => log.some((m) => m.id === "ws.close"));
    expect(log.find((m) => m.id === "ws.close")!.payload).toEqual({
      code: 4001,
      reason: "bye",
      clean: true,
    });
    expect(wsp.stats()).toMatchObject({ connections: 0, timers: 0 });
  });
  it("ws.close effect: the server closes with its code", async () => {
    const log: Message[] = [];
    const { http, wsp } = await boot(
      (m) =>
        m.id === "ws.open"
          ? [ws({ type: "close", code: 1008, reason: "no auth" })]
          : [],
      {},
      [],
      log,
    );
    const c = await connectWs(http);
    await c.closed;
    expect(c.closeFrame).toEqual({ code: 1008, reason: "no auth" });
    await until(() => log.some((m) => m.id === "ws.close"));
    expect(wsp.stats()).toMatchObject({ connections: 0, timers: 0 });
  });
  it("a vanished peer is reported as 1006", async () => {
    const log: Message[] = [];
    const { http } = await boot(() => [], {}, [], log);
    const c = await connectWs(http);
    c.socket.destroy();
    await until(() => log.some((m) => m.id === "ws.close"));
    expect(log.find((m) => m.id === "ws.close")!.payload as any).toMatchObject({
      code: 1006,
      clean: false,
    });
  });
  it("closing handshake that the peer ignores is cut after the timeout", async () => {
    const { http, wsp } = await boot(
      (m) => (m.id === "ws.message" ? [ws({ type: "close", code: 1000 })] : []),
      { closeTimeoutMs: 60 },
    );
    const c = await connectWs(http);
    c.sendText("close me");
    await c.closed; // client never answers the close frame
    await until(() => wsp.stats().timers === 0);
  });
  it("heartbeat culls connections that stop answering pings", async () => {
    const log: Message[] = [];
    const { http, wsp } = await boot(() => [], { heartbeatMs: 40 }, [], log);
    const alive = await connectWs(http); // answers pings
    const dead = await connectWs(http, "/", { autoPong: false });
    expect(wsp.stats().timers).toBe(1);
    await dead.closed;
    expect(wsp.stats().culled).toBe(1);
    await until(() => wsp.connections().length === 1);
    expect(alive.pings.length).toBeGreaterThan(0);
    alive.socket.destroy();
    await until(() => wsp.stats().connections === 0);
    expect(wsp.stats().timers).toBe(0); // the interval stops with the last connection
    expect(log.filter((m) => m.id === "ws.close")).toHaveLength(2);
  });
});

describe("backpressure", () => {
  const flood =
    (n: number): Handler =>
    (m) =>
      m.id === "ws.open"
        ? Array.from({ length: n }, () =>
            ws({ type: "send", data: Buffer.alloc(256 * 1024, 1) }),
          )
        : [];
  it("close policy: a client that does not read gets 1013 and is dropped", async () => {
    const log: Message[] = [];
    const { http, wsp } = await boot(
      flood(64),
      {
        backpressure: { maxBufferedBytes: 1024 * 1024, policy: "close" },
        closeTimeoutMs: 100,
      },
      [],
      log,
    );
    const sock = connect(http.port, "127.0.0.1");
    sock.pause();
    await new Promise((r) => sock.on("connect", r));
    sock.write(
      "GET / HTTP/1.1\r\nHost: x\r\nConnection: Upgrade\r\nUpgrade: websocket\r\nSec-WebSocket-Version: 13\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n\r\n",
    );
    await until(() => wsp.stats().dropped > 0);
    await until(() => wsp.stats().connections === 0, 4000);
    sock.destroy();
    expect(log.some((m) => m.id === "ws.close")).toBe(true);
    expect(wsp.stats().timers).toBe(0);
  });
  it("drop policy: messages are dropped, the connection stays", async () => {
    const { http, wsp } = await boot(flood(64), {
      backpressure: { maxBufferedBytes: 1024 * 1024, policy: "drop" },
    });
    const sock = connect(http.port, "127.0.0.1");
    sock.pause();
    await new Promise((r) => sock.on("connect", r));
    sock.write(
      "GET / HTTP/1.1\r\nHost: x\r\nConnection: Upgrade\r\nUpgrade: websocket\r\nSec-WebSocket-Version: 13\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n\r\n",
    );
    await until(() => wsp.stats().dropped > 0);
    expect(wsp.stats().connections).toBe(1);
    sock.destroy();
    await until(() => wsp.stats().connections === 0);
  });
});

describe("shutdown", () => {
  it("closes every websocket with 1001 and leaves nothing running", async () => {
    const { http, wsp, server } = await boot(() => []);
    const cs = await Promise.all([connectWs(http), connectWs(http)]);
    await until(() => wsp.connections().length === 2);
    cs.forEach((c) => c.socket.on("data", () => {}));
    // clients answer the close frame like a real client
    cs.forEach((c) => c.socket.once("data", () => c.close(1000)));
    await server.shutdown({ timeoutMs: 2000 });
    for (const c of cs) {
      await c.closed;
      expect(c.closeFrame?.code).toBe(1001);
    }
    expect(wsp.stats()).toMatchObject({ connections: 0, timers: 0, rooms: 0 });
    expect(server.stats()).toMatchObject({ active: 0, timers: 0 });
    expect(http.server.listening).toBe(false);
    expect(http.server.listenerCount("upgrade")).toBe(0);
  });
});
