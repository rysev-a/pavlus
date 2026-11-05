// Flow Studio. An interactive full-stack design dashboard: you design the frontend
// and the backend of an application as a swimlane graph (Browser / App / Plugins /
// Externals) of messages and effects, then Run it and watch tokens (one colour per
// request id) travel along the edges, step by step, with the payloads, the
// per-request state slice, the latencies and the injected faults.
//
// Everything in this file is a pure function of (message, state). The logic is in
// the files next to it: model, history (shared with the Visual Builder), layout,
// engine (the simulation), sequence, catalog, timeline, lint, codegen, import-vb,
// quick, faults and inspector. Side effects are plugins: `store`, `time` (the
// player), `svg` (the canvas and the other drawings), `files` and `local` (the saved
// project, the clipboard, the shortcuts, the reduced-motion query).
import {
  Component,
  type Effect,
  type Message,
} from "@service-laboratory/pavlus";
import {
  DomPlugin,
  storeEffector as store,
  svgEffector as svg,
  timeEffector as time,
} from "@service-laboratory/pavlus/plugins";
import { filesEffector, type Picked } from "../../files.ts";
import { type KeyPayload, localEffector as local } from "../../local.ts";
import {
  type History,
  canRedo,
  canUndo,
  commit,
  redo,
  start,
  undo,
} from "../visual-builder/history.ts";
import { DEMOS as VB_DEMOS } from "../visual-builder/demos.ts";
import { canvasTree, minimapTree, ridColor } from "./canvas.ts";
import { catalogOf, schemaText } from "./catalog.ts";
import { generateAll } from "./codegen.ts";
import { DEMOS, demoOf, loginDemo } from "./demos.ts";
import {
  type Outcome,
  type Step,
  type Trace,
  outcomes as outcomesOf,
  ridsOf,
  simulate,
} from "./engine.ts";
import {
  CHIPS,
  chipOn,
  faultText,
  removeFault,
  toggleChip,
  toggleNodeFault,
  updateFault,
} from "./faults.ts";
import { importVisualBuilder, importVisualBuilderText } from "./import-vb.ts";
import {
  type InspectorView,
  type ScenarioView,
  applyEdit,
  inspectorOf,
  scenarioView,
} from "./inspector.ts";
import {
  type Dir,
  type Viewport,
  GUTTER,
  HOME,
  autoLayout,
  centerOn,
  clampView,
  fitView,
  layoutOf,
  neighbor,
  reveal,
  zoomBy,
} from "./layout.ts";
import { counts, lintCached as lint } from "./lint.ts";
import {
  type FlowNode,
  type Model,
  type NodeKind,
  EFFECTS,
  KIND_LABEL,
  LANE_LABEL,
  addEdge,
  addNode,
  condNames,
  emptyModel,
  findEdge,
  findNode,
  laneOf,
  moveNode,
  newId,
  parseProject,
  projectText,
  removeEdge,
  removeNode,
  slugify,
} from "./model.ts";
import { parseQuick, QUICK_EXAMPLES } from "./quick.ts";
import { buildSequence, sequenceTree } from "./sequence.ts";
import { buildTimeline, timelineTree } from "./timeline.ts";
import view from "./flow-studio.pavlus";

export const STORAGE_KEY = "pavlus-flow-studio";
const FLOW = "#fs-flow";
const MINI = "#fs-minimap";
const SEQ = "#fs-seq";
const TIME = "#fs-time";
const TICK = "fs-tick";
const SYNC = "fs-sync";
/** how long one step of the animation lasts, ms (before the speed) */
export const STEP_MS = 650;
const TICK_MS = 50;
export const SPEEDS = [0.5, 1, 2, 4];

export type View =
  "flow" | "sequence" | "catalog" | "timeline" | "checks" | "source";
export type Side = "inspect" | "debug" | "scenario";

export const VIEWS: { id: View; label: string }[] = [
  { id: "flow", label: "Flow" },
  { id: "sequence", label: "Sequence" },
  { id: "catalog", label: "Catalog" },
  { id: "timeline", label: "Timeline" },
  { id: "checks", label: "Checks" },
  { id: "source", label: "Source" },
];

export interface Sel {
  kind: "none" | "node" | "edge";
  id: string;
}

export type Drag =
  | {
      kind: "node";
      id: string;
      ox: number;
      oy: number;
      x: number;
      y: number;
      moved: boolean;
    }
  | { kind: "pan"; ax: number; ay: number; moved: boolean }
  | {
      kind: "link";
      from: string;
      port: "out" | "ok" | "err";
      x: number;
      y: number;
    };

export interface Sheet {
  open: "" | "demos" | "import" | "vb";
  text: string;
  error: string;
}

/** the part of the state the user changes; everything else follows from it */
export interface Core {
  hist: History<Model>;
  tab: View;
  sel: Sel;
  side: Side;
  sideOpen: boolean;
  vp: Viewport;
  drag: Drag | null;
  follow: boolean;
  trace: Trace | null;
  pos: number;
  progress: number;
  playing: boolean;
  speed: number;
  breakpoints: Record<string, boolean>;
  ready: boolean;
  prefix: string;
  sheet: Sheet;
  message: string;
  live: string;
  reduced: boolean;
  quick: { text: string; error: string };
  srcPath: string;
  tlRid: string;
  /** which of the generated files was copied last, for the button label */
  copied: string;
}

export interface StepView {
  has: boolean;
  title: string;
  where: string;
  rid: string;
  col: number;
  type: string;
  status: string;
  note: string;
  time: string;
  took: string;
  payload: string;
  effect: string;
  hasEffect: boolean;
  req: string;
  hasReq: boolean;
  shared: string;
  client: string;
  fault: string;
  slices: { rid: string; col: number; text: string; current: boolean }[];
}

interface LogRow {
  k: string;
  i: number;
  text: string;
  sub: string;
  rid: string;
  col: number;
  type: string;
  status: string;
  current: boolean;
  passed: boolean;
}

interface Derived {
  model: Model;
  canUndo: boolean;
  canRedo: boolean;
  summary: string;
  projectName: string;
  tabs: { id: View; label: string; current: boolean; badge: string }[];
  viewTitle: string;
  isFlow: boolean;
  isSequence: boolean;
  isCatalog: boolean;
  isTimeline: boolean;
  isChecks: boolean;
  isSource: boolean;
  palette: PaletteGroup[];
  inspector: InspectorView;
  scenarioV: ScenarioView;
  chips: { id: string; label: string; hint: string; on: boolean }[];
  activeFaults: { k: string; text: string }[];
  runbar: {
    has: boolean;
    atEnd: boolean;
    atStart: boolean;
    playLabel: string;
    runLabel: string;
    position: string;
    clock: string;
    status: string;
  };
  cur: StepView;
  stepLog: LogRow[];
  outcomes: (Outcome & { col: number; text: string })[];
  bpList: { id: string; title: string }[];
  checks: {
    rows: {
      k: string;
      i: number;
      severity: string;
      title: string;
      detail: string;
      rule: string;
    }[];
    summary: string;
    clean: boolean;
  };
  catalog: {
    k: string;
    kind: string;
    id: string;
    producers: string;
    consumers: string;
    schema: string;
    tests: string;
    untested: boolean;
    edge: string;
  }[];
  source: {
    files: { path: string; title: string; group: string; current: boolean }[];
    code: string;
    path: string;
    count: string;
  };
  tlRids: { rid: string; col: number; current: boolean }[];
  tlNote: string;
  demoList: { id: string; title: string; about: string }[];
  zoomText: string;
  connectList: { id: string; title: string }[];
  quickExamples: { k: string; text: string }[];
  speeds: { v: string; label: string; selected: boolean }[];
  firstField: string;
  hasSel: boolean;
  condOptions: { k: string }[];
}

export type FsState = Core & Derived;

export interface PaletteGroup {
  lane: string;
  items: { kind: NodeKind; title: string; label: string }[];
}

export const PALETTE: PaletteGroup[] = [
  {
    lane: LANE_LABEL.browser,
    items: [
      { kind: "ui-event", title: "click #button", label: "UI event" },
      { kind: "fe-handler", title: "onClick", label: "Frontend handler" },
      { kind: "fe-state", title: "session", label: "State key" },
    ],
  },
  {
    lane: LANE_LABEL.app,
    items: [
      { kind: "route", title: "GET /items", label: "HTTP route" },
      { kind: "handler", title: "items.list", label: "Pure handler" },
      { kind: "reply", title: "items.loaded", label: "Reply message" },
      { kind: "error", title: "items.failed", label: "Error message" },
    ],
  },
  {
    lane: LANE_LABEL.plugins,
    items: EFFECTS.filter(
      (e) => e.type !== "http.sse" && e.type !== "pg.tx.rollback",
    ).map((e) => ({
      kind: "effect" as const,
      title: e.type,
      label: e.type,
    })),
  },
  {
    lane: LANE_LABEL.externals,
    items: [
      { kind: "external", title: "Postgres", label: "Postgres" },
      { kind: "external", title: "Redis", label: "Redis" },
      { kind: "external", title: "Third-party API", label: "Third-party API" },
      { kind: "external", title: "Client", label: "Client" },
    ],
  },
];

const NO_SEL: Sel = { kind: "none", id: "" };
const NO_SHEET: Sheet = { open: "", text: "", error: "" };

export const DEMO_LIST = [
  ...DEMOS.map((d) => ({ id: d.id, title: d.title, about: d.about })),
  { id: "blank", title: "Blank flow", about: "Start from nothing." },
];

const fmt = (n: number): string => `${Math.round(n * 10) / 10} ms`;
const pretty = (v: unknown): string =>
  v === undefined ? "" : JSON.stringify(v, null, 2);

export function coreOf(model: Model): Core {
  return {
    hist: start(model),
    tab: "flow",
    sel: NO_SEL,
    side: "inspect",
    sideOpen: false,
    vp: HOME,
    drag: null,
    follow: true,
    trace: null,
    pos: -1,
    progress: 1,
    playing: false,
    speed: 1,
    breakpoints: {},
    ready: false,
    prefix: "",
    sheet: NO_SHEET,
    message: "",
    live: "",
    reduced: false,
    quick: { text: "", error: "" },
    srcPath: "",
    tlRid: "",
    copied: "",
  };
}

const NO_STEP: StepView = {
  has: false,
  title: "Press Run",
  where: "",
  rid: "",
  col: 0,
  type: "",
  status: "",
  note: "Run simulates the design and plays it as tokens on the canvas. Step moves one hop at a time; Space steps, too.",
  time: "",
  took: "",
  payload: "",
  effect: "",
  hasEffect: false,
  req: "",
  hasReq: false,
  shared: "",
  client: "",
  fault: "",
  slices: [],
};

function stepView(m: Model, trace: Trace | null, pos: number): StepView {
  if (!trace || pos < 0 || pos >= trace.length) return NO_STEP;
  const s = trace[pos];
  const name = (id: string): string => findNode(m, id)?.title ?? id;
  const last = new Map<string, Step>();
  for (let i = 0; i <= pos; i++) last.set(trace[i].rid, trace[i]);
  const rids = ridsOf(trace);
  return {
    has: true,
    title: `${s.label}`,
    where: s.from === s.to ? name(s.to) : `${name(s.from)} to ${name(s.to)}`,
    rid: s.rid,
    col: ridColor(trace, s.rid),
    type: s.type,
    status: s.status,
    note: s.note,
    time: fmt(s.t),
    took: s.t - s.tStart > 0 ? fmt(s.t - s.tStart) : "instant",
    payload: pretty(s.payload),
    effect: s.effect ? pretty(s.effect) : "",
    hasEffect: s.effect !== null,
    req: s.req === null ? "(no slice: the request is done)" : pretty(s.req),
    hasReq: true,
    shared: pretty(s.shared),
    client: pretty(s.client),
    fault: s.fault,
    slices: [...last].map(([rid, st]) => ({
      rid,
      col: rids.indexOf(rid) % 5,
      text: st.req === null ? "(done)" : JSON.stringify(st.req),
      current: rid === s.rid,
    })),
  };
}

/** Pure: everything the template shows that follows from the core. */
export function derive(c: Core): Derived {
  const model = c.hist.present;
  const trace = c.trace;
  const has = trace !== null;
  const rids = trace ? ridsOf(trace) : [];
  const flowOrSeq = c.tab;
  const nRoutes = model.nodes.filter((n) => n.kind === "route").length;
  const iss = c.tab === "checks" || c.tab === "flow" ? lint(model) : [];
  const issueCounts = counts(iss);
  const outs = trace ? outcomesOf(trace) : [];
  const files = c.tab === "source" ? generateAll(model) : [];
  const srcPath = files.some((f) => f.path === c.srcPath)
    ? c.srcPath
    : (files[0]?.path ?? "");
  const cur = files.find((f) => f.path === srcPath);
  const cat = c.tab === "catalog" ? catalogOf(model) : [];
  const tlRid = rids.includes(c.tlRid) ? c.tlRid : (rids[0] ?? "");
  const atEnd = has && c.pos >= (trace?.length ?? 0) - 1;
  const lastStep =
    trace && c.pos >= 0 ? trace[Math.min(c.pos, trace.length - 1)] : null;
  return {
    model,
    canUndo: canUndo(c.hist),
    canRedo: canRedo(c.hist),
    summary: `${model.nodes.length} nodes · ${model.edges.length} edges · ${nRoutes} ${nRoutes === 1 ? "route" : "routes"}`,
    projectName: model.name,
    tabs: VIEWS.map((v) => ({
      id: v.id,
      label: v.label,
      current: v.id === c.tab,
      badge:
        v.id === "checks" && issueCounts.error + issueCounts.warn > 0
          ? String(issueCounts.error + issueCounts.warn)
          : "",
    })),
    viewTitle: VIEWS.find((v) => v.id === c.tab)?.label ?? "",
    isFlow: flowOrSeq === "flow",
    isSequence: flowOrSeq === "sequence",
    isCatalog: flowOrSeq === "catalog",
    isTimeline: flowOrSeq === "timeline",
    isChecks: flowOrSeq === "checks",
    isSource: flowOrSeq === "source",
    palette: PALETTE,
    inspector: inspectorOf(model, c.sel, c.breakpoints),
    scenarioV:
      c.side === "scenario"
        ? scenarioView(model)
        : { conds: [], requests: [], latency: [], faults: [], general: [] },
    chips: CHIPS.map((x) => ({
      id: x.id,
      label: x.label,
      hint: x.hint,
      on: chipOn(model, x),
    })),
    activeFaults: model.scenario.faults
      .filter((f) => f.on)
      .map((f) => ({ k: f.id, text: faultText(model, f) })),
    runbar: {
      has,
      atEnd,
      atStart: c.pos <= -1,
      playLabel: c.playing ? "Pause" : atEnd && has ? "Replay" : "Play",
      runLabel: has ? "Run again" : "Run",
      position: has
        ? `${Math.max(0, c.pos + 1)} / ${trace!.length}`
        : "not run",
      clock: lastStep ? fmt(lastStep.t) : "0 ms",
      status: has
        ? outs
            .map(
              (o) =>
                `${o.rid}: ${o.result}${o.status ? ` ${o.status}` : ""} in ${fmt(o.ms)}`,
            )
            .join(" · ")
        : "The design has not been run",
    },
    cur: stepView(model, trace, c.pos),
    stepLog: trace
      ? trace.slice(0, 600).map((s) => ({
          k: String(s.i),
          i: s.i,
          text: `${s.label}`,
          sub: `${s.t.toFixed(1)} ms · ${s.type}${s.status === "ok" ? "" : ` · ${s.status}`}`,
          rid: s.rid,
          col: ridColor(trace, s.rid),
          type: s.type,
          status: s.status,
          current: s.i === c.pos,
          passed: s.i < c.pos,
        }))
      : [],
    outcomes: outs.map((o) => ({
      ...o,
      col: ridColor(trace, o.rid),
      text: `${o.result}${o.status ? ` ${o.status}` : ""} · ${fmt(o.ms)}${o.cancelled ? ` · ${o.cancelled} cancelled` : ""}${o.dropped ? ` · ${o.dropped} dropped` : ""}`,
    })),
    bpList: Object.keys(c.breakpoints)
      .filter((id) => c.breakpoints[id] && findNode(model, id))
      .map((id) => ({ id, title: findNode(model, id)!.title })),
    checks: {
      rows: iss.map((i, k) => ({
        k: `${k}`,
        i: k,
        severity: i.severity,
        title: i.title,
        detail: i.detail,
        rule: i.rule,
      })),
      summary:
        iss.length === 0
          ? "No problems found."
          : `${issueCounts.error} errors · ${issueCounts.warn} warnings · ${issueCounts.info} notes`,
      clean: iss.length === 0,
    },
    catalog: cat.map((r, k) => ({
      k: `${k}`,
      kind: r.kind,
      id: r.id,
      producers: r.producers.join(", "),
      consumers: r.consumers.join(", "),
      schema: schemaText(r.fields),
      tests: r.tests.length ? r.tests.join("; ") : "not played by any test",
      untested: r.tests.length === 0,
      edge: r.edges[0] ?? "",
    })),
    source: {
      files: files.map((f) => ({
        path: f.path,
        title: f.title,
        group: f.group,
        current: f.path === srcPath,
      })),
      code: cur?.code ?? "",
      path: srcPath,
      count: `${files.length} files`,
    },
    tlRids: rids.map((r) => ({
      rid: r,
      col: ridColor(trace, r),
      current: r === tlRid,
    })),
    tlNote: has ? "" : "Run the flow to see where the time of a request goes.",
    demoList: DEMO_LIST,
    zoomText: `${Math.round(c.vp.z * 100)}%`,
    connectList: model.nodes
      .filter((n) => c.sel.kind === "node" && n.id !== c.sel.id)
      .map((n) => ({ id: n.id, title: `${KIND_LABEL[n.kind]}: ${n.title}` })),
    quickExamples: QUICK_EXAMPLES.map((text, k) => ({ k: String(k), text })),
    speeds: SPEEDS.map((v) => ({
      v: String(v),
      label: `${v}x`,
      selected: v === c.speed,
    })),
    firstField:
      c.sel.kind === "none"
        ? ""
        : (inspectorOf(model, c.sel, c.breakpoints).fields[0]?.id ?? ""),
    hasSel: c.sel.kind !== "none",
    condOptions: condNames(model).map((k) => ({ k })),
  };
}

export function stateOf(model: Model): FsState {
  const core = coreOf(model);
  return { ...core, ...derive(core) };
}

export const initial: FsState = stateOf(loginDemo());

const CORE_KEYS = [
  "hist",
  "tab",
  "sel",
  "side",
  "sideOpen",
  "vp",
  "drag",
  "follow",
  "trace",
  "pos",
  "progress",
  "playing",
  "speed",
  "breakpoints",
  "ready",
  "prefix",
  "sheet",
  "message",
  "live",
  "reduced",
  "quick",
  "srcPath",
  "tlRid",
  "copied",
] as const;

export function coreFrom(s: FsState): Core {
  const c: Record<string, unknown> = {};
  for (const k of CORE_KEYS) c[k] = s[k];
  return c as unknown as Core;
}

const MISS: Record<string, string> = {
  [FLOW]: "missFlow",
  [MINI]: "missMini",
  [SEQ]: "missSeq",
  [TIME]: "missTime",
};

/** the trees of the drawings the current view shows */
export function trees(
  c: Core,
): { target: string; tree: ReturnType<typeof canvasTree> }[] {
  const m = c.hist.present;
  const out: { target: string; tree: ReturnType<typeof canvasTree> }[] = [];
  const trace = c.trace;
  const cur =
    trace && c.pos >= 0 ? trace[Math.min(c.pos, trace.length - 1)] : null;
  if (c.tab === "flow") {
    const over =
      c.drag?.kind === "node"
        ? { [c.drag.id]: { x: c.drag.x, y: c.drag.y } }
        : {};
    const placed = layoutOf(m, over);
    const faultNodes = m.scenario.faults
      .filter((f) => f.on && findNode(m, f.target))
      .map((f) => f.target);
    out.push(
      {
        target: FLOW,
        tree: canvasTree(placed, {
          prefix: c.prefix,
          vp: c.vp,
          selNode: c.sel.kind === "node" ? c.sel.id : "",
          selEdge: c.sel.kind === "edge" ? c.sel.id : "",
          breakpoints: c.breakpoints,
          link:
            c.drag?.kind === "link"
              ? {
                  from: c.drag.from,
                  port: c.drag.port,
                  x: c.drag.x,
                  y: c.drag.y,
                }
              : null,
          trace,
          pos: c.pos,
          progress: c.reduced ? 1 : c.progress,
          faultNodes,
        }),
      },
      {
        target: MINI,
        tree: minimapTree(
          placed,
          c.vp,
          c.prefix,
          c.sel.kind === "node" ? c.sel.id : "",
        ),
      },
    );
  } else if (c.tab === "sequence") {
    const passed = trace
      ? trace.slice(0, Math.max(0, c.pos + 1)).map((s) => s.edge)
      : [];
    out.push({
      target: SEQ,
      tree: sequenceTree(buildSequence(m), {
        current: cur?.edge ?? "",
        passed,
        selEdge: c.sel.kind === "edge" ? c.sel.id : "",
        prefix: c.prefix,
      }),
    });
  } else if (c.tab === "timeline" && trace) {
    const rids = ridsOf(trace);
    const rid = rids.includes(c.tlRid) ? c.tlRid : rids[0];
    out.push({
      target: TIME,
      tree: timelineTree(buildTimeline(m, trace, rid), {
        cursor: cur && cur.rid === rid ? cur.t : null,
        prefix: c.prefix,
      }),
    });
  }
  return out;
}

export class FlowStudio extends Component<FsState> {
  view = view;

  // ---- helpers ----

  _model(state: FsState): Model {
    return state.hist.present;
  }

  _paint(core: Core, mount: boolean): Effect[] {
    if (!core.ready) return [];
    return trees(core).map((t) =>
      mount
        ? svg.mount(t.target, t.tree, undefined, MISS[t.target])
        : svg.update(t.target, t.tree, MISS[t.target]),
    );
  }

  /** Change some of the core; everything worked out from it follows. */
  _commit(
    state: FsState,
    patch: Partial<Core>,
    extra: Effect[] = [],
    mount = false,
  ): Effect[] {
    const next: Core = { ...coreFrom(state), ...patch };
    const d = derive(next);
    const saved = next.hist.present !== state.hist.present;
    return [
      store.merge("", { ...patch, ...d }),
      ...(saved
        ? [local.save(STORAGE_KEY, projectText(next.hist.present))]
        : []),
      ...this._paint(next, mount),
      ...extra,
    ];
  }

  /** a repaint only: the pointer moved while dragging (no need to derive the panels) */
  _light(state: FsState, patch: Partial<Core>): Effect[] {
    const next: Core = { ...coreFrom(state), ...patch };
    return [store.merge("", patch), ...this._paint(next, false)];
  }

  /** a model edit: recorded in the history; the trace of the old design is dropped */
  _edit(
    state: FsState,
    model: Model,
    tag = "",
    patch: Partial<Core> = {},
    layoutOnly = false,
  ): Effect[] {
    const hist = commit(state.hist, model, tag);
    const stale = !layoutOnly && state.trace !== null;
    const next = this._valid({
      ...coreFrom(state),
      hist,
      ...(stale ? { trace: null, pos: -1, playing: false, progress: 1 } : {}),
      ...patch,
    });
    return this._commit(
      state,
      next,
      stale && state.playing ? [time.cancel(TICK)] : [],
    );
  }

  _valid(c: Core): Core {
    const m = c.hist.present;
    let sel = c.sel;
    if (sel.kind === "node" && !findNode(m, sel.id)) sel = NO_SEL;
    if (sel.kind === "edge" && !findEdge(m, sel.id)) sel = NO_SEL;
    const breakpoints = Object.fromEntries(
      Object.entries(c.breakpoints).filter(([id]) => findNode(m, id)),
    );
    return { ...c, sel, breakpoints };
  }

  _say(text: string): Partial<Core> {
    return { live: text };
  }

  // ---- lifecycle ----

  enter(_msg: Message, state: FsState): Effect[] {
    return [
      local.prefix("gotPrefix"),
      local.keys("key", {
        root: ".fs",
        keys: [
          "Delete",
          "Backspace",
          "ArrowUp",
          "ArrowDown",
          "ArrowLeft",
          "ArrowRight",
          "Escape",
          "Enter",
          " ",
          "+",
          "=",
          "-",
          "0",
          "b",
          ",",
          ".",
          "r",
          "p",
        ],
      }),
      local.media("(prefers-reduced-motion: reduce)", "gotMotion"),
      local.load(STORAGE_KEY, "loaded"),
      ...(state.ready ? [time.setTimeout(SYNC, 0, "sync")] : []),
    ];
  }

  leave(): Effect[] {
    return [local.unkeys(), time.cancel(TICK), time.cancel(SYNC)];
  }

  gotPrefix(msg: Message, state: FsState): Effect[] {
    return this._commit(state, { prefix: msg.payload as string }, [], true);
  }

  gotMotion(msg: Message, state: FsState): Effect[] {
    const matches =
      (msg.payload as { matches?: boolean } | undefined)?.matches === true;
    return matches === state.reduced
      ? []
      : this._commit(state, { reduced: matches });
  }

  /** the saved project, if there is a good one */
  loaded(msg: Message, state: FsState): Effect[] {
    if (state.ready) return [time.setTimeout(SYNC, 0, "sync")];
    const text = (msg.payload as { text: string | null } | undefined)?.text;
    const parsed = text ? parseProject(text) : null;
    if (parsed && typeof parsed !== "string" && parsed.nodes.length > 0) {
      const core = coreOf(parsed);
      return this._commit(
        state,
        {
          ...core,
          prefix: state.prefix,
          reduced: state.reduced,
          ready: true,
          message: "Opened your saved flow",
        },
        [time.setTimeout(SYNC, 0, "sync")],
      );
    }
    return this._commit(state, { ready: true }, [
      time.setTimeout(SYNC, 0, "sync"),
    ]);
  }

  /** mounts the drawings once their containers are on the page */
  sync(_msg: Message, state: FsState): Effect[] {
    return this._paint(coreFrom(state), true);
  }

  missFlow(_m: Message, state: FsState): Effect[] {
    return this._paint(coreFrom(state), true);
  }
  missMini(_m: Message, state: FsState): Effect[] {
    return this._paint(coreFrom(state), true);
  }
  missSeq(_m: Message, state: FsState): Effect[] {
    return this._paint(coreFrom(state), true);
  }
  missTime(_m: Message, state: FsState): Effect[] {
    return this._paint(coreFrom(state), true);
  }

  // ---- the chrome ----

  setView(msg: Message, state: FsState): Effect[] {
    const v = msg.payload as View;
    if (v === state.tab) return [];
    const patch: Partial<Core> = { tab: v, drag: null };
    // the timeline needs a trace: make one without starting the player
    if (v === "timeline" && !state.trace) {
      const m = this._model(state);
      patch.trace = simulate(m, m.scenario, m.scenario.seed);
      patch.pos = -1;
    }
    return this._commit(state, patch, [], true);
  }

  tabSelect(msg: Message, state: FsState): Effect[] {
    return this.setView(
      { id: "setView", payload: msg.event?.value ?? "flow" },
      state,
    );
  }

  setSide(msg: Message, state: FsState): Effect[] {
    return this._commit(state, { side: msg.payload as Side, sideOpen: true });
  }

  toggleSide(_msg: Message, state: FsState): Effect[] {
    return this._commit(state, { sideOpen: !state.sideOpen });
  }

  setName(msg: Message, state: FsState): Effect[] {
    return this._edit(
      state,
      { ...this._model(state), name: msg.event?.value ?? "" },
      "project-name",
      {},
      true,
    );
  }

  dismiss(_msg: Message, state: FsState): Effect[] {
    return this._commit(state, { message: "" });
  }

  undo(_msg: Message, state: FsState): Effect[] {
    const hist = undo(state.hist);
    return hist === state.hist
      ? []
      : this._commit(
          state,
          this._valid({ ...coreFrom(state), hist, message: "Undone" }),
        );
  }

  redo(_msg: Message, state: FsState): Effect[] {
    const hist = redo(state.hist);
    return hist === state.hist
      ? []
      : this._commit(
          state,
          this._valid({ ...coreFrom(state), hist, message: "Redone" }),
        );
  }

  // ---- files, demos, import ----

  sheet(msg: Message, state: FsState): Effect[] {
    const open = msg.payload as Sheet["open"];
    return this._commit(state, {
      sheet:
        state.sheet.open === open ? NO_SHEET : { open, text: "", error: "" },
    });
  }

  _open(state: FsState, model: Model, message: string): Effect[] {
    const hist = commit(state.hist, model);
    return this._commit(
      state,
      {
        hist,
        tab: "flow",
        sel: NO_SEL,
        trace: null,
        pos: -1,
        playing: false,
        progress: 1,
        breakpoints: {},
        drag: null,
        vp: HOME,
        sheet: NO_SHEET,
        message,
        live: message,
      },
      [time.cancel(TICK)],
      true,
    );
  }

  loadDemo(msg: Message, state: FsState): Effect[] {
    const id = msg.payload as string;
    if (id === "blank")
      return this._open(
        state,
        { ...emptyModel(), name: "Blank flow" },
        "A blank flow. Add nodes from the palette or the Quick add bar.",
      );
    const d = demoOf(id);
    return this._open(
      state,
      d.make(),
      `Opened "${d.title}". Press Run to watch it.`,
    );
  }

  importText(msg: Message, state: FsState): Effect[] {
    return this._commit(state, {
      sheet: { ...state.sheet, text: msg.event?.value ?? "", error: "" },
    });
  }

  importApply(_msg: Message, state: FsState): Effect[] {
    if (state.sheet.open === "vb") return this.vbApply(_msg, state);
    const r = parseProject(state.sheet.text);
    if (typeof r === "string")
      return this._commit(state, { sheet: { ...state.sheet, error: r } });
    return this._open(state, r, `Imported "${r.name}".`);
  }

  importFile(): Effect[] {
    return [
      filesEffector.pick(
        ".json,application/json",
        "importPicked",
        "importFailed",
      ),
    ];
  }

  importPicked(msg: Message, state: FsState): Effect[] {
    return this._commit(state, {
      sheet: {
        open: state.sheet.open || "import",
        text: (msg.payload as Picked).text,
        error: "",
      },
    });
  }

  importFailed(_msg: Message, state: FsState): Effect[] {
    return this._commit(state, {
      sheet: { ...state.sheet, error: "The file could not be read." },
    });
  }

  exportJson(_msg: Message, state: FsState): Effect[] {
    const m = this._model(state);
    return [
      filesEffector.download(
        `${slugify(m.name)}.flow.json`,
        projectText(m),
        "application/json",
        "exported",
      ),
    ];
  }

  exported(_msg: Message, state: FsState): Effect[] {
    return this._commit(state, { message: "Exported the flow as JSON" });
  }

  copyJson(_msg: Message, state: FsState): Effect[] {
    return [local.copy(projectText(this._model(state)), "copiedJson")];
  }

  copiedJson(_msg: Message, state: FsState): Effect[] {
    return this._commit(state, {
      message: "The flow JSON is on the clipboard",
    });
  }

  vbApply(_msg: Message, state: FsState): Effect[] {
    const text = state.sheet.text.trim();
    const r = text
      ? importVisualBuilderText(text, this._model(state))
      : importVisualBuilder(
          VB_DEMOS.find((d) => d.id === "todo")!.make(),
          this._model(state),
        );
    if (typeof r === "string")
      return this._commit(state, { sheet: { ...state.sheet, error: r } });
    return this._open(
      state,
      r.model,
      `Imported the Browser lane: ${r.summary.events} events, ${r.summary.calls} HTTP calls to ${r.summary.routes} routes.`,
    );
  }

  // ---- the canvas ----

  /** the node under `id`, in absolute world coordinates */
  _abs(state: FsState, id: string): { x: number; y: number } | null {
    const p = layoutOf(this._model(state)).nodes.find((n) => n.id === id);
    return p ? { x: p.x, y: p.y } : null;
  }

  cvDown(msg: Message, state: FsState): Effect[] {
    const p = msg.payload as { x: number; y: number };
    return this._commit(state, {
      sel: NO_SEL,
      drag: { kind: "pan", ax: p.x, ay: p.y, moved: false },
    });
  }

  nodeDown(msg: Message, state: FsState): Effect[] {
    const p = msg.payload as { id: string; x: number; y: number };
    const a = this._abs(state, p.id);
    if (!a) return [];
    const m = this._model(state);
    const n = findNode(m, p.id)!;
    return this._commit(state, {
      sel: { kind: "node", id: p.id },
      side: state.side === "scenario" ? "scenario" : "inspect",
      drag: {
        kind: "node",
        id: p.id,
        ox: p.x - a.x,
        oy: p.y - a.y,
        x: n.x,
        y: n.y,
        moved: false,
      },
    });
  }

  portDown(msg: Message, state: FsState): Effect[] {
    const p = msg.payload as {
      id: string;
      port: "out" | "ok" | "err";
      x: number;
      y: number;
    };
    return this._commit(state, {
      sel: { kind: "node", id: p.id },
      drag: { kind: "link", from: p.id, port: p.port, x: p.x, y: p.y },
    });
  }

  cvMove(msg: Message, state: FsState): Effect[] {
    const d = state.drag;
    if (!d) return [];
    const p = msg.payload as { x: number; y: number };
    if (d.kind === "pan") {
      const placed = layoutOf(this._model(state));
      const vp = clampView(
        {
          ...state.vp,
          x: state.vp.x + (d.ax - p.x),
          y: state.vp.y + (d.ay - p.y),
        },
        placed.width,
        placed.height,
      );
      return this._light(state, {
        vp,
        drag: {
          ...d,
          moved: d.moved || Math.abs(d.ax - p.x) + Math.abs(d.ay - p.y) > 2,
        },
      });
    }
    if (d.kind === "link")
      return this._light(state, { drag: { ...d, x: p.x, y: p.y } });
    // a node follows the pointer, inside its lane
    const m = this._model(state);
    const node = findNode(m, d.id);
    if (!node) return [];
    const placed = layoutOf(m);
    const band = placed.bands.find((b) => b.lane === laneOf(node));
    const x = Math.max(0, Math.round(p.x - d.ox - GUTTER));
    const y = Math.max(8, Math.round(p.y - d.oy - (band?.top ?? 0)));
    const moved = d.moved || Math.abs(x - node.x) + Math.abs(y - node.y) > 4;
    return moved ? this._light(state, { drag: { ...d, x, y, moved } }) : [];
  }

  _endDrag(state: FsState): Effect[] {
    const d = state.drag;
    if (!d) return [];
    if (d.kind === "node" && d.moved)
      return this._edit(
        state,
        moveNode(this._model(state), d.id, d.x, d.y),
        "",
        { drag: null },
        true,
      );
    return this._commit(state, { drag: null });
  }

  cvUp(_msg: Message, state: FsState): Effect[] {
    return this._endDrag(state);
  }

  cvLeave(_msg: Message, state: FsState): Effect[] {
    return state.drag?.kind === "node" ||
      state.drag?.kind === "link" ||
      state.drag?.kind === "pan"
      ? this._commit(state, { drag: null })
      : [];
  }

  nodeUp(msg: Message, state: FsState): Effect[] {
    const d = state.drag;
    const id = (msg.payload as { id: string }).id;
    if (d?.kind === "link") {
      if (d.from === id) return this._commit(state, { drag: null });
      return this._connect(state, d.from, id, d.port);
    }
    return this._endDrag(state);
  }

  _connect(
    state: FsState,
    from: string,
    to: string,
    port: "out" | "ok" | "err" = "out",
  ): Effect[] {
    const m = this._model(state);
    const r = addEdge(m, from, to, { port });
    if (!r)
      return this._commit(state, {
        drag: null,
        message: "Those two nodes are already linked that way.",
      });
    return this._edit(state, r.model, "", {
      drag: null,
      sel: { kind: "edge", id: r.id },
      side: "inspect",
      message: "Linked. Name the message or the effect in the inspector.",
      live: "Edge created",
    });
  }

  connect(msg: Message, state: FsState): Effect[] {
    const to = msg.event?.value ?? "";
    if (state.sel.kind !== "node" || !to) return [];
    return this._connect(state, state.sel.id, to);
  }

  edgeClick(msg: Message, state: FsState): Effect[] {
    const id = (msg.payload as { id: string }).id;
    const e = findEdge(this._model(state), id);
    return this._commit(state, {
      sel: { kind: "edge", id },
      side: "inspect",
      live: e ? `Edge ${e.kind} ${e.msg} selected` : "",
    });
  }

  nodeCtx(msg: Message, state: FsState): Effect[] {
    return this.bpToggle(
      { id: "bpToggle", payload: (msg.payload as { id: string }).id },
      state,
    );
  }

  nodeDbl(msg: Message, state: FsState): Effect[] {
    const id = (msg.payload as { id: string }).id;
    return this._commit(
      state,
      {
        sel: { kind: "node", id },
        side: "inspect",
        sideOpen: true,
        drag: null,
      },
      [time.setTimeout("fs-focus", 0, "focusField")],
    );
  }

  focusField(_msg: Message, state: FsState): Effect[] {
    return state.firstField ? [DomPlugin.focus(`#${state.firstField}`)] : [];
  }

  mmClick(msg: Message, state: FsState): Effect[] {
    const p = msg.payload as { x: number; y: number };
    return this._commit(state, {
      vp: this._clamp(state, centerOn(state.vp, p.x, p.y)),
    });
  }

  zoomIn(_m: Message, state: FsState): Effect[] {
    return this._commit(state, {
      vp: this._clamp(state, zoomBy(state.vp, 1.25)),
    });
  }
  zoomOut(_m: Message, state: FsState): Effect[] {
    return this._commit(state, {
      vp: this._clamp(state, zoomBy(state.vp, 0.8)),
    });
  }
  fit(_m: Message, state: FsState): Effect[] {
    const placed = layoutOf(this._model(state));
    return this._commit(state, { vp: fitView(placed.width, placed.height) });
  }
  home(_m: Message, state: FsState): Effect[] {
    return this._commit(state, { vp: HOME });
  }
  toggleFollow(_m: Message, state: FsState): Effect[] {
    return this._commit(state, { follow: !state.follow });
  }

  autoLayoutAll(_m: Message, state: FsState): Effect[] {
    return this._edit(
      state,
      autoLayout(this._model(state)),
      "",
      { vp: HOME, message: "Laid out the lanes", live: "Auto layout done" },
      true,
    );
  }

  // ---- editing ----

  addNodeOf(msg: Message, state: FsState): Effect[] {
    const [kind, title] = msg.payload as [NodeKind, string];
    const r = addNode(this._model(state), kind, title);
    const node = findNode(r.model, r.id)!;
    return this._edit(
      state,
      r.model,
      "",
      {
        sel: { kind: "node", id: r.id },
        side: "inspect",
        vp: this._reveal(state, r.model, node),
        message: `Added ${KIND_LABEL[kind]}`,
        live: `Added ${KIND_LABEL[kind]} ${title}`,
      },
      true,
    );
  }

  _reveal(state: FsState, model: Model, node: FlowNode): Viewport {
    const placed = layoutOf(model);
    const p = placed.nodes.find((n) => n.id === node.id);
    return p
      ? clampView(reveal(state.vp, p), placed.width, placed.height)
      : state.vp;
  }

  /** the view stays over the world */
  _clamp(state: FsState, vp: Viewport): Viewport {
    const placed = layoutOf(this._model(state));
    return clampView(vp, placed.width, placed.height);
  }

  quickKey(msg: Message, state: FsState): Effect[] {
    return msg.event?.key === "Enter" ? this.quickAdd(msg, state) : [];
  }

  quickText(msg: Message, state: FsState): Effect[] {
    return this._commit(state, {
      quick: { text: msg.event?.value ?? "", error: "" },
    });
  }

  quickAdd(msg: Message, state: FsState): Effect[] {
    const text = (msg.event?.value ?? state.quick.text).trim();
    const q = parseQuick(text);
    if (typeof q === "string")
      return this._commit(state, { quick: { text, error: q } });
    let m = this._model(state);
    const made = addNode(m, q.kind, q.title, q.patch);
    m = made.model;
    // linked from the selected node, when the pair makes sense
    if (state.sel.kind === "node") {
      const link = addEdge(m, state.sel.id, made.id);
      if (link) m = link.model;
    }
    const node = findNode(m, made.id)!;
    return this._edit(state, m, "", {
      sel: { kind: "node", id: made.id },
      quick: { text: "", error: "" },
      vp: this._reveal(state, m, node),
      side: "inspect",
      message: `Added ${KIND_LABEL[q.kind]} ${q.title}`,
      live: `Added ${KIND_LABEL[q.kind]} ${q.title}`,
    });
  }

  quickExample(msg: Message, state: FsState): Effect[] {
    return this._commit(state, {
      quick: { text: msg.payload as string, error: "" },
    });
  }

  delSel(_msg: Message, state: FsState): Effect[] {
    const m = this._model(state);
    if (state.sel.kind === "node") {
      const n = findNode(m, state.sel.id);
      return this._edit(state, removeNode(m, state.sel.id), "", {
        sel: NO_SEL,
        message: n ? `Deleted ${n.title}` : "",
        live: n ? `Deleted ${n.title}` : "",
      });
    }
    if (state.sel.kind === "edge") {
      const e = findEdge(m, state.sel.id);
      return this._edit(state, removeEdge(m, state.sel.id), "", {
        sel: NO_SEL,
        message: e ? `Deleted edge ${e.msg}` : "",
        live: e ? `Deleted edge ${e.msg}` : "",
      });
    }
    return [];
  }

  dupNode(_msg: Message, state: FsState): Effect[] {
    if (state.sel.kind !== "node") return [];
    const m = this._model(state);
    const n = findNode(m, state.sel.id);
    if (!n) return [];
    const made = newId(m, "n");
    const copy = { ...n, id: made.id, x: n.x + 24, y: n.y + 20 };
    return this._edit(
      state,
      { ...made.model, nodes: [...made.model.nodes, copy] },
      "",
      { sel: { kind: "node", id: copy.id }, message: `Duplicated ${n.title}` },
      true,
    );
  }

  /** `f.edit` from the field part: (ctx, name) + what was typed */
  "f.edit"(msg: Message, state: FsState): Effect[] {
    const [ctx, name] = msg.payload as [string, string];
    const value = msg.event?.value ?? "";
    const r = applyEdit(this._model(state), ctx, name, value);
    if (!r) return [];
    return this._edit(state, r.model, r.tag);
  }

  faultNode(msg: Message, state: FsState): Effect[] {
    const [node, kind] = msg.payload as [string, "error" | "timeout" | "slow"];
    return this._edit(state, toggleNodeFault(this._model(state), node, kind));
  }

  chip(msg: Message, state: FsState): Effect[] {
    return this._edit(
      state,
      toggleChip(this._model(state), msg.payload as string),
    );
  }

  faultToggle(msg: Message, state: FsState): Effect[] {
    const id = msg.payload as string;
    const f = this._model(state).scenario.faults.find((x) => x.id === id);
    return f
      ? this._edit(state, updateFault(this._model(state), id, { on: !f.on }))
      : [];
  }

  faultDel(msg: Message, state: FsState): Effect[] {
    return this._edit(
      state,
      removeFault(this._model(state), msg.payload as string),
    );
  }

  reqAdd(_msg: Message, state: FsState): Effect[] {
    const m = this._model(state);
    const entry =
      m.scenario.requests[0]?.entry ??
      m.nodes.find((n) => n.kind === "ui-event")?.id ??
      "";
    if (!entry)
      return this._commit(state, {
        message: "Add a UI event or a client first.",
      });
    const n = m.scenario.requests.length + 1;
    return this._edit(state, {
      ...m,
      scenario: {
        ...m.scenario,
        requests: [
          ...m.scenario.requests,
          { rid: `r${n}`, entry, at: (n - 1) * 8, payload: {} },
        ],
      },
    });
  }

  reqDel(msg: Message, state: FsState): Effect[] {
    const m = this._model(state);
    const i = msg.payload as number;
    return this._edit(state, {
      ...m,
      scenario: {
        ...m.scenario,
        requests: m.scenario.requests.filter((_, k) => k !== i),
      },
    });
  }

  bpToggle(msg: Message, state: FsState): Effect[] {
    const id =
      (typeof msg.payload === "string" ? msg.payload : "") ||
      (state.sel.kind === "node" ? state.sel.id : "");
    if (!id || !findNode(this._model(state), id)) return [];
    const on = !state.breakpoints[id];
    const title = findNode(this._model(state), id)!.title;
    return this._commit(state, {
      breakpoints: { ...state.breakpoints, [id]: on },
      live: `Breakpoint ${on ? "set on" : "removed from"} ${title}`,
    });
  }

  // ---- the player ----

  _simulate(state: FsState): Trace {
    const m = this._model(state);
    return simulate(m, m.scenario, m.scenario.seed);
  }

  _announce(trace: Trace, pos: number, m: Model): string {
    const s = trace[pos];
    if (!s) return "";
    const nm = (id: string): string => findNode(m, id)?.title ?? id;
    return `Step ${pos + 1} of ${trace.length} at ${fmt(s.t)}. ${s.rid}: ${s.type} ${s.label}, ${nm(s.from)} to ${nm(s.to)}${s.status === "ok" ? "" : `, ${s.status}`}. ${s.note}`;
  }

  /** the patch that shows step `pos`: the view follows the token */
  _show(
    state: FsState,
    trace: Trace,
    pos: number,
    extra: Partial<Core> = {},
  ): Partial<Core> {
    const m = this._model(state);
    const s = trace[pos];
    const patch: Partial<Core> = {
      trace,
      pos,
      progress: 0,
      live: this._announce(trace, pos, m),
      ...extra,
    };
    if (s && state.follow && state.tab === "flow") {
      const target = layoutOf(m).nodes.find((n) => n.id === s.to);
      if (target) patch.vp = this._clamp(state, reveal(state.vp, target));
    }
    return patch;
  }

  run(_msg: Message, state: FsState): Effect[] {
    const trace = this._simulate(state);
    if (trace.length === 0)
      return this._commit(state, {
        message:
          "Nothing to run: add a UI event or a client with an edge going out of it.",
        live: "Nothing to run",
      });
    return this._commit(state, this._show(state, trace, 0, { playing: true }), [
      time.setInterval(TICK, TICK_MS, "tick"),
    ]);
  }

  step(_msg: Message, state: FsState): Effect[] {
    const trace = state.trace ?? this._simulate(state);
    if (trace.length === 0)
      return this._commit(state, {
        message: "Nothing to run yet.",
        live: "Nothing to run",
      });
    const next = Math.min(trace.length - 1, state.pos + 1);
    if (state.pos >= trace.length - 1)
      return this._commit(
        state,
        { live: "That was the last step" },
        state.playing ? [time.cancel(TICK)] : [],
      );
    return this._commit(
      state,
      this._show(state, trace, next, { playing: false, progress: 1 }),
      state.playing ? [time.cancel(TICK)] : [],
    );
  }

  stepBack(_msg: Message, state: FsState): Effect[] {
    if (!state.trace || state.pos < 0) return [];
    const pos = state.pos - 1;
    if (pos < 0)
      return this._commit(
        state,
        { pos: -1, playing: false, progress: 1, live: "Back at the start" },
        [time.cancel(TICK)],
      );
    return this._commit(
      state,
      this._show(state, state.trace, pos, { playing: false, progress: 1 }),
      state.playing ? [time.cancel(TICK)] : [],
    );
  }

  play(_msg: Message, state: FsState): Effect[] {
    if (state.playing)
      return this._commit(state, { playing: false, live: "Paused" }, [
        time.cancel(TICK),
      ]);
    const trace = state.trace ?? this._simulate(state);
    if (trace.length === 0) return [];
    const restart = state.pos >= trace.length - 1;
    const pos = restart || state.pos < 0 ? 0 : state.pos;
    return this._commit(
      state,
      this._show(state, trace, pos, { playing: true }),
      [time.setInterval(TICK, TICK_MS, "tick")],
    );
  }

  pause(_msg: Message, state: FsState): Effect[] {
    return state.playing
      ? this._commit(state, { playing: false, live: "Paused" }, [
          time.cancel(TICK),
        ])
      : [];
  }

  reset(_msg: Message, state: FsState): Effect[] {
    return this._commit(
      state,
      { pos: -1, playing: false, progress: 1, live: "Reset" },
      [time.cancel(TICK)],
    );
  }

  seek(msg: Message, state: FsState): Effect[] {
    if (!state.trace) return [];
    const i = Math.max(
      0,
      Math.min(state.trace.length - 1, msg.payload as number),
    );
    return this._commit(
      state,
      this._show(state, state.trace, i, { playing: false, progress: 1 }),
      state.playing ? [time.cancel(TICK)] : [],
    );
  }

  setSpeed(msg: Message, state: FsState): Effect[] {
    const v = Number(msg.event?.value);
    return SPEEDS.includes(v) ? this._commit(state, { speed: v }) : [];
  }

  tick(_msg: Message, state: FsState): Effect[] {
    const trace = state.trace;
    if (!state.playing || !trace) return [time.cancel(TICK)];
    const progress = state.progress + (TICK_MS * state.speed) / STEP_MS;
    if (progress < 1) return this._commit(state, { progress });
    // the token arrived: the next step
    const next = state.pos + 1;
    if (next >= trace.length)
      return this._commit(
        state,
        {
          playing: false,
          progress: 1,
          live: `The run is finished. ${this._summary(trace)}`,
        },
        [time.cancel(TICK)],
      );
    const patch = this._show(state, trace, next);
    const s = trace[next];
    if (state.breakpoints[s.to]) {
      const title = findNode(this._model(state), s.to)?.title ?? s.to;
      return this._commit(
        state,
        {
          ...patch,
          playing: false,
          progress: 1,
          live: `Breakpoint at ${title}. ${this._announce(trace, next, this._model(state))}`,
        },
        [time.cancel(TICK)],
      );
    }
    return this._commit(state, patch);
  }

  _summary(trace: Trace): string {
    return outcomesOf(trace)
      .map(
        (o) =>
          `${o.rid} ${o.result}${o.status ? ` ${o.status}` : ""} in ${fmt(o.ms)}`,
      )
      .join(", ");
  }

  // ---- views ----

  focusIssue(msg: Message, state: FsState): Effect[] {
    const i = msg.payload as number;
    const issue = lint(this._model(state))[i];
    if (!issue) return [];
    const m = this._model(state);
    const node = issue.node ? findNode(m, issue.node) : undefined;
    const edge = issue.edge ? findEdge(m, issue.edge) : undefined;
    const target = node ?? (edge ? findNode(m, edge.from) : undefined);
    const placed = layoutOf(m);
    const p = target ? placed.nodes.find((n) => n.id === target.id) : undefined;
    return this._commit(
      state,
      {
        tab: "flow",
        sel: node
          ? { kind: "node", id: node.id }
          : edge
            ? { kind: "edge", id: edge.id }
            : NO_SEL,
        side: "inspect",
        sideOpen: true,
        vp: p ? centerOn(state.vp, p.x + p.w / 2, p.y + p.h / 2) : state.vp,
        live: `${issue.title}. Focused on the canvas.`,
      },
      [],
      true,
    );
  }

  focusEdge(msg: Message, state: FsState): Effect[] {
    const id = msg.payload as string;
    const m = this._model(state);
    const e = findEdge(m, id);
    if (!e) return [];
    const from = layoutOf(m).nodes.find((n) => n.id === e.from);
    return this._commit(
      state,
      {
        tab: "flow",
        sel: { kind: "edge", id },
        side: "inspect",
        vp: from
          ? centerOn(state.vp, from.x + from.w, from.y + from.h / 2)
          : state.vp,
      },
      [],
      true,
    );
  }

  sqEdge(msg: Message, state: FsState): Effect[] {
    const id = (msg.payload as { id: string }).id;
    return this._commit(state, { sel: { kind: "edge", id }, side: "inspect" });
  }

  tlStep(msg: Message, state: FsState): Effect[] {
    const i = (msg.payload as { i: number }).i;
    return this.seek({ id: "seek", payload: i }, state);
  }

  tlRid(msg: Message, state: FsState): Effect[] {
    return this._commit(state, { tlRid: msg.payload as string });
  }

  srcTab(msg: Message, state: FsState): Effect[] {
    return this._commit(state, { srcPath: msg.payload as string, copied: "" });
  }

  copyFile(_msg: Message, state: FsState): Effect[] {
    const f = state.source.code;
    return [local.copy(f, "copyDone")];
  }

  copyAll(_msg: Message, state: FsState): Effect[] {
    const all = generateAll(this._model(state))
      .map((f) => `// ===== ${f.path} =====\n${f.code}`)
      .join("\n");
    return [local.copy(all, "copyDone")];
  }

  copyDone(_msg: Message, state: FsState): Effect[] {
    return this._commit(state, {
      copied: state.source.path || "all",
      message: "Copied to the clipboard",
    });
  }

  // ---- keyboard ----

  key(msg: Message, state: FsState): Effect[] {
    const { key, ctrl, shift } = msg.payload as KeyPayload;
    if (state.sheet.open && key !== "Escape") return [];
    if (ctrl && key === "z")
      return shift ? this.redo(msg, state) : this.undo(msg, state);
    if (ctrl && key === "y") return this.redo(msg, state);
    if (ctrl && key === "d") return this.dupNode(msg, state);
    if (ctrl) return [];
    switch (key) {
      case " ":
        return this.step(msg, state);
      case "r":
        return this.run(msg, state);
      case "p":
        return this.play(msg, state);
      case ".":
        return this.step(msg, state);
      case ",":
        return this.stepBack(msg, state);
      case "Escape":
        if (state.sheet.open) return this._commit(state, { sheet: NO_SHEET });
        return this._commit(state, {
          sel: NO_SEL,
          drag: null,
          sideOpen: false,
        });
      case "Delete":
      case "Backspace":
        return this.delSel(msg, state);
      case "Enter":
        if (state.sel.kind === "none") return [];
        return this._commit(state, { side: "inspect", sideOpen: true }, [
          time.setTimeout("fs-focus", 0, "focusField"),
        ]);
      case "+":
      case "=":
        return this.zoomIn(msg, state);
      case "-":
        return this.zoomOut(msg, state);
      case "0":
        return this.fit(msg, state);
      case "b":
        return this.bpToggle({ id: "bpToggle", payload: "" }, state);
      case "ArrowLeft":
      case "ArrowRight":
      case "ArrowUp":
      case "ArrowDown": {
        if (state.tab !== "flow") return [];
        const dir: Dir =
          key === "ArrowLeft"
            ? "left"
            : key === "ArrowRight"
              ? "right"
              : key === "ArrowUp"
                ? "up"
                : "down";
        const m = this._model(state);
        const placed = layoutOf(m);
        const from = state.sel.kind === "node" ? state.sel.id : "";
        const to = neighbor(
          placed.nodes,
          from || (placed.nodes[0]?.id ?? ""),
          dir,
        );
        const id = from ? to : (placed.nodes[0]?.id ?? null);
        if (!id) return [];
        const node = findNode(m, id)!;
        return this._commit(
          state,
          {
            sel: { kind: "node", id },
            vp: this._reveal(state, m, node),
            live: `${KIND_LABEL[node.kind]} ${node.title}${node.detail ? `, ${node.detail}` : ""}`,
          },
          [time.setTimeout("fs-focusnode", 0, "focusNode", id)],
        );
      }
    }
    return [];
  }

  focusNode(msg: Message): Effect[] {
    return [DomPlugin.focus(`#fs-n-${msg.payload as string}`)];
  }
}

export const page = new FlowStudio();
