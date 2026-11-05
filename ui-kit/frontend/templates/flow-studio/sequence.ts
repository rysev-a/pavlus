// The Sequence tab: the lifelines (Browser / App / Postgres / Redis / ...) and the
// arrows between them, generated from the design. Message arrows carry the message
// id and the rid badge, activation bars show who is busy, `alt` and `opt` fragments
// show the conditional branches and the failure paths (onError). Pure: `buildSequence`
// reads the model and lays the rows out, `sequenceTree` draws them with the svg plugin.
import type { SvgNode } from "@service-laboratory/pavlus/plugins/svg";
import {
  defs,
  g,
  line,
  path,
  rect,
  root,
  svg,
  text,
} from "@service-laboratory/pavlus/plugins/svg/h";
import {
  type EdgeKind,
  type FlowEdge,
  type FlowNode,
  type Model,
  EXTERNAL_OF,
  condName,
  EDGE_KINDS,
  effectDef,
  findNode,
  laneOf,
  outEdges,
} from "./model.ts";
import { requestsOf } from "./engine.ts";

export interface Lifeline {
  id: string;
  label: string;
  x: number;
}

export type Item =
  | {
      t: "arrow";
      from: string;
      to: string;
      label: string;
      kind: EdgeKind;
      edge: string;
      rid: boolean;
      dashed?: boolean;
    }
  | {
      t: "self";
      at: string;
      label: string;
      kind: EdgeKind;
      edge: string;
      rid: boolean;
      dashed?: boolean;
    }
  | {
      t: "frag";
      op: "alt" | "opt";
      branches: { guard: string; items: Item[] }[];
    };

export interface Row {
  item: Extract<Item, { t: "arrow" | "self" }>;
  y: number;
  x1: number;
  x2: number;
}
export interface Frag {
  op: "alt" | "opt";
  depth: number;
  y1: number;
  y2: number;
  guards: { guard: string; y: number }[];
}
export interface Activation {
  lifeline: string;
  y1: number;
  y2: number;
  depth: number;
}
export interface Sequence {
  lifelines: Lifeline[];
  rows: Row[];
  frags: Frag[];
  activations: Activation[];
  width: number;
  height: number;
}

const GAP = 168;
const LEFT = 84;
const TOP = 74;
const ROW = 34;
const FRAG_HEAD = 26;

const short = (s: string, n: number): string =>
  s.length > n ? `${s.slice(0, n - 1)}…` : s;

/** the lifelines the design needs, in order: client, app, the externals, the plugins */
export function lifelinesOf(m: Model): Lifeline[] {
  const hasBrowser = m.nodes.some((n) => laneOf(n) === "browser");
  const ext = (plugin: string): FlowNode | undefined =>
    m.nodes.find((n) => n.kind === "external" && n.plugin === plugin);
  const used = new Set(
    m.nodes.filter((n) => n.kind === "effect").map((n) => n.plugin),
  );
  const clientExt = m.nodes.find(
    (n) => n.kind === "external" && n.plugin === "http",
  );
  const list: { id: string; label: string }[] = [
    {
      id: "client",
      label: hasBrowser ? "Browser" : (clientExt?.title ?? "Client"),
    },
    { id: "app", label: "App" },
  ];
  if (used.has("pg"))
    list.push({ id: "pg", label: ext("pg")?.title ?? "Postgres" });
  if (used.has("redis"))
    list.push({ id: "redis", label: ext("redis")?.title ?? "Redis" });
  if (used.has("fetch"))
    list.push({ id: "fetch", label: ext("fetch")?.title ?? "Third-party API" });
  for (const p of ["crypto", "timer", "log"])
    if (used.has(p)) list.push({ id: p, label: `${p} plugin` });
  return list.map((l, i) => ({ ...l, x: LEFT + i * GAP }));
}

/** the lifeline an effect node talks to */
export const lifelineOfEffect = (n: FlowNode): string => {
  if (n.plugin === "http" || n.plugin === "ws") return "client";
  return n.plugin in EXTERNAL_OF ||
    ["crypto", "timer", "log"].includes(n.plugin)
    ? n.plugin
    : "app";
};

/** The arrows of the design as a tree of items (before the layout). */
export function itemsOf(m: Model): Item[] {
  const items: Item[] = [];
  const entries = [
    ...new Set(requestsOf(m, m.scenario).map((r) => r.entry)),
  ].filter((id) => findNode(m, id));

  const walkStart = (startId: string): Item[] => {
    const seen = new Set<string>();

    const edgeItems = (e: FlowEdge, from: FlowNode, to: FlowNode): Item[] => {
      const label = e.msg;
      const lane = laneOf(from);
      if (from.kind === "effect") {
        // a reply or an error comes back from a plugin
        if (laneOf(to) === "browser")
          return [
            {
              t: "self",
              at: "client",
              label,
              kind: e.kind,
              edge: e.id,
              rid: false,
            },
          ];
        return [
          {
            t: "arrow",
            from: lifelineOfEffect(from),
            to: "app",
            label,
            kind: e.kind,
            edge: e.id,
            rid: e.rid,
            dashed: e.kind === "error",
          },
        ];
      }
      if (to.kind === "route")
        return [
          {
            t: "arrow",
            from: "client",
            to: "app",
            label: `${label} ${to.title}`,
            kind: e.kind,
            edge: e.id,
            rid: e.rid,
          },
        ];
      if (to.kind === "effect") {
        const detail =
          to.detail && to.title !== "http.respond"
            ? ` ${short(to.detail, 30)}`
            : "";
        const tail = to.title === "http.respond" ? ` ${to.status || 200}` : "";
        return [
          {
            t: "arrow",
            from: "app",
            to: lifelineOfEffect(to),
            label: `${label}${tail}${detail}`,
            kind: e.kind,
            edge: e.id,
            rid: e.rid,
          },
        ];
      }
      return [
        {
          t: "self",
          at: lane === "browser" ? "client" : "app",
          label:
            from.kind === "fe-handler" && to.kind === "fe-state"
              ? `${label} ${to.title}`
              : label,
          kind: e.kind,
          edge: e.id,
          rid: e.rid,
        },
      ];
    };

    /** the branches of the edges leaving a node, conditions as alt / opt */
    const branches = (edges: FlowEdge[]): Item[] => {
      const out: Item[] = [];
      const plain = edges.filter((e) => !e.cond.trim());
      const cond = edges.filter((e) => e.cond.trim());
      for (const e of plain) out.push(...follow(e));
      const names = [...new Set(cond.map((e) => condName(e.cond)))];
      for (const name of names) {
        const yes = cond.filter((e) => e.cond.trim() === name);
        const no = cond.filter((e) => e.cond.trim() === `!${name}`);
        const other = cond.filter(
          (e) =>
            condName(e.cond) === name && !yes.includes(e) && !no.includes(e),
        );
        const mk = (list: FlowEdge[]): Item[] => list.flatMap((e) => follow(e));
        if (yes.length && no.length)
          out.push({
            t: "frag",
            op: "alt",
            branches: [
              { guard: name, items: mk(yes) },
              { guard: "else", items: mk(no) },
            ],
          });
        else {
          const list = [...yes, ...no, ...other];
          const guard = list[0].cond.trim();
          out.push({
            t: "frag",
            op: "opt",
            branches: [{ guard, items: mk(list) }],
          });
        }
      }
      return out;
    };

    const follow = (e: FlowEdge): Item[] => {
      const from = findNode(m, e.from);
      const to = findNode(m, e.to);
      if (!from || !to) return [];
      const head = edgeItems(e, from, to);
      if (seen.has(to.id) && to.kind !== "effect") {
        // a join point (an error handler, a shared reply): shown once, then referred to
        return [
          ...head,
          {
            t: "self",
            at: laneOf(to) === "browser" ? "client" : "app",
            label: `${to.title} (as above)`,
            kind: e.kind,
            edge: e.id,
            rid: false,
            dashed: true,
          },
        ];
      }
      return [...head, ...walk(to)];
    };

    const walk = (n: FlowNode): Item[] => {
      seen.add(n.id);
      if (n.kind === "effect") {
        const outs = outEdges(m, n.id);
        const def = effectDef(n.title);
        const replies = outs.filter((e) => e.kind === "reply");
        const errors = outs.filter((e) => e.kind === "error");
        if (def?.responds || n.plugin === "http") {
          // the response goes to the client; what the client does with it follows
          const res: Item[] = [];
          for (const e of replies) res.push(...follow(e));
          return res;
        }
        if (replies.length && errors.length)
          return [
            {
              t: "frag",
              op: "alt",
              branches: [
                { guard: "ok", items: replies.flatMap((e) => follow(e)) },
                { guard: "onError", items: errors.flatMap((e) => follow(e)) },
              ],
            },
          ];
        return [...replies, ...errors].flatMap((e) => follow(e));
      }
      return branches(outEdges(m, n.id));
    };

    const start = findNode(m, startId)!;
    seen.add(start.id);
    return branches(outEdges(m, start.id));
  };

  for (const id of entries) items.push(...walkStart(id));
  return items;
}

export function buildSequence(m: Model): Sequence {
  const lifelines = lifelinesOf(m);
  const xOf = (id: string): number =>
    lifelines.find((l) => l.id === id)?.x ?? lifelines[1].x;
  const rows: Row[] = [];
  const frags: Frag[] = [];
  const acts: Activation[] = [];
  let y = TOP + 18;
  const open = new Map<string, number>();
  const closeAct = (id: string, at: number, depth: number): void => {
    const y1 = open.get(id);
    if (y1 !== undefined) {
      acts.push({ lifeline: id, y1, y2: at, depth });
      open.delete(id);
    }
  };

  const place = (items: Item[], depth: number): void => {
    for (const it of items) {
      if (it.t === "frag") {
        const f: Frag = { op: it.op, depth, y1: y, y2: y, guards: [] };
        y += FRAG_HEAD - 8;
        it.branches.forEach((b, i) => {
          if (i > 0) y += 8;
          f.guards.push({ guard: b.guard, y });
          y += 14;
          place(b.items, depth + 1);
        });
        y += 10;
        f.y2 = y;
        frags.push(f);
        y += 8;
        continue;
      }
      y += it.t === "self" ? ROW : ROW - 4;
      if (it.t === "arrow") {
        const x1 = xOf(it.from);
        const x2 = xOf(it.to);
        rows.push({ item: it, y, x1, x2 });
        if (it.to !== "app" && it.to !== "client" && it.from === "app")
          open.set(it.to, y);
        else if (it.from !== "app" && it.from !== "client" && it.to === "app")
          closeAct(it.from, y, depth);
      } else {
        const x = xOf(it.at);
        rows.push({ item: it, y, x1: x, x2: x });
      }
    }
  };
  place(itemsOf(m), 0);
  for (const [id, y1] of open)
    acts.push({ lifeline: id, y1, y2: y1 + 16, depth: 0 });
  // the app is busy from its first to its last arrow
  const appRows = rows.filter(
    (r) =>
      (r.item.t === "arrow" &&
        (r.item.from === "app" || r.item.to === "app")) ||
      (r.item.t === "self" && r.item.at === "app"),
  );
  if (appRows.length)
    acts.push({
      lifeline: "app",
      y1: appRows[0].y - 10,
      y2: appRows[appRows.length - 1].y + 12,
      depth: 0,
    });
  const width = LEFT + (lifelines.length - 1) * GAP + 120;
  return { lifelines, rows, frags, activations: acts, width, height: y + 36 };
}

// ---- drawing ----

export interface SeqUi {
  /** the edge of the step the debugger shows */
  current: string;
  /** the edges already passed in the trace */
  passed: string[];
  selEdge: string;
  prefix: string;
}

const KIND_CLASS: Record<EdgeKind, string> = {
  request: "request",
  effect: "effect",
  reply: "reply",
  error: "error",
  cancel: "cancel",
};

export function sequenceTree(s: Sequence, ui: SeqUi): SvgNode {
  const msg = (id: string, payload: Record<string, unknown>) => ({
    id: ui.prefix + id,
    payload,
    stop: true,
  });
  const nodes: (SvgNode | null)[] = [];
  const bottom = s.height - 24;
  for (const l of s.lifelines) {
    nodes.push(
      line({
        key: `L${l.id}`,
        class: "fs-sq__life",
        x1: l.x,
        y1: TOP,
        x2: l.x,
        y2: bottom,
      }),
      g(
        { key: `H${l.id}`, class: "fs-sq__head" },
        rect({ x: l.x - 62, y: 14, width: 124, height: 34, rx: 8 }),
        text({ x: l.x, y: 36, "text-anchor": "middle" }, short(l.label, 16)),
      ),
    );
  }
  const xMin = s.lifelines[0].x - 70;
  const xMax = s.lifelines[s.lifelines.length - 1].x + 70;
  for (const [i, f] of s.frags.entries()) {
    const inset = f.depth * 7;
    nodes.push(
      g(
        { key: `F${i}`, class: `fs-sq__frag fs-sq__frag--${f.op}` },
        rect({
          x: xMin + inset,
          y: f.y1,
          width: xMax - xMin - inset * 2,
          height: f.y2 - f.y1,
          rx: 3,
        }),
        rect({
          class: "fs-sq__tag",
          x: xMin + inset,
          y: f.y1,
          width: 34,
          height: 16,
        }),
        text(
          { class: "fs-sq__tagtext", x: xMin + inset + 6, y: f.y1 + 12 },
          f.op,
        ),
        ...f.guards.flatMap((gd, k) => [
          k > 0
            ? line({
                class: "fs-sq__sep",
                x1: xMin + inset,
                y1: gd.y - 4,
                x2: xMax - inset,
                y2: gd.y - 4,
              })
            : null,
          text(
            {
              class: "fs-sq__guard",
              x: xMin + inset + 42,
              y: gd.y + (k === 0 ? 0 : 6) + 6,
            },
            `[${gd.guard}]`,
          ),
        ]),
      ),
    );
  }
  for (const [i, a] of s.activations.entries())
    nodes.push(
      rect({
        key: `A${i}`,
        class: `fs-sq__act fs-sq__act--${a.lifeline === "app" ? "app" : "plugin"}`,
        x: (s.lifelines.find((l) => l.id === a.lifeline)?.x ?? 0) - 5,
        y: a.y1,
        width: 10,
        height: Math.max(8, a.y2 - a.y1),
        rx: 2,
      }),
    );
  for (const [i, r] of s.rows.entries()) {
    const it = r.item;
    const cls = [
      "fs-sq__msg",
      `fs-sq__msg--${KIND_CLASS[it.kind]}`,
      it.dashed ? "is-dashed" : "",
      ui.current === it.edge && it.edge ? "is-current" : "",
      ui.passed.includes(it.edge) && it.edge ? "is-passed" : "",
      ui.selEdge === it.edge && it.edge ? "is-sel" : "",
    ]
      .filter(Boolean)
      .join(" ");
    const on = it.edge ? { click: msg("sqEdge", { id: it.edge }) } : undefined;
    const label = short(it.label, 44);
    const badge = it.rid
      ? [
          rect({
            class: "fs-sq__rid",
            x: Math.min(r.x1, r.x2) + 10 + label.length * 5.6 + 4,
            y: r.y - 21,
            width: 22,
            height: 12,
            rx: 6,
          }),
          text(
            {
              class: "fs-sq__ridtext",
              x: Math.min(r.x1, r.x2) + 10 + label.length * 5.6 + 15,
              y: r.y - 12,
              "text-anchor": "middle",
            },
            "rid",
          ),
        ]
      : [];
    if (it.t === "self") {
      nodes.push(
        g(
          { key: `M${i}`, class: cls, on },
          path({
            class: "fs-sq__line",
            d: `M${r.x1} ${r.y - 12} h34 v16 h-34`,
            fill: "none",
            "marker-end": `url(#fs-sq-arrow-${it.kind})`,
          }),
          text({ class: "fs-sq__label", x: r.x1 + 40, y: r.y - 1 }, label),
        ),
      );
      continue;
    }
    const dir = r.x2 >= r.x1 ? 1 : -1;
    nodes.push(
      g(
        { key: `M${i}`, class: cls, on },
        line({
          class: "fs-sq__line",
          x1: r.x1 + 5 * dir,
          y1: r.y,
          x2: r.x2 - 5 * dir,
          y2: r.y,
          "marker-end": `url(#fs-sq-arrow-${it.kind})`,
        }),
        line({
          class: "fs-sq__hit",
          x1: r.x1,
          y1: r.y,
          x2: r.x2,
          y2: r.y,
        }),
        text(
          {
            class: "fs-sq__label",
            x: Math.min(r.x1, r.x2) + 10,
            y: r.y - 6,
          },
          label,
        ),
        ...badge,
      ),
    );
  }
  return root(
    {
      viewBox: `0 0 ${s.width} ${s.height}`,
      class: "fs-sq",
      role: "img",
      "aria-label": "Sequence diagram of the design",
    },
    markerDefs("fs-sq-arrow"),
    ...nodes,
  );
}

/** one arrowhead per kind of edge, painted by the CSS from the kit's tokens */
export function markerDefs(prefix: string): SvgNode {
  return defs(
    {},
    ...EDGE_KINDS.map((k) =>
      svg(
        "marker",
        {
          id: `${prefix}-${k}`,
          markerUnits: "userSpaceOnUse",
          markerWidth: 10,
          markerHeight: 10,
          refX: 9,
          refY: 5,
          orient: "auto",
        },
        path({ d: "M0 0 L10 5 L0 10 z", class: `fs-arrow fs-arrow--${k}` }),
      ),
    ),
  );
}

/** For the tests and the catalog: the labels of the arrows in order. */
export const labelsOf = (s: Sequence): string[] =>
  s.rows.map((r) => r.item.label);
