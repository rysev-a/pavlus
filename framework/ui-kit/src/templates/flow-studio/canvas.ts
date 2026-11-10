// The Flow canvas: the swimlanes, nodes, ports and edges drawn from data with the
// svg plugin, plus the tokens of the simulation (one colour per rid) and the minimap.
// Pure: `canvasTree` turns a placed layout and the state of the run into an svg tree.
import type { SvgHandler, SvgNode } from "@pavlus/client/plugins/svg";
import {
  circle,
  g,
  path,
  rect,
  root,
  text,
} from "@pavlus/client/plugins/svg/h";
import { ridsOf, type Step, type Trace } from "./engine.ts";
import {
  FRAME_HEAD,
  MOD_ROW,
  miniBox,
  type PEdge,
  type Placed,
  type PNode,
  pathOf,
  pinY,
  pointAt,
  VIEW_H,
  VIEW_W,
  type Viewport,
  viewBoxOf,
} from "./layout.ts";
import { effectDefIn, KIND_LABEL } from "./model.ts";
import { markerDefs } from "./sequence.ts";

export interface CanvasUi {
  prefix: string;
  vp: Viewport;
  selNode: string;
  selEdge: string;
  breakpoints: Record<string, boolean>;
  /** the link being dragged: from a port to the pointer */
  link: {
    from: string;
    port: "out" | "ok" | "err";
    /** a module: the output port the link starts at */
    pid?: string;
    x: number;
    y: number;
  } | null;
  trace: Trace | null;
  /** the step being shown (-1: the run has not started) */
  pos: number;
  /** 0..1: how far the token of the current step is along its edge */
  progress: number;
  /** fault ids that are on, to mark the nodes they hit */
  faultNodes: string[];
  /** the frame a component being dragged is over: it is attached to it when dropped */
  dropFrame?: string;
  /** a component from the dock, on its way to the plot: where it would be put */
  addGhost?: {
    x: number;
    y: number;
    w: number;
    h: number;
    label: string;
    kind: string;
  };
  /** inside a module: the ports bound to each node, shown as badges above it */
  badges?: Record<string, { ins: string[]; outs: string[] }>;
}

const r1 = (n: number): number => Math.round(n * 10) / 10;

const short = (s: string, n: number): string =>
  s.length > n ? `${s.slice(0, n - 1)}…` : s;

/** the colour index (0..4) of a rid */
export const ridColor = (trace: Trace | null, rid: string): number => {
  if (!trace) return 0;
  const i = ridsOf(trace).indexOf(rid);
  return (i < 0 ? 0 : i) % 5;
};

interface Seen {
  edges: Map<string, { rid: string; cancelled: boolean }>;
  nodesBusy: Map<string, string[]>;
  cancelledNodes: Set<string>;
  /** requests whose client went away */
  aborted: Set<string>;
  tokens: { rid: string; step: Step }[];
  current: Step | null;
}

/** What the trace up to `pos` says about each edge and node. */
export function seenOf(trace: Trace | null, pos: number): Seen {
  const seen: Seen = {
    edges: new Map(),
    nodesBusy: new Map(),
    cancelledNodes: new Set(),
    aborted: new Set(),
    tokens: [],
    current: null,
  };
  if (!trace || pos < 0) return seen;
  const last = new Map<string, Step>();
  for (let i = 0; i <= pos && i < trace.length; i++) {
    const s = trace[i];
    last.set(s.rid, s);
    if (s.edge)
      seen.edges.set(s.edge, {
        rid: s.rid,
        cancelled: s.status === "cancelled" || s.status === "dropped",
      });
    if (s.type === "cancel") seen.cancelledNodes.add(s.to);
    if (s.type === "abort" && s.edge.startsWith("abort:"))
      seen.aborted.add(s.rid);
  }
  seen.current = trace[Math.min(pos, trace.length - 1)] ?? null;
  for (const [rid, step] of last) {
    seen.tokens.push({ rid, step });
    for (const n of step.inflight) {
      const l = seen.nodesBusy.get(n) ?? [];
      l.push(rid);
      seen.nodesBusy.set(n, l);
    }
  }
  return seen;
}

const KIND_ICON: Record<string, string> = {
  "ui-event": "●",
  "fe-handler": "ƒ",
  "fe-state": "◧",
  route: "⇥",
  handler: "λ",
  reply: "↩",
  error: "!",
  effect: "⚙",
  external: "▣",
  module: "▦",
};

/**
 * The ports of a module box: an input pin and its message on the left (a message
 * dropped on the pin goes to that port), the names of the outputs on the right (the
 * handle to drag from is drawn with the other ports).
 */
function pinNodes(
  p: PNode,
  msg: (
    id: string,
    payload?: Record<string, unknown>,
    extra?: Record<string, unknown>,
  ) => SvgHandler,
): SvgNode[] {
  const def = p.def!;
  return [
    ...def.inputs.flatMap((port, i) => [
      circle({
        key: `PI${p.id}${port.id}`,
        class: `fs-pin${port.node ? "" : " is-unbound"}`,
        cx: p.x,
        cy: pinY(p, i),
        r: 4.5,
        on: {
          pointerup: msg("pinUp", { id: p.id, pid: port.id }, { stop: true }),
        },
      }),
      text(
        {
          key: `PIT${p.id}${port.id}`,
          class: "fs-n__pin",
          x: p.x + 9,
          y: pinY(p, i) + 3,
        },
        short(port.name || "(unnamed)", 14),
      ),
    ]),
    ...def.outputs.map((port, i) =>
      text(
        {
          key: `POT${p.id}${port.id}`,
          class: "fs-n__pin fs-n__pin--out",
          x: p.x + p.w - 9,
          y: pinY(p, i) + 3,
          "text-anchor": "end",
        },
        short(port.name || "(unnamed)", 14),
      ),
    ),
  ];
}

/** The ports of the open module bound to a node: `in name` / `name out` above it. */
function badgeNodes(
  p: PNode,
  b: { ins: string[]; outs: string[] } | undefined,
): SvgNode[] {
  if (!b) return [];
  return [
    b.ins.length
      ? text(
          { key: `BI${p.id}`, class: "fs-n__badge", x: p.x + 2, y: p.y - 5 },
          `in ▸ ${short(b.ins.join(", "), 22)}`,
        )
      : null,
    b.outs.length
      ? text(
          {
            key: `BO${p.id}`,
            class: "fs-n__badge fs-n__badge--out",
            x: p.x + p.w - 2,
            y: p.y - 5,
            "text-anchor": "end",
          },
          `${short(b.outs.join(", "), 22)} ▸ out`,
        )
      : null,
  ].filter((x): x is SvgNode => x !== null);
}

export function canvasTree(placed: Placed, ui: CanvasUi): SvgNode {
  const msg = (
    id: string,
    payload: Record<string, unknown> = {},
    extra: Record<string, unknown> = {},
  ) => ({ id: ui.prefix + id, payload, ...extra });
  const seen = seenOf(ui.trace, ui.pos);
  const running = ui.trace !== null && ui.pos >= 0;
  const byId = new Map(placed.nodes.map((n) => [n.id, n]));
  const cur = seen.current;

  // ---- frames ----
  // a frame is a rectangle on a plot that has no end: its header moves it (with what is
  // attached to it), its four corners change its size (only the corners: the borders are
  // not handles), and a component dropped on it is attached to it
  const grip = Math.max(10, 12 / ui.vp.z);
  const frames: SvgNode[] = placed.frames.flatMap((f, i) => {
    // a small square centered on each corner, always the same size on the screen
    const handles = [
      { mode: "nw", x: f.x, y: f.y },
      { mode: "ne", x: f.x + f.w, y: f.y },
      { mode: "sw", x: f.x, y: f.y + f.h },
      { mode: "se", x: f.x + f.w, y: f.y + f.h },
    ].map((h) => ({
      mode: h.mode,
      x: h.x - grip / 2,
      y: h.y - grip / 2,
      w: grip,
      h: grip,
    }));
    const name = f.name.trim() || "Frame";
    const room = Math.max(4, Math.floor((f.w - 64) / 7));
    return [
      rect({
        key: `FB${f.id}`,
        class: `fs-frame${f.role ? ` fs-frame--${f.role}` : ""}${ui.dropFrame === f.id ? " is-target" : ""}`,
        x: f.x,
        y: f.y,
        width: f.w,
        height: f.h,
        rx: 6,
      }),
      rect({
        key: `FH${f.id}`,
        class: "fs-frame__head",
        x: f.x,
        y: f.y,
        width: f.w,
        height: FRAME_HEAD,
        rx: 6,
        on: {
          pointerdown: msg("frameDown", { id: f.id }, { stop: true }),
          dblclick: msg("frameEdit", { id: f.id }, { stop: true }),
        },
      }),
      text(
        {
          key: `FT${f.id}`,
          class: "fs-frame__title",
          x: f.x + 10,
          y: f.y + 16,
          "pointer-events": "none",
        },
        short(name, room) +
          (f.role && name.toLowerCase() !== f.role ? `  · ${f.role}` : ""),
      ),
      // the cross that takes the frame away (what is on it stays on the plot)
      rect({
        key: `FX${f.id}`,
        class: "fs-frame__x",
        x: f.x + f.w - 24,
        y: f.y + 4,
        width: 18,
        height: 16,
        rx: 4,
        on: { pointerdown: msg("frameDel", { id: f.id }, { stop: true }) },
      }),
      text(
        {
          key: `FXT${f.id}`,
          class: "fs-frame__xt",
          x: f.x + f.w - 15,
          y: f.y + 16,
          "text-anchor": "middle",
          "pointer-events": "none",
        },
        "×",
      ),
      ...handles.map((h) =>
        rect({
          key: `FZ${f.id}${h.mode}`,
          class: `fs-frame__size fs-frame__size--${h.mode}`,
          x: h.x,
          y: h.y,
          width: Math.max(0, h.w),
          height: Math.max(0, h.h),
          rx: 2,
          on: {
            pointerdown: msg(
              "frameSize",
              { id: f.id, edge: h.mode },
              { stop: true },
            ),
          },
        }),
      ),
    ];
  });

  // ---- the plugin to external wires ----
  const wires = placed.wires.map((w) =>
    path({
      key: `W${w.effect}`,
      class: "fs-wire",
      d: `M${w.x1} ${w.y1} L${w.x2} ${w.y2}`,
      fill: "none",
    }),
  );

  // ---- edges ----
  const labelNodes: SvgNode[] = [];
  const edgeNodes: SvgNode[] = placed.edges.flatMap((pe: PEdge) => {
    const e = pe.edge;
    const info = seen.edges.get(e.id);
    const cls = [
      "fs-edge",
      `fs-edge--${e.kind}`,
      e.cond.trim() ? "is-cond" : "",
      ui.selEdge === e.id ? "is-sel" : "",
      info
        ? `is-seen fs-rc-${ridColor(ui.trace, info.rid)}`
        : running
          ? "is-idle"
          : "",
      info?.cancelled ? "is-cancelled" : "",
      cur && cur.edge === e.id ? "is-current" : "",
    ]
      .filter(Boolean)
      .join(" ");
    const label = short(e.msg, 24);
    const w = Math.max(24, label.length * 5.7 + (e.rid ? 26 : 12));
    const lx = pe.lx;
    const ly = pe.ly;
    labelNodes.push(
      g(
        {
          key: `P${e.id}`,
          class: `fs-elabel fs-elabel--${e.kind}${ui.selEdge === e.id ? " is-sel" : ""}${info ? " is-seen" : ""}`,
          on: { click: msg("edgeClick", { id: e.id }, { stop: true }) },
        },
        rect({
          x: lx - w / 2,
          y: ly - 17,
          width: w,
          height: e.cond.trim() ? 24 : 14,
          rx: 7,
        }),
        text({ x: lx - w / 2 + 6, y: ly - 7 }, label),
        e.rid
          ? g(
              { class: "fs-rid" },
              rect({
                x: lx + w / 2 - 22,
                y: ly - 15,
                width: 18,
                height: 10,
                rx: 5,
              }),
              text(
                { x: lx + w / 2 - 13, y: ly - 7, "text-anchor": "middle" },
                "rid",
              ),
            )
          : null,
        e.cond.trim()
          ? text(
              { class: "fs-elabel__cond", x: lx - w / 2 + 6, y: ly + 3 },
              `if ${short(e.cond.trim(), 20)}`,
            )
          : null,
      ),
    );
    return [
      path({
        key: `E${e.id}`,
        class: cls,
        d: pe.d,
        fill: "none",
        "marker-end": `url(#fs-fl-arrow-${e.kind})`,
      }),
      path({
        key: `H${e.id}`,
        class: "fs-edge__hit",
        d: pe.d,
        fill: "none",
        on: { click: msg("edgeClick", { id: e.id }, { stop: true }) },
      }),
    ];
  });

  // the runtime's own edges in the trace: cancel, abort, timeout
  const synth: SvgNode[] = [];
  if (ui.trace && ui.pos >= 0) {
    const done = new Set<string>();
    for (let i = 0; i <= ui.pos && i < ui.trace.length; i++) {
      const s = ui.trace[i];
      if (!s.edge || !/^(cancel|abort|timeout|abortmsg):/.test(s.edge))
        continue;
      const key = `${s.edge}:${s.rid}`;
      if (done.has(key)) continue;
      done.add(key);
      const a = byId.get(s.from);
      const b = byId.get(s.to);
      if (!a || !b) continue;
      const geo = {
        x1: a.x + a.w / 2,
        y1: a.y + (b.y > a.y ? a.h : 0),
        x2: b.x + b.w / 2,
        y2: b.y + (b.y > a.y ? 0 : b.h),
      };
      const p =
        a.id === b.id
          ? null
          : pathOf({ x1: geo.x1, y1: geo.y1 }, { x2: geo.x2, y2: geo.y2 });
      if (!p) continue;
      synth.push(
        path({
          key: `S${key}`,
          class: `fs-edge fs-edge--cancel is-seen fs-rc-${ridColor(ui.trace, s.rid)}${cur && cur.i === i ? " is-current" : ""}`,
          d: `M${geo.x1} ${geo.y1} L${geo.x2} ${geo.y2}`,
          fill: "none",
          "marker-end": "url(#fs-fl-arrow-cancel)",
        }),
        text(
          {
            key: `SL${key}`,
            class: "fs-elabel__text fs-elabel__text--cancel",
            x: (geo.x1 + geo.x2) / 2 + 6,
            y: (geo.y1 + geo.y2) / 2,
          },
          short(s.label, 24),
        ),
      );
    }
  }

  // ---- nodes ----
  const nodeNodes: SvgNode[] = placed.nodes.flatMap((p: PNode) => {
    const n = p.node;
    const busy = seen.nodesBusy.get(n.id);
    const cancelled = seen.cancelledNodes.has(n.id);
    const current =
      cur && (cur.to === n.id || cur.from === n.id) && cur.type !== "start";
    const cls = [
      "fs-n",
      `fs-n--${n.kind}`,
      ui.selNode === n.id ? "is-sel" : "",
      busy && !cancelled ? "is-busy" : "",
      cancelled ? "is-cancelled" : "",
      current && cur?.to === n.id ? "is-current" : "",
      ui.breakpoints[n.id] ? "has-bp" : "",
      ui.faultNodes.includes(n.id) ? "has-fault" : "",
    ]
      .filter(Boolean)
      .join(" ");
    const sub =
      n.kind === "effect"
        ? n.detail || effectDefIn(placed.plugins, n.title)?.hint || ""
        : n.kind === "route"
          ? n.detail
          : n.kind === "external"
            ? "no code of ours"
            : n.kind === "module"
              ? p.def
                ? `${p.def.name} · ${p.def.side === "frontend" ? "browser" : "server"}`
                : "module is gone"
              : n.detail || KIND_LABEL[n.kind];
    const label = n.title || "(unnamed)";
    const status =
      n.kind === "effect" && effectDefIn(placed.plugins, n.title)?.responds
        ? ` ${n.status || 200}`
        : "";
    return [
      g(
        {
          key: `N${n.id}`,
          class: cls,
          id: `fs-n-${n.id}`,
          tabindex:
            ui.selNode === n.id || (!ui.selNode && p === placed.nodes[0])
              ? 0
              : -1,
          role: "button",
          "aria-label": `${KIND_LABEL[n.kind]} ${n.title}${n.detail ? `: ${n.detail}` : ""}`,
          "aria-pressed": ui.selNode === n.id ? "true" : "false",
          on: {
            pointerdown: msg("nodeDown", { id: n.id }, { stop: true }),
            pointerup: msg("nodeUp", { id: n.id }, { stop: true }),
            contextmenu: msg(
              "nodeCtx",
              { id: n.id },
              { prevent: true, stop: true },
            ),
            dblclick: msg("nodeDbl", { id: n.id }, { stop: true }),
          },
        },
        rect({
          class: "fs-n__box",
          x: p.x,
          y: p.y,
          width: p.w,
          height: p.h,
          rx: 8,
        }),
        rect({
          class: "fs-n__bar",
          x: p.x,
          y: p.y + 6,
          width: 4,
          height: p.h - 12,
          rx: 2,
        }),
        text(
          { class: "fs-n__icon", x: p.x + 12, y: p.y + 19 },
          KIND_ICON[n.kind] ?? "·",
        ),
        text(
          { class: "fs-n__title", x: p.x + 26, y: p.y + 19 },
          short(label, 17) + status,
        ),
        text({ class: "fs-n__sub", x: p.x + 12, y: p.y + 35 }, short(sub, 25)),
        ...(p.def ? pinNodes(p, msg) : []),
        ...badgeNodes(p, ui.badges?.[n.id]),
        ui.breakpoints[n.id]
          ? circle({
              class: "fs-n__bp",
              cx: p.x + p.w - 8,
              cy: p.y + 8,
              r: 4.5,
            })
          : null,
        ...(busy && !cancelled
          ? busy.slice(0, 3).map((rid, i) =>
              circle({
                key: `B${n.id}${rid}`,
                class: `fs-n__ring fs-rc-${ridColor(ui.trace, rid)}`,
                cx: p.x + 10 + i * 12,
                cy: p.y + p.h + 1,
                r: 4,
              }),
            )
          : []),
      ),
    ];
  });

  // ---- ports ----
  const ports: SvgNode[] = placed.ports.map((pt) => {
    const armed =
      ui.link &&
      ui.link.from === pt.nodeId &&
      ui.link.port === pt.port &&
      (ui.link.pid ?? "") === (pt.pid ?? "");
    return circle({
      key: `PT${pt.nodeId}${pt.port}${pt.pid ?? ""}`,
      class: `fs-port fs-port--${pt.port}${armed ? " is-armed" : ""}`,
      cx: pt.x,
      cy: pt.y,
      r: 6,
      on: {
        pointerdown: msg(
          "portDown",
          { id: pt.nodeId, port: pt.port, pid: pt.pid ?? "" },
          { stop: true },
        ),
        pointerup: msg("nodeUp", { id: pt.nodeId }, { stop: true }),
      },
    });
  });

  // ---- the link being dragged ----
  const preview: SvgNode[] = [];
  if (ui.link) {
    const pt = placed.ports.find(
      (p) =>
        p.nodeId === ui.link!.from &&
        p.port === ui.link!.port &&
        (p.pid ?? "") === (ui.link!.pid ?? ""),
    );
    if (pt) {
      const p = pathOf(
        { x1: pt.x, y1: pt.y },
        { x2: ui.link.x, y2: ui.link.y },
      );
      preview.push(
        path({ key: "LINK", class: "fs-link", d: p.d, fill: "none" }),
      );
    }
  }

  // ---- the tokens ----
  const tokens: SvgNode[] = [];
  if (ui.trace && ui.pos >= 0) {
    seen.tokens.forEach(({ rid, step }, idx) => {
      const isCur = cur !== null && step.i === cur.i;
      const col = ridColor(ui.trace, rid);
      const end = byId.get(step.to);
      if (!end) return;
      let x = end.x + end.w - 18 - (idx % 3) * 14;
      let y = end.y - 3;
      const pe = placed.edges.find((e) => e.edge.id === step.edge);
      if (isCur && pe && step.from !== step.to) {
        const t = Math.min(1, Math.max(0, ui.progress));
        const q = pointAt(pe, t);
        x = q.x;
        y = q.y;
      } else if (
        isCur &&
        step.edge &&
        /^(cancel|abort|timeout|abortmsg):/.test(step.edge)
      ) {
        const a = byId.get(step.from);
        if (a && a.id !== end.id) {
          const t = Math.min(1, Math.max(0, ui.progress));
          const ax = a.x + a.w / 2;
          const ay = a.y + (end.y > a.y ? a.h : 0);
          const bx = end.x + end.w / 2;
          const by = end.y + (end.y > a.y ? 0 : end.h);
          x = ax + (bx - ax) * t;
          y = ay + (by - ay) * t;
        }
      }
      const dead = step.status === "cancelled" || seen.aborted.has(rid);
      const gone = step.type === "done";
      tokens.push(
        g(
          {
            key: `TK${rid}`,
            class: `fs-token fs-rc-${col}${isCur ? " is-current" : ""}${dead ? " is-dead" : ""}${gone ? " is-done" : ""}${isCur && step.from === step.to && step.type === "work" ? " is-work" : ""}`,
          },
          circle({ class: "fs-token__dot", cx: x, cy: y, r: 9 }),
          text(
            { class: "fs-token__text", x, y: y + 3.5, "text-anchor": "middle" },
            dead ? "×" : rid.replace(/^r/, "").slice(0, 3) || rid,
          ),
        ),
      );
    });
  }

  return root(
    {
      viewBox: viewBoxOf(ui.vp),
      preserveAspectRatio: "xMinYMin meet",
      class: "fs-fl",
      role: "group",
      "aria-label": `Flow canvas: ${placed.frames.length ? `frames ${placed.frames.map((f) => f.name).join(", ")}` : "no frames"}`,
      on: {
        pointermove: msg("cvMove"),
        pointerup: msg("cvUp"),
        pointerleave: msg("cvLeave"),
        pointercancel: msg("cvLeave"),
      },
    },
    markerDefs("fs-fl-arrow"),
    rect({
      key: "BG",
      class: "fs-bg",
      x: -4000,
      y: -4000,
      width: 12000,
      height: 12000,
      on: { pointerdown: msg("cvDown") },
    }),
    ...frames,
    ...wires,
    ...edgeNodes,
    ...synth,
    ...nodeNodes,
    ...ports,
    ...labelNodes,
    ...preview,
    ...tokens,
    ...(ui.addGhost
      ? [
          rect({
            key: "GHOST",
            class: `fs-ghost fs-ghost--${ui.addGhost.kind}`,
            x: ui.addGhost.x,
            y: ui.addGhost.y,
            width: ui.addGhost.w,
            height: ui.addGhost.h,
            rx: 8,
          }),
          text(
            {
              key: "GHOSTT",
              class: "fs-ghost__label",
              x: ui.addGhost.x + ui.addGhost.w / 2,
              y: ui.addGhost.y + ui.addGhost.h / 2 + 4,
              "text-anchor": "middle",
              "pointer-events": "none",
            },
            short(ui.addGhost.label, 18),
          ),
        ]
      : []),
  );
}

// ---- the minimap ----

export function minimapTree(
  placed: Placed,
  vp: Viewport,
  prefix: string,
  selNode: string,
  /** what it shows (the design and the view); fixed while the rectangle is dragged */
  box: { x: number; y: number; w: number; h: number } = miniBox(placed, vp),
): SvgNode {
  return root(
    {
      viewBox: `${r1(box.x)} ${r1(box.y)} ${r1(box.w)} ${r1(box.h)}`,
      preserveAspectRatio: "xMidYMid meet",
      class: "fs-mini",
      role: "img",
      "aria-label":
        "Minimap: the rectangle is what the board shows; drag it, or click to move the view",
      on: { pointerdown: { id: `${prefix}mmDown`, payload: {}, stop: true } },
    },
    rect({
      class: "fs-mm__bg",
      x: box.x,
      y: box.y,
      width: box.w,
      height: box.h,
    }),
    ...placed.frames.map((f) =>
      rect({
        key: `MB${f.id}`,
        class: `fs-mm__lane fs-mm__lane--${f.role || "free"}`,
        x: f.x,
        y: f.y,
        width: f.w,
        height: f.h,
      }),
    ),
    ...placed.nodes.map((n) =>
      rect({
        key: `MN${n.id}`,
        class: `fs-mm__node fs-mm__node--${n.lane}${selNode === n.id ? " is-sel" : ""}`,
        x: n.x,
        y: n.y,
        width: n.w,
        height: n.h,
        rx: 6,
      }),
    ),
    rect({
      key: "MV",
      class: "fs-mm__view",
      x: vp.x,
      y: vp.y,
      width: (vp.w ?? VIEW_W) / vp.z,
      height: (vp.h ?? VIEW_H) / vp.z,
    }),
  );
}
