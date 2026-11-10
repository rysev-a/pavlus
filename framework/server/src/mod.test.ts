import { describe, expect, it } from "vitest";
import * as api from "./mod.ts";
import * as testing from "./testing/mod.ts";

describe("public surface", () => {
  it("has one factory per plugin and one runtime", () => {
    for (const name of [
      "createServerApp",
      "createHttpServerPlugin",
      "createWsServerPlugin",
      "createPostgresPlugin",
      "createRedisPlugin",
      "createFetchPlugin",
      "createTimePlugin",
      "createLogPlugin",
      "createRequestsPlugin",
      "createCryptoPlugin",
      "createPagesPlugin",
    ])
      expect(typeof (api as any)[name], name).toBe("function");
    expect(Object.keys(api).filter((k) => /^create\w+App$/.test(k))).toEqual([
      "createServerApp",
    ]);
  });
  it("has an effector object per plugin and the one reply convention", () => {
    for (const name of [
      "httpEffector",
      "wsEffector",
      "pgEffector",
      "redisEffector",
      "fetchEffector",
      "timeEffector",
      "logEffector",
      "requestsEffector",
      "cryptoEffector",
      "pagesEffector",
    ])
      expect(typeof (api as any)[name], name).toBe("object");
    for (const name of ["reply", "ok", "fail", "deliver", "traceOf", "route"])
      expect(typeof (api as any)[name], name).toBe("function");
    // route-helpers
    expect(typeof api.createFlowFetch).toBe("function");
    expect(typeof api.PagesAPI).toBe("function");
    // multi-process
    expect(typeof api.runCluster).toBe("function");
  });
  it("effectors build the effects the plugins accept", () => {
    expect(api.httpEffector.json({ a: 1 }, 201)).toEqual({
      plugin: "http",
      type: "respond",
      status: 201,
      json: { a: 1 },
    });
    expect(api.httpEffector.sseSend({ n: 1 }, { event: "todo" })).toMatchObject(
      { plugin: "http", type: "sse.send", event: "todo" },
    );
    expect(api.wsEffector.broadcast("room", "hi", "c1")).toEqual({
      plugin: "ws",
      type: "broadcast",
      room: "room",
      data: "hi",
      except: "c1",
    });
    expect(api.wsEffector.send("x")).toEqual({
      plugin: "ws",
      type: "send",
      data: "x",
    });
  });
  it("testing exports the helpers", () => {
    for (const name of [
      "flow",
      "scenario",
      "fakeHttp",
      "fakeWs",
      "request",
      "connectWs",
      "collector",
      "startTestRedis",
    ])
      expect(typeof (testing as any)[name], name).toBe("function");
  });
});
