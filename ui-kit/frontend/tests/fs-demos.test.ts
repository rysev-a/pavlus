import { describe, expect, test } from "vitest";
import { DEMOS, demoOf } from "../templates/flow-studio/demos.ts";
import {
  outcomes,
  simulate,
  stepsOf,
} from "../templates/flow-studio/engine.ts";
import { toggleChip } from "../templates/flow-studio/faults.ts";
import { lint } from "../templates/flow-studio/lint.ts";
import { LANES, findNode, laneOf } from "../templates/flow-studio/model.ts";

const play = (id: string, chips: string[] = []) => {
  let m = demoOf(id).make();
  for (const c of chips) m = toggleChip(m, c);
  return { m, t: simulate(m, m.scenario, m.scenario.seed) };
};
const results = (id: string, chips: string[] = []) =>
  outcomes(play(id, chips).t).map((o) => `${o.rid}:${o.result}:${o.status}`);

describe("the demos", () => {
  test("the demos of the brief, and the one with modules", () => {
    expect(DEMOS.map((d) => d.title)).toEqual([
      "Login with rate limit",
      "Coffee shop CRM",
      "Login in modules",
      "Todo CRUD with cache",
      "Websocket chat with history",
      "Payment webhook with retries and idempotency key",
      "Client abort and timeout",
    ]);
  });
  test("each opens ready to Run: requests, entries, all four lanes, a route", () => {
    for (const d of DEMOS) {
      const m = d.make();
      expect(m.name).toBe(d.title);
      expect(m.scenario.requests.length).toBeGreaterThanOrEqual(2);
      for (const r of m.scenario.requests)
        expect(findNode(m, r.entry)).toBeDefined();
      for (const lane of LANES)
        expect(
          m.nodes.some(
            (n) =>
              laneOf(n) === lane || (lane === "browser" && d.id === "payment"),
          ),
        ).toBe(true);
      expect(m.nodes.some((n) => n.kind === "route")).toBe(true);
      expect(
        m.nodes.some(
          (n) =>
            n.kind === "effect" &&
            ["http.respond", "ws.send"].includes(n.title),
        ),
      ).toBe(true);
    }
  });
  test("each has no errors in the checks and finishes every request", () => {
    for (const d of DEMOS) {
      const m = d.make();
      expect(lint(m).filter((i) => i.severity === "error")).toEqual([]);
      const o = outcomes(simulate(m, m.scenario, 1));
      expect(o.length).toBe(m.scenario.requests.length);
      for (const x of o) expect(x.result).not.toBe("incomplete");
    }
  });
  test("an unknown id gives the first demo", () => {
    expect(demoOf("nope").id).toBe("login");
  });
});

describe("login with rate limit", () => {
  test("two users log in at once, each with an own slice", () => {
    expect(results("login")).toEqual(["r1:responded:200", "r2:responded:200"]);
    const { t } = play("login");
    const emails = ["r1", "r2"].map((rid) => {
      const s = stepsOf(t, rid).find((x) => x.to === "h1")!;
      return (s.req as { email: string }).email;
    });
    expect(emails).toEqual(["ann@example.com", "bob@example.com"]);
    const tokens = ["r1", "r2"].map(
      (rid) => stepsOf(t, rid).find((x) => x.to === "h5")!.req,
    );
    expect(tokens[0]).not.toEqual(tokens[1]);
  });
  test("Redis INCR, EXPIRE and SET; a scrypt verify; a pg lookup", () => {
    const { t } = play("login");
    const effects = stepsOf(t, "r1")
      .filter((s) => s.type === "effect")
      .map(
        (s) => s.effect as { plugin: string; args?: string[]; sql?: string },
      );
    const redis = effects
      .filter((e) => e.plugin === "redis")
      .map((e) => e.args![0]);
    expect(redis).toEqual(["INCR", "EXPIRE", "SET"]);
    expect(effects.some((e) => e.plugin === "crypto")).toBe(true);
    expect(
      effects.some((e) => e.sql?.startsWith("select id, email, password_hash")),
    ).toBe(true);
  });
  test("the session goes to the browser state", () => {
    const { t } = play("login");
    const last = stepsOf(t, "r1").at(-1)!;
    expect(last.client).toMatchObject({
      status: "signed in",
      session: "tok_9d41c7",
    });
  });
  test("a Redis timeout answers 500 after the timeout; a Postgres error too", () => {
    expect(results("login", ["redis-timeout"])).toEqual([
      "r1:failed:500",
      "r2:failed:500",
    ]);
    expect(results("login", ["pg-error"])).toEqual([
      "r1:failed:500",
      "r2:failed:500",
    ]);
    const { t } = play("login", ["redis-timeout"]);
    const w = stepsOf(t, "r1").find((s) => s.type === "work")!;
    expect(w.status).toBe("timeout");
    expect(w.t - w.tStart).toBe(1000);
  });
  test("a slow query past the 800 ms timeout of the lookup fails it with ETIMEDOUT", () => {
    const { t } = play("login", ["slow"]);
    const w = stepsOf(t, "r1").find(
      (s) => s.type === "work" && s.to === "pgu",
    )!;
    expect(w).toMatchObject({ status: "timeout" });
    expect(w.t - w.tStart).toBe(800);
    expect(results("login", ["slow"])).toEqual([
      "r1:failed:500",
      "r2:failed:500",
    ]);
  });
  test("the abort chip cancels the work of both requests", () => {
    const o = outcomes(play("login", ["abort"]).t);
    expect(o.map((x) => x.result)).toEqual(["aborted", "aborted"]);
    expect(o.every((x) => x.cancelled > 0)).toBe(true);
  });
  test("the deadline chip answers 504 from the runtime", () => {
    expect(results("login", ["deadline"])).toEqual([
      "r1:timeout:504",
      "r2:timeout:504",
    ]);
  });
});

describe("login in modules", () => {
  test("is the same login: both users get in, with the same effects", () => {
    expect(results("modules")).toEqual([
      "r1:responded:200",
      "r2:responded:200",
    ]);
    const effects = (id: string) =>
      stepsOf(play(id).t, "r1")
        .filter((s) => s.type === "effect")
        .map((s) => s.label);
    expect(effects("modules")).toEqual(effects("login"));
  });
  test("has two modules with ports and a body each", () => {
    const m = demoOf("modules").make();
    expect(m.modules.map((d) => d.name)).toEqual([
      "Rate limit",
      "Check credentials",
    ]);
    for (const d of m.modules) {
      expect(d.inputs).toHaveLength(1);
      expect(d.outputs).toHaveLength(2);
      for (const p of [...d.inputs, ...d.outputs])
        expect(d.nodes.some((n) => n.id === p.node)).toBe(true);
      expect(d.nodes.length).toBeGreaterThan(5);
    }
    expect(m.nodes.filter((n) => n.kind === "module")).toHaveLength(2);
  });
  test("each module owns its failure policy: a Redis timeout answers 500 from inside it", () => {
    expect(results("modules", ["redis-timeout"])).toEqual([
      "r1:failed:500",
      "r2:failed:500",
    ]);
    expect(results("modules", ["pg-error"])).toEqual([
      "r1:failed:500",
      "r2:failed:500",
    ]);
  });
  test("a rate limited user is turned away through the port of the module", () => {
    const m = demoOf("modules").make();
    const t = simulate(m, { ...m.scenario, conds: { limited: true } }, 1);
    const o = outcomes(t);
    expect(o.map((x) => `${x.result}:${x.status}`)).toEqual([
      "responded:429",
      "responded:429",
    ]);
    // the browser handler is reached by the output port, so it is not lint noise
    expect(lint(m).filter((i) => i.rule === "unreachable")).toEqual([]);
  });
  test("the checks have no notes about the modules", () => {
    const m = demoOf("modules").make();
    expect(lint(m).filter((i) => i.rule.startsWith("port-"))).toEqual([]);
  });
});

describe("todo CRUD with cache", () => {
  test("a read-through cache: a miss asks Postgres, fills Redis, then answers", () => {
    const { t } = play("todo");
    const effects = stepsOf(t, "r1")
      .filter((s) => s.type === "effect")
      .map((s) => s.effect as { plugin: string; args?: string[] });
    expect(
      effects.map((e) => e.plugin + (e.args ? `:${e.args[0]}` : "")),
    ).toEqual(["redis:GET", "pg", "redis:SET", "http"]);
    expect(results("todo")).toEqual(["r1:responded:200", "r2:responded:204"]);
  });
  test("the cache fill is not cancelled by the response: it is awaited first", () => {
    const { t } = play("todo");
    expect(stepsOf(t, "r1").some((s) => s.type === "cancel")).toBe(false);
  });
  test("a hit answers from the cache without Postgres", () => {
    const m = demoOf("todo").make();
    const t = simulate(m, { ...m.scenario, conds: { cacheHit: true } }, 1);
    const eff = stepsOf(t, "r1")
      .filter((s) => s.type === "effect")
      .map((s) => (s.effect as { plugin: string }).plugin);
    expect(eff).toEqual(["redis", "http"]);
  });
  test("reorder runs in a transaction: begin, update, commit, then invalidates the cache", () => {
    const { t } = play("todo");
    const eff = stepsOf(t, "r2")
      .filter((s) => s.type === "effect")
      .map((s) => (s.effect as { plugin: string; type: string }).type);
    expect(eff).toEqual([
      "tx.begin",
      "query",
      "tx.commit",
      "pipeline",
      "respond",
    ]);
  });
  test("a failed update rolls back, an unowned row rolls back and answers 409", () => {
    const m = demoOf("todo").make();
    const failed = simulate(
      m,
      {
        ...m.scenario,
        faults: [
          {
            id: "f",
            kind: "error",
            target: "pgu",
            rid: "r2",
            code: "40001",
            ms: 0,
            on: true,
          },
        ],
      },
      1,
    );
    const eff = stepsOf(failed, "r2")
      .filter((s) => s.type === "effect")
      .map((s) => (s.effect as { type: string }).type);
    expect(eff).toContain("tx.rollback");
    expect(outcomes(failed)[1].status).toBe(500);
    const notMine = simulate(
      m,
      { ...m.scenario, conds: { ownsRows: false } },
      1,
    );
    expect(outcomes(notMine)[1].status).toBe(409);
  });
  test("the two requests are different routes with their own slices", () => {
    const { t } = play("todo");
    const routes = ["r1", "r2"].map(
      (r) =>
        (
          stepsOf(t, r).find((s) => s.to.startsWith("r") && s.req)!.req as {
            route: string;
          }
        ).route,
    );
    expect(routes).toEqual(["todos.list", "todos.reorder"]);
  });
});

describe("websocket chat with history", () => {
  test("a connection gets the history; a frame is stored, cached and broadcast", () => {
    expect(results("chat")).toEqual(["r1:responded:0", "r2:responded:0"]);
    const { t } = play("chat");
    const open = stepsOf(t, "r1")
      .filter((s) => s.type === "effect")
      .map(
        (s) =>
          (s.effect as { plugin: string; args?: string[] }).args?.[0] ??
          (s.effect as { plugin: string }).plugin,
      );
    expect(open).toEqual(["LRANGE", "ws"]);
    const frame = stepsOf(t, "r2")
      .filter((s) => s.type === "effect")
      .map((s) => (s.effect as { type: string }).type);
    expect(frame).toEqual(["query", "cmd", "broadcast", "send"]);
  });
  test("the history reaches the browser state", () => {
    const { t } = play("chat");
    expect(stepsOf(t, "r1").at(-1)!.client).toMatchObject({
      messages: ["ann: hello", "bob: hi"],
    });
  });
});

describe("payment webhook with retries and idempotency key", () => {
  test("the flaky billing API is retried twice and then works", () => {
    const { t } = play("payment");
    const retries = stepsOf(t, "r1").filter((s) => s.type === "retry");
    expect(retries).toHaveLength(2);
    expect(results("payment")).toEqual([
      "r1:responded:200",
      "r2:responded:200",
    ]);
    // the second delivery is not affected
    expect(stepsOf(t, "r2").some((s) => s.type === "retry")).toBe(false);
  });
  test("the idempotency key is claimed with SET NX before anything is stored", () => {
    const { t } = play("payment");
    const eff = stepsOf(t, "r1")
      .filter((s) => s.type === "effect")
      .map((s) => s.effect as { plugin: string; args?: string[] });
    const claim = eff.find((e) => e.args?.[0] === "SET")!;
    expect(claim.args).toEqual([
      "SET",
      "idem:pay_1042",
      "1",
      "NX",
      "EX",
      "86400",
    ]);
    const order = eff.map((e) => e.plugin);
    expect(order.indexOf("redis")).toBeLessThan(order.indexOf("pg"));
  });
  test("a duplicate delivery answers 200 and does nothing", () => {
    const m = demoOf("payment").make();
    const t = simulate(m, { ...m.scenario, conds: { duplicate: true } }, 1);
    const eff = stepsOf(t, "r1")
      .filter((s) => s.type === "effect")
      .map((s) => (s.effect as { plugin: string }).plugin);
    expect(eff).not.toContain("pg");
    expect(eff).not.toContain("fetch");
    expect(outcomes(t)[0].status).toBe(200);
  });
  test("when billing keeps failing the key is released and the answer is 502", () => {
    const m = demoOf("payment").make();
    const t = simulate(
      m,
      {
        ...m.scenario,
        faults: [
          {
            id: "f",
            kind: "error",
            target: "ack",
            rid: "",
            code: "ECONNREFUSED",
            ms: 0,
            on: true,
          },
        ],
      },
      1,
    );
    const del = stepsOf(t, "r1")
      .filter((s) => s.type === "effect")
      .map((s) => s.effect as { args?: string[] })
      .find((e) => e.args?.[0] === "DEL");
    expect(del?.args).toEqual(["DEL", "idem:pay_1042"]);
    expect(outcomes(t)[0]).toMatchObject({ status: 502 });
  });
  test("a bad signature answers 400", () => {
    const m = demoOf("payment").make();
    const t = simulate(m, { ...m.scenario, conds: { sigOk: false } }, 1);
    expect(outcomes(t)[0].status).toBe(400);
  });
});

describe("client abort and timeout", () => {
  test("the first client hangs up mid-query; the second request is untouched", () => {
    expect(results("abort")).toEqual(["r1:aborted:0", "r2:responded:200"]);
  });
  test("the cancel greys out the in-flight work and rolls the transaction back", () => {
    const { t } = play("abort");
    const mine = stepsOf(t, "r1");
    expect(
      mine
        .filter((s) => s.type === "cancel")
        .map((s) => s.to)
        .sort(),
    ).toEqual(["agg", "timer"]);
    expect(mine.some((s) => s.type === "rollback")).toBe(true);
    expect(mine.some((s) => s.type === "abort")).toBe(true);
    expect(
      stepsOf(t, "r2").some((s) => s.type === "cancel" && s.to === "timer"),
    ).toBe(true); // after its own response
    expect(stepsOf(t, "r2").some((s) => s.type === "abort")).toBe(false);
  });
  test("the app hears http.aborted and logs it", () => {
    const { t } = play("abort");
    expect(
      stepsOf(t, "r1").some((s) => s.type === "work" && s.to === "logab"),
    ).toBe(true);
  });
  test("with the deadline chip the 504 comes from the handler of request.timeout", () => {
    const m = toggleChip(demoOf("abort").make(), "deadline");
    const t = simulate(
      {
        ...m,
        scenario: {
          ...m.scenario,
          faults: m.scenario.faults.filter((f) => f.kind !== "abort"),
        },
      },
      {
        ...m.scenario,
        faults: m.scenario.faults.filter((f) => f.kind !== "abort"),
      },
      1,
    );
    expect(outcomes(t).map((o) => o.status)).toEqual([504, 504]);
    expect(
      stepsOf(t, "r1").some((s) => s.type === "timeout" && s.to === "htime"),
    ).toBe(true);
    expect(
      stepsOf(t, "r1").some(
        (s) => s.type === "rollback" || (s.type === "effect" && s.to === "trb"),
      ),
    ).toBe(true);
  });
});
