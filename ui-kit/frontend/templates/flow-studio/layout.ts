// Geometry of the flow canvas: the swimlanes, where the nodes and ports are, the
// path of an edge, the auto-layout per lane, the viewport (zoom and pan) and the
// keyboard navigation between nodes. Pure: the model in, numbers out.
import {
  type EdgeKind,
  type FlowEdge,
  type FlowNode,
  type Lane,
  type Model,
  EXTERNAL_OF,
  KIND_LANE,
  LANES,
  NODE_H,
  NODE_W,
  findNode,
  laneOf,
} from "./model.ts";

/** the width of the lane labels on the left */
export const GUTTER = 92;
export const COL_W = NODE_W + 40;
export const LANE_PAD = 16;
export const STACK_GAP = 14;
export const LANE_MIN = NODE_H + LANE_PAD * 2;
/** the size of the view at zoom 1, in world units */
export const VIEW_W = 1000;
export const VIEW_H = 520;

export interface Band {
  lane: Lane;
  top: number;
  h: number;
}

export interface PNode {
  id: string;
  node: FlowNode;
  x: number;
  y: number;
  w: number;
  h: number;
  lane: Lane;
}

export interface Port {
  /** `out` for most nodes, `ok` and `err` for effects */
  port: "out" | "ok" | "err";
  nodeId: string;
  x: number;
  y: number;
}

export interface PEdge {
  edge: FlowEdge;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  d: string;
  /** the middle of the path, where the label goes */
  lx: number;
  ly: number;
}

export interface Wire {
  effect: string;
  external: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface Placed {
  bands: Band[];
  nodes: PNode[];
  ports: Port[];
  edges: PEdge[];
  wires: Wire[];
  width: number;
  height: number;
}

export type Offsets = Record<string, { x: number; y: number }>;

export function bandsOf(m: Model, over: Offsets = {}): Band[] {
  let top = 0;
  return LANES.map((lane) => {
    const mine = m.nodes.filter((n) => laneOf(n) === lane);
    const bottom = mine.reduce(
      (mx, n) => Math.max(mx, (over[n.id]?.y ?? n.y) + NODE_H),
      0,
    );
    const h = Math.max(LANE_MIN, bottom + LANE_PAD);
    const band = { lane, top, h };
    top += h;
    return band;
  });
}

export const portsOf = (p: PNode): Port[] =>
  p.node.kind === "effect"
    ? [
        { port: "ok", nodeId: p.id, x: p.x + p.w, y: p.y + p.h * 0.3 },
        { port: "err", nodeId: p.id, x: p.x + p.w, y: p.y + p.h * 0.74 },
      ]
    : [{ port: "out", nodeId: p.id, x: p.x + p.w, y: p.y + p.h / 2 }];

/** The control points of the curve from (x1, y1) to (x2, y2). */
export function controls(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): { c1x: number; c2x: number } {
  const back = x2 < x1 + 8;
  const dx = back ? 56 : Math.max(36, (x2 - x1) / 2);
  void y1;
  void y2;
  return { c1x: x1 + dx, c2x: x2 - dx };
}

/** Where an edge starts and ends, and the path between. */
export function pathOf(
  a: { x1: number; y1: number },
  b: { x2: number; y2: number },
): { d: string; lx: number; ly: number } {
  const { x1, y1 } = a;
  const { x2, y2 } = b;
  const { c1x, c2x } = controls(x1, y1, x2, y2);
  const d = `M${r(x1)} ${r(y1)} C${r(c1x)} ${r(y1)} ${r(c2x)} ${r(y2)} ${r(x2)} ${r(y2)}`;
  // the point of the curve at t = 0.5
  const lx = (x1 + 3 * c1x + 3 * c2x + x2) / 8;
  const ly = (y1 + 3 * y1 + 3 * y2 + y2) / 8;
  return { d, lx, ly };
}

/** The point at `t` (0..1) along an edge: a token travels there. */
export function pointAt(
  e: { x1: number; y1: number; x2: number; y2: number },
  t: number,
): { x: number; y: number } {
  const { c1x, c2x } = controls(e.x1, e.y1, e.x2, e.y2);
  const u = 1 - t;
  const x = u * u * u * e.x1 + 3 * u * u * t * c1x + 3 * u * t * t * c2x + t * t * t * e.x2;
  const y = u * u * u * e.y1 + 3 * u * u * t * e.y1 + 3 * u * t * t * e.y2 + t * t * t * e.y2;
  return { x, y };
}
const r = (n: number): number => Math.round(n * 10) / 10;

export function layoutOf(m: Model, over: Offsets = {}): Placed {
  const bands = bandsOf(m, over);
  const top = new Map(bands.map((b) => [b.lane, b.top]));
  const nodes: PNode[] = m.nodes.map((node) => {
    const lane = laneOf(node);
    const o = over[node.id];
    return {
      id: node.id,
      node,
      x: GUTTER + (o?.x ?? node.x),
      y: (top.get(lane) ?? 0) + (o?.y ?? node.y),
      w: NODE_W,
      h: NODE_H,
      lane,
    };
  });
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const ports = nodes.flatMap(portsOf);
  const edges: PEdge[] = [];
  for (const edge of m.edges) {
    const a = byId.get(edge.from);
    const b = byId.get(edge.to);
    if (!a || !b) continue;
    const want = a.node.kind === "effect" ? (edge.kind === "error" ? "err" : "ok") : "out";
    const pt = ports.find((p) => p.nodeId === a.id && p.port === want)!;
    const geo = {
      x1: pt.x,
      y1: pt.y,
      x2: b.x,
      y2: b.y + b.h / 2,
    };
    edges.push({ edge, ...geo, ...pathOf(geo, geo) });
  }
  const wires: Wire[] = [];
  for (const e of nodes) {
    if (e.node.kind !== "effect") continue;
    const ext = externalFor(m, e.node);
    const x = ext ? byId.get(ext.id) : undefined;
    if (!x) continue;
    wires.push({
      effect: e.id,
      external: x.id,
      x1: e.x + e.w / 2,
      y1: e.y + e.h,
      x2: x.x + x.w / 2,
      y2: x.y,
    });
  }
  const last = bands[bands.length - 1];
  const width = Math.max(
    GUTTER + 4 * COL_W,
    ...nodes.map((n) => n.x + n.w + 48),
  );
  return { bands, nodes, ports, edges, wires, width, height: last.top + last.h };
}

/** The external node an effect talks to (the first of its plugin). */
export function externalFor(m: Model, effect: FlowNode): FlowNode | undefined {
  const want = EXTERNAL_OF[effect.plugin];
  if (!want) return undefined;
  return (
    m.nodes.find((n) => n.kind === "external" && n.plugin === effect.plugin) ??
    m.nodes.find(
      (n) =>
        n.kind === "external" &&
        EXTERNAL_OF[n.plugin]?.id === want.id,
    )
  );
}

// ---- auto layout per lane ----

/** Columns by the longest path from the starts; the nodes of a lane stack. */
export function depthsOf(m: Model): Map<string, number> {
  const ids = new Set(m.nodes.map((n) => n.id));
  const out = new Map<string, string[]>();
  for (const e of m.edges)
    if (ids.has(e.from) && ids.has(e.to)) {
      const l = out.get(e.from) ?? [];
      l.push(e.to);
      out.set(e.from, l);
    }
  // drop the edges that close a cycle (found by a depth-first walk)
  const state = new Map<string, 0 | 1 | 2>();
  const back = new Set<string>();
  const walk = (id: string): void => {
    state.set(id, 1);
    for (const to of out.get(id) ?? []) {
      const s = state.get(to) ?? 0;
      if (s === 1) back.add(`${id}>${to}`);
      else if (s === 0) walk(to);
    }
    state.set(id, 2);
  };
  const hasIn = new Set(
    m.edges.filter((e) => ids.has(e.from) && ids.has(e.to)).map((e) => e.to),
  );
  for (const n of m.nodes) if (!hasIn.has(n.id) && !state.has(n.id)) walk(n.id);
  for (const n of m.nodes) if (!state.has(n.id)) walk(n.id);
  const depth = new Map<string, number>();
  const visit = (id: string, d: number, seen: Set<string>): void => {
    if ((depth.get(id) ?? -1) >= d || seen.has(id)) return;
    depth.set(id, d);
    seen.add(id);
    for (const to of out.get(id) ?? [])
      if (!back.has(`${id}>${to}`)) visit(to, d + 1, seen);
    seen.delete(id);
  };
  for (const n of m.nodes)
    if (!hasIn.has(n.id) && n.kind !== "external") visit(n.id, 0, new Set());
  for (const n of m.nodes) if (!depth.has(n.id) && n.kind !== "external") visit(n.id, 0, new Set());
  // an external sits under the first effect of its plugin
  for (const n of m.nodes) {
    if (n.kind !== "external") continue;
    const users = m.nodes.filter(
      (e) =>
        e.kind === "effect" &&
        (e.plugin === n.plugin || EXTERNAL_OF[e.plugin]?.id === EXTERNAL_OF[n.plugin]?.id),
    );
    const entry = m.edges.some((e) => e.from === n.id) && !m.edges.some((e) => e.to === n.id);
    const ds = users.map((u) => depth.get(u.id) ?? 0);
    depth.set(n.id, entry ? 0 : ds.length ? Math.min(...ds) : 0);
  }
  return depth;
}

export function autoLayout(m: Model): Model {
  const depth = depthsOf(m);
  const slots = new Map<string, number>();
  const nodes = m.nodes.map((n) => ({ ...n }));
  // order inside a column: by the height of what the node comes from
  const order = [...nodes].sort(
    (a, b) =>
      (depth.get(a.id) ?? 0) - (depth.get(b.id) ?? 0) ||
      m.nodes.indexOf(findNode(m, a.id)!) - m.nodes.indexOf(findNode(m, b.id)!),
  );
  for (const n of order) {
    const key = `${KIND_LANE[n.kind]}:${depth.get(n.id) ?? 0}`;
    const i = slots.get(key) ?? 0;
    slots.set(key, i + 1);
    n.x = (depth.get(n.id) ?? 0) * COL_W + 8;
    n.y = LANE_PAD + i * (NODE_H + STACK_GAP);
  }
  return { ...m, nodes };
}

// ---- the viewport ----

export interface Viewport {
  x: number;
  y: number;
  z: number;
}
export const MIN_Z = 0.3;
export const MAX_Z = 2.4;
export const HOME: Viewport = { x: 0, y: 0, z: 1 };

export const clampZ = (z: number): number => Math.min(MAX_Z, Math.max(MIN_Z, z));
export const viewBoxOf = (v: Viewport): string =>
  `${r(v.x)} ${r(v.y)} ${r(VIEW_W / v.z)} ${r(VIEW_H / v.z)}`;
export const viewSize = (v: Viewport): { w: number; h: number } => ({
  w: VIEW_W / v.z,
  h: VIEW_H / v.z,
});

/** Zoom by a factor around the center of the view. */
export function zoomBy(v: Viewport, factor: number): Viewport {
  const z = clampZ(v.z * factor);
  const cx = v.x + VIEW_W / v.z / 2;
  const cy = v.y + VIEW_H / v.z / 2;
  return { x: cx - VIEW_W / z / 2, y: cy - VIEW_H / z / 2, z };
}

/** Shows the whole world. */
export function fitView(width: number, height: number): Viewport {
  const pad = 12;
  const z = clampZ(Math.min(VIEW_W / (width + pad * 2), VIEW_H / (height + pad * 2)));
  return {
    x: -pad - (VIEW_W / z - (width + pad * 2)) / 2 + 0,
    y: -pad,
    z,
  };
}

export function centerOn(v: Viewport, x: number, y: number): Viewport {
  return { ...v, x: x - VIEW_W / v.z / 2, y: y - VIEW_H / v.z / 2 };
}

/** Moves the view only when the rectangle is not inside it (the token is followed). */
export function reveal(
  v: Viewport,
  rect: { x: number; y: number; w: number; h: number },
): Viewport {
  const { w, h } = viewSize(v);
  const m = 24;
  const inside =
    rect.x >= v.x + m &&
    rect.x + rect.w <= v.x + w - m &&
    rect.y >= v.y + m &&
    rect.y + rect.h <= v.y + h - m;
  if (inside) return v;
  return centerOn(v, rect.x + rect.w / 2, rect.y + rect.h / 2);
}

export const clampView = (v: Viewport, width: number, height: number): Viewport => {
  const { w, h } = viewSize(v);
  const x = Math.min(Math.max(v.x, -w + 80), Math.max(width - 80, 0));
  const y = Math.min(Math.max(v.y, -h + 80), Math.max(height - 80, 0));
  return { ...v, x, y };
};

// ---- the keyboard ----

export type Dir = "left" | "right" | "up" | "down";

/** The node nearest to `id` in a direction: arrows move the selection. */
export function neighbor(nodes: PNode[], id: string, dir: Dir): string | null {
  const from = nodes.find((n) => n.id === id);
  if (!from) return nodes[0]?.id ?? null;
  const cx = from.x + from.w / 2;
  const cy = from.y + from.h / 2;
  let best: { id: string; score: number } | null = null;
  for (const n of nodes) {
    if (n.id === id) continue;
    const dx = n.x + n.w / 2 - cx;
    const dy = n.y + n.h / 2 - cy;
    const along = dir === "right" ? dx : dir === "left" ? -dx : dir === "down" ? dy : -dy;
    const across = dir === "left" || dir === "right" ? Math.abs(dy) : Math.abs(dx);
    if (along <= 4) continue;
    const score = along + across * 2.2;
    if (!best || score < best.score) best = { id: n.id, score };
  }
  return best?.id ?? null;
}

/** The colour class of a kind of edge (the CSS paints it from the tokens). */
export const EDGE_TONE: Record<EdgeKind, string> = {
  request: "request",
  effect: "effect",
  reply: "reply",
  error: "error",
  cancel: "cancel",
};
