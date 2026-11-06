// Geometry of the flow canvas: the frames on the plot, where the nodes and ports are,
// the path of an edge, the auto-layout, the viewport (zoom and pan) and the keyboard
// navigation between nodes. Pure: the model in, numbers out.
import {
  type EdgeKind,
  type FlowEdge,
  type FlowNode,
  type Frame,
  type Lane,
  type Model,
  type ModuleDef,
  EXTERNAL_OF,
  type PluginManifest,
  externalIn,
  type LaneDef,
  NODE_H,
  NODE_W,
  bandOf,
  defOf,
  findNode,
  laneOf,
  lanesOf,
} from "./model.ts";

/** the width of the lane labels on the left */
export const GUTTER = 92;
export const COL_W = NODE_W + 68;
/** the height of the header of a frame: its name, and what moves it */
export const FRAME_HEAD = 24;
export const LANE_PAD = 16;
export const STACK_GAP = 14;
export const LANE_MIN = NODE_H + LANE_PAD * 2;
/** the size of the view at zoom 1, in world units */
export const VIEW_W = 800;
export const VIEW_H = 460;

export interface Band {
  /** the id of the lane */
  lane: string;
  /** what the lane runs as (the board is coloured by it) */
  role: Lane;
  name: string;
  top: number;
  h: number;
  /** the width, the same for every lane: a rectangle from the left edge of the board to here */
  w: number;
  /** the height is the one set by hand (the border can be dragged back up) */
  fixed: boolean;
  /** the width is the one set by hand */
  fixedW: boolean;
  /** the least the lane can be: its nodes and the padding */
  min: number;
  minW: number;
}

export interface PNode {
  id: string;
  node: FlowNode;
  x: number;
  y: number;
  w: number;
  h: number;
  /** what the node runs as */
  lane: Lane;
  /** the id of the frame it is attached to ("" = free on the plot) */
  frame: string;
  /** the module an instance node stands for */
  def?: ModuleDef;
}

export interface Port {
  /** `out` for most nodes, `ok` and `err` for effects */
  port: "out" | "ok" | "err";
  nodeId: string;
  x: number;
  y: number;
  /** a module: the id of the output port this handle is */
  pid?: string;
}

/** a module box is wider than a node, and as tall as its longer side of ports */
export const MOD_W = NODE_W + 36;
export const MOD_ROW = 13;
export const MOD_TOP = 44;

export function sizeOf(m: Model, n: FlowNode): { w: number; h: number } {
  if (n.kind !== "module") return { w: NODE_W, h: NODE_H };
  const d = defOf(m, n);
  const rows = Math.max(d?.inputs.length ?? 0, d?.outputs.length ?? 0);
  return { w: MOD_W, h: rows ? MOD_TOP + rows * MOD_ROW : NODE_H };
}

/** The y of the pin of port `i` on a module box. */
export const pinY = (p: { y: number }, i: number): number =>
  p.y + MOD_TOP - 3 + i * MOD_ROW;

/** The y an edge meets a node at: the port row on a module, else the middle. */
export function anchorY(p: PNode, dir: "in" | "out", portId: string): number {
  if (!p.def) return p.y + p.h / 2;
  const list = dir === "in" ? p.def.inputs : p.def.outputs;
  const i = Math.max(
    0,
    list.findIndex((x) => x.id === portId),
  );
  return list.length ? pinY(p, i) : p.y + p.h / 2;
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
  frames: Frame[];
  nodes: PNode[];
  ports: Port[];
  edges: PEdge[];
  wires: Wire[];
  /** the plugins of the project, for the labels of the effects */
  plugins: PluginManifest[];
  /** the right and bottom of what is on the plot, and the left and top (the plot has no end; this is where its content is) */
  width: number;
  height: number;
  minX: number;
  minY: number;
}

export type Offsets = Record<string, { x: number; y: number }>;

/** how far right a node reaches, with room after it */
const reach = (m: Model, n: FlowNode, over: Offsets): number =>
  GUTTER + (over[n.id]?.x ?? n.x) + sizeOf(m, n).w + 48;

export function bandsOf(m: Model, over: Offsets = {}): Band[] {
  let top = 0;
  // every lane is as wide as the design, or as wide as the person made them (never less)
  const minW = Math.max(
    GUTTER + 4 * COL_W,
    ...m.nodes.map((n) => reach(m, n, over)),
  );
  const width = Math.max(minW, m.laneW ?? 0);
  return lanesOf(m).map((def: LaneDef) => {
    const mine = m.nodes.filter((n) => bandOf(m, n) === def.id);
    const bottom = mine.reduce(
      (mx, n) => Math.max(mx, (over[n.id]?.y ?? n.y) + sizeOf(m, n).h),
      0,
    );
    const min = Math.max(LANE_MIN, bottom + LANE_PAD);
    const h = Math.max(min, def.h ?? 0);
    const band: Band = {
      lane: def.id,
      role: def.role,
      name: def.name.trim() || "Lane",
      top,
      h,
      w: width,
      fixed: (def.h ?? 0) > min,
      fixedW: (m.laneW ?? 0) > minW,
      min,
      minW,
    };
    top += h;
    return band;
  });
}

/**
 * A design that has frames. An older one has lanes instead (Browser, App, Plugins and
 * Externals, or the ones it saved): each becomes a frame the width of the board, the same
 * place and the same size, and its nodes go to absolute places on the plot, attached to it.
 * The drawing is the same; from then on a frame is a rectangle like any other. A design
 * that has frames is returned as it is.
 */
export function toFrames(m: Model): Model {
  if (m.frames) return m;
  const bands = bandsOf(m);
  const home = new Map(bands.map((b) => [b.lane, b]));
  const frames: Frame[] = bands.map((b) => ({
    id: b.lane,
    name: b.name,
    x: 0,
    y: b.top,
    w: b.w,
    h: b.h,
    role: b.role,
  }));
  const nodes = m.nodes.map((n) => {
    const { band: _band, ...rest } = n;
    const b = home.get(bandOf(m, n));
    return {
      ...rest,
      x: GUTTER + n.x,
      y: (b?.top ?? 0) + n.y,
      frame: b?.lane ?? "",
    };
  });
  const { lanes: _lanes, laneW: _laneW, ...design } = m;
  return { ...design, nodes, frames };
}

export const portsOf = (p: PNode): Port[] =>
  p.node.kind === "module"
    ? (p.def?.outputs ?? []).map((o, i) => ({
        port: "out" as const,
        nodeId: p.id,
        x: p.x + p.w,
        y: pinY(p, i),
        pid: o.id,
      }))
    : p.node.kind === "effect"
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
  const x =
    u * u * u * e.x1 +
    3 * u * u * t * c1x +
    3 * u * t * t * c2x +
    t * t * t * e.x2;
  const y =
    u * u * u * e.y1 +
    3 * u * u * t * e.y1 +
    3 * u * t * t * e.y2 +
    t * t * t * e.y2;
  return { x, y };
}
const r = (n: number): number => Math.round(n * 10) / 10;

export function layoutOf(design: Model, over: Offsets = {}): Placed {
  const m = toFrames(design);
  const nodes: PNode[] = m.nodes.map((node) => {
    const o = over[node.id];
    const size = sizeOf(m, node);
    return {
      id: node.id,
      node,
      x: o?.x ?? node.x,
      y: o?.y ?? node.y,
      w: size.w,
      h: size.h,
      lane: laneOf(node),
      frame: node.frame ?? "",
      def: defOf(m, node),
    };
  });
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const ports = nodes.flatMap(portsOf);
  const edges: PEdge[] = [];
  for (const edge of m.edges) {
    const a = byId.get(edge.from);
    const b = byId.get(edge.to);
    if (!a || !b) continue;
    const want =
      a.node.kind === "effect" ? (edge.kind === "error" ? "err" : "ok") : "out";
    const mine = ports.filter((p) => p.nodeId === a.id && p.port === want);
    const pt = mine.find((p) => p.pid && p.pid === edge.fromPort) ?? mine[0];
    const geo = {
      x1: pt ? pt.x : a.x + a.w,
      y1: a.def ? anchorY(a, "out", edge.fromPort) : (pt?.y ?? a.y + a.h / 2),
      x2: b.x,
      y2: anchorY(b, "in", edge.toPort),
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
  // where the content is: the frames and the nodes (with room after them)
  const frames = m.frames ?? [];
  const rights = [
    ...frames.map((f) => f.x + f.w),
    ...nodes.map((n) => n.x + n.w + 48),
  ];
  const bottoms = [
    ...frames.map((f) => f.y + f.h),
    ...nodes.map((n) => n.y + n.h + LANE_PAD),
  ];
  const lefts = [...frames.map((f) => f.x), ...nodes.map((n) => n.x)];
  const tops = [...frames.map((f) => f.y), ...nodes.map((n) => n.y)];
  return {
    frames,
    nodes,
    ports,
    edges,
    wires,
    plugins: m.plugins,
    width: Math.max(480, ...rights),
    height: Math.max(240, ...bottoms),
    minX: lefts.length ? Math.min(...lefts) : 0,
    minY: tops.length ? Math.min(...tops) : 0,
  };
}

/** The external node an effect talks to (the first of its plugin). */
export function externalFor(m: Model, effect: FlowNode): FlowNode | undefined {
  const want = externalIn(m.plugins, effect.plugin);
  if (!want) return undefined;
  return (
    m.nodes.find((n) => n.kind === "external" && n.plugin === effect.plugin) ??
    m.nodes.find(
      (n) =>
        n.kind === "external" &&
        externalIn(m.plugins, n.plugin)?.id === want.id,
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
  for (const n of m.nodes)
    if (!depth.has(n.id) && n.kind !== "external") visit(n.id, 0, new Set());
  // an external sits under the first effect of its plugin
  for (const n of m.nodes) {
    if (n.kind !== "external") continue;
    const users = m.nodes.filter(
      (e) =>
        e.kind === "effect" &&
        (e.plugin === n.plugin ||
          externalIn(m.plugins, e.plugin)?.id ===
            externalIn(m.plugins, n.plugin)?.id),
    );
    const entry =
      m.edges.some((e) => e.from === n.id) &&
      !m.edges.some((e) => e.to === n.id);
    const ds = users.map((u) => depth.get(u.id) ?? 0);
    depth.set(n.id, entry ? 0 : ds.length ? Math.min(...ds) : 0);
  }
  return depth;
}

/** The nodes of a design that has frames: in columns, in the frame each is attached to. */
function autoLayoutFrames(m: Model): Model {
  const depth = depthsOf(m);
  const frames = (m.frames ?? []).map((f) => ({ ...f }));
  const nodes = m.nodes.map((n) => ({ ...n }));
  const order = [...nodes].sort(
    (a, b) =>
      (depth.get(a.id) ?? 0) - (depth.get(b.id) ?? 0) ||
      m.nodes.indexOf(findNode(m, a.id)!) - m.nodes.indexOf(findNode(m, b.id)!),
  );
  const place = (
    group: FlowNode[],
    x0: number,
    y0: number,
  ): { w: number; h: number } => {
    const first = Math.min(...group.map((n) => depth.get(n.id) ?? 0));
    const heights = new Map<number, number>();
    let w = 0;
    let h = 0;
    for (const n of group) {
      const col = (depth.get(n.id) ?? 0) - first;
      const y = heights.get(col) ?? 0;
      const size = sizeOf(m, n);
      heights.set(col, y + size.h + STACK_GAP);
      n.x = x0 + col * COL_W;
      n.y = y0 + y;
      w = Math.max(w, col * COL_W + size.w);
      h = Math.max(h, y + size.h);
    }
    return { w, h };
  };
  // the room a frame has for its nodes: under its name, with a margin
  const PAD = 16;
  const HEAD = 34;
  for (const f of frames) {
    const mine = order.filter((n) => n.frame === f.id);
    if (mine.length === 0) continue;
    const used = place(mine, f.x + PAD, f.y + HEAD);
    // a frame grows to hold what is in it, and is never made smaller
    f.w = Math.max(f.w, used.w + PAD * 2);
    f.h = Math.max(f.h, used.h + HEAD + PAD);
  }
  // what is attached to no frame goes under all of them
  const free = order.filter(
    (n) => !n.frame || !frames.some((f) => f.id === n.frame),
  );
  if (free.length > 0) {
    const left = frames.length ? Math.min(...frames.map((f) => f.x)) : 0;
    const bottom = frames.length
      ? Math.max(...frames.map((f) => f.y + f.h))
      : 0;
    place(free, left, bottom + (frames.length ? 40 : 0));
  }
  return { ...m, nodes, frames };
}

export function autoLayout(m: Model): Model {
  if (m.frames) return autoLayoutFrames(m);
  const depth = depthsOf(m);
  const heights = new Map<string, number>();
  const nodes = m.nodes.map((n) => ({ ...n }));
  // order inside a column: by the height of what the node comes from
  const order = [...nodes].sort(
    (a, b) =>
      (depth.get(a.id) ?? 0) - (depth.get(b.id) ?? 0) ||
      m.nodes.indexOf(findNode(m, a.id)!) - m.nodes.indexOf(findNode(m, b.id)!),
  );
  for (const n of order) {
    const key = `${laneOf(n)}:${depth.get(n.id) ?? 0}`;
    const y = heights.get(key) ?? LANE_PAD;
    heights.set(key, y + sizeOf(m, n).h + STACK_GAP);
    n.x = (depth.get(n.id) ?? 0) * COL_W + 8;
    n.y = y;
  }
  return { ...m, nodes };
}

// ---- the viewport ----

export interface Viewport {
  x: number;
  y: number;
  z: number;
  /** the size of the board on the page, in px (absent: the size of the start) */
  w?: number;
  h?: number;
}
const vw = (v: Viewport): number => v.w ?? VIEW_W;
const vh = (v: Viewport): number => v.h ?? VIEW_H;
export const MIN_Z = 0.15;
export const MAX_Z = 2.4;
export const HOME: Viewport = { x: 0, y: 0, z: 1 };

export const clampZ = (z: number): number =>
  Math.min(MAX_Z, Math.max(MIN_Z, z));
export const viewBoxOf = (v: Viewport): string =>
  `${r(v.x)} ${r(v.y)} ${r(vw(v) / v.z)} ${r(vh(v) / v.z)}`;
export const viewSize = (v: Viewport): { w: number; h: number } => ({
  w: vw(v) / v.z,
  h: vh(v) / v.z,
});

/**
 * What the minimap shows: the design and the view, whichever sticks out of the other, so
 * the rectangle of the view is always on it (zoomed out far, the design gets small).
 */
/** Where the content of the plot is: its left and top (default 0), its right and bottom. */
export interface World {
  width: number;
  height: number;
  minX?: number;
  minY?: number;
}

export function miniBox(
  world: World,
  v: Viewport,
): { x: number; y: number; w: number; h: number } {
  const { w, h } = viewSize(v);
  const x0 = Math.min(world.minX ?? 0, v.x);
  const y0 = Math.min(world.minY ?? 0, v.y);
  const x1 = Math.max(world.width, v.x + w);
  const y1 = Math.max(world.height, v.y + h);
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/** The view that has `center` (a point of the world) in the middle of it. */
export const centeredAt = (v: Viewport, x: number, y: number): Viewport => ({
  ...v,
  x: x - vw(v) / v.z / 2,
  y: y - vh(v) / v.z / 2,
});

/** Zoom by a factor around the center of the view. */
export function zoomBy(v: Viewport, factor: number): Viewport {
  const z = clampZ(v.z * factor);
  const cx = v.x + vw(v) / v.z / 2;
  const cy = v.y + vh(v) / v.z / 2;
  return { ...v, x: cx - vw(v) / z / 2, y: cy - vh(v) / z / 2, z };
}

/**
 * Zoom by a factor around a point of the board (px from its corner), which stays
 * where it is under the pointer: the wheel zooms toward the cursor.
 */
export function zoomAt(
  v: Viewport,
  factor: number,
  px: number,
  py: number,
): Viewport {
  const z = clampZ(v.z * factor);
  // the world point under the pointer, then the corner that keeps it there
  const wx = v.x + px / v.z;
  const wy = v.y + py / v.z;
  return { ...v, x: wx - px / z, y: wy - py / z, z };
}

/** Shows the whole world (in a board of the size of `size`, else of the start). */
export function fitView(
  world: World,
  size: { w?: number; h?: number } = {},
): Viewport {
  const pad = 12;
  const W = size.w ?? VIEW_W;
  const H = size.h ?? VIEW_H;
  const width = world.width - (world.minX ?? 0);
  const height = world.height - (world.minY ?? 0);
  const z = clampZ(Math.min(W / (width + pad * 2), H / (height + pad * 2)));
  return {
    x: (world.minX ?? 0) - pad - Math.max(0, W / z - (width + pad * 2)) / 2,
    y: (world.minY ?? 0) - pad,
    z,
    ...(size.w !== undefined ? { w: size.w } : {}),
    ...(size.h !== undefined ? { h: size.h } : {}),
  };
}

export function centerOn(v: Viewport, x: number, y: number): Viewport {
  return { ...v, x: x - vw(v) / v.z / 2, y: y - vh(v) / v.z / 2 };
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

/**
 * Keeps the world within reach, and no more: the view can go as far as the world is
 * still a quarter of the screen, so the design can be dragged to any side of the board
 * (the space around it is as good as endless) and never gets lost.
 */
export const clampView = (v: Viewport, world: World): Viewport => {
  const { w, h } = viewSize(v);
  const fit = (pos: number, view: number, lo: number, hi: number): number => {
    const keep = view * 0.25;
    return Math.min(hi - keep, Math.max(lo + keep - view, pos));
  };
  return {
    ...v,
    x: fit(v.x, w, world.minX ?? 0, world.width),
    y: fit(v.y, h, world.minY ?? 0, world.height),
  };
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
    const along =
      dir === "right" ? dx : dir === "left" ? -dx : dir === "down" ? dy : -dy;
    const across =
      dir === "left" || dir === "right" ? Math.abs(dy) : Math.abs(dx);
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
