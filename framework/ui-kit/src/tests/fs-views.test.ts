// Sequence, catalog, timeline and the svg trees: built from the design (and the
// trace), and every tree is accepted by the svg plugin.

import type { Message } from "@pavlus/client";
import { createSvgPlugin, type SvgNode } from "@pavlus/client/plugins";
import { describe, expect, test } from "vitest";
import {
  canvasTree,
  minimapTree,
  ridColor,
  seenOf,
} from "../templates/flow-studio/canvas.ts";
import {
  catalogOf,
  coverage,
  schemaText,
} from "../templates/flow-studio/catalog.ts";
import {
  DEMOS,
  loginDemo,
  paymentDemo,
} from "../templates/flow-studio/demos.ts";
import { simulate } from "../templates/flow-studio/engine.ts";
import { HOME, layoutOf } from "../templates/flow-studio/layout.ts";
import {
  buildSequence,
  itemsOf,
  labelsOf,
  lifelinesOf,
  sequenceTree,
} from "../templates/flow-studio/sequence.ts";
import {
  buildTimeline,
  tickStep,
  timelineTree,
} from "../templates/flow-studio/timeline.ts";
import { Kit, ping } from "./fs-kit.ts";

/** What the svg plugin makes of a tree (it throws when the tree is not allowed). */
function svgText(tree: SvgNode): string {
  let out = "";
  const plugin = createSvgPlugin();
  plugin.handle({ plugin: "svg", type: "toString", tree, onSuccess: "done" }, {
    dispatch: (m: Message) => (out = m.payload as string),
  } as never);
  return out;
}

describe("the sequence diagram", () => {
  const m = loginDemo();
  const seq = buildSequence(m);

  test("lifelines: the browser, the app, then what the design uses", () => {
    expect(seq.lifelines.map((l) => l.label)).toEqual([
      "Browser",
      "App",
      "Postgres",
      "Redis",
      "crypto plugin",
      "log plugin",
    ]);
    const xs = seq.lifelines.map((l) => l.x);
    expect([...xs].sort((a, b) => a - b)).toEqual(xs);
  });
  test("without a browser the client is named by the design", () => {
    expect(lifelinesOf(paymentDemo())[0].label).toBe("Payment provider");
    expect(lifelinesOf(ping())[0].label).toBe("Client");
  });
  test("arrows carry the message ids, the effect types and the route", () => {
    const labels = labelsOf(seq);
    expect(labels).toContain("http.request POST /login");
    expect(labels.some((l) => l.startsWith("redis.cmd INCR rl:"))).toBe(true);
    expect(labels).toContain("auth.login.counted");
    expect(labels).toContain("auth.login.found");
    expect(labels.some((l) => l.startsWith("pg.query select id"))).toBe(true);
    expect(labels.some((l) => l.startsWith("http.respond 200"))).toBe(true);
    expect(labels).toContain("onLoggedIn");
  });
  test("a request goes from the client to the app, a reply from the plugin to the app", () => {
    const req = seq.rows.find(
      (r) => r.item.t === "arrow" && r.item.label.startsWith("http.request"),
    )!;
    expect(req.item).toMatchObject({
      t: "arrow",
      from: "client",
      to: "app",
      rid: true,
    });
    const reply = seq.rows.find((r) => r.item.label === "auth.login.found")!;
    expect(reply.item).toMatchObject({
      t: "arrow",
      from: "pg",
      to: "app",
      kind: "reply",
    });
    const err = seq.rows.find((r) => r.item.label === "auth.failed")!;
    expect(err.item).toMatchObject({ kind: "error", dashed: true });
  });
  test("conditions are alt (both sides) and opt (one side) fragments", () => {
    const tree = itemsOf(m);
    const frags: { op: string; guards: string[] }[] = [];
    const walk = (items: ReturnType<typeof itemsOf>): void => {
      for (const it of items)
        if (it.t === "frag") {
          frags.push({ op: it.op, guards: it.branches.map((b) => b.guard) });
          it.branches.forEach((b) => walk(b.items));
        }
    };
    walk(tree);
    expect(frags).toContainEqual({ op: "alt", guards: ["limited", "else"] });
    expect(frags).toContainEqual({ op: "opt", guards: ["firstHit"] });
    // the failure path of an effect is an alt of ok and onError
    expect(frags).toContainEqual({ op: "alt", guards: ["ok", "onError"] });
  });
  test("fragments nest inside each other and are drawn around their rows", () => {
    expect(seq.frags.length).toBeGreaterThan(8);
    expect(Math.max(...seq.frags.map((f) => f.depth))).toBeGreaterThan(1);
    for (const f of seq.frags) {
      expect(f.y2).toBeGreaterThan(f.y1);
      expect(f.guards.length).toBeGreaterThan(0);
    }
  });
  test("activation bars: the app is busy, a plugin from its call to its reply", () => {
    const app = seq.activations.filter((a) => a.lifeline === "app");
    expect(app).toHaveLength(1);
    const pg = seq.activations.filter((a) => a.lifeline === "pg");
    expect(pg.length).toBeGreaterThan(0);
    for (const a of seq.activations) expect(a.y2).toBeGreaterThan(a.y1);
  });
  test("rows are in the order of the flow, top to bottom", () => {
    const ys = seq.rows.map((r) => r.y);
    expect([...ys].sort((a, b) => a - b)).toEqual(ys);
    expect(seq.height).toBeGreaterThan(Math.max(...ys));
  });
  test("a join point is shown once and then referred to", () => {
    expect(
      labelsOf(seq).filter((l) => l === "auth.failed (as above)").length,
    ).toBeGreaterThan(0);
    // the handler of the failure is expanded once: its log line appears once
    expect(labelsOf(seq).filter((l) => l.startsWith("log error")).length).toBe(
      1,
    );
  });
  test("the tree is a valid svg and lights the current step", () => {
    const edge = seq.rows.find((r) => r.item.edge)!.item.edge;
    const tree = sequenceTree(seq, {
      current: edge,
      passed: [edge],
      selEdge: "",
      prefix: "p.",
    });
    const text = svgText(tree);
    expect(text).toContain("<svg");
    expect(text).toContain("is-current");
    expect(text).toContain("is-passed");
    expect(text).toContain("Browser");
  });
  test("every demo has a sequence", () => {
    for (const d of DEMOS) {
      const s = buildSequence(d.make());
      expect(s.rows.length).toBeGreaterThan(8);
      expect(
        svgText(
          sequenceTree(s, { current: "", passed: [], selEdge: "", prefix: "" }),
        ),
      ).toContain("<svg");
    }
  });
  test("an empty design has lifelines and no arrows", () => {
    const s = buildSequence(new Kit().done());
    expect(s.rows).toEqual([]);
    expect(s.lifelines.map((l) => l.id)).toEqual(["client", "app"]);
  });
});

describe("the catalog", () => {
  const m = loginDemo();
  const rows = catalogOf(m);
  const row = (id: string) => rows.find((r) => r.id === id)!;
  test("lists messages and effects, each once", () => {
    const keys = rows.map((r) => `${r.kind}:${r.id}`);
    expect(new Set(keys).size).toBe(keys.length);
    expect(row("auth.login.found").kind).toBe("message");
    expect(row("pg.query").kind).toBe("effect");
  });
  test("producers and consumers are the titles of the nodes", () => {
    expect(row("auth.login.found")).toMatchObject({
      producers: ["pg.query"],
      consumers: ["auth.login.found"],
    });
    expect(row("pg.query").producers).toEqual(["auth.login.counted"]);
    expect(row("pg.query").consumers).toEqual(["pg.query"]);
    expect(row("http.request").consumers).toEqual(["POST /login"]);
  });
  test("the payload schema is the union of the fields of the edges", () => {
    expect(schemaText(row("auth.login.counted").fields)).toBe("count: number");
    expect(schemaText(row("http.request").fields)).toContain(
      "body.email: string",
    );
    expect(schemaText([])).toBe("(forwarded as it came)");
    // the errors of every effect share one message id: the fields are merged once
    expect(row("auth.failed").fields.map((f) => f.name)).toEqual([
      "code",
      "message",
    ]);
  });
  test("tests: which simulated path plays the message", () => {
    const cov = coverage(m);
    expect(cov.get("auth.login.found")).toContain("happy path");
    expect(cov.get("auth.failed")!.length).toBeGreaterThan(1);
    expect(row("auth.login.found").tests).toContain("happy path");
    // the rate limit branch is a test of its own
    expect(row("http.respond").tests.some((t) => t.includes("limited"))).toBe(
      true,
    );
  });
  test("a message no test plays is marked", () => {
    const orphan = new Kit()
      .n("a", "handler", "a")
      .n("b", "handler", "never.played")
      .e("a", "b", "never.played")
      .done();
    expect(catalogOf(orphan)[0].tests).toEqual([]);
  });
  test("can skip the tests for speed", () => {
    expect(catalogOf(m, false).every((r) => r.tests.length === 0)).toBe(true);
  });
});

describe("the timeline", () => {
  const m = loginDemo();
  const trace = simulate(m, m.scenario, 1);
  test("rows: the network, then each effect that took time", () => {
    const tl = buildTimeline(m, trace, "r1");
    expect(tl.rows[0].id).toBe("net");
    expect(tl.rows.length).toBeGreaterThan(5);
    const verify = tl.rows.find((r) => r.id === "verify")!;
    expect(verify.bars[0]).toMatchObject({ kind: "work" });
    expect(verify.bars[0].t1 - verify.bars[0].t0).toBeGreaterThan(40);
    expect(tl.t1).toBeGreaterThan(tl.t0);
  });
  test("the request goes over the network first", () => {
    const tl = buildTimeline(m, trace, "r1");
    expect(tl.rows[0].bars[0]).toMatchObject({
      kind: "hop",
      label: "http.request",
    });
  });
  test("a retry shows its backoff as a wait", () => {
    const pay = paymentDemo();
    const t = simulate(pay, pay.scenario, 1);
    const tl = buildTimeline(pay, t, "r1");
    const ack = tl.rows.find((r) => r.id === "ack")!;
    expect(ack.bars.map((b) => b.kind)).toEqual([
      "retry",
      "wait",
      "retry",
      "wait",
      "work",
    ]);
  });
  test("a cancel cuts the work short and is marked", () => {
    const t = simulate(
      m,
      {
        ...m.scenario,
        faults: [
          {
            id: "a",
            kind: "abort",
            target: "",
            rid: "r1",
            code: "",
            ms: 40,
            on: true,
          },
        ],
      },
      1,
    );
    const tl = buildTimeline(m, t, "r1");
    expect(
      tl.rows.some((r) => r.bars.some((b) => b.kind === "cancelled")),
    ).toBe(true);
    expect(tl.marks.map((k) => k.kind)).toContain("abort");
    expect(tl.marks.map((k) => k.kind)).toContain("cancel");
    expect(tl.marks.map((k) => k.kind)).toContain("done");
  });
  test("a time axis with round ticks", () => {
    expect(tickStep(100)).toBe(10);
    expect(tickStep(1000)).toBe(100);
    expect(tickStep(37)).toBe(5);
    expect(tickStep(0.3)).toBeGreaterThan(0);
  });
  test("the tree is valid and has a cursor", () => {
    const tl = buildTimeline(m, trace, "r2");
    const text = svgText(timelineTree(tl, { cursor: tl.t0 + 5, prefix: "" }));
    expect(text).toContain("fs-tl__cursor");
    expect(text).toContain("fs-tl__bar");
    expect(
      svgText(timelineTree(tl, { cursor: null, prefix: "" })),
    ).not.toContain("fs-tl__cursor");
  });
  test("a trace without the request gives an empty timeline", () => {
    const tl = buildTimeline(m, trace, "zz");
    expect(tl.marks).toEqual([]);
  });
});

describe("the flow canvas tree", () => {
  const m = loginDemo();
  const placed = layoutOf(m);
  const trace = simulate(m, m.scenario, 1);
  const ui = (over: Partial<Parameters<typeof canvasTree>[1]> = {}) => ({
    prefix: "fs.",
    vp: HOME,
    selNode: "",
    selEdge: "",
    breakpoints: {},
    link: null,
    trace: null,
    pos: -1,
    progress: 1,
    faultNodes: [],
    ...over,
  });
  test("draws every node, every edge and every lane", () => {
    const text = svgText(canvasTree(placed, ui()));
    expect((text.match(/class="fs-n /g) ?? []).length).toBe(m.nodes.length);
    expect((text.match(/class="fs-edge fs-edge--/g) ?? []).length).toBe(
      m.edges.length,
    );
    for (const lane of [
      "BROWSER",
      "Browser",
      "App",
      "Plugins",
      "Externals",
    ].slice(1))
      expect(text).toContain(lane);
  });
  test("labels are the exact message ids and effect types, with the rid badge", () => {
    const text = svgText(canvasTree(placed, ui()));
    expect(text).toContain(">http.request<");
    expect(text).toContain(">auth.login.counted<");
    expect(text).toContain(">pg.query<");
    expect(text).toContain("fs-rid");
    expect(text).toContain("if !limited");
  });
  test("edges are painted by kind", () => {
    const text = svgText(canvasTree(placed, ui()));
    for (const k of ["request", "effect", "reply", "error"])
      expect(text).toContain(`fs-edge--${k}`);
  });
  test("selection, breakpoints and faults are marked", () => {
    const text = svgText(
      canvasTree(
        placed,
        ui({
          selNode: "h1",
          selEdge: "e1",
          breakpoints: { h2: true },
          faultNodes: ["pgu"],
        }),
      ),
    );
    expect(text).toContain("is-sel");
    expect(text).toContain("has-bp");
    expect(text).toContain("has-fault");
  });
  test("the tokens of the trace: one per request, in the colour of its rid", () => {
    const at = trace.findIndex((s) => s.rid === "r2" && s.type === "message");
    const text = svgText(
      canvasTree(placed, ui({ trace, pos: at, progress: 0.5 })),
    );
    expect((text.match(/class="fs-token /g) ?? []).length).toBe(2);
    expect(text).toContain("fs-rc-0");
    expect(text).toContain("fs-rc-1");
    expect(ridColor(trace, "r1")).toBe(0);
    expect(ridColor(trace, "r2")).toBe(1);
    expect(ridColor(null, "r9")).toBe(0);
  });
  test("a cancel is drawn as a cancel edge and the node is greyed", () => {
    const aborted = simulate(
      m,
      {
        ...m.scenario,
        faults: [
          {
            id: "a",
            kind: "abort",
            target: "",
            rid: "r1",
            code: "",
            ms: 40,
            on: true,
          },
        ],
      },
      1,
    );
    const end = aborted.length - 1;
    const seen = seenOf(aborted, end);
    expect(seen.cancelledNodes.size).toBeGreaterThan(0);
    const text = svgText(canvasTree(placed, ui({ trace: aborted, pos: end })));
    expect(text).toContain("fs-edge--cancel is-seen");
    expect(text).toContain("is-cancelled");
    expect(text).toContain("is-dead");
  });
  test("the link being dragged is drawn from its port", () => {
    const text = svgText(
      canvasTree(
        placed,
        ui({ link: { from: "h1", port: "out", x: 500, y: 100 } }),
      ),
    );
    expect(text).toContain("fs-link");
  });
  test("the seen edges after a step are marked, with the rid colour", () => {
    const s = seenOf(trace, 10);
    expect(s.edges.size).toBeGreaterThan(3);
    expect(s.tokens.length).toBe(2);
    expect(seenOf(trace, -1).edges.size).toBe(0);
  });
  test("the minimap shows the lanes, the nodes and the view", () => {
    const text = svgText(minimapTree(placed, HOME, "fs.", "h1"));
    expect((text.match(/fs-mm__node /g) ?? []).length).toBe(m.nodes.length);
    expect(text).toContain("fs-mm__view");
    expect(text).toContain("is-sel");
  });
  test("every demo draws", () => {
    for (const d of DEMOS) {
      const dm = d.make();
      expect(svgText(canvasTree(layoutOf(dm), ui()))).toContain("fs-fl");
    }
  });
  test("a node has an accessible name and a roving tabindex", () => {
    const text = svgText(canvasTree(placed, ui({ selNode: "h1" })));
    expect(text).toContain('role="button"');
    expect(text).toContain('aria-label="Pure handler auth.login');
    expect((text.match(/tabindex="0"/g) ?? []).length).toBe(1);
  });
});
