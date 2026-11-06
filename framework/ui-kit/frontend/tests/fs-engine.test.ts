import { describe, expect, test } from "vitest";
import {
  MESSAGE_BUDGET,
  fill,
  literal,
  outcomes,
  ridsOf,
  rngOf,
  simulate,
  stepsOf,
  tokensAt,
  traceText,
  variantsOf,
  defaultRequests,
} from "../templates/flow-studio/engine.ts";
import {
  type Fault,
  type Model,
  type Scenario,
} from "../templates/flow-studio/model.ts";
import { Kit, ping } from "./fs-kit.ts";

const sc = (m: Model, over: Partial<Scenario> = {}): Scenario => ({
  ...m.scenario,
  ...over,
});
const fault = (f: Partial<Fault>): Fault => ({
  id: `f${Math.random()}`,
  kind: "error",
  target: "",
  rid: "",
  code: "",
  ms: 0,
  on: true,
  ...f,
});
const run = (
  m: Model,
  over: Partial<Scenario> = {},
  seed: number | string = 1,
) => simulate(m, sc(m, over), seed);
const labels = (t: ReturnType<typeof simulate>, rid = "r1") =>
  stepsOf(t, rid).map((s) => s.label);

describe("the happy path", () => {
  const m = ping();
  const t = run(m);

  test("walks the flow in order, one rid", () => {
    expect(labels(t).map((l) => l.replace(/ [\d.]+ms$/, " <ms>"))).toEqual([
      "Client",
      "http.request",
      "ping.get",
      "pg.query",
      "pg.query <ms>",
      "ping.found",
      "http.respond",
      "http.respond <ms>",
      "request.done",
    ]);
    expect(ridsOf(t)).toEqual(["r1"]);
    expect(t.every((s) => s.rid === "r1")).toBe(true);
  });

  test("types of the steps", () => {
    expect(t.map((s) => s.type)).toEqual([
      "start",
      "message",
      "message",
      "effect",
      "work",
      "reply",
      "effect",
      "work",
      "done",
    ]);
  });

  test("time never goes back and a step starts before it ends", () => {
    for (let i = 1; i < t.length; i++)
      expect(t[i].t).toBeGreaterThanOrEqual(t[i - 1].t);
    for (const s of t) expect(s.tStart).toBeLessThanOrEqual(s.t);
  });

  test("the network hop takes the net latency, the plugin its own", () => {
    const hop = t.find((s) => s.label === "http.request")!;
    expect(hop.t - hop.tStart).toBeCloseTo(18, 5);
    const work = t.find(
      (s) => s.type === "work" && s.label.startsWith("pg.query"),
    )!;
    expect(work.t - work.tStart).toBeGreaterThan(10.7);
    expect(work.t - work.tStart).toBeLessThan(13.3);
  });

  test("the request slice is created at the route and written by the handlers", () => {
    const route = t.find((s) => s.to === "rt" && s.edge)!;
    expect(route.req).toMatchObject({ route: "ping.get", step: "" });
    const h1 = t.find((s) => s.to === "h1")!;
    expect(h1.req).toMatchObject({ step: "query", who: "ann" });
    const h2 = t.find((s) => s.to === "h2")!;
    expect(h2.req).toMatchObject({ step: "answer", n: 7 });
  });

  test("the effect is shown as the plugin would receive it, with the rid", () => {
    const e = t.find((s) => s.type === "effect" && s.to === "pg")!;
    expect(e.effect).toMatchObject({
      plugin: "pg",
      type: "query",
      sql: "select 1",
      replyTo: "ping.found",
      onError: "ping.failed",
      ctx: { rid: "r1" },
    });
    const r = t.find((s) => s.to === "ok" && s.type === "effect")!;
    expect(r.effect).toMatchObject({
      plugin: "http",
      type: "respond",
      status: 200,
      json: { n: 7, rid: "r1" },
    });
  });

  test("the response ends the request and drops its slice", () => {
    const done = t[t.length - 1];
    expect(done.type).toBe("done");
    expect(done.req).toBeNull();
    expect(done.payload).toEqual({ result: "responded", status: 200 });
    expect(outcomes(t)).toMatchObject([
      { rid: "r1", result: "responded", status: 200 },
    ]);
  });

  test("the reply carries the schema of the edge as its payload", () => {
    const r = t.find((s) => s.type === "reply")!;
    expect(r.payload).toEqual({ rows: [{ n: 7 }] });
  });
});

describe("determinism and the seed", () => {
  const m = ping();
  test("the same seed gives the same trace", () => {
    expect(run(m, {}, 7)).toEqual(run(m, {}, 7));
    expect(traceText(run(m, {}, "abc"))).toBe(traceText(run(m, {}, "abc")));
  });
  test("another seed changes the latencies", () => {
    expect(traceText(run(m, {}, 1))).not.toBe(traceText(run(m, {}, 2)));
  });
  test("the default seed is the one of the scenario", () => {
    expect(simulate(m, sc(m, { seed: 5 }))).toEqual(
      simulate(m, sc(m, { seed: 5 }), 5),
    );
  });
  test("the generator is in [0, 1) and repeatable", () => {
    const a = rngOf(3);
    const b = rngOf(3);
    for (let i = 0; i < 50; i++) {
      const x = a();
      expect(x).toBe(b());
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
    }
  });
  test("simulating does not change the model", () => {
    const before = JSON.stringify(m);
    run(m, { faults: [fault({ kind: "abort", ms: 20 })] });
    expect(JSON.stringify(m)).toBe(before);
  });
});

describe("latencies are configurable per plugin and per node", () => {
  test("model latency replaces the default", () => {
    const m = { ...ping(), latency: { pg: 100, net: 5 } };
    const t = run(m);
    const work = t.find((s) => s.type === "work" && s.to === "pg")!;
    expect(work.t - work.tStart).toBeGreaterThan(89);
    const hop = t.find((s) => s.label === "http.request")!;
    expect(hop.t - hop.tStart).toBeCloseTo(5, 5);
  });
  test("a node latency beats the plugin latency", () => {
    const base = ping();
    const m = {
      ...base,
      nodes: base.nodes.map((n) =>
        n.id === "pg" ? { ...n, latency: 300 } : n,
      ),
    };
    const work = run(m).find((s) => s.type === "work" && s.to === "pg")!;
    expect(work.t - work.tStart).toBeGreaterThan(260);
  });
  test("an edge latency beats the hop default", () => {
    const base = ping();
    const m = {
      ...base,
      edges: base.edges.map((e) =>
        e.from === "xc" ? { ...e, latency: 77 } : e,
      ),
    };
    const hop = run(m).find((s) => s.label === "http.request")!;
    expect(hop.t - hop.tStart).toBeCloseTo(77, 5);
  });
  test("a timer waits exactly its delay", () => {
    const m = new Kit()
      .n("xc", "external", "Client", { plugin: "http" })
      .n("rt", "route", "GET /t", { detail: "t.get" })
      .n("h", "handler", "t.get")
      .n("tm", "effect", "timer.after", { detail: "250" })
      .n("h2", "handler", "t.fired")
      .n("ok", "effect", "http.respond", { status: 204 })
      .e("xc", "rt", "http.request")
      .e("rt", "h", "t.get")
      .e("h", "tm", "timer.after")
      .e("tm", "h2", "t.fired")
      .e("h2", "ok", "http.respond")
      .req("r1", "xc")
      .done();
    const w = run(m, {}, 9).find((s) => s.type === "work" && s.to === "tm")!;
    expect(w.t - w.tStart).toBe(250);
  });
});

describe("conditions", () => {
  const build = (): Model =>
    new Kit()
      .n("xc", "external", "Client", { plugin: "http" })
      .n("rt", "route", "GET /c", { detail: "c.get" })
      .n("h", "handler", "c.get")
      .n("a", "effect", "http.respond", { status: 200, detail: '{"a":1}' })
      .n("b", "effect", "http.respond", { status: 409, detail: '{"b":1}' })
      .e("xc", "rt", "http.request")
      .e("rt", "h", "c.get")
      .e("h", "a", "http.respond", { cond: "ok" })
      .e("h", "b", "http.respond", { cond: "!ok" })
      .conds({ ok: true })
      .req("r1", "xc")
      .done();
  test("the design value decides", () => {
    expect(outcomes(run(build()))[0].status).toBe(200);
    expect(outcomes(run({ ...build(), conds: { ok: false } }))[0].status).toBe(
      409,
    );
  });
  test("the scenario overrides the design", () => {
    expect(outcomes(run(build(), { conds: { ok: false } }))[0].status).toBe(
      409,
    );
  });
  test("an unknown condition is false", () => {
    expect(outcomes(run({ ...build(), conds: {} }))[0].status).toBe(409);
  });
});

describe("fault injection", () => {
  const m = ping();
  test("a Postgres error replies on onError with the SQLSTATE", () => {
    const t = run(m, {
      faults: [fault({ kind: "error", target: "pg", code: "23505" })],
    });
    const w = t.find((s) => s.type === "work")!;
    expect(w.status).toBe("error");
    expect(w.payload).toMatchObject({
      code: "23505",
      constraint: "users_email_key",
    });
    const err = t.find((s) => s.type === "error")!;
    expect(err.label).toBe("ping.failed");
    expect(err.payload).toMatchObject({ code: "23505" });
    expect(outcomes(t)[0]).toMatchObject({ result: "failed", status: 500 });
  });
  test("the default code of a Postgres error is a SQLSTATE", () => {
    const t = run(m, {
      faults: [fault({ kind: "error", target: "plugin:pg" })],
    });
    expect(
      (t.find((s) => s.type === "work")!.payload as { code: string }).code,
    ).toBe("40001");
  });
  test("a timeout waits for the timeout of the node, then fails with ETIMEDOUT", () => {
    const base = ping();
    const withTmo = {
      ...base,
      nodes: base.nodes.map((n) =>
        n.id === "pg" ? { ...n, timeoutMs: 400 } : n,
      ),
    };
    const t = run(withTmo, {
      faults: [fault({ kind: "timeout", target: "pg" })],
    });
    const w = t.find((s) => s.type === "work")!;
    expect(w.status).toBe("timeout");
    expect(w.t - w.tStart).toBe(400);
    expect(w.payload).toMatchObject({ code: "ETIMEDOUT" });
  });
  test("a slow query adds its time; past the timeout it times out", () => {
    const ok = run(m, {
      faults: [fault({ kind: "slow", target: "pg", ms: 900 })],
    });
    const w = ok.find((s) => s.type === "work")!;
    expect(w.status).toBe("ok");
    expect(w.t - w.tStart).toBeGreaterThan(900);
    const tight = {
      ...m,
      nodes: m.nodes.map((n) => (n.id === "pg" ? { ...n, timeoutMs: 500 } : n)),
    };
    const t = run(tight, {
      faults: [fault({ kind: "slow", target: "pg", ms: 900 })],
    });
    expect(t.find((s) => s.type === "work")!.status).toBe("timeout");
  });
  test("a fault can target a plugin, one request or a node", () => {
    const two = new Kit();
    two.m = { ...m };
    const t2 = simulate(
      {
        ...m,
        scenario: {
          ...m.scenario,
          requests: [
            ...m.scenario.requests,
            { rid: "r2", entry: "xc", at: 3, payload: {} },
          ],
        },
      },
      {
        ...m.scenario,
        requests: [
          ...m.scenario.requests,
          { rid: "r2", entry: "xc", at: 3, payload: {} },
        ],
        faults: [fault({ kind: "error", target: "plugin:pg", rid: "r2" })],
      },
      1,
    );
    expect(outcomes(t2).map((o) => [o.rid, o.result])).toEqual([
      ["r1", "responded"],
      ["r2", "failed"],
    ]);
  });
  test("a fault that is off does nothing", () => {
    const t = run(m, {
      faults: [fault({ kind: "error", target: "pg", on: false })],
    });
    expect(outcomes(t)[0].result).toBe("responded");
  });
  test("an effect with no onError ends in a runtime 500", () => {
    const noErr = { ...m, edges: m.edges.filter((e) => e.kind !== "error") };
    const t = run(noErr, { faults: [fault({ kind: "error", target: "pg" })] });
    const e = t.find((s) => s.type === "error")!;
    expect(e.label).toBe("no onError");
    expect(e.note).toContain("500");
    expect(outcomes(t)[0]).toMatchObject({ result: "failed", status: 500 });
  });
  test("the faults of the scenario are reported on the step", () => {
    const f = fault({ id: "boom", kind: "error", target: "pg" });
    const t = run(m, { faults: [f] });
    expect(t.find((s) => s.type === "work")!.fault).toBe("boom");
  });
});

describe("the failure policy: retries", () => {
  const retrying = (retries: number): Model => {
    const base = ping();
    return {
      ...base,
      nodes: base.nodes.map((n) =>
        n.id === "pg" ? { ...n, retries, backoffMs: 50 } : n,
      ),
    };
  };
  test("fails the first N attempts, then works", () => {
    const t = run(retrying(3), {
      faults: [fault({ kind: "error", target: "pg", ms: 2 })],
    });
    expect(t.filter((s) => s.type === "retry")).toHaveLength(2);
    expect(outcomes(t)[0].result).toBe("responded");
    const retries = t.filter((s) => s.type === "retry");
    expect(retries[0].status).toBe("retry");
    // the backoff doubles: 50 then 100
    const works = t.filter((s) => s.type === "work" || s.type === "retry");
    expect(works[1].tStart - works[0].t).toBeCloseTo(50, 5);
    expect(works[2].tStart - works[1].t).toBeCloseTo(100, 5);
  });
  test("gives up after the retries and uses onError", () => {
    const t = run(retrying(1), {
      faults: [fault({ kind: "error", target: "pg" })],
    });
    expect(t.filter((s) => s.type === "retry")).toHaveLength(1);
    expect(t.some((s) => s.type === "error" && s.label === "ping.failed")).toBe(
      true,
    );
    expect(outcomes(t)[0].status).toBe(500);
  });
});

describe("cancellation", () => {
  const long = (): Model => {
    const base = ping();
    return {
      ...base,
      nodes: base.nodes.map((n) =>
        n.id === "pg" ? { ...n, latency: 500 } : n,
      ),
    };
  };
  test("an abort cancels the in-flight effect and discards its reply", () => {
    const t = run(long(), { faults: [fault({ kind: "abort", ms: 100 })] });
    const abort = t.find((s) => s.type === "abort")!;
    expect(abort).toMatchObject({
      label: "http.aborted",
      status: "cancelled",
      t: 100,
    });
    const cancel = t.find((s) => s.type === "cancel")!;
    expect(cancel).toMatchObject({
      to: "pg",
      status: "cancelled",
      edge: "cancel:pg",
      kind: "cancel",
    });
    expect(cancel.t).toBe(100);
    expect(t.some((s) => s.label === "ping.found")).toBe(false);
    expect(t.some((s) => s.type === "work")).toBe(false);
    expect(outcomes(t)[0]).toMatchObject({
      result: "aborted",
      cancelled: 2,
      dropped: 0,
    });
  });
  test("the steps after the cancel show nothing in flight", () => {
    const t = run(long(), { faults: [fault({ kind: "abort", ms: 100 })] });
    const before = t.find((s) => s.type === "effect" && s.to === "pg")!;
    expect(before.inflight).toEqual(["pg"]);
    expect(t[t.length - 1].inflight).toEqual([]);
  });
  test("an open transaction is rolled back automatically", () => {
    const m = new Kit()
      .n("xc", "external", "Client", { plugin: "http" })
      .n("rt", "route", "POST /tx", { detail: "tx.post" })
      .n("h", "handler", "tx.post")
      .n("b", "effect", "pg.tx.begin")
      .n("h2", "handler", "tx.began")
      .n("q", "effect", "pg.query", { latency: 400 })
      .n("e", "error", "tx.failed")
      .n("ok", "effect", "http.respond", { status: 200 })
      .e("xc", "rt", "http.request")
      .e("rt", "h", "tx.post")
      .e("h", "b", "pg.tx.begin")
      .e("b", "h2", "tx.began", { payload: "tx:string=t1" })
      .err("b", "e")
      .e("h2", "q", "pg.query")
      .e("q", "ok", "http.respond", { kind: "reply" })
      .err("q", "e")
      .req("r1", "xc")
      .done();
    const t = run(m, { faults: [fault({ kind: "abort", ms: 120 })] });
    const rb = t.find((s) => s.type === "rollback")!;
    expect(rb.label).toContain("rollback");
    expect(rb.note).toContain("rolls it back");
    // the slice shows the open transaction until then
    const mid = t.find((s) => s.type === "effect" && s.to === "q")!;
    expect(mid.req).toHaveProperty("tx");
    expect(rb.req).not.toHaveProperty("tx");
  });
  test("a reply that arrives for a cancelled rid would be dropped", () => {
    // the handler after the abort time runs with a late message: it is dropped
    const m = long();
    const t = run(m, { faults: [fault({ kind: "abort", ms: 25 })] });
    // the abort happens while the request is still in the network or in the app
    expect(outcomes(t)[0].result).toBe("aborted");
  });
  test("the app can still hear http.aborted and log it", () => {
    const base = long();
    const m = new Kit();
    m.m = { ...base };
    const withLog = new Kit();
    withLog.m = base;
    withLog
      .n("ha", "handler", "http.aborted")
      .n("lg", "effect", "log", { detail: "warn aborted {rid}" })
      .e("ha", "lg", "log");
    const t = run(withLog.done(), {
      faults: [fault({ kind: "abort", ms: 100 })],
    });
    const labelsAfter = t
      .slice(t.findIndex((s) => s.type === "abort"))
      .map((s) => s.label);
    expect(labelsAfter).toContain("http.aborted");
    expect(t.some((s) => s.type === "work" && s.to === "lg")).toBe(true);
  });
  test("an abort before the request reaches the server just ends it", () => {
    const t = run(ping(), { faults: [fault({ kind: "abort", ms: 5 })] });
    expect(outcomes(t)[0]).toMatchObject({ result: "aborted" });
    expect(t.some((s) => s.type === "cancel")).toBe(false);
  });
  test("an abort after the response is ignored", () => {
    const t = run(ping(), { faults: [fault({ kind: "abort", ms: 5000 })] });
    expect(outcomes(t)[0].result).toBe("responded");
  });
  test("responding cancels what is still in flight (a deadline timer)", () => {
    const m = new Kit()
      .n("xc", "external", "Client", { plugin: "http" })
      .n("rt", "route", "GET /d", { detail: "d.get" })
      .n("h", "handler", "d.get")
      .n("tm", "effect", "timer.after", { detail: "3000" })
      .n("ok", "effect", "http.respond", { status: 200 })
      .n("late", "handler", "request.timeout")
      .e("xc", "rt", "http.request")
      .e("rt", "h", "d.get")
      .e("h", "tm", "timer.after")
      .e("h", "ok", "http.respond")
      .e("tm", "late", "request.timeout")
      .req("r1", "xc")
      .done();
    const t = run(m);
    const c = t.find((s) => s.type === "cancel")!;
    expect(c.to).toBe("tm");
    expect(c.note).toContain("response sent");
  });
});

describe("the request deadline", () => {
  const withHandler = (): Model => {
    const base = ping();
    const k = new Kit();
    k.m = {
      ...base,
      nodes: base.nodes.map((n) =>
        n.id === "pg" ? { ...n, latency: 500 } : n,
      ),
    };
    k.n("ht", "handler", "request.timeout")
      .n("r504", "effect", "http.respond", {
        status: 504,
        detail: '{"error":"timeout"}',
      })
      .e("ht", "r504", "http.respond");
    return k.done();
  };
  test("is delivered as request.timeout to the handler", () => {
    const t = run(withHandler(), {
      faults: [fault({ kind: "deadline", ms: 100 })],
    });
    const to = t.find((s) => s.type === "timeout")!;
    expect(to).toMatchObject({ to: "ht", status: "timeout", t: 100 });
    expect(outcomes(t)[0]).toMatchObject({ result: "failed", status: 504 });
    // the slow query was cancelled when the 504 went out
    expect(t.some((s) => s.type === "cancel" && s.to === "pg")).toBe(true);
  });
  test("without a handler the runtime answers 504", () => {
    const base = ping();
    const m = {
      ...base,
      nodes: base.nodes.map((n) =>
        n.id === "pg" ? { ...n, latency: 500 } : n,
      ),
    };
    const t = run(m, { faults: [fault({ kind: "deadline", ms: 100 })] });
    expect(outcomes(t)[0]).toMatchObject({ result: "timeout", status: 504 });
    expect(t.some((s) => s.type === "cancel")).toBe(true);
  });
  test("a deadline after the response does nothing", () => {
    const t = run(ping(), { faults: [fault({ kind: "deadline", ms: 4000 })] });
    expect(outcomes(t)[0].result).toBe("responded");
  });
});

describe("concurrent requests keep their own state", () => {
  const m = (() => {
    const base = ping();
    return {
      ...base,
      scenario: {
        ...base.scenario,
        requests: [
          { rid: "r1", entry: "xc", at: 0, payload: {} },
          { rid: "r2", entry: "xc", at: 2, payload: {} },
          { rid: "r3", entry: "xc", at: 4, payload: {} },
        ],
      },
    };
  })();
  const t = simulate(m, m.scenario, 1);
  test("their steps interleave on one timeline", () => {
    const order = t.map((s) => s.rid);
    expect(new Set(order)).toEqual(new Set(["r1", "r2", "r3"]));
    // r2 starts before r1 is done
    expect(order.indexOf("r2")).toBeLessThan(order.lastIndexOf("r1"));
  });
  test("each rid has its own slice, written only by its own messages", () => {
    for (const s of t) {
      if (s.req && "who" in s.req) expect(s.req.who).toBe("ann");
    }
    const answers = t.filter((s) => s.to === "h2");
    expect(answers.map((s) => s.rid).sort()).toEqual(["r1", "r2", "r3"]);
  });
  test("the response of a request carries its own rid", () => {
    for (const rid of ["r1", "r2", "r3"]) {
      const e = t.find(
        (s) => s.rid === rid && s.type === "effect" && s.to === "ok",
      )!;
      expect((e.effect as { json: { rid: string } }).json.rid).toBe(rid);
    }
  });
  test("a fault on one request leaves the others alone", () => {
    const t2 = simulate(
      m,
      { ...m.scenario, faults: [fault({ kind: "abort", rid: "r2", ms: 25 })] },
      1,
    );
    expect(outcomes(t2).map((o) => o.result)).toEqual([
      "responded",
      "aborted",
      "responded",
    ]);
  });
  test("tokensAt gives the newest step of each request", () => {
    const at = tokensAt(t, 12);
    expect(at.length).toBeLessThanOrEqual(3);
    for (const k of at) expect(k.step.i).toBeLessThanOrEqual(12);
    expect(new Set(at.map((k) => k.rid)).size).toBe(at.length);
  });
});

describe("shared state and the browser", () => {
  test("a handler writes state.shared; every slice sees it", () => {
    const base = ping();
    const m = {
      ...base,
      nodes: base.nodes.map((n) =>
        n.id === "h2" ? { ...n, sharedSet: { last: "{rid}" } } : n,
      ),
      shared: { hits: "0" },
    };
    const t = run(m);
    const h2 = t.find((s) => s.to === "h2")!;
    expect(h2.shared).toEqual({ hits: 0, last: "r1" });
    expect(t[0].shared).toEqual({ hits: 0 });
  });
  test("a frontend handler and a state key write the browser state", () => {
    const m = new Kit()
      .n("ev", "ui-event", "click")
      .n("fh", "fe-handler", "go", {
        clientSet: { loading: "true", who: "{payload.who}" },
      })
      .n("fs", "fe-state", "session", { detail: "{payload.token}" })
      .e("ev", "fh", "ui.click")
      .e("fh", "fs", "store.set", { payload: "token:string=abc" })
      .req("r1", "ev", 0, { who: "ann" })
      .done();
    const t = run(m);
    expect(t[t.length - 1].client).toMatchObject({
      loading: true,
      who: "ann",
      session: "abc",
    });
    // no server involved: the request completed in the browser
    expect(outcomes(t)[0].result).toBe("completed");
  });
});

describe("limits and odd designs", () => {
  test("a loop stops at the message budget", () => {
    const m = new Kit()
      .n("xc", "external", "Client", { plugin: "http" })
      .n("rt", "route", "GET /l", { detail: "l.get" })
      .n("a", "handler", "l.get")
      .n("b", "handler", "l.back")
      .e("xc", "rt", "http.request")
      .e("rt", "a", "l.get")
      .e("a", "b", "l.back")
      .e("b", "a", "l.get")
      .req("r1", "xc")
      .done();
    const t = run(m);
    const b = t.find((s) => s.type === "budget")!;
    expect(b.note).toContain(String(MESSAGE_BUDGET));
    expect(outcomes(t)[0]).toMatchObject({ result: "failed", status: 500 });
  });
  test("a route that never responds is incomplete", () => {
    const m = new Kit()
      .n("xc", "external", "Client", { plugin: "http" })
      .n("rt", "route", "GET /n", { detail: "n.get" })
      .n("h", "handler", "n.get")
      .e("xc", "rt", "http.request")
      .e("rt", "h", "n.get")
      .req("r1", "xc")
      .done();
    expect(outcomes(run(m))[0].result).toBe("incomplete");
  });
  test("websocket frames count as an answer", () => {
    const m = new Kit()
      .n("xc", "external", "Client", { plugin: "http" })
      .n("rt", "route", "WS /w", { detail: "w.msg" })
      .n("h", "handler", "w.msg")
      .n("s", "effect", "ws.send", { detail: "ok" })
      .e("xc", "rt", "http.request")
      .e("rt", "h", "w.msg")
      .e("h", "s", "ws.send")
      .req("r1", "xc")
      .done();
    expect(outcomes(run(m))[0].result).toBe("responded");
  });
  test("an empty design makes an empty trace", () => {
    const empty = new Kit().done();
    expect(simulate(empty, empty.scenario, 1)).toEqual([]);
  });
  test("with no request in the scenario the first UI event or client starts one", () => {
    const m = { ...ping(), scenario: { ...ping().scenario, requests: [] } };
    expect(defaultRequests(m)).toEqual([
      { rid: "r1", entry: "xc", at: 0, payload: {} },
    ]);
    expect(run(m).length).toBeGreaterThan(5);
  });
  test("a request that names a missing node is ignored", () => {
    const m = ping();
    const t = run(m, {
      requests: [
        { rid: "x", entry: "nope", at: 0, payload: {} },
        ...m.scenario.requests,
      ],
    });
    expect(ridsOf(t)).toEqual(["r1"]);
  });
});

describe("references and literals", () => {
  const scope = {
    payload: { body: { email: "a@b.c" }, rows: [{ id: 3 }] },
    req: { step: "x" },
    shared: { n: 2 },
    client: { k: 1 },
    rid: "r9",
  };
  test("a whole reference keeps the type", () => {
    expect(fill("{payload.rows.0.id}", scope)).toBe(3);
    expect(fill("{shared.n}", scope)).toBe(2);
    expect(fill("{rid}", scope)).toBe("r9");
  });
  test("a reference inside text is interpolated", () => {
    expect(fill("hi {payload.body.email}!", scope)).toBe("hi a@b.c!");
  });
  test("a bare name is looked up in the slice, the payload and the shared state", () => {
    expect(fill("{step}", scope)).toBe("x");
    expect(fill("{n}", scope)).toBe(2);
  });
  test("an unknown reference stays as it is", () => {
    expect(fill("{nope.x}", scope)).toBe("{nope.x}");
  });
  test("literals", () => {
    expect(literal("12")).toBe(12);
    expect(literal("true")).toBe(true);
    expect(literal("null")).toBeNull();
    expect(literal('{"a":1}')).toEqual({ a: 1 });
    expect(literal("{bad")).toBe("{bad");
    expect(literal("text")).toBe("text");
  });
});

describe("variants of a design", () => {
  test("the happy path, each failing effect, each flipped condition, abort and deadline", () => {
    const m = ping();
    const v = variantsOf(m);
    expect(v.map((x) => x.id)).toEqual([
      "happy",
      "fail-pg",
      "abort",
      "deadline",
    ]);
    expect(v[1].scenario.faults[0]).toMatchObject({ target: "pg", on: true });
  });
  test("flips conditions that edges use", () => {
    const m = new Kit()
      .n("xc", "external", "Client", { plugin: "http" })
      .n("rt", "route", "GET /c", { detail: "c.get" })
      .n("h", "handler", "c.get")
      .n("a", "effect", "http.respond", { status: 200 })
      .e("xc", "rt", "http.request")
      .e("rt", "h", "c.get")
      .e("h", "a", "http.respond", { cond: "ok" })
      .conds({ ok: true })
      .req("r1", "xc")
      .done();
    const v = variantsOf(m).find((x) => x.id === "cond-ok")!;
    expect(v.scenario.conds.ok).toBe(false);
  });
  test("every variant simulates to a finished trace", () => {
    for (const v of variantsOf(ping())) {
      const t = simulate(ping(), v.scenario, 1);
      expect(
        t[t.length - 1].type === "done" || t.some((s) => s.type === "done"),
      ).toBe(true);
    }
  });
});

describe("reading a trace", () => {
  test("traceText has one line per step", () => {
    const t = run(ping());
    expect(traceText(t).split("\n")).toHaveLength(t.length);
  });
  test("stepsOf filters by request", () => {
    const m = ping();
    const t = simulate(
      m,
      {
        ...m.scenario,
        requests: [
          ...m.scenario.requests,
          { rid: "r2", entry: "xc", at: 1, payload: {} },
        ],
      },
      1,
    );
    expect(stepsOf(t, "r2").every((s) => s.rid === "r2")).toBe(true);
  });
});
