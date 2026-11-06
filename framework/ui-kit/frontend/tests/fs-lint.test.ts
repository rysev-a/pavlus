import { describe, expect, test } from "vitest";
import {
  RULES,
  counts,
  lint,
  lintCached,
} from "../templates/flow-studio/lint.ts";
import { DEMOS } from "../templates/flow-studio/demos.ts";
import {
  type Model,
  removeEdge,
  removeNode,
  updateNode,
} from "../templates/flow-studio/model.ts";
import { Kit, edgeOf, ping } from "./fs-kit.ts";

const rules = (m: Model): string[] => lint(m).map((i) => i.rule);
const has = (m: Model, rule: string, node = "", edge = ""): boolean =>
  lint(m).some(
    (i) =>
      i.rule === rule &&
      (node ? i.node === node : true) &&
      (edge ? i.edge === edge : true),
  );

describe("a sound design", () => {
  test("ping has nothing to say", () => {
    expect(lint(ping())).toEqual([]);
  });
  test("the demos have no errors", () => {
    for (const d of DEMOS) {
      const bad = lint(d.make()).filter((i) => i.severity === "error");
      expect(bad.map((i) => `${d.id}: ${i.title}`)).toEqual([]);
    }
  });
  test("every rule has a title", () => {
    expect(RULES.length).toBeGreaterThanOrEqual(14);
    for (const r of RULES) expect(r.title.length).toBeGreaterThan(5);
  });
});

describe("effects", () => {
  test("an effect whose reply nobody handles", () => {
    const m = removeEdge(ping(), edgeOf(ping(), "pg", "h2").id);
    expect(has(m, "no-reply-consumer", "pg")).toBe(true);
    expect(lint(m).find((i) => i.rule === "no-reply-consumer")!.severity).toBe(
      "error",
    );
  });
  test("a reply that goes to something that is not a handler", () => {
    const k = new Kit();
    k.m = ping();
    k.n("x", "external", "Redis", { plugin: "redis" });
    k.m = removeEdge(k.m, edgeOf(k.m, "pg", "h2").id);
    k.e("pg", "x", "pg.reply", { kind: "reply" });
    expect(
      has(k.done(), "no-reply-consumer", "", edgeOf(k.m, "pg", "x").id),
    ).toBe(true);
  });
  test("an effect with no onError", () => {
    const m = removeEdge(ping(), edgeOf(ping(), "pg", "bad").id);
    const i = lint(m).find((x) => x.rule === "missing-onerror")!;
    expect(i).toMatchObject({ node: "pg", severity: "error" });
  });
  test("fire-and-forget effects need no reply and no onError", () => {
    const m = new Kit()
      .n("h", "handler", "h")
      .n("lg", "effect", "log", { detail: "info x" })
      .n("ex", "effect", "redis.cmd", { detail: "EXPIRE k 60" })
      .e("h", "lg", "log")
      .e("h", "ex", "redis.cmd")
      .done();
    expect(rules(m)).not.toContain("no-reply-consumer");
    expect(rules(m)).not.toContain("missing-onerror");
  });
  test("a timer cannot fail", () => {
    const m = new Kit()
      .n("h", "handler", "h")
      .n("t", "effect", "timer.after", { detail: "10" })
      .n("h2", "handler", "fired")
      .e("h", "t", "timer.after")
      .e("t", "h2", "fired")
      .done();
    expect(rules(m)).not.toContain("missing-onerror");
  });
  test("a fetch without a timeout is a note", () => {
    const m = new Kit()
      .n("h", "handler", "h")
      .n("f", "effect", "fetch.request", { detail: "GET https://x.y" })
      .n("h2", "handler", "got")
      .n("e", "error", "failed")
      .e("h", "f", "fetch.request")
      .e("f", "h2", "got")
      .err("f", "e")
      .done();
    expect(lint(m).find((i) => i.rule === "no-timeout")!.severity).toBe("info");
    expect(rules(updateNode(m, "f", { timeoutMs: 800 }))).not.toContain(
      "no-timeout",
    );
  });
});

describe("messages", () => {
  test("a handler nothing sends to", () => {
    const m = new Kit();
    m.m = ping();
    m.n("orphan", "handler", "never.sent");
    const found = lint(m.done());
    expect(
      found.some((i) => i.rule === "no-producer" && i.node === "orphan"),
    ).toBe(true);
  });
  test("the messages of the runtime need no producer", () => {
    const m = new Kit()
      .n("a", "handler", "http.aborted")
      .n("b", "handler", "request.timeout")
      .done();
    expect(rules(m)).not.toContain("no-producer");
    expect(rules(m)).not.toContain("unreachable");
  });
  test("an edge whose id is not the one the handler takes", () => {
    const base = ping();
    const m = {
      ...base,
      edges: base.edges.map((e) =>
        e.from === "pg" && e.kind === "reply" ? { ...e, msg: "wrong" } : e,
      ),
    };
    const i = lint(m).find((x) => x.rule === "msg-mismatch")!;
    expect(i.edge).toBe(edgeOf(base, "pg", "h2").id);
    expect(i.severity).toBe("warn");
  });
  test("a route and its edge must agree", () => {
    const base = ping();
    const m = {
      ...base,
      nodes: base.nodes.map((n) =>
        n.id === "rt" ? { ...n, detail: "other.id" } : n,
      ),
    };
    expect(has(m, "msg-mismatch", "", edgeOf(base, "rt", "h1").id)).toBe(true);
  });
  test("two handlers with one message id", () => {
    const k = new Kit();
    k.m = ping();
    k.n("dup", "handler", "ping.found");
    expect(
      lint(k.done()).some((i) => i.rule === "duplicate" && i.node === "dup"),
    ).toBe(true);
  });
});

describe("reachability and responses", () => {
  test("a node nothing leads to", () => {
    const k = new Kit();
    k.m = ping();
    k.n("lonely", "effect", "log", { detail: "info x" });
    expect(
      lint(k.done()).some(
        (i) => i.rule === "unreachable" && i.node === "lonely",
      ),
    ).toBe(true);
  });
  test("a route that never calls http.respond", () => {
    let m = removeNode(ping(), "ok");
    m = removeNode(m, "r500");
    const i = lint(m).find((x) => x.rule === "route-never-responds")!;
    expect(i).toMatchObject({ node: "rt", severity: "error" });
  });
  test("a path that does not respond, when a condition has a value", () => {
    const base = ping();
    const m = {
      ...base,
      edges: base.edges.map((e) =>
        e.from === "h2" ? { ...e, cond: "ready" } : e,
      ),
      conds: { ready: true },
    };
    const i = lint(m).find((x) => x.rule === "route-path-no-respond")!;
    expect(i.node).toBe("rt");
    expect(i.title).toContain("ready=false");
  });
  test("a condition with both sides responds on every path", () => {
    const k = new Kit();
    k.m = ping();
    const base = k.m;
    k.m = {
      ...base,
      edges: base.edges.map((e) =>
        e.from === "h2" ? { ...e, cond: "ready" } : e,
      ),
    };
    k.n("alt", "effect", "http.respond", { status: 202 });
    k.e("h2", "alt", "http.respond", { cond: "!ready" });
    expect(rules(k.done())).not.toContain("route-path-no-respond");
  });
  test("an error that leads nowhere is a path without a response", () => {
    const m = removeNode(ping(), "r500");
    expect(has(m, "route-path-no-respond", "rt")).toBe(true);
  });
  test("a websocket frame counts as an answer", () => {
    const m = new Kit()
      .n("rt", "route", "WS /w", { detail: "w.msg" })
      .n("h", "handler", "w.msg")
      .n("s", "effect", "ws.send", { detail: "ok" })
      .e("rt", "h", "w.msg")
      .e("h", "s", "ws.send")
      .done();
    expect(rules(m)).not.toContain("route-never-responds");
  });
});

describe("transactions", () => {
  const tx = (
    close: "commit" | "rollback" | "none",
    errorClosed: boolean,
  ): Model => {
    const k = new Kit()
      .n("rt", "route", "POST /t", { detail: "t.post" })
      .n("h", "handler", "t.post")
      .n("b", "effect", "pg.tx.begin")
      .n("h2", "handler", "t.began")
      .n("q", "effect", "pg.query", { detail: "update x" })
      .n("h3", "handler", "t.updated")
      .n("e", "error", "t.failed")
      .n("ok", "effect", "http.respond", { status: 200 })
      .n("r500", "effect", "http.respond", { status: 500 })
      .e("rt", "h", "t.post")
      .e("h", "b", "pg.tx.begin")
      .e("b", "h2", "t.began")
      .err("b", "e")
      .e("h2", "q", "pg.query")
      .e("q", "h3", "t.updated")
      .err("q", "e")
      .e("h3", "ok", "http.respond")
      .e("e", "r500", "http.respond");
    if (close !== "none") {
      k.n(
        "c",
        "effect",
        close === "commit" ? "pg.tx.commit" : "pg.tx.rollback",
      );
      k.e("h3", "c", close === "commit" ? "pg.tx.commit" : "pg.tx.rollback");
    }
    if (errorClosed) {
      k.n("rb", "effect", "pg.tx.rollback");
      k.e("e", "rb", "pg.tx.rollback");
    }
    return k.done();
  };
  test("closed on every path is fine", () => {
    expect(rules(tx("commit", true))).not.toContain("tx-not-closed");
    expect(rules(tx("rollback", true))).not.toContain("tx-not-closed");
  });
  test("never closed", () => {
    expect(has(tx("none", true), "tx-not-closed", "b")).toBe(true);
  });
  test("the failure path is not closed", () => {
    const i = lint(tx("commit", false)).find(
      (x) => x.rule === "tx-not-closed",
    )!;
    expect(i.node).toBe("b");
    expect(i.detail).toContain("failure paths");
  });
});

describe("loops, fan-out and secrets", () => {
  test("a loop with no condition is an error, with one a note", () => {
    const loop = (cond: string): Model =>
      new Kit()
        .n("a", "handler", "a")
        .n("b", "handler", "b")
        .e("a", "b", "b")
        .e("b", "a", "a", { cond })
        .done();
    expect(lint(loop("")).find((i) => i.rule === "loop")!.severity).toBe(
      "error",
    );
    expect(lint(loop("again")).find((i) => i.rule === "loop")!.severity).toBe(
      "info",
    );
  });
  test("a handler that emits too many effects at once", () => {
    const k = new Kit().n("h", "handler", "h");
    for (let i = 0; i < 7; i++) {
      k.n(`l${i}`, "effect", "log", { detail: `info ${i}` });
      k.e("h", `l${i}`, "log");
    }
    expect(has(k.done(), "fan-out", "h")).toBe(true);
  });
  test("a secret in a log line, or flowing into one", () => {
    const base = ping();
    const k = new Kit();
    k.m = base;
    k.n("lg", "effect", "log", {
      detail: "warn login failed for {req.password}",
    });
    k.e("h2", "lg", "log", { payload: "token:string=x" });
    const found = lint(k.done()).filter((i) => i.rule === "secret-in-log");
    expect(found.some((i) => i.node === "lg")).toBe(true);
    expect(found.some((i) => i.title.includes("token flows into a log"))).toBe(
      true,
    );
  });
  test("a credential kept in the request slice, until something clears it", () => {
    const kept = updateNode(ping(), "h1", {
      reqSet: { password: "{payload.body.password}" },
    });
    expect(has(kept, "secret-in-state", "h1")).toBe(true);
    const cleared = updateNode(kept, "h2", { reqSet: { password: "" } });
    expect(rules(cleared)).not.toContain("secret-in-state");
  });
});

describe("conditions and the report", () => {
  test("a condition with no value is a note", () => {
    const base = ping();
    const m = {
      ...base,
      edges: base.edges.map((e) =>
        e.from === "h2" ? { ...e, cond: "undefinedOne" } : e,
      ),
    };
    expect(lint(m).find((i) => i.rule === "cond-undefined")!.severity).toBe(
      "info",
    );
    expect(rules({ ...m, conds: { undefinedOne: true } })).not.toContain(
      "cond-undefined",
    );
  });
  test("issues are ordered by severity and counted", () => {
    const m = removeNode(removeNode(ping(), "ok"), "r500");
    const found = lint(m);
    const order = found.map((i) => i.severity);
    expect(order).toEqual(
      [...order].sort(
        (a, b) =>
          ["error", "warn", "info"].indexOf(a) -
          ["error", "warn", "info"].indexOf(b),
      ),
    );
    const c = counts(found);
    expect(c.error + c.warn + c.info).toBe(found.length);
  });
  test("every issue can be focused: it names a node or an edge", () => {
    const m = removeNode(
      removeNode(removeEdge(ping(), edgeOf(ping(), "pg", "bad").id), "ok"),
      "r500",
    );
    for (const i of lint(m)) expect(i.node || i.edge).not.toBe("");
  });
  test("the cached lint is the same list for the same model", () => {
    const m = ping();
    expect(lintCached(m)).toBe(lintCached(m));
    expect(lintCached(m)).toEqual(lint(m));
  });
});
