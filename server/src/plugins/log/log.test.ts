import { describe, expect, it } from "vitest";
import { collector } from "../../testing/collector.ts";
import { createLogPlugin, logEffector as log, Metrics } from "./mod.ts";

const pc = (dispatch: any): any => ({
  dispatch,
  getState: () => undefined,
  dispatchEffect() {},
});

function setup(o: Parameters<typeof createLogPlugin>[0] = {}) {
  const lines: any[] = [];
  const p = createLogPlugin({
    now: () => 0,
    ...o,
    sink: (l) => lines.push(JSON.parse(l)),
  });
  return { p, lines, c: collector() };
}

describe("log plugin", () => {
  it("writes json with rid/connId from ctx and merges fields", () => {
    const { p, lines, c } = setup();
    p.handle(
      { ...log.info("hello", { a: 1 }), ctx: { rid: "r1", connId: "c1" } },
      pc(c.dispatch),
    );
    expect(lines).toEqual([
      {
        ts: "1970-01-01T00:00:00.000Z",
        level: "info",
        msg: "hello",
        rid: "r1",
        connId: "c1",
        a: 1,
      },
    ]);
  });
  it("filters by level", () => {
    const { p, lines, c } = setup({ level: "warn" });
    p.handle(log.info("x"), pc(c.dispatch));
    p.handle(log.error("y"), pc(c.dispatch));
    expect(lines.map((l) => l.msg)).toEqual(["y"]);
  });
  it("redacts nested keys, case/dash insensitive, and survives cycles", () => {
    const { p, lines, c } = setup({ redact: ["ssn"] });
    const cyc: any = { Password: "p" };
    cyc.self = cyc;
    p.handle(
      log.info("x", {
        headers: { Authorization: "Bearer a", "x-api-key": "k" },
        user: { ssn: "1", name: "n" },
        list: [{ token: "t" }],
        cyc,
      }),
      pc(c.dispatch),
    );
    expect(lines[0].headers).toEqual({
      Authorization: "[REDACTED]",
      "x-api-key": "[REDACTED]",
    });
    expect(lines[0].user).toEqual({ ssn: "[REDACTED]", name: "n" });
    expect(lines[0].list).toEqual([{ token: "[REDACTED]" }]);
    expect(lines[0].cyc).toEqual({
      Password: "[REDACTED]",
      self: "[Circular]",
    });
  });
  it("does not let fields overwrite core keys; serialises errors", () => {
    const { p, lines, c } = setup();
    p.handle(
      log.error("boom", { level: "x", err: new Error("bad") }),
      pc(c.dispatch),
    );
    expect(lines[0].level).toBe("error");
    expect(lines[0].err.message).toBe("bad");
  });
  it("pretty mode", () => {
    const out: string[] = [];
    const p = createLogPlugin({
      pretty: true,
      now: () => 0,
      sink: (l) => out.push(l),
    });
    p.log("info", "hi", { a: 1 }, { rid: "r" });
    expect(out[0]).toContain("INFO");
    expect(out[0]).toContain("[r] hi");
  });
});

describe("metrics", () => {
  it("counters and histograms expose prometheus text", () => {
    const m = new Metrics();
    m.inc("http_requests_total", { method: "GET", status: 200 });
    m.inc("http_requests_total", { status: 200, method: "GET" }, 2);
    m.observe("latency_seconds", 0.03, {}, [0.01, 0.1]);
    m.observe("latency_seconds", 0.5, {}, [0.01, 0.1]);
    expect(m.value("http_requests_total", { method: "GET", status: 200 })).toBe(
      3,
    );
    expect(m.text()).toBe(
      [
        "# TYPE http_requests_total counter",
        'http_requests_total{method="GET",status="200"} 3',
        "# TYPE latency_seconds histogram",
        'latency_seconds_bucket{le="0.01"} 0',
        'latency_seconds_bucket{le="0.1"} 1',
        'latency_seconds_bucket{le="+Inf"} 2',
        "latency_seconds_sum 0.53",
        "latency_seconds_count 2",
        "",
      ].join("\n"),
    );
  });
  it("plugin effects and metrics.get reply", () => {
    const { p, c } = setup();
    p.handle(log.inc("jobs_total", { kind: 'a"b' }), pc(c.dispatch));
    p.handle({ ...log.metrics("m"), ctx: { rid: "r" } }, pc(c.dispatch));
    expect(c.messages[0]!.payload).toContain('jobs_total{kind="a\\"b"} 1');
    expect(c.messages[0]!.ctx).toEqual({ rid: "r" });
  });
  it("rejects bad names", () => {
    expect(() => new Metrics().inc("bad name")).toThrow();
  });
});
