// @vitest-environment jsdom
import { describe, expect, test } from "vitest";
import type { Message } from "../core/types.ts";
import { createHttpPlugin } from "./http/mod.ts";
import { createWsPlugin, type SocketLike } from "./ws/mod.ts";
import { createRouterPlugin } from "./router/mod.ts";
import { createLoggerPlugin } from "./logger/mod.ts";

function harness() {
  const got: Message[] = [];
  return {
    got,
    ctx: {
      dispatch: (m: Message) => got.push(m),
      getState: () => undefined as never,
      dispatchEffect() {},
    },
  };
}
const tick = () => new Promise((r) => setTimeout(r, 0));

describe("http", () => {
  const response = (data: unknown, ok = true, status = 200) =>
    ({
      ok,
      status,
      statusText: ok ? "OK" : "Nope",
      json: async () => data,
    }) as Response;

  test("settled() waits for every request, including the ones an answer starts", async () => {
    const got: Message[] = [];
    const http = createHttpPlugin({
      fetch: (async (url: string) => {
        await new Promise((r) => setTimeout(r, 5));
        return response(url);
      }) as typeof fetch,
    });
    const req = (id: string, url: string) =>
      http.handle(
        {
          plugin: "http",
          type: "request",
          id,
          url,
          onSuccess: "ok",
          onError: "err",
        },
        ctx,
      );
    // like the core: an answer is a message, which may request more
    const ctx = {
      dispatch: (m: Message) => {
        got.push(m);
        if ((m.payload as { data: string }).data === "/first")
          req("second", "/second");
      },
      getState: () => undefined as never,
      dispatchEffect() {},
    };
    req("first", "/first");
    await http.settled();
    expect(got.map((m) => (m.payload as { data: string }).data)).toEqual([
      "/first",
      "/second",
    ]);
    expect(http.pending()).toEqual([]);
    await http.settled(); // nothing in flight: resolves at once
  });

  test("same id cancels the previous request: its answer is ignored", async () => {
    const { got, ctx } = harness();
    const aborted: boolean[] = [];
    const http = createHttpPlugin({
      fetch: ((url: string, init: RequestInit) =>
        new Promise((resolve) => {
          setTimeout(
            () => {
              aborted.push(!!init.signal?.aborted);
              resolve(response(url));
            },
            url === "/slow" ? 20 : 1,
          );
        })) as typeof fetch,
    });
    const req = (url: string) =>
      http.handle(
        {
          plugin: "http",
          type: "request",
          id: "q",
          url,
          onSuccess: "ok",
          onError: "err",
        },
        ctx,
      );
    req("/slow");
    req("/fast");
    expect(http.pending()).toEqual(["q"]);
    await new Promise((r) => setTimeout(r, 40));
    expect(got).toEqual([
      { id: "ok", payload: { status: 200, data: "/fast" } },
    ]);
    expect(aborted).toEqual([false, true]);
    expect(http.pending()).toEqual([]);
  });

  test("explicit cancel, error status and json body", async () => {
    const { got, ctx } = harness();
    let sent: RequestInit | undefined;
    const http = createHttpPlugin({
      fetch: (async (_u: string, init: RequestInit) => {
        sent = init;
        return response({ msg: "bad" }, false, 422);
      }) as typeof fetch,
    });
    http.handle(
      {
        plugin: "http",
        type: "request",
        id: "a",
        url: "/x",
        method: "POST",
        body: { k: 1 },
        onSuccess: "ok",
        onError: "err",
      },
      ctx,
    );
    await tick();
    expect(sent?.body).toBe('{"k":1}');
    expect((sent?.headers as Record<string, string>)["content-type"]).toBe(
      "application/json",
    );
    expect(got).toEqual([
      {
        id: "err",
        payload: { status: 422, error: "Nope", data: { msg: "bad" } },
      },
    ]);

    got.length = 0;
    http.handle(
      {
        plugin: "http",
        type: "request",
        id: "b",
        url: "/x",
        onSuccess: "ok",
        onError: "err",
      },
      ctx,
    );
    http.handle({ plugin: "http", type: "cancel", id: "b" }, ctx);
    await tick();
    expect(got).toEqual([]);
  });
});

describe("ws", () => {
  function fakeSocket() {
    const s: SocketLike & { sent: string[]; closed: boolean } = {
      sent: [],
      closed: false,
      send(d) {
        this.sent.push(d);
      },
      close() {
        this.closed = true;
      },
      onopen: null,
      onmessage: null,
      onclose: null,
      onerror: null,
    };
    return s;
  }

  test("connect, receive (json parsed), send, reconnect with same id", () => {
    const { got, ctx } = harness();
    const made: ReturnType<typeof fakeSocket>[] = [];
    const ws = createWsPlugin({
      create: () => (made.push(fakeSocket()), made[made.length - 1]),
    });
    ws.handle(
      {
        plugin: "ws",
        type: "connect",
        id: "chat",
        url: "ws://x",
        onOpen: "open",
        onMessage: "msg",
        onClose: "closed",
      },
      ctx,
    );
    made[0].onopen!({});
    made[0].onmessage!({ data: '{"a":1}' });
    made[0].onmessage!({ data: "plain" });
    ws.handle(
      { plugin: "ws", type: "send", id: "chat", data: { hello: true } },
      ctx,
    );
    expect(made[0].sent).toEqual(['{"hello":true}']);
    expect(got).toEqual([
      { id: "open" },
      { id: "msg", payload: { a: 1 } },
      { id: "msg", payload: "plain" },
    ]);

    ws.handle(
      {
        plugin: "ws",
        type: "connect",
        id: "chat",
        url: "ws://y",
        onMessage: "msg",
      },
      ctx,
    );
    expect(made[0].closed).toBe(true);
    expect(ws.connections()).toEqual(["chat"]);
    expect(() =>
      ws.handle({ plugin: "ws", type: "send", id: "none", data: 1 }, ctx),
    ).toThrow();
    ws.dispose!();
    expect(ws.connections()).toEqual([]);
  });
});

describe("router", () => {
  test("navigate pushes history and reports the location", () => {
    const { got, ctx } = harness();
    const router = createRouterPlugin();
    router.handle({ plugin: "router", type: "listen", onChange: "route" }, ctx);
    router.handle(
      { plugin: "router", type: "navigate", url: "/users?x=1#top" },
      ctx,
    );
    expect(got.map((m) => m.payload)).toEqual([
      { path: "/", search: "", hash: "" },
      { path: "/users", search: "?x=1", hash: "#top" },
    ]);
    router.dispose!();
  });
});

describe("logger", () => {
  test("writes to the chosen level", () => {
    const calls: unknown[][] = [];
    const logger = createLoggerPlugin({
      sink: {
        debug() {},
        info() {},
        error() {},
        warn: (...a) => calls.push(a),
      },
    });
    logger.handle(
      {
        plugin: "logger",
        type: "log",
        level: "warn",
        message: "careful",
        data: 1,
      },
      harness().ctx,
    );
    expect(calls).toEqual([["careful", 1]]);
  });
});
