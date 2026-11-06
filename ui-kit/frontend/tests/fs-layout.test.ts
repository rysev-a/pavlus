import { describe, expect, test } from "vitest";
import {
  COL_W,
  GUTTER,
  HOME,
  LANE_MIN,
  MAX_Z,
  MIN_Z,
  VIEW_H,
  VIEW_W,
  autoLayout,
  bandsOf,
  centerOn,
  clampView,
  controls,
  depthsOf,
  externalFor,
  fitView,
  layoutOf,
  neighbor,
  pathOf,
  pointAt,
  reveal,
  viewBoxOf,
  viewSize,
  zoomBy,
} from "../templates/flow-studio/layout.ts";
import {
  LANES,
  NODE_H,
  NODE_W,
  findNode,
  laneOf,
} from "../templates/flow-studio/model.ts";
import { DEMOS } from "../templates/flow-studio/demos.ts";
import { Kit, ping } from "./fs-kit.ts";

describe("swimlanes", () => {
  test("four bands, one under the other, never shorter than a node", () => {
    const b = bandsOf(ping());
    expect(b.map((x) => x.lane)).toEqual(LANES);
    expect(b[0].top).toBe(0);
    for (let i = 1; i < b.length; i++)
      expect(b[i].top).toBe(b[i - 1].top + b[i - 1].h);
    for (const x of b) expect(x.h).toBeGreaterThanOrEqual(LANE_MIN);
  });
  test("a lane grows to hold what is stacked in it", () => {
    const m = new Kit();
    for (let i = 0; i < 4; i++) m.n(`h${i}`, "handler", `h${i}`);
    const laid = m.done();
    const app = bandsOf(laid).find((b) => b.lane === "app")!;
    expect(app.h).toBeGreaterThan(LANE_MIN + 2 * NODE_H);
  });
  test("every node sits inside the band of its lane", () => {
    for (const d of DEMOS) {
      const m = d.make();
      const p = layoutOf(m);
      for (const n of p.nodes) {
        const band = p.bands.find((b) => b.lane === laneOf(n.node))!;
        expect(n.y).toBeGreaterThanOrEqual(band.top);
        expect(n.y + n.h).toBeLessThanOrEqual(band.top + band.h);
        expect(n.x).toBeGreaterThanOrEqual(GUTTER);
      }
    }
  });
  test("a node that is dragged is placed by the offset without changing the model", () => {
    const m = ping();
    const p = layoutOf(m, { h1: { x: 300, y: 50 } });
    const n = p.nodes.find((x) => x.id === "h1")!;
    expect(n.x).toBe(GUTTER + 300);
    expect(findNode(m, "h1")!.x).not.toBe(300);
  });
});

describe("auto layout", () => {
  test("columns follow the order of the flow, left to right", () => {
    const m = ping();
    const d = depthsOf(m);
    expect(d.get("rt")!).toBeGreaterThan(d.get("xc")! - 1);
    expect(d.get("h1")!).toBeLessThan(d.get("pg")!);
    expect(d.get("pg")!).toBeLessThan(d.get("h2")!);
    expect(d.get("h2")!).toBeLessThan(d.get("ok")!);
  });
  test("a node is never left of the node it comes from", () => {
    for (const demo of DEMOS) {
      const m = demo.make();
      const byId = new Map(m.nodes.map((n) => [n.id, n]));
      let forward = 0;
      let counted = 0;
      for (const e of m.edges) {
        const to = byId.get(e.to)!;
        // the reply of a plugin to a module with code closes a cycle by design
        if (
          byId.get(e.from)!.kind === "effect" &&
          to.kind === "module" &&
          m.modules.find((d) => d.id === to.ref)?.body === "code"
        )
          continue;
        counted++;
        if (to.x >= byId.get(e.from)!.x) forward++;
      }
      // the only edges that go back are the ones that close a cycle
      expect(forward).toBe(counted);
    }
  });
  test("two nodes of a lane in one column are stacked, not overlapped", () => {
    const m = new Kit()
      .n("rt", "route", "GET /a", { detail: "a" })
      .n("a", "handler", "a")
      .n("b", "handler", "b")
      .e("rt", "a", "a")
      .e("rt", "b", "b")
      .done();
    const a = findNode(m, "a")!;
    const b = findNode(m, "b")!;
    expect(a.x).toBe(b.x);
    expect(Math.abs(a.y - b.y)).toBeGreaterThanOrEqual(NODE_H);
  });
  test("is deterministic and idempotent", () => {
    const m = ping();
    expect(autoLayout(m)).toEqual(m);
    expect(autoLayout(autoLayout(m))).toEqual(autoLayout(m));
  });
  test("survives a cycle", () => {
    const m = new Kit()
      .n("a", "handler", "a")
      .n("b", "handler", "b")
      .e("a", "b", "x")
      .e("b", "a", "y")
      .done();
    const d = depthsOf(m);
    expect(d.get("a")).toBe(0);
    expect(d.get("b")).toBe(1);
  });
  test("an external sits in the column of the first effect that talks to it", () => {
    const m = new Kit()
      .n("h", "handler", "h")
      .n("pg", "effect", "pg.query")
      .n("x", "external", "Postgres", { plugin: "pg" })
      .e("h", "pg", "pg.query")
      .done();
    expect(findNode(m, "x")!.x).toBe(findNode(m, "pg")!.x);
    expect(externalFor(m, findNode(m, "pg")!)?.id).toBe("x");
    expect(externalFor(m, findNode(m, "h")!)).toBeUndefined();
  });
  test("an empty model lays out to nothing", () => {
    expect(autoLayout(new Kit().done()).nodes).toEqual([]);
  });
});

describe("edges", () => {
  test("start at the right of a node and end at the left of the next", () => {
    const p = layoutOf(ping());
    const e = p.edges.find((x) => x.edge.from === "h1" && x.edge.to === "pg")!;
    const a = p.nodes.find((n) => n.id === "h1")!;
    const b = p.nodes.find((n) => n.id === "pg")!;
    expect(e.x1).toBe(a.x + a.w);
    expect(e.x2).toBe(b.x);
    expect(e.d.startsWith(`M${e.x1}`)).toBe(true);
  });
  test("an effect has a reply port and an error port, an error edge leaves by the second", () => {
    const p = layoutOf(ping());
    const ports = p.ports.filter((x) => x.nodeId === "pg");
    expect(ports.map((x) => x.port)).toEqual(["ok", "err"]);
    const err = p.edges.find(
      (x) => x.edge.kind === "error" && x.edge.from === "pg",
    )!;
    const ok = p.edges.find(
      (x) => x.edge.kind === "reply" && x.edge.from === "pg",
    )!;
    expect(err.y1).toBeGreaterThan(ok.y1);
    expect(p.ports.filter((x) => x.nodeId === "h1")).toHaveLength(1);
  });
  test("the wires join an effect to its external", () => {
    const m = DEMOS[0].make();
    const p = layoutOf(m);
    expect(p.wires.length).toBeGreaterThan(5);
    for (const w of p.wires) expect(w.y2).toBeGreaterThan(w.y1);
  });
  test("the path starts and ends where it should, a token travels along it", () => {
    const a = { x1: 10, y1: 20 };
    const b = { x2: 300, y2: 120 };
    const { d, lx, ly } = pathOf(a, b);
    expect(d).toMatch(/^M10 20 C/);
    const e = { ...a, ...b };
    expect(pointAt(e, 0)).toEqual({ x: 10, y: 20 });
    expect(pointAt(e, 1)).toEqual({ x: 300, y: 120 });
    const mid = pointAt(e, 0.5);
    expect(mid.x).toBeCloseTo(lx, 5);
    expect(mid.y).toBeCloseTo(ly, 5);
    // a path that goes back loops out to the right first
    expect(controls(300, 0, 100, 0).c1x).toBeGreaterThan(300);
  });
  test("the world is wide enough for the nodes", () => {
    for (const d of DEMOS) {
      const p = layoutOf(d.make());
      for (const n of p.nodes) expect(n.x + n.w).toBeLessThanOrEqual(p.width);
      expect(p.height).toBeGreaterThan(0);
    }
  });
  test("the columns have room for a label", () => {
    expect(COL_W - NODE_W).toBeGreaterThanOrEqual(60);
  });
});

describe("the viewport", () => {
  test("zoom keeps the center and is clamped", () => {
    const v = zoomBy(HOME, 2);
    expect(v.z).toBe(2);
    expect(v.x + VIEW_W / v.z / 2).toBeCloseTo(HOME.x + VIEW_W / 2, 5);
    expect(zoomBy(HOME, 1000).z).toBe(MAX_Z);
    expect(zoomBy(HOME, 0.0001).z).toBe(MIN_Z);
  });
  test("fit shows the whole world", () => {
    const w = 3000;
    const h = 600;
    const v = fitView(w, h);
    const s = viewSize(v);
    expect(v.x).toBeLessThanOrEqual(0);
    expect(v.x + s.w).toBeGreaterThanOrEqual(w);
    expect(v.y + s.h).toBeGreaterThanOrEqual(h);
    // a small world is centered, never zoomed beyond the limit
    const small = fitView(100, 100);
    expect(small.z).toBeLessThanOrEqual(MAX_Z);
  });
  test("centerOn and reveal", () => {
    const c = centerOn(HOME, 1000, 500);
    expect(c.x).toBe(1000 - VIEW_W / 2);
    expect(c.y).toBe(500 - VIEW_H / 2);
    const inside = { x: 100, y: 100, w: 50, h: 50 };
    expect(reveal(HOME, inside)).toBe(HOME);
    const outside = { x: 2000, y: 100, w: 140, h: 46 };
    const r = reveal(HOME, outside);
    expect(r.x).toBeGreaterThan(0);
    expect(r.x + VIEW_W / 2).toBeCloseTo(2070, 5);
  });
  test("panning is limited to the world", () => {
    const far = clampView({ x: 99999, y: -99999, z: 1 }, 1000, 500);
    expect(far.x).toBeLessThanOrEqual(1000);
    expect(far.y).toBeGreaterThanOrEqual(-VIEW_H);
  });
  test("the viewBox follows the zoom", () => {
    expect(viewBoxOf({ x: 5, y: 6, z: 2 })).toBe(
      `5 6 ${VIEW_W / 2} ${VIEW_H / 2}`,
    );
  });
});

describe("the keyboard moves the selection between nodes", () => {
  const m = ping();
  const p = layoutOf(m);
  test("right goes to the next column, left back", () => {
    const right = neighbor(p.nodes, "h1", "right");
    expect(right).not.toBeNull();
    const rn = p.nodes.find((n) => n.id === right)!;
    const hn = p.nodes.find((n) => n.id === "h1")!;
    expect(rn.x).toBeGreaterThan(hn.x);
    expect(neighbor(p.nodes, right!, "left")).not.toBeNull();
  });
  test("up and down change the lane", () => {
    const down = neighbor(p.nodes, "h1", "down")!;
    expect(p.nodes.find((n) => n.id === down)!.y).toBeGreaterThan(
      p.nodes.find((n) => n.id === "h1")!.y,
    );
    const up = neighbor(p.nodes, "pg", "up")!;
    expect(p.nodes.find((n) => n.id === up)!.y).toBeLessThan(
      p.nodes.find((n) => n.id === "pg")!.y,
    );
    expect(neighbor(p.nodes, "h1", "up")).toBeNull();
  });
  test("nothing beyond the edge, and an unknown node starts from the first", () => {
    const leftmost = [...p.nodes].sort((a, b) => a.x - b.x)[0].id;
    expect(neighbor(p.nodes, leftmost, "left")).toBeNull();
    expect(neighbor(p.nodes, "zzz", "right")).toBe(p.nodes[0].id);
    expect(neighbor([], "a", "right")).toBeNull();
  });
});
