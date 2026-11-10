// The Diagram: the whole app as a node graph, drawn with the framework's svg
// plugin from data. Columns: pages / sections / elements | event chains and HTTP
// calls | state keys. Edges: element --event--> chain, chain --> state key
// (what the actions write), chain --> http, http --onSuccess/onError/loading-->
// key, and key --subscribes--> element (dashed). Pure: `buildGraph` reads the
// model, `layoutGraph` places it, `diagramTree` makes the svg tree.
import type { SvgNode } from "@pavlus/client/plugins/svg";

const marker = (
  attrs: Record<string, string | number>,
  ...kids: SvgNode[]
): SvgNode => svg("marker", attrs, ...kids);

import {
  defs,
  g,
  path,
  rect,
  root,
  svg,
  text,
} from "@pavlus/client/plugins/svg/h";
import { parseInitial, refsOf } from "./bind.ts";
import { appendAction, blankAction, removeAction, walk } from "./chain.ts";
import {
  type Action,
  ELEMENTS,
  type El,
  type EventName,
  eventsOf,
  findElement,
  type Model,
  mapElement,
  stateKey,
} from "./model.ts";

export type NodeKind =
  | "page"
  | "section"
  | "element"
  | "chain"
  | "http"
  | "key";
export type EdgeKind =
  | "event"
  | "write"
  | "http"
  | "ok"
  | "err"
  | "loading"
  | "then"
  | "catch"
  | "navigate"
  | "subscribe"
  | "bind";

export interface GNode {
  id: string;
  kind: NodeKind;
  col: 0 | 1 | 2;
  label: string;
  sub: string;
  /** the element / page / section / key this node stands for */
  ref: string;
  page: string;
  /** element nodes: the events shown as ports */
  ports: { event: EventName; used: boolean }[];
}

export interface EdgeRef {
  kind: "action" | "bind" | "none";
  el: string;
  event: EventName | "";
  path: string;
}

export interface GEdge {
  id: string;
  kind: EdgeKind;
  from: string;
  to: string;
  label: string;
  port: EventName | "";
  ref: EdgeRef;
}

export interface Graph {
  nodes: GNode[];
  edges: GEdge[];
}

const NONE: EdgeRef = { kind: "none", el: "", event: "", path: "" };

const short = (s: string, n: number): string =>
  s.length > n ? s.slice(0, n - 1) + "…" : s;

/** the text fields of an element that can read the state */
function textsOf(el: El): string[] {
  return [...Object.values(el.props), el.visible];
}

export function buildGraph(m: Model): Graph {
  const nodes: GNode[] = [];
  const edges: GEdge[] = [];
  const seen = new Set<string>();
  const addEdge = (e: Omit<GEdge, "id">): void => {
    const id = `${e.kind}:${e.from}>${e.to}:${e.label}:${e.ref.path}`;
    if (seen.has(id)) return;
    seen.add(id);
    edges.push({ ...e, id });
  };
  const keyNode = (k: string): string => `k:${k}`;
  for (const k of m.keys)
    nodes.push({
      id: keyNode(k.key),
      kind: "key",
      col: 2,
      label: k.key,
      sub: k.type,
      ref: k.key,
      page: "",
      ports: [],
    });
  const hasKey = (k: string): boolean => m.keys.some((x) => x.key === k);
  const pageBySlug = (url: string): string | undefined => {
    const slug = ("/" + url.replace(/^#?\/?/, "")).replace(/(.)\/+$/, "$1");
    return m.pages.find((p) => p.slug === slug)?.id;
  };

  for (const page of m.pages) {
    nodes.push({
      id: `p:${page.id}`,
      kind: "page",
      col: 0,
      label: page.name,
      sub: page.slug,
      ref: page.id,
      page: page.id,
      ports: [],
    });
    for (const section of page.sections) {
      nodes.push({
        id: `s:${section.id}`,
        kind: "section",
        col: 0,
        label: section.name,
        sub: section.kind,
        ref: section.id,
        page: page.id,
        ports: [],
      });
      for (const el of section.elements) {
        const def = ELEMENTS[el.type];
        const used = eventsOf(el.type).filter(
          (ev) => (el.events[ev]?.length ?? 0) > 0,
        );
        const shown = eventsOf(el.type).filter(
          (ev) => used.includes(ev) || ev === def.primary,
        );
        const id = `e:${el.id}`;
        nodes.push({
          id,
          kind: "element",
          col: 0,
          label: short(
            el.props.text || el.props.title || el.props.label || def.label,
            22,
          ),
          sub: def.label,
          ref: el.id,
          page: page.id,
          ports: shown.map((ev) => ({ event: ev, used: used.includes(ev) })),
        });
        for (const ev of used) {
          const chain = el.events[ev] ?? [];
          const cid = `c:${el.id}:${ev}`;
          nodes.push({
            id: cid,
            kind: "chain",
            col: 1,
            label: ev,
            sub: `${chain.length} action${chain.length === 1 ? "" : "s"}`,
            ref: el.id,
            page: page.id,
            ports: [],
          });
          addEdge({
            kind: "event",
            from: id,
            to: cid,
            label: ev,
            port: ev,
            ref: NONE,
          });
          const link = (
            from: string,
            a: Action,
            apath: string,
            via: string,
            kind: EdgeKind,
          ): void => {
            if (a.t === "navigate") {
              const pid = pageBySlug(a.url ?? "");
              if (pid)
                addEdge({
                  kind: "navigate",
                  from,
                  to: `p:${pid}`,
                  label: "navigate",
                  port: "",
                  ref: { kind: "action", el: el.id, event: ev, path: apath },
                });
            }
            if (
              a.t === "set" ||
              a.t === "toggle" ||
              a.t === "push" ||
              a.t === "remove"
            ) {
              const root = (a.key ?? "").split(".")[0];
              if (root && hasKey(root))
                addEdge({
                  kind,
                  from,
                  to: keyNode(root),
                  label: via ? `${via} · ${a.t}` : a.t,
                  port: "",
                  ref: { kind: "action", el: el.id, event: ev, path: apath },
                });
            }
          };
          const visit = (
            list: Action[],
            from: string,
            prefix: string,
            via: string,
          ): void => {
            list.forEach((a, i) => {
              const apath = prefix ? `${prefix}.${i}` : String(i);
              if (a.t === "http") {
                const hid = `h:${el.id}:${ev}:${apath}`;
                nodes.push({
                  id: hid,
                  kind: "http",
                  col: 1,
                  label: `${a.method || "GET"} ${short(a.url ?? "", 24)}`,
                  sub: "http",
                  ref: el.id,
                  page: page.id,
                  ports: [],
                });
                addEdge({
                  kind: via ? (via === "catch" ? "catch" : "then") : "http",
                  from,
                  to: hid,
                  label: via || "http",
                  port: "",
                  ref: { kind: "action", el: el.id, event: ev, path: apath },
                });
                const ref: EdgeRef = {
                  kind: "action",
                  el: el.id,
                  event: ev,
                  path: apath,
                };
                for (const [k, kind, label] of [
                  [
                    a.okKey,
                    "ok",
                    a.okPath ? `onSuccess · ${a.okPath}` : "onSuccess",
                  ],
                  [a.errKey, "err", "onError"],
                  [a.loadingKey, "loading", "loading"],
                ] as const) {
                  const root = (k ?? "").split(".")[0];
                  if (root && hasKey(root))
                    addEdge({
                      kind,
                      from: hid,
                      to: keyNode(root),
                      label,
                      port: "",
                      ref,
                    });
                }
                visit(a.then ?? [], hid, `${apath}.then`, "then");
                visit(a.catch ?? [], hid, `${apath}.catch`, "catch");
              } else link(from, a, apath, via, "write");
            });
          };
          visit(chain, cid, "", "");
        }
        // what the element reads
        const reads = new Set<string>();
        for (const t of textsOf(el)) for (const r of refsOf(t)) reads.add(r);
        for (const r of reads)
          if (hasKey(r))
            addEdge({
              kind: "subscribe",
              from: keyNode(r),
              to: id,
              label: "subscribes",
              port: "",
              ref: NONE,
            });
        const bound = el.bind.split(".")[0];
        if (bound && hasKey(bound))
          addEdge({
            kind: "bind",
            from: keyNode(bound),
            to: id,
            label: "two-way",
            port: "",
            ref: { kind: "bind", el: el.id, event: "", path: "" },
          });
        const ek = (el.props.errorsKey ?? "").split(".")[0];
        if (ek && hasKey(ek))
          addEdge({
            kind: "subscribe",
            from: id,
            to: keyNode(ek),
            label: "errors",
            port: "",
            ref: NONE,
          });
      }
    }
  }
  return { nodes, edges };
}

// ---- layout ----

export const COL_X = [16, 340, 640] as const;
export const COL_W = [210, 200, 170] as const;
export const NODE_H = 34;
export const GAP = 10;
export const PORT_STEP = 16;

export interface PNode extends GNode {
  x: number;
  y: number;
  w: number;
  h: number;
  /** the page this node is shown under, collapsed pages hide their elements */
  hidden: boolean;
}

export interface PEdge extends GEdge {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  d: string;
  lx: number;
  ly: number;
}

export interface Placed {
  nodes: PNode[];
  edges: PEdge[];
  width: number;
  height: number;
  ports: {
    id: string;
    el: string;
    event: EventName;
    x: number;
    y: number;
    used: boolean;
  }[];
}

const heightOf = (n: GNode): number =>
  n.kind === "element"
    ? Math.max(NODE_H, 12 + n.ports.length * PORT_STEP)
    : n.kind === "section"
      ? 26
      : NODE_H;

export function layoutGraph(
  graph: Graph,
  collapsed: Record<string, boolean> = {},
): Placed {
  const hiddenNode = (n: GNode): boolean =>
    !!collapsed[n.page] && (n.kind === "element" || n.kind === "section");
  const visible = graph.nodes.filter((n) => !hiddenNode(n));
  // an edge into a hidden node is drawn to its page
  const idMap = new Map<string, string>();
  for (const n of graph.nodes)
    idMap.set(n.id, hiddenNode(n) ? `p:${n.page}` : n.id);
  // chains and http nodes of a collapsed page are folded too
  const folded = new Set<string>();
  for (const n of visible)
    if ((n.kind === "chain" || n.kind === "http") && collapsed[n.page])
      folded.add(n.id);
  const shown = visible.filter((n) => !folded.has(n.id));
  for (const id of folded)
    idMap.set(id, `p:${graph.nodes.find((n) => n.id === id)!.page}`);

  const byId = new Map<string, PNode>();
  const seen = new Set<string>();
  const dedup: GEdge[] = [];
  for (const e of graph.edges) {
    const from = idMap.get(e.from) ?? e.from;
    const to = idMap.get(e.to) ?? e.to;
    if (from === to) continue;
    const key = `${from}>${to}>${e.kind}>${from !== e.from || to !== e.to ? "" : e.label}`;
    if (seen.has(key)) continue;
    seen.add(key);
    dedup.push({ ...e, from, to, port: from !== e.from ? "" : e.port });
  }

  // column 0 in reading order, the others by the average height of what they touch
  let y0 = 16;
  const placed: PNode[] = [];
  for (const n of shown.filter((n) => n.col === 0)) {
    const h = heightOf(n);
    const p: PNode = {
      ...n,
      x: COL_X[0] + (n.kind === "page" ? 0 : n.kind === "section" ? 14 : 28),
      y: y0,
      w: COL_W[0] - (n.kind === "page" ? 0 : n.kind === "section" ? 14 : 28),
      h,
      hidden: false,
    };
    y0 += h + (n.kind === "page" ? 6 : GAP - 4);
    placed.push(p);
    byId.set(p.id, p);
  }
  const neighbours = (id: string): string[] =>
    dedup.flatMap((e) =>
      e.from === id ? [e.to] : e.to === id ? [e.from] : [],
    );
  for (const col of [1, 2] as const) {
    const list = shown.filter((n) => n.col === col);
    const want = new Map<string, number>();
    for (const n of list) {
      const ys = neighbours(n.id)
        .map((o) => byId.get(o))
        .filter((o): o is PNode => !!o)
        .map((o) => o.y + o.h / 2);
      want.set(
        n.id,
        ys.length ? ys.reduce((a, b) => a + b, 0) / ys.length : Infinity,
      );
    }
    const order = list
      .map((n, i) => ({ n, i }))
      .sort((a, b) => want.get(a.n.id)! - want.get(b.n.id)! || a.i - b.i)
      .map((o) => o.n);
    let floor = 16;
    for (const n of order) {
      const h = heightOf(n);
      const w = want.get(n.id)!;
      const y = Math.max(floor, Number.isFinite(w) ? w - h / 2 : floor);
      const p: PNode = {
        ...n,
        x: COL_X[col],
        y,
        w: COL_W[col],
        h,
        hidden: false,
      };
      floor = y + h + GAP;
      placed.push(p);
      byId.set(p.id, p);
    }
  }

  // ports of the elements
  const ports: Placed["ports"] = [];
  for (const n of placed)
    if (n.kind === "element")
      n.ports.forEach((p, i) =>
        ports.push({
          id: `${n.id}:${p.event}`,
          el: n.ref,
          event: p.event,
          x: n.x + n.w,
          y: n.y + 14 + i * PORT_STEP,
          used: p.used,
        }),
      );

  const edges: PEdge[] = [];
  for (const e of dedup) {
    const a = byId.get(e.from);
    const b = byId.get(e.to);
    if (!a || !b) continue;
    const port = e.port
      ? ports.find((p) => p.id === `${a.id}:${e.port}`)
      : undefined;
    // forward edges leave the right side and enter the left; the backward ones
    // (a key that an element reads) leave the left side of the key and enter the
    // right side of the element
    const forward = a.col < b.col || (a.col === b.col && a.y <= b.y);
    const x1 = forward ? a.x + a.w : a.x;
    const y1 = port ? port.y : a.y + a.h / 2;
    const x2 = forward ? b.x : b.x + b.w;
    const y2 = b.y + b.h / 2;
    const dx = Math.max(40, Math.abs(x2 - x1) / 2);
    const s = forward ? 1 : -1;
    const d = `M${x1} ${y1} C${x1 + s * dx} ${y1} ${x2 - s * dx} ${y2} ${x2} ${y2}`;
    edges.push({
      ...e,
      x1,
      y1,
      x2,
      y2,
      d,
      lx: (x1 + x2) / 2,
      ly: (y1 + y2) / 2,
    });
  }
  const width = COL_X[2] + COL_W[2] + 16;
  const height = Math.max(120, ...placed.map((n) => n.y + n.h + 16));
  return { nodes: placed, edges, width, height, ports };
}

// ---- the svg tree ----

export interface DiagramUi {
  hover: string;
  selNode: string;
  selEdge: string;
  /** the event port that was picked to start a link: `el:event` */
  armed: string;
  collapsed: Record<string, boolean>;
  /** the prefix of the message ids (the component's place in the app) */
  prefix: string;
}

/** The ids of the nodes and edges lit up when `hover` is hovered. */
export function litBy(
  p: Placed,
  hover: string,
): { nodes: Set<string>; edges: Set<string> } {
  const nodes = new Set<string>();
  const edges = new Set<string>();
  if (!hover) return { nodes, edges };
  nodes.add(hover);
  for (const e of p.edges)
    if (e.from === hover || e.to === hover) {
      edges.add(e.id);
      nodes.add(e.from);
      nodes.add(e.to);
    }
  return { nodes, edges };
}

const NODE_CLASS: Record<NodeKind, string> = {
  page: "vb-dg__node vb-dg__page",
  section: "vb-dg__node vb-dg__section",
  element: "vb-dg__node vb-dg__element",
  chain: "vb-dg__node vb-dg__chain",
  http: "vb-dg__node vb-dg__http",
  key: "vb-dg__node vb-dg__key",
};

export function diagramTree(p: Placed, ui: DiagramUi): SvgNode {
  const lit = litBy(p, ui.hover);
  const dim = ui.hover !== "";
  const msg = (
    id: string,
    payload: Record<string, unknown>,
    extra: Record<string, unknown> = { stop: true },
  ) => ({
    id: ui.prefix + id,
    payload,
    ...extra,
  });
  const edgeNodes = p.edges.flatMap((e) => {
    const on = lit.edges.has(e.id);
    const cls = [
      "vb-dg__edge",
      `vb-dg__edge--${e.kind}`,
      e.kind === "subscribe" || e.kind === "bind" ? "is-dashed" : "",
      on ? "is-lit" : dim ? "is-dim" : "",
      ui.selEdge === e.id ? "is-sel" : "",
    ]
      .filter(Boolean)
      .join(" ");
    return [
      path({
        key: `E${e.id}`,
        class: cls,
        d: e.d,
        fill: "none",
        "marker-end": "url(#vb-arrow)",
      }),
      path({
        key: `H${e.id}`,
        class: "vb-dg__hit",
        d: e.d,
        fill: "none",
        on: { click: msg("dgEdge", { id: e.id }) },
      }),
      ...(on || ui.selEdge === e.id
        ? [
            text(
              {
                key: `L${e.id}`,
                class: "vb-dg__elabel",
                x: e.lx,
                y: e.ly - 4,
                "text-anchor": "middle",
              },
              e.label,
            ),
          ]
        : []),
    ];
  });
  const nodeNodes = p.nodes.map((n) => {
    const cls = [
      NODE_CLASS[n.kind],
      lit.nodes.has(n.id) ? "is-lit" : dim ? "is-dim" : "",
      ui.selNode === n.id ? "is-sel" : "",
      n.kind === "page" && ui.collapsed[n.ref] ? "is-collapsed" : "",
    ]
      .filter(Boolean)
      .join(" ");
    const on: Record<string, ReturnType<typeof msg>> = {
      click: msg("dgNode", { id: n.id }),
      mouseenter: msg("dgHover", { id: n.id }),
      mouseleave: msg("dgHover", { id: "" }),
    };
    if (n.kind === "key") on.pointerup = msg("dgDrop", { id: n.id });
    return g(
      {
        key: `N${n.id}`,
        class: cls,
        on,
        tabindex: 0,
        role: "button",
        "aria-label": `${n.sub} ${n.label}`,
      },
      rect({
        class: "vb-dg__box",
        x: n.x,
        y: n.y,
        width: n.w,
        height: n.h,
        rx: 7,
      }),
      text(
        {
          class: "vb-dg__title",
          x: n.x + 10,
          y: n.y + (n.kind === "section" ? 17 : 15),
        },
        n.kind === "page"
          ? `${ui.collapsed[n.ref] ? "▸" : "▾"} ${n.label}`
          : n.label,
      ),
      n.kind === "section"
        ? null
        : text({ class: "vb-dg__sub", x: n.x + 10, y: n.y + 28 }, n.sub),
    );
  });
  const toggles = p.nodes
    .filter((n) => n.kind === "page")
    .map((n) =>
      rect({
        key: `T${n.id}`,
        class: "vb-dg__toggle",
        x: n.x,
        y: n.y,
        width: 28,
        height: n.h,
        on: { click: msg("dgToggle", { id: n.ref }, { stop: true }) },
      }),
    );
  const portNodes = p.ports.map((pt) => {
    const armed = ui.armed === `${pt.el}:${pt.event}`;
    return g(
      {
        key: `P${pt.id}`,
        class: [
          "vb-dg__port",
          pt.used ? "is-used" : "",
          armed ? "is-armed" : "",
        ]
          .filter(Boolean)
          .join(" "),
      },
      rect({
        class: "vb-dg__portdot",
        x: pt.x - 5,
        y: pt.y - 5,
        width: 10,
        height: 10,
        rx: 5,
        on: {
          pointerdown: msg("dgPort", { el: pt.el, event: pt.event }),
          click: msg("dgPort", { el: pt.el, event: pt.event }, { stop: true }),
        },
      }),
      text(
        {
          class: "vb-dg__portlabel",
          x: pt.x - 9,
          y: pt.y + 3,
          "text-anchor": "end",
        },
        pt.event,
      ),
    );
  });
  return root(
    {
      viewBox: `0 0 ${p.width} ${p.height}`,
      class: "vb-dg",
      role: "group",
      "aria-label": "App diagram",
      on: { click: msg("dgBackground", {}, {}) },
    },
    defs(
      {},
      marker(
        {
          id: "vb-arrow",
          markerWidth: 8,
          markerHeight: 8,
          refX: 7,
          refY: 4,
          orient: "auto",
        },
        path({ d: "M0 0 L8 4 L0 8 z", class: "vb-dg__arrow" }),
      ),
    ),
    text({ class: "vb-dg__head", x: COL_X[0], y: 10 }, "Pages · elements"),
    text({ class: "vb-dg__head", x: COL_X[1], y: 10 }, "Events · HTTP"),
    text({ class: "vb-dg__head", x: COL_X[2], y: 10 }, "State"),
    ...edgeNodes,
    ...nodeNodes,
    ...toggles,
    ...portNodes,
  );
}

// ---- editing through the diagram ----

/** The action a new link from an element's event to a state key creates. */
export function linkAction(
  m: Model,
  elId: string,
  event: EventName,
  key: string,
): Action {
  const el = findElement(m, elId)?.el;
  const k = stateKey(m, key);
  if (!k) return blankAction("set");
  const input = event === "input" || event === "change" || event === "enter";
  const checkbox = el?.type === "checkbox";
  const picked =
    el?.type === "table"
      ? "row"
      : el?.type === "list" || el?.type === "repeater"
        ? "item"
        : "";
  if (k.type === "boolean") return { t: "toggle", key };
  const isArray = k.type === "json" && Array.isArray(parseInitial(k).value);
  if (isArray)
    return {
      t: "push",
      key,
      value:
        picked || (input ? (checkbox ? "event.checked" : "event.value") : '""'),
    };
  if (k.type === "number")
    return {
      t: "set",
      key,
      value: input ? "num(event.value)" : `state.${key} + 1`,
    };
  return {
    t: "set",
    key,
    value:
      picked || (input ? (checkbox ? "event.checked" : "event.value") : '""'),
  };
}

export function addLink(
  m: Model,
  elId: string,
  event: EventName,
  key: string,
): Model {
  return mapElement(m, elId, (e) => ({
    ...e,
    events: {
      ...e.events,
      [event]: appendAction(
        e.events[event] ?? [],
        "",
        linkAction(m, elId, event, key),
      ),
    },
  }));
}

/** Removes what an edge stands for; null when the edge is derived from a text. */
export function removeEdge(m: Model, edge: GEdge): Model | null {
  const r = edge.ref;
  if (r.kind === "bind")
    return mapElement(m, r.el, (e) => ({ ...e, bind: "" }));
  if (r.kind !== "action" || !r.event) return null;
  const ev = r.event;
  return mapElement(m, r.el, (e) => {
    const chain = removeAction(e.events[ev] ?? [], r.path);
    const events = { ...e.events };
    if (chain.length === 0) delete events[ev];
    else events[ev] = chain;
    return { ...e, events };
  });
}

/** Counts the actions of the model (for the summary line). */
export function countActions(m: Model): number {
  let n = 0;
  for (const p of m.pages)
    for (const s of p.sections)
      for (const e of s.elements)
        for (const c of Object.values(e.events)) walk(c ?? [], () => n++);
  return n;
}
