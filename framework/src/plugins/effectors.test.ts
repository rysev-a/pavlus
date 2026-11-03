// @vitest-environment jsdom
import { describe, expect, test } from "vitest";
import type { Message } from "../core/types.ts";
import { storeEffector as store } from "./store/helpers.ts";
import { httpEffector as http } from "./http/helpers.ts";
import { timeEffector as time } from "./time/helpers.ts";
import { loggerEffector as log } from "./logger/helpers.ts";
import { wsEffector as ws } from "./ws/helpers.ts";
import { routerEffector as router } from "./router/helpers.ts";
import { domEffector as dom } from "./dom/helpers.ts";
import { createStorePlugin } from "./store/mod.ts";
import { createTimePlugin } from "./time/mod.ts";
import { createHttpPlugin } from "./http/mod.ts";
import { createLoggerPlugin } from "./logger/mod.ts";
import { createWsPlugin, type SocketLike } from "./ws/mod.ts";
import { createRouterPlugin } from "./router/mod.ts";
import { createDomPlugin } from "./dom/mod.ts";

const view = { render: () => [], diff: () => [] };

describe("effectors build the effects the plugins document", () => {
  test("store", () => {
    expect(store.set("a.b", 1)).toEqual({
      plugin: "store",
      type: "set",
      path: "a.b",
      value: 1,
    });
    expect(store.merge(["a"], { x: 1 })).toEqual({
      plugin: "store",
      type: "merge",
      path: ["a"],
      value: { x: 1 },
    });
    expect(store.remove("a")).toEqual({
      plugin: "store",
      type: "remove",
      path: "a",
    });
    expect(store.undo()).toEqual({ plugin: "store", type: "undo" });
    expect(store.undo(3)).toEqual({ plugin: "store", type: "undo", steps: 3 });
    expect(store.restoreTo(5)).toEqual({
      plugin: "store",
      type: "restoreTo",
      timestamp: 5,
    });
  });

  test("http", () => {
    expect(
      http.request({
        id: "u",
        url: "/u",
        onSuccess: "ok",
        onError: "bad",
        method: "POST",
        body: { a: 1 },
      }),
    ).toEqual({
      plugin: "http",
      type: "request",
      id: "u",
      url: "/u",
      onSuccess: "ok",
      onError: "bad",
      method: "POST",
      body: { a: 1 },
    });
    expect(http.cancel("u")).toEqual({
      plugin: "http",
      type: "cancel",
      id: "u",
    });
  });

  test("time", () => {
    expect(time.now("t")).toEqual({
      plugin: "time",
      type: "now",
      replyTo: "t",
    });
    expect(time.setTimeout("s", 300, "fire")).toEqual({
      plugin: "time",
      type: "setTimeout",
      id: "s",
      ms: 300,
      replyTo: "fire",
    });
    expect(time.setTimeout("s", 300, "fire", "q")).toMatchObject({
      payload: "q",
    });
    expect(time.setInterval("i", 10, "tick", 0)).toEqual({
      plugin: "time",
      type: "setInterval",
      id: "i",
      ms: 10,
      replyTo: "tick",
      payload: 0,
    });
    expect(time.cancel("s")).toEqual({
      plugin: "time",
      type: "cancel",
      id: "s",
    });
    expect(time.cancelAll()).toEqual({ plugin: "time", type: "cancelAll" });
  });

  test("logger", () => {
    expect(log.info("hi")).toEqual({
      plugin: "logger",
      type: "log",
      level: "info",
      message: "hi",
    });
    expect(log.error("bad", { code: 1 })).toEqual({
      plugin: "logger",
      type: "log",
      level: "error",
      message: "bad",
      data: { code: 1 },
    });
    expect(log.log("warn", "w").level).toBe("warn");
    expect(
      ["debug", "info", "warn", "error"].map(
        (l) => log[l as "debug"]("m").level,
      ),
    ).toEqual(["debug", "info", "warn", "error"]);
  });

  test("ws", () => {
    expect(ws.connect({ id: "c", url: "wss://x", onMessage: "got" })).toEqual({
      plugin: "ws",
      type: "connect",
      id: "c",
      url: "wss://x",
      onMessage: "got",
    });
    expect(ws.send("c", { a: 1 })).toEqual({
      plugin: "ws",
      type: "send",
      id: "c",
      data: { a: 1 },
    });
    expect(ws.close("c")).toEqual({ plugin: "ws", type: "close", id: "c" });
    expect(ws.close("c", 1000, "bye")).toEqual({
      plugin: "ws",
      type: "close",
      id: "c",
      code: 1000,
      reason: "bye",
    });
  });

  test("router", () => {
    expect(router.listen("route")).toEqual({
      plugin: "router",
      type: "listen",
      onChange: "route",
    });
    expect(router.navigate("/x")).toEqual({
      plugin: "router",
      type: "navigate",
      url: "/x",
    });
    expect(router.navigate("/x", { replace: true })).toEqual({
      plugin: "router",
      type: "navigate",
      url: "/x",
      replace: true,
    });
    expect(router.back()).toEqual({ plugin: "router", type: "back" });
    expect(router.forward()).toEqual({ plugin: "router", type: "forward" });
  });

  test("dom", () => {
    expect(dom.mount("#app", view)).toEqual({
      plugin: "dom",
      type: "mount",
      target: "#app",
      view,
    });
    expect(dom.mount("#app", view, { onMounted: "ready" })).toMatchObject({
      onMounted: "ready",
    });
    expect(dom.unmount("#app")).toEqual({
      plugin: "dom",
      type: "unmount",
      target: "#app",
    });
    expect(dom.focus("input")).toEqual({
      plugin: "dom",
      type: "focus",
      selector: "input",
    });
    expect(dom.blur("input")).toEqual({
      plugin: "dom",
      type: "blur",
      selector: "input",
    });
  });
});

describe("the plugins accept what the effectors build", () => {
  const harness = () => {
    const got: Message[] = [];
    return {
      got,
      ctx: {
        dispatch: (m: Message) => got.push(m),
        getState: () => undefined as never,
        dispatchEffect() {},
      },
    };
  };

  test("store", () => {
    const s = createStorePlugin<Record<string, unknown>>({ n: 1 });
    const { ctx } = harness();
    s.handle(store.set("n", 2), ctx);
    s.handle(store.merge("o", { a: 1 }), ctx);
    s.handle(store.remove("n"), ctx);
    expect(s.getState()).toEqual({ o: { a: 1 } });
    s.handle(store.undo(2), ctx);
    expect(s.getState()).toEqual({ n: 2 });
  });

  test("time", () => {
    const { got, ctx } = harness();
    const timers: (() => void)[] = [];
    const t = createTimePlugin({
      setTimeout: (fn) => (timers.push(fn), timers.length),
      clearTimeout: () => {},
      now: () => 42,
    });
    t.handle(time.setTimeout("s", 5, "fire", "q"), ctx);
    t.handle(time.now("now"), ctx);
    timers[0]();
    expect(got).toEqual([
      { id: "now", payload: 42 },
      { id: "fire", payload: "q" },
    ]);
    t.handle(time.setTimeout("again", 5, "fire"), ctx);
    t.handle(time.cancel("again"), ctx);
    expect(t.active()).toEqual([]);
  });

  test("http", async () => {
    const { got, ctx } = harness();
    const h = createHttpPlugin({
      fetch: (async () => ({
        ok: true,
        status: 200,
        statusText: "OK",
        json: async () => ({ hi: 1 }),
      })) as unknown as typeof fetch,
    });
    h.handle(
      http.request({ id: "r", url: "/r", onSuccess: "ok", onError: "bad" }),
      ctx,
    );
    await new Promise((r) => setTimeout(r, 0));
    expect(got).toEqual([
      { id: "ok", payload: { status: 200, data: { hi: 1 } } },
    ]);
    h.handle(http.cancel("r"), ctx);
  });

  test("logger", () => {
    const calls: unknown[][] = [];
    const l = createLoggerPlugin({
      sink: {
        debug() {},
        info() {},
        error() {},
        warn: (...a) => calls.push(a),
      },
    });
    l.handle(log.warn("careful", 1), harness().ctx);
    expect(calls).toEqual([["careful", 1]]);
  });

  test("ws", () => {
    const { ctx } = harness();
    const sent: string[] = [];
    const socket: SocketLike = {
      send: (d) => sent.push(d),
      close() {},
      onopen: null,
      onmessage: null,
      onclose: null,
      onerror: null,
    };
    const w = createWsPlugin({ create: () => socket });
    w.handle(ws.connect({ id: "c", url: "x", onMessage: "m" }), ctx);
    w.handle(ws.send("c", { a: 1 }), ctx);
    expect(sent).toEqual(['{"a":1}']);
    w.handle(ws.close("c"), ctx);
    w.dispose!();
  });

  test("router", () => {
    const { got, ctx } = harness();
    const r = createRouterPlugin();
    r.handle(router.listen("route"), ctx);
    r.handle(router.navigate("/users#top", { replace: true }), ctx);
    expect(got.map((m) => m.payload)).toEqual([
      { path: "/", search: "", hash: "" },
      { path: "/users", search: "", hash: "#top" },
    ]);
    r.dispose!();
  });

  test("dom", () => {
    document.body.innerHTML = `<div id="app"></div><input id="name" />`;
    const { got, ctx } = harness();
    const d = createDomPlugin();
    d.init!(ctx);
    const state = {};
    const c = { ...ctx, getState: () => state as never };
    d.handle(
      dom.mount(
        "#app",
        { render: () => [{ t: "text", text: "hi" }], diff: () => [] },
        { onMounted: "ready" },
      ),
      c,
    );
    expect(document.querySelector("#app")?.textContent).toBe("hi");
    expect(got).toEqual([{ id: "ready" }]);
    d.handle(dom.focus("#name"), c);
    expect(document.activeElement?.id).toBe("name");
    d.handle(dom.blur("#name"), c);
    d.handle(dom.unmount("#app"), c);
    expect(document.querySelector("#app")?.textContent).toBe("");
  });
});
