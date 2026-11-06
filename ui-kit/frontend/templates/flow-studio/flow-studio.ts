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
import { addable, libraryEntries } from "../../plugin-library/index.ts";
import { canvasTree, minimapTree, ridColor } from "./canvas.ts";
import { type CodeView, codeViewOf } from "./code.ts";
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
  type PluginsView,
  type ScenarioView,
  applyEdit,
  inspectorOf,
  pluginsView,
  scenarioView,
} from "./inspector.ts";
import {
  type Dir,
  type Viewport,
  GUTTER,
  HOME,
  autoLayout,
  centerOn,
  centeredAt,
  clampView,
  fitView,
  layoutOf,
  miniBox,
  neighbor,
  reveal,
  toFrames,
  zoomAt,
  zoomBy,
} from "./layout.ts";
import { counts, lintCached as lint } from "./lint.ts";
import {
  addPlugin,
  mergePlugins,
  pluginsText,
  removePlugin,
} from "./plugins.ts";
import {
  type Dir as PortDir,
  addInstance,
  addModule,
  addPipe,
  addPort,
  addStage,
  badgesOf,
  canNest,
  crumbs,
  defAt,
  flatten,
  flatId,
  heldCount,
  holdCode,
  localId,
  locate,
  modelAt,
  moveStage,
  putAt,
  releaseCode,
  removeModule,
  removePort,
  removeStage,
  scopeValid,
  syncPipe,
  syncPorts,
  traceIn,
  updateModule,
} from "./modules.ts";
import {
  type FlowNode,
  type Lane,
  type Model,
  type NodeKind,
  type PluginManifest,
  EFFECTS,
  FRAME_H,
  FRAME_MIN_H,
  FRAME_MIN_W,
  FRAME_W,
  KIND_LABEL,
  LANE_LABEL,
  LANES,
  addEdge,
  addFrame,
  addNode,
  attachNode,
  condNames,
  emptyModel,
  findDef,
  findEdge,
  findFrame,
  findNode,
  frameAt,
  framesOf,
  laneOf,
  moveFrame,
  moveNode,
  newId,
  parsePlugins,
  parseProject,
  projectText,
  removeEdge,
  removeFrame,
  removeNode,
  renameFrame,
  setFrameRect,
  setFrameRole,
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

/** the board on the page: its height to start with, and the least and the most */
export const BOARD_H = 520;
export const BOARD_MIN = 240;
export const BOARD_MAX = 2400;
/** where the height of the board is remembered (in this browser) */
export const BOARD_KEY = "pavlus-flow-board";
/** the board starts at least this zoomed in */
const START_Z = 0.7;
const boardStyle = (h: number, full: boolean): string =>
  full ? "" : `height: ${h}px`;

/** the view size a viewport has, else the one of the state it replaces */
const sized = (vp: Viewport, from: Viewport): Viewport =>
  vp.w !== undefined || from.w === undefined
    ? vp
    : { ...vp, w: from.w, h: from.h };

export type View =
  | "flow"
  | "sequence"
  | "catalog"
  | "timeline"
  | "checks"
  | "source";
export type Side = "inspect" | "debug" | "scenario" | "plugins";

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
      /** the frame under the node: it is attached to it when dropped ("" = none) */
      frame: string;
      moved: boolean;
    }
  /** the background: the view where it was (`vx`, `vy`) and the pointer (px of the window), null until it moves */
  | {
      kind: "pan";
      cx: number | null;
      cy: number | null;
      vx: number;
      vy: number;
      moved: boolean;
    }
  /**
   * a frame by its header: `cx0` and `cy0` are where the pointer was (px of the window),
   * null until it moves; `dx` and `dy` how far it has gone, in the world
   */
  | {
      kind: "frame";
      id: string;
      cx0: number | null;
      cy0: number | null;
      dx: number;
      dy: number;
    }
  /** a border or a corner of a frame (`edge`: n, s, e, w, ne, nw, se, sw), and the rectangle it was and is */
  | {
      kind: "frameSize";
      id: string;
      edge: string;
      cx0: number | null;
      cy0: number | null;
      r0: { x: number; y: number; w: number; h: number };
      r: { x: number; y: number; w: number; h: number };
    }
  /** the handle under the board: its height */
  | { kind: "height"; cy0: number | null; h0: number }
  /**
   * the rectangle on the minimap: the view where it was (`vx`, `vy`), the pointer (px of the
   * window, null until it moves), what a px of the minimap is in the world (`k`) and what the
   * minimap shows, which stays as it was while the rectangle is dragged
   */
  | {
      kind: "mini";
      cx0: number | null;
      cy0: number | null;
      vx: number;
      vy: number;
      k: number;
      box: { x: number; y: number; w: number; h: number };
    }
  | {
      kind: "link";
      from: string;
      port: "out" | "ok" | "err";
      /** a module: the output port the link was dragged from */
      pid: string;
      x: number;
      y: number;
    };

export interface Sheet {
  open: "" | "demos" | "import" | "vb" | "plugins";
  text: string;
  error: string;
}

/** the part of the state the user changes; everything else follows from it */
export interface Core {
  hist: History<Model>;
  /** the instances to open to get to the module being edited ([] = the top level) */
  scope: string[];
  tab: View;
  sel: Sel;
  side: Side;
  sideOpen: boolean;
  vp: Viewport;
  /** the height of the board on the page (px); the handle under it changes it */
  boardH: number;
  /** the size of the minimap on the page (px), to know what its rectangle moves by */
  mini: { w: number; h: number };
  /** the board fills the screen */
  full: boolean;
  /** the panel that edits the frames */
  framesOpen: boolean;
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
  /** the plugins kept in this browser, for every project ("My library") */
  mine: PluginManifest[];
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
  pluginsV: PluginsView;
  /** the plugin library: ready-made plugins, those kept here, the built-in ones */
  libraryV: {
    bundled: LibraryRow[];
    mine: LibraryRow[];
    builtin: { name: string; server: string; unmodelled: string }[];
  };
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
  /** the style of the board's box: its height, unless it fills the screen */
  boardStyle: string;
  framePanel: {
    id: string;
    name: string;
    /** how many components are attached to it */
    count: number;
    roles: { v: "" | Lane; label: string; selected: boolean }[];
  }[];
  connectList: { id: string; title: string }[];
  quickExamples: { k: string; text: string }[];
  speeds: { v: string; label: string; selected: boolean }[];
  firstField: string;
  hasSel: boolean;
  condOptions: { k: string }[];
  /** the breadcrumb of the modules that are open: the top level is not in it */
  crumbs: {
    k: string;
    i: number;
    title: string;
    module: string;
    last: boolean;
  }[];
  inModule: boolean;
  moduleTitle: string;
  /** the selected node is an instance of a module that can be opened */
  canOpen: boolean;
  library: {
    k: string;
    id: string;
    name: string;
    side: string;
    uses: string;
    ok: boolean;
  }[];
  hasLibrary: boolean;
  /** the open module has a body of code: the board is replaced by its editor */
  isCodeBody: boolean;
  code: CodeView | null;
  /** the open module is a pipe: its stages, to reorder and extend */
  pipe: {
    name: string;
    stages: {
      k: string;
      i: number;
      title: string;
      module: string;
      first: boolean;
      last: boolean;
    }[];
    options: { id: string; name: string }[];
  } | null;
  /** how many modules hold code that came in with an import */
  heldCount: number;
}

export interface LibraryRow {
  k: string;
  name: string;
  about: string;
  external: string;
  effects: string;
  /** the project has a plugin of this name */
  added: boolean;
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

const MINE_KEY = "pavlus-flow-plugins";

const rowOf = (m: Model, p: PluginManifest): LibraryRow => ({
  k: p.name,
  name: p.name,
  about: p.about,
  external: p.external,
  effects: p.effects.map((e) => e.type).join(", "),
  added: m.plugins.some((x) => x.name === p.name),
});

/** the library as the Plugins tab shows it */
function libraryOf(m: Model, mine: PluginManifest[]): Derived["libraryV"] {
  const all = libraryEntries();
  return {
    bundled: addable(all).map((e) => rowOf(m, e.manifest)),
    mine: mine.map((p) => rowOf(m, p)),
    builtin: all
      .filter((e) => e.builtin)
      .map((e) => ({
        name: e.name,
        server: e.server,
        unmodelled: e.unmodelled.join(", "),
      })),
  };
}

/** the palette of a project: the built-in plugins and externals, and its own */
export function paletteOf(m: Model): PaletteGroup[] {
  return PALETTE.map((g) =>
    g.lane === LANE_LABEL.plugins
      ? {
          ...g,
          items: [
            ...g.items,
            ...m.plugins.flatMap((p) =>
              p.effects.map((e) => ({
                kind: "effect" as const,
                title: e.type,
                label: e.type,
              })),
            ),
          ],
        }
      : g.lane === LANE_LABEL.externals
        ? {
            ...g,
            items: [
              ...g.items,
              ...m.plugins
                .filter((p) => p.external)
                .map((p) => ({
                  kind: "external" as const,
                  title: p.external,
                  label: p.external,
                })),
            ],
          }
        : g,
  );
}

const NO_SEL: Sel = { kind: "none", id: "" };
const NO_SHEET: Sheet = { open: "", text: "", error: "" };

export const DEMO_LIST = [
  ...DEMOS.map((d) => ({ id: d.id, title: d.title, about: d.about })),
  { id: "blank", title: "Blank flow", about: "Start from nothing." },
];

const fmt = (n: number): string => `${Math.round(n * 10) / 10} ms`;
const pretty = (v: unknown): string =>
  v === undefined ? "" : JSON.stringify(v, null, 2);

/** the scope of a core, or the top level when the module it points to is gone */
export const scopeOf = (c: {
  hist: History<Model>;
  scope: string[];
}): string[] => (scopeValid(c.hist.present, c.scope) ? c.scope : []);

/** the model the board shows: the top level, or the body of the open module */
export const viewModel = (c: {
  hist: History<Model>;
  scope: string[];
}): Model => modelAt(c.hist.present, scopeOf(c));

/** `m1/` for the module at [m1]: what the flat ids of its nodes start with */
const prefixOf = (scope: string[]): string =>
  scope.length ? `${scope.join("/")}/` : "";

export function coreOf(model: Model): Core {
  return {
    hist: start(model),
    scope: [],
    tab: "flow",
    sel: NO_SEL,
    side: "inspect",
    sideOpen: false,
    vp: HOME,
    boardH: BOARD_H,
    mini: { w: 0, h: 0 },
    full: false,
    framesOpen: false,
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
    mine: [],
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
  const root = c.hist.present;
  const scope = scopeOf(c);
  const model = modelAt(root, scope);
  const flat = flatten(root);
  const open = defAt(root, scope);
  const trace = c.trace;
  const has = trace !== null;
  const rids = trace ? ridsOf(trace) : [];
  const flowOrSeq = c.tab;
  const nRoutes = model.nodes.filter((n) => n.kind === "route").length;
  const iss = c.tab === "checks" || c.tab === "flow" ? lint(root) : [];
  const issueCounts = counts(iss);
  const outs = trace ? outcomesOf(trace) : [];
  const files = c.tab === "source" ? generateAll(root) : [];
  const srcPath = files.some((f) => f.path === c.srcPath)
    ? c.srcPath
    : (files[0]?.path ?? "");
  const cur = files.find((f) => f.path === srcPath);
  const cat = c.tab === "catalog" ? catalogOf(root) : [];
  const tlRid = rids.includes(c.tlRid) ? c.tlRid : (rids[0] ?? "");
  const atEnd = has && c.pos >= (trace?.length ?? 0) - 1;
  const lastStep =
    trace && c.pos >= 0 ? trace[Math.min(c.pos, trace.length - 1)] : null;
  const selNode = c.sel.kind === "node" ? findNode(model, c.sel.id) : undefined;
  const inspector = inspectorOf(
    model,
    c.sel,
    c.breakpoints,
    prefixOf(scope),
    open?.id ?? "",
  );
  return {
    model,
    canUndo: canUndo(c.hist),
    canRedo: canRedo(c.hist),
    summary: `${model.nodes.length} nodes · ${model.edges.length} edges · ${nRoutes} ${nRoutes === 1 ? "route" : "routes"}${root.modules.length ? ` · ${root.modules.length} ${root.modules.length === 1 ? "module" : "modules"}` : ""}`,
    projectName: root.name,
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
    palette: paletteOf(root),
    inspector,
    pluginsV:
      c.side === "plugins" ? pluginsView(root) : { builtin: [], custom: [] },
    libraryV:
      c.side === "plugins"
        ? libraryOf(root, c.mine)
        : { bundled: [], mine: [], builtin: [] },
    scenarioV:
      c.side === "scenario"
        ? scenarioView(flat)
        : { conds: [], requests: [], latency: [], faults: [], general: [] },
    chips: CHIPS.map((x) => ({
      id: x.id,
      label: x.label,
      hint: x.hint,
      on: chipOn(root, x),
    })),
    activeFaults: root.scenario.faults
      .filter((f) => f.on)
      .map((f) => ({ k: f.id, text: faultText(root, f) })),
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
    cur: stepView(flat, trace, c.pos),
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
      .filter((id) => c.breakpoints[id] && findNode(flat, id))
      .map((id) => ({ id, title: findNode(flat, id)!.title })),
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
    boardStyle: boardStyle(c.boardH, c.full),
    framePanel: framesOf(toFrames(model)).map((f) => ({
      id: f.id,
      name: f.name,
      count: model.nodes.filter((n) => n.frame === f.id).length,
      roles: [
        {
          v: "" as const,
          label: "Nothing (what its kind says)",
          selected: !f.role,
        },
        ...LANES.map((v) => ({
          v,
          label: LANE_LABEL[v],
          selected: f.role === v,
        })),
      ],
    })),
    connectList: model.nodes
      .filter((n) => c.sel.kind === "node" && n.id !== c.sel.id)
      .map((n) => ({ id: n.id, title: `${KIND_LABEL[n.kind]}: ${n.title}` })),
    quickExamples: QUICK_EXAMPLES.map((text, k) => ({ k: String(k), text })),
    speeds: SPEEDS.map((v) => ({
      v: String(v),
      label: `${v}x`,
      selected: v === c.speed,
    })),
    firstField: c.sel.kind === "none" ? "" : (inspector.fields[0]?.id ?? ""),
    hasSel: c.sel.kind !== "none",
    condOptions: condNames(flat).map((k) => ({ k })),
    crumbs: crumbs(root, scope).map((x, i, all) => ({
      k: x.path.join("/"),
      i,
      title: x.title,
      module: x.module,
      last: i === all.length - 1,
    })),
    inModule: scope.length > 0,
    moduleTitle: open?.name ?? "",
    canOpen:
      !!selNode && selNode.kind === "module" && !!findDef(root, selNode.ref),
    library: root.modules.map((d) => ({
      k: d.id,
      id: d.id,
      name: d.name,
      side: d.side === "frontend" ? "browser" : "server",
      uses: String(
        root.nodes.filter((n) => n.kind === "module" && n.ref === d.id).length,
      ),
      ok: canNest(root, open?.id ?? "", d.id),
    })),
    hasLibrary: root.modules.length > 0,
    isCodeBody: open?.body === "code",
    code: open?.body === "code" ? codeViewOf(open, root.plugins) : null,
    pipe:
      open?.body === "pipe"
        ? {
            name: open.name,
            stages: open.stages.map((sid, i) => {
              const n = open.nodes.find((x) => x.id === sid);
              return {
                k: sid,
                i,
                title: n?.title ?? sid,
                module: findDef(root, n?.ref ?? "")?.name ?? "(gone)",
                first: i === 0,
                last: i === open.stages.length - 1,
              };
            }),
            options: root.modules
              .filter((d) => canNest(root, open.id, d.id))
              .map((d) => ({ id: d.id, name: d.name })),
          }
        : null,
    heldCount: heldCount(root),
  };
}

export function stateOf(model: Model): FsState {
  const core = coreOf(model);
  return { ...core, ...derive(core) };
}

export const initial: FsState = stateOf(loginDemo());

const CORE_KEYS = [
  "hist",
  "scope",
  "tab",
  "sel",
  "side",
  "sideOpen",
  "vp",
  "boardH",
  "mini",
  "full",
  "framesOpen",
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
  "mine",
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
/**
 * The model with what is being dragged where the pointer has it (a design that has frames):
 * a component where it is and in the frame it is over, a frame where it has gone with what is
 * attached to it, a frame in the size it is given.
 */
function dragged(m: Model, d: Drag | null): Model {
  if (d?.kind === "node")
    return attachNode(moveNode(m, d.id, d.x, d.y), d.id, d.frame || null);
  if (d?.kind === "frame") return moveFrame(m, d.id, d.dx, d.dy);
  if (d?.kind === "frameSize") return setFrameRect(m, d.id, d.r);
  return m;
}

export function trees(
  c: Core,
): { target: string; tree: ReturnType<typeof canvasTree> }[] {
  const root = c.hist.present;
  const scope = scopeOf(c);
  const m = toFrames(modelAt(root, scope));
  const out: { target: string; tree: ReturnType<typeof canvasTree> }[] = [];
  // the sequence and the timeline show the flat design; the board shows the scope
  const trace = c.trace;
  const seen = traceIn(trace, scope);
  const cur =
    trace && c.pos >= 0 ? trace[Math.min(c.pos, trace.length - 1)] : null;
  if (c.tab === "flow") {
    const placed = layoutOf(dragged(m, c.drag));
    const faultNodes = root.scenario.faults
      .filter((f) => f.on)
      .map((f) => localId(scope, f.target))
      .filter((id) => id && findNode(m, id));
    const marks = Object.fromEntries(
      Object.entries(c.breakpoints)
        .filter(([, on]) => on)
        .map(([id]) => [localId(scope, id), true]),
    );
    out.push(
      {
        target: FLOW,
        tree: canvasTree(placed, {
          prefix: c.prefix,
          vp: c.vp,
          selNode: c.sel.kind === "node" ? c.sel.id : "",
          selEdge: c.sel.kind === "edge" ? c.sel.id : "",
          breakpoints: marks,
          link:
            c.drag?.kind === "link"
              ? {
                  from: c.drag.from,
                  port: c.drag.port,
                  pid: c.drag.pid,
                  x: c.drag.x,
                  y: c.drag.y,
                }
              : null,
          trace: seen,
          badges: badgesOf(defAt(root, scope)),
          pos: c.pos,
          progress: c.reduced ? 1 : c.progress,
          faultNodes,
          dropFrame: c.drag?.kind === "node" ? c.drag.frame : "",
        }),
      },
      {
        target: MINI,
        tree: minimapTree(
          placed,
          c.vp,
          c.prefix,
          c.sel.kind === "node" ? c.sel.id : "",
          c.drag?.kind === "mini" ? c.drag.box : miniBox(placed, c.vp),
        ),
      },
    );
  } else if (c.tab === "sequence") {
    const passed = trace
      ? trace.slice(0, Math.max(0, c.pos + 1)).map((s) => s.edge)
      : [];
    out.push({
      target: SEQ,
      tree: sequenceTree(buildSequence(root), {
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
      tree: timelineTree(buildTimeline(root, trace, rid), {
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

  /** the model the board shows and the editor changes: the top level or an open module */
  _model(state: FsState): Model {
    return viewModel(state);
  }

  /** the same, as a design that has frames (an older design is turned into one) */
  _frames(state: FsState): Model {
    return toFrames(viewModel(state));
  }

  /** the whole project, whatever module is open */
  _root(state: FsState): Model {
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
    if (patch.vp) patch = { ...patch, vp: sized(patch.vp, state.vp) };
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
    if (patch.vp) patch = { ...patch, vp: sized(patch.vp, state.vp) };
    const next: Core = { ...coreFrom(state), ...patch };
    return [store.merge("", patch), ...this._paint(next, false)];
  }

  /**
   * An edit of what the board shows: `model` is a change of `_model(state)`, so it
   * goes back into the module that is open. Recorded in the history; the trace of
   * the old design is dropped.
   */
  _edit(
    state: FsState,
    model: Model,
    tag = "",
    patch: Partial<Core> = {},
    layoutOnly = false,
  ): Effect[] {
    const root = state.hist.present;
    // a design edited has frames (an older one is turned into them, drawn the same)
    let full = putAt(root, scopeOf(state), toFrames(model));
    // the body of a pipe is generated from its stages: a stage added or deleted
    // on the board rebuilds the chain
    const open = defAt(root, scopeOf(state));
    if (open?.body === "pipe") full = syncPipe(full, open.id);
    return this._record(state, full, tag, patch, layoutOnly);
  }

  /** An edit of the whole project (the name, the scenario, the library of modules). */
  _editRoot(
    state: FsState,
    model: Model,
    tag = "",
    patch: Partial<Core> = {},
    layoutOnly = false,
  ): Effect[] {
    return this._record(state, model, tag, patch, layoutOnly);
  }

  _record(
    state: FsState,
    model: Model,
    tag: string,
    patch: Partial<Core>,
    layoutOnly: boolean,
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
    const scope = scopeOf(c);
    const m = modelAt(c.hist.present, scope);
    let sel = c.sel;
    if (sel.kind === "node" && !findNode(m, sel.id)) sel = NO_SEL;
    if (sel.kind === "edge" && !findEdge(m, sel.id)) sel = NO_SEL;
    // breakpoints are kept by the id of the flat design
    const flat = flatten(c.hist.present);
    const breakpoints = Object.fromEntries(
      Object.entries(c.breakpoints).filter(([id]) => findNode(flat, id)),
    );
    return { ...c, scope, sel, breakpoints };
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
          "o",
        ],
      }),
      local.media("(prefers-reduced-motion: reduce)", "gotMotion"),
      local.load(STORAGE_KEY, "loaded"),
      local.load(MINE_KEY, "mineLoaded"),
      local.load(BOARD_KEY, "boardLoaded"),
      ...(state.ready ? [time.setTimeout(SYNC, 0, "sync")] : []),
    ];
  }

  leave(): Effect[] {
    return [
      local.unkeys(),
      time.cancel(TICK),
      time.cancel(SYNC),
      // the full screen is the board's: leaving the page ends it
      store.set("full", false),
    ];
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
    // an empty board is the demo, unless the place that keeps the project says it is
    // the project's own (an application that saves it: `keepEmpty`)
    const keepEmpty =
      (msg.payload as { keepEmpty?: boolean } | undefined)?.keepEmpty === true;
    if (
      parsed &&
      typeof parsed !== "string" &&
      (parsed.nodes.length > 0 || keepEmpty)
    ) {
      const core = coreOf(parsed);
      return this._commit(
        state,
        {
          ...core,
          prefix: state.prefix,
          reduced: state.reduced,
          // how the board sits on the page is not the project's
          boardH: state.boardH,
          mini: state.mini,
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
    return [
      ...this._paint(coreFrom(state), true),
      // the board fills its box: the box is measured, and Shift + wheel zooms it
      local.watch("#fs-flow", "boardSize"),
      local.watch("#fs-minimap", "miniSize"),
      local.wheel("#fs-flow", "boardWheel"),
    ];
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
      const m = this._root(state);
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
    return this._editRoot(
      state,
      { ...this._root(state), name: msg.event?.value ?? "" },
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
        scope: [],
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
    if (state.sheet.open === "plugins") return this.pluginsApply(_msg, state);
    const r = parseProject(state.sheet.text);
    if (typeof r === "string")
      return this._commit(state, { sheet: { ...state.sheet, error: r } });
    const held = holdCode(r);
    return this._open(
      state,
      held,
      `Imported "${r.name}".${heldCount(held) ? " The code of its modules is held: read it, then enable it." : ""}`,
    );
  }

  pluginsApply(_msg: Message, state: FsState): Effect[] {
    const r = parsePlugins(state.sheet.text);
    if (typeof r === "string")
      return this._commit(state, { sheet: { ...state.sheet, error: r } });
    return this._editRoot(state, mergePlugins(this._root(state), r), "", {
      sheet: NO_SHEET,
      message: `Added ${r.length} plugin${r.length === 1 ? "" : "s"}: ${r.map((p) => p.name).join(", ")}.`,
    });
  }

  pluginAdd(_msg: Message, state: FsState): Effect[] {
    const r = addPlugin(this._root(state));
    return this._editRoot(state, r.model, "", {
      side: "plugins",
      sideOpen: true,
      message: `Added the plugin ${r.name}. Describe its effects, then find them in the palette.`,
    });
  }

  pluginDel(msg: Message, state: FsState): Effect[] {
    const root = this._root(state);
    const next = removePlugin(root, msg.payload as string);
    return next === root
      ? this._commit(state, {
          message:
            "An effect node still uses the plugin. Delete those nodes first.",
        })
      : this._editRoot(state, next);
  }

  /** the plugins kept in this browser came back */
  mineLoaded(msg: Message, state: FsState): Effect[] {
    const text = (msg.payload as { text: string | null } | undefined)?.text;
    const r = text ? parsePlugins(text) : [];
    return typeof r === "string" ? [] : this._commit(state, { mine: r });
  }

  /** a plugin of the library (by name) is added to the project */
  pluginUse(msg: Message, state: FsState): Effect[] {
    const e = libraryEntries().find(
      (x) => !x.builtin && x.name === msg.payload,
    );
    if (!e) return [];
    return this._editRoot(
      state,
      mergePlugins(this._root(state), [e.manifest]),
      "",
      {
        side: "plugins",
        message: `Added the plugin ${e.name} from the library.`,
      },
    );
  }

  /** a plugin of the project is kept in this browser, for the other projects */
  pluginSave(msg: Message, state: FsState): Effect[] {
    const p = this._root(state).plugins.find((x) => x.name === msg.payload);
    if (!p) return [];
    const mine = [...state.mine.filter((x) => x.name !== p.name), p];
    return this._commit(
      state,
      { mine, message: `Kept ${p.name} in My library.` },
      [local.save(MINE_KEY, pluginsText(mine))],
    );
  }

  mineUse(msg: Message, state: FsState): Effect[] {
    const p = state.mine.find((x) => x.name === msg.payload);
    return p
      ? this._editRoot(state, mergePlugins(this._root(state), [p]), "", {
          message: `Added the plugin ${p.name} from My library.`,
        })
      : [];
  }

  mineDel(msg: Message, state: FsState): Effect[] {
    const mine = state.mine.filter((x) => x.name !== msg.payload);
    return this._commit(state, { mine }, [
      local.save(MINE_KEY, pluginsText(mine)),
    ]);
  }

  pluginCopy(msg: Message, state: FsState): Effect[] {
    const p = this._root(state).plugins.find((x) => x.name === msg.payload);
    return p ? [local.copy(pluginsText([p]), "copiedJson")] : [];
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
    const m = this._root(state);
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
    return [local.copy(projectText(this._root(state)), "copiedJson")];
  }

  copiedJson(_msg: Message, state: FsState): Effect[] {
    return this._commit(state, {
      message: "The flow JSON is on the clipboard",
    });
  }

  vbApply(_msg: Message, state: FsState): Effect[] {
    const text = state.sheet.text.trim();
    const r = text
      ? importVisualBuilderText(text, this._root(state))
      : importVisualBuilder(
          VB_DEMOS.find((d) => d.id === "todo")!.make(),
          this._root(state),
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
    void p;
    // the pointer is followed wherever it goes, off the board too
    return [
      ...this._commit(state, {
        sel: NO_SEL,
        drag: {
          kind: "pan",
          cx: null,
          cy: null,
          vx: state.vp.x,
          vy: state.vp.y,
          moved: false,
        },
      }),
      local.drag("dragMove"),
    ];
  }

  nodeDown(msg: Message, state: FsState): Effect[] {
    const p = msg.payload as { id: string; x: number; y: number };
    const a = this._abs(state, p.id);
    if (!a) return [];
    const n = findNode(this._frames(state), p.id)!;
    return this._commit(state, {
      sel: { kind: "node", id: p.id },
      side: state.side === "scenario" ? "scenario" : "inspect",
      drag: {
        kind: "node",
        id: p.id,
        ox: p.x - a.x,
        oy: p.y - a.y,
        x: a.x,
        y: a.y,
        frame: n.frame ?? "",
        moved: false,
      },
    });
  }

  portDown(msg: Message, state: FsState): Effect[] {
    const p = msg.payload as {
      id: string;
      port: "out" | "ok" | "err";
      pid?: string;
      x: number;
      y: number;
    };
    return this._commit(state, {
      sel: { kind: "node", id: p.id },
      drag: {
        kind: "link",
        from: p.id,
        port: p.port,
        pid: p.pid ?? "",
        x: p.x,
        y: p.y,
      },
    });
  }

  cvMove(msg: Message, state: FsState): Effect[] {
    const d = state.drag;
    if (!d) return [];
    const p = msg.payload as { x: number; y: number };
    if (d.kind === "link")
      return this._light(state, { drag: { ...d, x: p.x, y: p.y } });
    // a node follows the pointer, anywhere on the plot; over a frame, it will be attached to it
    if (d.kind !== "node") return [];
    const m = this._frames(state);
    const node = findNode(m, d.id);
    if (!node) return [];
    const size = layoutOf(m).nodes.find((n) => n.id === d.id);
    const x = Math.round(p.x - d.ox);
    const y = Math.round(p.y - d.oy);
    const moved = d.moved || Math.abs(x - d.x) + Math.abs(y - d.y) > 4;
    if (!moved) return [];
    // the middle of the node says which frame it is over
    const over = frameAt(m, x + (size?.w ?? 0) / 2, y + (size?.h ?? 0) / 2);
    return this._light(state, {
      drag: { ...d, x, y, moved, frame: over?.id ?? "" },
    });
  }

  _endDrag(state: FsState): Effect[] {
    const d = state.drag;
    if (!d) return [];
    // these are followed by the window, and end with its release (`dragMove` with `done`): a
    // release over the board, which comes first, is not their end
    if (
      d.kind === "frame" ||
      d.kind === "frameSize" ||
      d.kind === "height" ||
      d.kind === "pan" ||
      d.kind === "mini"
    )
      return [];
    if (d.kind === "node" && d.moved)
      return this._edit(
        state,
        dragged(this._frames(state), d),
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
    // a pan goes on outside the board: the pointer is followed by the window
    return state.drag?.kind === "node" || state.drag?.kind === "link"
      ? this._commit(state, { drag: null })
      : [];
  }

  nodeUp(msg: Message, state: FsState): Effect[] {
    const d = state.drag;
    const id = (msg.payload as { id: string }).id;
    if (d?.kind === "link") {
      if (d.from === id) return this._commit(state, { drag: null });
      return this._connect(state, d.from, id, d.port, d.pid);
    }
    return this._endDrag(state);
  }

  /** a link dropped on an input pin of a module: it arrives at that port */
  pinUp(msg: Message, state: FsState): Effect[] {
    const d = state.drag;
    const p = msg.payload as { id: string; pid: string };
    if (d?.kind !== "link") return this._endDrag(state);
    if (d.from === p.id) return this._commit(state, { drag: null });
    return this._connect(state, d.from, p.id, d.port, d.pid, p.pid);
  }

  _connect(
    state: FsState,
    from: string,
    to: string,
    port: "out" | "ok" | "err" = "out",
    fromPort = "",
    toPort = "",
  ): Effect[] {
    const m = this._model(state);
    const r = addEdge(m, from, to, {
      port,
      ...(fromPort ? { fromPort } : {}),
      ...(toPort ? { toPort } : {}),
    });
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
    const node = findNode(this._model(state), id);
    if (node?.kind === "module" && findDef(this._root(state), node.ref))
      return this._enter(state, [...scopeOf(state), id]);
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

  /** the minimap measured: what a pixel of it is in the world depends on it */
  miniSize(msg: Message, state: FsState): Effect[] {
    const s = msg.payload as { w: number; h: number };
    return state.mini.w === s.w && state.mini.h === s.h
      ? []
      : this._light(state, { mini: { w: s.w, h: s.h } });
  }

  /**
   * A press on the minimap: on the rectangle, it is taken where it is; elsewhere, the view
   * goes there. The pointer then moves the rectangle wherever it goes.
   */
  mmDown(msg: Message, state: FsState): Effect[] {
    const p = msg.payload as { x: number; y: number };
    const placed = layoutOf(this._model(state));
    const box = miniBox(placed, state.vp);
    const size = { w: state.vp.w ?? 800, h: state.vp.h ?? 460 };
    const inside =
      p.x >= state.vp.x &&
      p.x <= state.vp.x + size.w / state.vp.z &&
      p.y >= state.vp.y &&
      p.y <= state.vp.y + size.h / state.vp.z;
    const vp = inside
      ? state.vp
      : this._clamp(state, centeredAt(state.vp, p.x, p.y));
    // a px of the minimap, in world units: it shows the box as large as fits
    const scale =
      state.mini.w > 0 && state.mini.h > 0
        ? Math.min(state.mini.w / box.w, state.mini.h / box.h)
        : 0.1;
    return [
      ...this._commit(state, {
        vp,
        drag: {
          kind: "mini",
          cx0: null,
          cy0: null,
          vx: vp.x,
          vy: vp.y,
          k: 1 / scale,
          box,
        },
      }),
      local.drag("dragMove"),
    ];
  }

  boardLoaded(msg: Message, state: FsState): Effect[] {
    const text = (msg.payload as { text: string | null } | undefined)?.text;
    const h = Number(text);
    if (!text || !Number.isFinite(h) || h === state.boardH) return [];
    const boardH = Math.min(BOARD_MAX, Math.max(BOARD_MIN, Math.round(h)));
    return this._commit(state, {
      boardH,
      vp: state.vp.w === undefined ? state.vp : { ...state.vp, h: boardH },
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
    return this._commit(state, {
      vp: fitView(placed, state.vp),
    });
  }
  home(_m: Message, state: FsState): Effect[] {
    return this._commit(state, { vp: HOME });
  }
  toggleFollow(_m: Message, state: FsState): Effect[] {
    return this._commit(state, { follow: !state.follow });
  }

  // ---- the board in its box: its size, the wheel, the full screen, the height ----

  /** the box of the board was measured: the drawing fills it (and shows the whole design the first time) */
  boardSize(msg: Message, state: FsState): Effect[] {
    const s = msg.payload as { w: number; h: number };
    if (state.vp.w === s.w && state.vp.h === s.h) return [];
    const placed = layoutOf(this._model(state));
    const first = state.vp.w === undefined;
    // the first time the whole design is shown, but not smaller than it can be read
    const fit = fitView(placed, s);
    return this._commit(state, {
      vp: first
        ? fit.z >= START_Z
          ? fit
          : { ...fit, x: -12, y: -12, z: START_Z }
        : { ...state.vp, w: s.w, h: s.h },
    });
  }

  /** Shift + wheel: zoom toward the pointer */
  boardWheel(msg: Message, state: FsState): Effect[] {
    const w = msg.payload as { dy: number; x: number; y: number };
    const factor = Math.exp(-w.dy * 0.0018);
    return this._commit(state, {
      vp: this._clamp(state, zoomAt(state.vp, factor, w.x, w.y)),
    });
  }

  toggleFull(): Effect[] {
    return [local.fullscreen(".fs", "fullChanged")];
  }

  fullChanged(msg: Message, state: FsState): Effect[] {
    const on = (msg.payload as { on: boolean }).on === true;
    // the box is another size now: measure it again
    return on === state.full
      ? []
      : this._commit(state, { full: on }, [
          time.setTimeout("fs-measure", 80, "remeasure"),
        ]);
  }

  /** the box of the board is measured again, once the page has laid itself out */
  remeasure(): Effect[] {
    return [local.watch("#fs-flow", "boardSize")];
  }

  /** the handle under the board: the height follows the pointer */
  heightDown(_msg: Message, state: FsState): Effect[] {
    return [
      ...this._light(state, {
        drag: { kind: "height", cy0: null, h0: state.boardH },
      }),
      local.drag("dragMove"),
    ];
  }

  heightKey(msg: Message, state: FsState): Effect[] {
    const k = msg.event?.key;
    if (k !== "ArrowUp" && k !== "ArrowDown") return [];
    const h = Math.min(
      BOARD_MAX,
      Math.max(BOARD_MIN, state.boardH + (k === "ArrowDown" ? 40 : -40)),
    );
    return this._commit(
      state,
      {
        boardH: h,
        vp: { ...state.vp, h },
      },
      [local.save(BOARD_KEY, String(h))],
    );
  }

  /** a frame by its header: it follows the pointer, and what is attached to it goes with it */
  frameDown(msg: Message, state: FsState): Effect[] {
    const id = (msg.payload as { id: string }).id;
    if (!findFrame(this._frames(state), id)) return [];
    return [
      ...this._light(state, {
        sel: NO_SEL,
        drag: { kind: "frame", id, cx0: null, cy0: null, dx: 0, dy: 0 },
      }),
      local.drag("dragMove"),
    ];
  }

  /** a border or a corner of a frame: the rectangle follows the pointer */
  frameSize(msg: Message, state: FsState): Effect[] {
    const p = msg.payload as { id: string; edge: string };
    const f = findFrame(this._frames(state), p.id);
    if (!f) return [];
    const r = { x: f.x, y: f.y, w: f.w, h: f.h };
    return [
      ...this._light(state, {
        sel: NO_SEL,
        drag: {
          kind: "frameSize",
          id: p.id,
          edge: p.edge,
          cx0: null,
          cy0: null,
          r0: r,
          r,
        },
      }),
      local.drag("dragMove"),
    ];
  }

  /** the pointer moves, anywhere on the screen, while the height of the board or of a lane is dragged */
  dragMove(msg: Message, state: FsState): Effect[] {
    const d = state.drag;
    if (
      !d ||
      (d.kind !== "frame" &&
        d.kind !== "frameSize" &&
        d.kind !== "height" &&
        d.kind !== "pan" &&
        d.kind !== "mini")
    )
      return [];
    const p = msg.payload as { x: number; y: number; done: boolean };
    if (d.kind === "mini") {
      if (p.done) return this._commit(state, { drag: null });
      if (d.cx0 === null || d.cy0 === null)
        return this._light(state, { drag: { ...d, cx0: p.x, cy0: p.y } });
      const placed = layoutOf(this._model(state));
      return this._light(state, {
        vp: clampView(
          {
            ...state.vp,
            x: d.vx + (p.x - d.cx0) * d.k,
            y: d.vy + (p.y - d.cy0) * d.k,
          },
          placed,
        ),
      });
    }
    if (d.kind === "pan") {
      if (p.done) return this._commit(state, { drag: null });
      if (d.cx === null || d.cy === null)
        return this._light(state, { drag: { ...d, cx: p.x, cy: p.y } });
      const placed = layoutOf(this._model(state));
      const dx = p.x - d.cx;
      const dy = p.y - d.cy;
      return this._light(state, {
        vp: clampView(
          {
            ...state.vp,
            x: d.vx - dx / state.vp.z,
            y: d.vy - dy / state.vp.z,
          },
          placed,
        ),
        drag: { ...d, moved: d.moved || Math.abs(dx) + Math.abs(dy) > 2 },
      });
    }
    if (d.cy0 === null) {
      return p.done
        ? this._light(state, { drag: null })
        : this._light(state, {
            drag: {
              ...d,
              cy0: p.y,
              ...(d.kind === "frame" || d.kind === "frameSize"
                ? { cx0: p.x }
                : {}),
            },
          });
    }
    const dy = p.y - d.cy0;
    if (d.kind === "height") {
      const h = Math.min(BOARD_MAX, Math.max(BOARD_MIN, Math.round(d.h0 + dy)));
      // the box of the board is exactly this high: the drawing follows at once
      const vp = { ...state.vp, h };
      if (p.done)
        return this._commit(state, { drag: null, boardH: h, vp }, [
          local.save(BOARD_KEY, String(h)),
        ]);
      const next: Core = { ...coreFrom(state), drag: { ...d }, boardH: h, vp };
      return [
        store.merge("", {
          drag: { ...d },
          boardH: h,
          vp,
          boardStyle: boardStyle(h, state.full),
        }),
        ...this._paint(next, false),
      ];
    }
    const dx = (p.x - (d.cx0 ?? p.x)) / state.vp.z;
    const dyw = dy / state.vp.z;
    if (d.kind === "frame") {
      if (!p.done) return this._light(state, { drag: { ...d, dx, dy: dyw } });
      // a drag that ended where it began is no step of the history
      if (Math.abs(dx) + Math.abs(dyw) < 1)
        return this._commit(state, { drag: null });
      return this._edit(
        state,
        moveFrame(this._frames(state), d.id, dx, dyw),
        "",
        { drag: null },
        true,
      );
    }
    // the edges of the rectangle that the handle holds move, the others stay
    const r = d.r0;
    const left = d.edge.includes("w");
    const right = d.edge.includes("e");
    const top = d.edge.includes("n");
    const bottom = d.edge.includes("s");
    const w = Math.max(FRAME_MIN_W, r.w + (right ? dx : 0) - (left ? dx : 0));
    const h = Math.max(FRAME_MIN_H, r.h + (bottom ? dyw : 0) - (top ? dyw : 0));
    const next = {
      // the side that is held by the opposite border does not move when the least size is reached
      x: left ? r.x + r.w - w : r.x,
      y: top ? r.y + r.h - h : r.y,
      w,
      h,
    };
    if (!p.done) return this._light(state, { drag: { ...d, r: next } });
    if (next.x === r.x && next.y === r.y && next.w === r.w && next.h === r.h)
      return this._commit(state, { drag: null });
    return this._edit(
      state,
      setFrameRect(this._frames(state), d.id, next),
      "",
      { drag: null },
      true,
    );
  }

  // ---- the frames: add, name, what they run as, take away ----

  toggleFrames(_m: Message, state: FsState): Effect[] {
    return this._commit(state, { framesOpen: !state.framesOpen });
  }

  /** a double click on the name of a frame: the panel that edits the frames */
  frameEdit(_m: Message, state: FsState): Effect[] {
    return this._commit(state, { framesOpen: true });
  }

  /** a new frame in the middle of what the board shows */
  frameAdd(_m: Message, state: FsState): Effect[] {
    const vp = state.vp;
    const w = (vp.w ?? 800) / vp.z;
    const h = (vp.h ?? 460) / vp.z;
    // not larger than the board, and not under the corner of the last one
    const fw = Math.min(FRAME_W, Math.max(FRAME_MIN_W, w * 0.6));
    const fh = Math.min(FRAME_H, Math.max(FRAME_MIN_H, h * 0.6));
    const m = this._frames(state);
    const step = framesOf(m).length * 24;
    return this._edit(
      state,
      addFrame(
        m,
        {
          x: vp.x + (w - fw) / 2 + step,
          y: vp.y + (h - fh) / 2 + step,
          w: fw,
          h: fh,
        },
        `Frame ${framesOf(m).length + 1}`,
      ).model,
      "",
      { message: "Added a frame. Drag its header, or a component onto it." },
      true,
    );
  }

  frameName(msg: Message, state: FsState): Effect[] {
    const id = String(msg.payload);
    return this._edit(
      state,
      renameFrame(this._frames(state), id, msg.event?.value ?? ""),
      `frame-name:${id}`,
      {},
      true,
    );
  }

  frameRole(msg: Message, state: FsState): Effect[] {
    const v = msg.event?.value ?? "";
    if (v !== "" && !(LANES as string[]).includes(v)) return [];
    return this._edit(
      state,
      setFrameRole(this._frames(state), String(msg.payload), v as "" | Lane),
      "",
      {},
      true,
    );
  }

  /** the cross of a frame, or Remove in the panel: the components on it stay on the plot */
  frameDel(msg: Message, state: FsState): Effect[] {
    const raw = msg.payload as { id?: string } | string;
    const id = typeof raw === "string" ? raw : String(raw?.id ?? "");
    return this._edit(
      state,
      removeFrame(this._frames(state), id),
      "",
      { message: "Removed the frame: its components stay where they are" },
      true,
    );
  }

  autoLayoutAll(_m: Message, state: FsState): Effect[] {
    return this._edit(
      state,
      autoLayout(this._frames(state)),
      "",
      {
        vp: HOME,
        message: "Laid out the components in their frames",
        live: "Auto layout done",
      },
      true,
    );
  }

  // ---- editing ----

  addNodeOf(msg: Message, state: FsState): Effect[] {
    const [kind, title] = msg.payload as [NodeKind, string];
    // an external of a plugin of the project stands behind that plugin
    const owner =
      kind === "external"
        ? this._model(state).plugins.find((p) => p.external === title)
        : undefined;
    const r = addNode(
      this._frames(state),
      kind,
      title,
      owner ? { plugin: owner.name } : {},
    );
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
    return p ? clampView(reveal(state.vp, p), placed) : state.vp;
  }

  /** the view stays over the world */
  _clamp(state: FsState, vp: Viewport): Viewport {
    const placed = layoutOf(this._model(state));
    return clampView(vp, placed);
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
    const q = parseQuick(text, this._model(state).plugins);
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
    // nodes and edges are those of the board; the scenario and the library of
    // modules belong to the whole project
    const kind = ctx.split(":")[0];
    if (kind === "n" || kind === "e") {
      const r = applyEdit(this._model(state), ctx, name, value);
      return r ? this._edit(state, r.model, r.tag) : [];
    }
    const r = applyEdit(this._root(state), ctx, name, value);
    return r ? this._editRoot(state, r.model, r.tag) : [];
  }

  faultNode(msg: Message, state: FsState): Effect[] {
    const [node, kind] = msg.payload as [string, "error" | "timeout" | "slow"];
    return this._editRoot(
      state,
      toggleNodeFault(this._root(state), flatId(scopeOf(state), node), kind),
    );
  }

  chip(msg: Message, state: FsState): Effect[] {
    return this._editRoot(
      state,
      toggleChip(this._root(state), msg.payload as string),
    );
  }

  faultToggle(msg: Message, state: FsState): Effect[] {
    const id = msg.payload as string;
    const f = this._root(state).scenario.faults.find((x) => x.id === id);
    return f
      ? this._editRoot(state, updateFault(this._root(state), id, { on: !f.on }))
      : [];
  }

  faultDel(msg: Message, state: FsState): Effect[] {
    return this._editRoot(
      state,
      removeFault(this._root(state), msg.payload as string),
    );
  }

  reqAdd(_msg: Message, state: FsState): Effect[] {
    const m = this._root(state);
    const entry =
      m.scenario.requests[0]?.entry ??
      m.nodes.find((n) => n.kind === "ui-event")?.id ??
      "";
    if (!entry)
      return this._commit(state, {
        message: "Add a UI event or a client first.",
      });
    const n = m.scenario.requests.length + 1;
    return this._editRoot(state, {
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
    const m = this._root(state);
    const i = msg.payload as number;
    return this._editRoot(state, {
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
    const node = id ? findNode(this._model(state), id) : undefined;
    if (!node) return [];
    // breakpoints are kept by the id of the flat design; a module has no node of
    // its own there, so its breakpoint is on the node its first input port feeds
    const def =
      node.kind === "module" ? findDef(this._root(state), node.ref) : undefined;
    const inner = node.kind === "module" ? (def?.inputs[0]?.node ?? "") : "";
    if (node.kind === "module" && !inner)
      return this._commit(state, {
        message:
          "Bind an input port of the module to a node to set a breakpoint on it.",
      });
    const key = flatId(
      scopeOf(state),
      node.kind === "module" ? `${id}/${inner}` : id,
    );
    const on = !state.breakpoints[key];
    const title = node.title;
    return this._commit(state, {
      breakpoints: { ...state.breakpoints, [key]: on },
      live: `Breakpoint ${on ? "set on" : "removed from"} ${title}`,
    });
  }

  // ---- modules ----

  /** shows the body of the module at `scope` (the top level for []) */
  _enter(state: FsState, scope: string[]): Effect[] {
    return this._commit(
      state,
      {
        scope,
        sel: NO_SEL,
        drag: null,
        vp: HOME,
        side: "inspect",
        sideOpen: false,
        live: scope.length ? "Opened a module" : "Back at the top level",
      },
      [],
      true,
    );
  }

  /** the selected instance (or the one in the message) is opened */
  openModule(msg: Message, state: FsState): Effect[] {
    const id =
      typeof msg.payload === "string" && msg.payload
        ? msg.payload
        : state.sel.kind === "node"
          ? state.sel.id
          : "";
    const node = id ? findNode(this._model(state), id) : undefined;
    if (
      !node ||
      node.kind !== "module" ||
      !findDef(this._root(state), node.ref)
    )
      return [];
    return this._enter(state, [...scopeOf(state), id]);
  }

  /** the breadcrumb: back up to the `i`-th open module (-1: the top level) */
  goScope(msg: Message, state: FsState): Effect[] {
    const i = msg.payload as number;
    return this._enter(state, scopeOf(state).slice(0, i + 1));
  }

  /** a new module in the library, with an instance on the board, ready to open */
  newModule(msg: Message, state: FsState): Effect[] {
    return this._newModule(
      state,
      msg.payload === "frontend" ? "frontend" : "backend",
      "graph",
    );
  }

  /** a new pipe, with an instance on the board: add its stages when it is open */
  newPipe(msg: Message, state: FsState): Effect[] {
    const side = msg.payload === "frontend" ? "frontend" : "backend";
    const root = this._root(state);
    const n = root.modules.filter((d) => d.body === "pipe").length + 1;
    const made = addPipe(root, `Pipe ${n}`, side);
    const scoped = modelAt(made.model, scopeOf(state));
    const inst = addInstance(scoped, made.id);
    if (!inst) return [];
    const node = findNode(inst.model, inst.id)!;
    return this._edit(
      state,
      inst.model,
      "",
      {
        sel: { kind: "node", id: inst.id },
        side: "inspect",
        sideOpen: true,
        vp: this._reveal(state, inst.model, node),
        message: `Created the pipe ${node.title}. Open it to add the stages.`,
      },
      true,
    );
  }

  pipeAdd(msg: Message, state: FsState): Effect[] {
    const open = defAt(this._root(state), scopeOf(state));
    const stage = msg.event?.value ?? "";
    if (!open || !stage) return [];
    const next = addStage(this._root(state), open.id, stage);
    return next === this._root(state)
      ? this._commit(state, {
          message: "That module cannot be a stage of this pipe.",
        })
      : this._editRoot(state, next);
  }

  pipeMove(msg: Message, state: FsState): Effect[] {
    const open = defAt(this._root(state), scopeOf(state));
    const [i, dir] = msg.payload as [number, -1 | 1];
    return open
      ? this._editRoot(state, moveStage(this._root(state), open.id, i, dir))
      : [];
  }

  pipeDel(msg: Message, state: FsState): Effect[] {
    const open = defAt(this._root(state), scopeOf(state));
    return open
      ? this._editRoot(
          state,
          removeStage(this._root(state), open.id, msg.payload as number),
        )
      : [];
  }

  newCodeModule(msg: Message, state: FsState): Effect[] {
    return this._newModule(
      state,
      msg.payload === "frontend" ? "frontend" : "backend",
      "code",
    );
  }

  _newModule(
    state: FsState,
    side: "frontend" | "backend",
    body: "graph" | "code",
  ): Effect[] {
    const root = this._root(state);
    const n = root.modules.filter((d) => d.side === side).length + 1;
    const made = addModule(
      root,
      `${side === "frontend" ? "Widget" : "Service"} ${n}`,
      side,
      body,
    );
    // the instance goes to the board that is open (the library is shared)
    const scoped = modelAt(made.model, scopeOf(state));
    const inst = addInstance(scoped, made.id);
    if (!inst) return [];
    const node = findNode(inst.model, inst.id)!;
    return this._edit(
      state,
      inst.model,
      "",
      {
        sel: { kind: "node", id: inst.id },
        side: "inspect",
        sideOpen: true,
        vp: this._reveal(state, inst.model, node),
        message: `Created the module ${node.title}. Double-click it to open the body.`,
        live: `Created the module ${node.title}`,
      },
      true,
    );
  }

  /** an instance of a module of the library */
  addInstanceOf(msg: Message, state: FsState): Effect[] {
    const defId = msg.payload as string;
    const open = defAt(this._root(state), scopeOf(state));
    if (!canNest(this._root(state), open?.id ?? "", defId))
      return this._commit(state, {
        message:
          "A module cannot contain itself, not even through another module.",
      });
    const r = addInstance(this._model(state), defId);
    if (!r) return [];
    const node = findNode(r.model, r.id)!;
    return this._edit(
      state,
      r.model,
      "",
      {
        sel: { kind: "node", id: r.id },
        side: "inspect",
        vp: this._reveal(state, r.model, node),
        message: `Added an instance of ${node.title}`,
        live: `Added an instance of ${node.title}`,
      },
      true,
    );
  }

  /** the textarea of a code body: the source of the open module */
  codeEdit(msg: Message, state: FsState): Effect[] {
    const open = defAt(this._root(state), scopeOf(state));
    if (!open) return [];
    return this._editRoot(
      state,
      updateModule(this._root(state), open.id, {
        source: msg.event?.value ?? "",
      }),
      `mod:${open.id}:source`,
    );
  }

  modSync(msg: Message, state: FsState): Effect[] {
    const root = this._root(state);
    const next = syncPorts(root, msg.payload as string);
    return next === root
      ? this._commit(state, {
          message: "Every emitted port already has an output.",
        })
      : this._editRoot(state, next, "", {
          message: "Added the output ports the code emits.",
        });
  }

  enableCode(_msg: Message, state: FsState): Effect[] {
    return this._editRoot(state, releaseCode(this._root(state)), "", {
      message: "The code of the imported modules is enabled.",
    });
  }

  modAddPort(msg: Message, state: FsState): Effect[] {
    const [defId, dir] = msg.payload as [string, PortDir];
    const r = addPort(this._root(state), defId, dir);
    return r ? this._editRoot(state, r.model) : [];
  }

  modDelPort(msg: Message, state: FsState): Effect[] {
    const [defId, dir, portId] = msg.payload as [string, PortDir, string];
    return this._editRoot(
      state,
      removePort(this._root(state), defId, dir, portId),
    );
  }

  modDelete(msg: Message, state: FsState): Effect[] {
    const defId = msg.payload as string;
    const root = this._root(state);
    const next = removeModule(root, defId);
    if (next === root)
      return this._commit(state, {
        message: "The module still has instances. Delete them first.",
      });
    return this._editRoot(state, next, "", {
      message: "Deleted the module",
      live: "Deleted the module",
    });
  }

  // ---- the player ----

  _simulate(state: FsState): Trace {
    const m = this._root(state);
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
      live: this._announce(trace, pos, flatten(this._root(state))),
      ...extra,
    };
    if (s && state.follow && state.tab === "flow") {
      const here = localId(scopeOf(state), s.to);
      const target = layoutOf(m).nodes.find((n) => n.id === here);
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
      const flat = flatten(this._root(state));
      const title = findNode(flat, s.to)?.title ?? s.to;
      return this._commit(
        state,
        {
          ...patch,
          playing: false,
          progress: 1,
          live: `Breakpoint at ${title}. ${this._announce(trace, next, flat)}`,
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
    const issue = lint(this._root(state))[i];
    if (!issue) return [];
    // an issue inside a module opens the module
    const at = locate(issue.node || issue.edge);
    const scope = scopeValid(this._root(state), at.path) ? at.path : [];
    const m = modelAt(this._root(state), scope);
    const node = issue.node ? findNode(m, at.id) : undefined;
    const edge = issue.edge ? findEdge(m, at.id) : undefined;
    const target = node ?? (edge ? findNode(m, edge.from) : undefined);
    const placed = layoutOf(m);
    const p = target ? placed.nodes.find((n) => n.id === target.id) : undefined;
    return this._commit(
      state,
      {
        tab: "flow",
        scope,
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
    const at = locate(msg.payload as string);
    const scope = scopeValid(this._root(state), at.path) ? at.path : [];
    const id = at.id;
    const m = modelAt(this._root(state), scope);
    const e = findEdge(m, id);
    if (!e) return [];
    const from = layoutOf(m).nodes.find((n) => n.id === e.from);
    return this._commit(
      state,
      {
        tab: "flow",
        scope,
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
    const at = locate((msg.payload as { id: string }).id);
    const scope = scopeValid(this._root(state), at.path) ? at.path : [];
    return this._commit(state, {
      scope,
      sel: { kind: "edge", id: at.id },
      side: "inspect",
    });
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
    const all = generateAll(this._root(state))
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
        // nothing selected inside a module: Escape leaves it
        if (state.sel.kind === "none" && scopeOf(state).length > 0)
          return this._enter(state, scopeOf(state).slice(0, -1));
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
      case "o":
        return this.openModule(msg, state);
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
