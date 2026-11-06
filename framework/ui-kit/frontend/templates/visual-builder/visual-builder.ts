// The Visual Builder. A page designer (sections on a 12-column grid, several
// pages, three devices), a state editor, events with action chains, an
// interpreter that runs the model ("Preview"), a diagram of the whole app, a
// code generator, and a project that is saved in the browser.
//
// Everything in this file is a pure function of (message, state). The model and
// its logic are in the files next to it (grid, history, bind, actions, mock,
// diagram, codegen, ...); the side effects are plugins: `store`, `http`, `time`,
// `svg` (diagram and charts), `files` (export / import) and `local` (saved
// project, clipboard, shortcuts).
import { Component, type Effect, type Message } from "@pavlus/frontend";
import {
  httpEffector as http,
  storeEffector as store,
  svgEffector as svg,
  timeEffector as time,
} from "@pavlus/frontend/plugins";
import { filesEffector, type Picked } from "../../files.ts";
import { type KeyPayload, localEffector as local } from "../../local.ts";
import {
  DEMOS as FLOW_DEMOS,
  demoOf as flowDemoOf,
} from "../flow-studio/demos.ts";
import { callFlow, routesOf } from "../flow-studio/flowlink.ts";
import { parseProject as parseFlow } from "../flow-studio/model.ts";
import {
  type Answer,
  envOf,
  execute,
  finish,
  fire,
  formInput,
  formSubmit,
  type HttpRequest,
  type Run,
  SLOTS,
  type Step,
  startRun,
  writeKey,
} from "./actions.ts";
import {
  coerce,
  getPath,
  initialData,
  listOf,
  scopeOf,
  setPath,
} from "./bind.ts";
import { chartPoints, chartTree } from "./charts.ts";
import { generatedText } from "./codegen.ts";
import { DEMOS, demoOf } from "./demos.ts";
import {
  addLink,
  buildGraph,
  countActions,
  type DiagramUi,
  diagramTree,
  layoutGraph,
  removeEdge,
} from "./diagram.ts";
import {
  addElement,
  clampRect,
  layoutOf,
  moveTo,
  nudge,
  resizeTo,
} from "./grid.ts";
import {
  canRedo,
  canUndo,
  commit,
  type History,
  redo,
  start,
  undo,
} from "./history.ts";
import {
  ACTION_TYPES,
  addAction,
  applyEdit,
  deleteAction,
  type FieldView,
  type InspectorView,
  inspectorOf,
  keyFields,
  mockFields,
  shiftAction,
} from "./inspector.ts";
import { parseProject, projectText } from "./io.ts";
import { routeMock } from "./mock.ts";
import {
  allElements,
  type Bp,
  duplicateElement,
  EL_TYPES,
  ELEMENTS,
  type El,
  type ElType,
  type EventName,
  emptyModel,
  findElement,
  findSection,
  type Model,
  makeElement,
  newId,
  removeElement,
  SECTION_LABEL,
  type SectionKind,
} from "./model.ts";
import {
  addSectionTo,
  deletePage,
  deleteSection,
  duplicateSection,
  mapPage,
  moveSection,
  newPage,
} from "./pages.ts";
import { makeSection } from "./sections.ts";
import { type StageView, stageOf } from "./stage.ts";
import view from "./visual-builder.pavlus";

export const STORAGE_KEY = "pavlus-visual-builder";
const DIAGRAM = "#vb-diagram";

export type Tab = "design" | "diagram" | "preview";
export type LeftTab = "elements" | "sections" | "pages" | "state" | "mock";
export type Pane = "canvas" | "left" | "right";

export interface Sel {
  kind: "none" | "element" | "section" | "page" | "key";
  id: string;
}

/**
 * What is being dragged. The pointer is followed by the window (`local.drag`): `cx` and `cy`
 * are where it was pressed (px, null until the first sample), the drag is `live` once it
 * has moved a few pixels (a click that does not move is a click), and `over` is the cell of
 * a section it is over, as `section|x|y` ("" = none).
 */
export type Drag = (
  | { kind: "palette"; type: ElType }
  | { kind: "move"; id: string }
  | { kind: "resize"; id: string }
  | { kind: "section"; section: SectionKind }
) & { live?: boolean; cx?: number | null; cy?: number | null; over?: string };

/** how far the pointer goes before a press is a drag (px) */
const DRAG_SLOP = 5;

/** where a drag would land: a rectangle of a section's grid */
export interface Ghost {
  section: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface DiagramState {
  collapsed: Record<string, boolean>;
  hover: string;
  selNode: string;
  selEdge: string;
  armed: string;
}

export interface Sheet {
  open: "" | "import" | "code" | "demos" | "flow";
  text: string;
  error: string;
}

/** the part of the state the user changes; everything else follows from it */
interface Core {
  hist: History<Model>;
  tab: Tab;
  bp: Bp;
  pageId: string;
  sel: Sel;
  selKey: string;
  pane: Pane;
  leftTab: LeftTab;
  evTab: string;
  run: Run;
  drag: Drag | null;
  dg: DiagramState;
  prefix: string;
  ready: boolean;
  sheet: Sheet;
  message: string;
}

interface Derived {
  model: Model;
  /** a drag is under way (the pointer has moved): the cells to drop on are there */
  dragLive: boolean;
  canUndo: boolean;
  canRedo: boolean;
  summary: string;
  pageTabs: { id: string; name: string; slug: string; current: boolean }[];
  stage: StageView;
  frameClass: string;
  inspector: InspectorView;
  keyList: { k: string; key: string; fields: FieldView[]; error: string }[];
  keyNames: { k: string }[];
  mockList: { k: string; id: string; fields: FieldView[] }[];
  mockOn: boolean;
  outline: {
    id: string;
    name: string;
    slug: string;
    current: boolean;
    sections: {
      id: string;
      name: string;
      selected: boolean;
      elements: {
        id: string;
        label: string;
        selected: boolean;
        hidden: boolean;
      }[];
    }[];
  }[];
  runJson: string;
  runLog: { k: string; text: string }[];
  address: string;
  notice: string;
  edgeInfo: { label: string; removable: boolean } | null;
  codeText: string;
  mockHint: string;
  /** the diagram the project is linked to: its routes, and the demos to link to */
  flowV: {
    on: boolean;
    apiBase: string;
    name: string;
    tables: string;
    routes: { k: string; label: string; detail: string }[];
    demos: { id: string; title: string }[];
  };
  projectName: string;
  palette: PaletteGroup[];
  sectionLib: { id: SectionKind; label: string }[];
  actionTypes: { id: string; label: string }[];
  demoList: { id: string; title: string; about: string }[];
}

export type VbState = Core & Derived;

export interface PaletteGroup {
  group: string;
  items: { type: ElType; label: string }[];
}
export const PALETTE: PaletteGroup[] = (
  ["Content", "Inputs", "Data", "Layout"] as const
).map((group) => ({
  group,
  items: EL_TYPES.filter((t) => ELEMENTS[t].group === group).map((type) => ({
    type,
    label: ELEMENTS[type].label,
  })),
}));
export const SECTION_LIBRARY = (
  Object.keys(SECTION_LABEL) as SectionKind[]
).map((id) => ({
  id,
  label: SECTION_LABEL[id],
}));

export const DEMO_LIST = [
  ...DEMOS.map((d) => ({ id: d.id, title: d.title, about: d.about })),
  { id: "blank", title: "Blank project", about: "One empty page." },
];

// ---- the view-models ----

const pageOf = (c: Core): Model["pages"][number] | undefined => {
  const m = c.hist.present;
  const id = c.tab === "preview" ? c.run.page : c.pageId;
  return m.pages.find((p) => p.id === id) ?? m.pages[0];
};

function labelOf(e: El): string {
  const p = e.props;
  return (
    p.text ||
    p.title ||
    p.label ||
    p.tabs ||
    ELEMENTS[e.type].label
  ).slice(0, 28);
}

/** the cell a drag is over, from its `over` (`section|x|y`) */
export function cellOf(
  over: string | undefined,
): { section: string; x: number; y: number } | null {
  const [section, x, y] = (over ?? "").split("|");
  return section && /^\d+$/.test(x ?? "") && /^\d+$/.test(y ?? "")
    ? { section, x: Number(x), y: Number(y) }
    : null;
}

/**
 * Where what is dragged would land: an element from the library at its size, an element that
 * is moved at its own size, a resize from the corner of the element to the cell. Nothing when
 * the pointer is not over a cell, or when the drop would do nothing.
 */
export function ghostOf(c: Core, model: Model): Ghost | null {
  const d = c.drag;
  const cell = cellOf(d?.over);
  if (!d || !cell) return null;
  const target = findSection(model, cell.section);
  if (!target) return null;
  let w = 1;
  let h = 1;
  let x = cell.x;
  let y = cell.y;
  if (d.kind === "palette") {
    w = ELEMENTS[d.type].w;
    h = ELEMENTS[d.type].h;
  } else if (d.kind === "move") {
    const f = findElement(model, d.id);
    const r = f && layoutOf(f.section, c.bp)[d.id];
    if (!r) return null;
    w = r.w;
    h = r.h;
  } else if (d.kind === "resize") {
    const f = findElement(model, d.id);
    const r = f && layoutOf(f.section, c.bp)[d.id];
    // a resize is within the section the element is in
    if (!r || f.section.id !== cell.section) return null;
    x = r.x;
    y = r.y;
    w = Math.max(1, cell.x - r.x + 1);
    h = Math.max(1, cell.y - r.y + 1);
  } else return null;
  const rect = clampRect({ x, y, w, h });
  return { section: cell.section, ...rect };
}

/** Pure: everything the template shows that follows from the core. */
export function derive(c: Core): Derived {
  const model = c.hist.present;
  const preview = c.tab === "preview";
  const page = pageOf(c);
  const data = preview ? c.run.data : initialData(model.keys);
  const stage =
    c.tab === "diagram"
      ? { sections: [], empty: true, charts: [] }
      : stageOf({
          model,
          page,
          bp: c.bp,
          mode: preview ? "preview" : "design",
          data,
          ui: preview ? c.run.ui : {},
          selected: c.sel.kind === "element" ? c.sel.id : "",
          selectedSection: c.sel.kind === "section" ? c.sel.id : "",
          dragging: c.drag?.live === true,
          ghost: c.drag?.live ? ghostOf(c, model) : null,
          location: c.run.location,
        });
  const elements = allElements(model);
  const edge = c.dg.selEdge
    ? buildGraph(model).edges.find((e) => e.id === c.dg.selEdge)
    : undefined;
  return {
    model,
    dragLive: c.drag?.live === true,
    canUndo: canUndo(c.hist),
    canRedo: canRedo(c.hist),
    summary: `${model.pages.length} page${model.pages.length === 1 ? "" : "s"} · ${elements.length} elements · ${model.keys.length} state keys · ${countActions(model)} actions`,
    pageTabs: model.pages.map((p) => ({
      id: p.id,
      name: p.name,
      slug: p.slug,
      current: p.id === (page?.id ?? ""),
    })),
    stage,
    frameClass: `vb-frame vb-frame--${c.bp}`,
    inspector:
      c.tab === "preview"
        ? inspectorOf(model, { kind: "none", id: "" }, c.bp, "")
        : inspectorOf(model, c.sel, c.bp, c.evTab),
    keyList: c.leftTab === "state" ? keyFields(model) : [],
    keyNames: model.keys.map((k) => ({ k: k.key })),
    mockList: c.leftTab === "mock" ? mockFields(model) : [],
    mockOn: model.mockOn,
    outline:
      c.leftTab === "pages"
        ? model.pages.map((p) => ({
            id: p.id,
            name: p.name,
            slug: p.slug,
            current: p.id === c.pageId,
            sections:
              p.id === c.pageId
                ? p.sections.map((s) => ({
                    id: s.id,
                    name: s.name,
                    selected: c.sel.kind === "section" && c.sel.id === s.id,
                    elements: s.elements.map((e) => ({
                      id: e.id,
                      label: labelOf(e),
                      selected: c.sel.kind === "element" && c.sel.id === e.id,
                      hidden: !!e.hide[c.bp],
                    })),
                  }))
                : [],
          }))
        : [],
    runJson: preview ? JSON.stringify(c.run.data, null, 2) : "",
    runLog: preview
      ? c.run.log.map((text, i) => ({ k: `${i}`, text })).reverse()
      : [],
    address: c.run.location,
    notice: c.run.notice,
    edgeInfo: edge
      ? {
          label: `${edge.label}: ${edge.from.slice(2)} to ${edge.to.slice(2)}`,
          removable: edge.ref.kind !== "none",
        }
      : null,
    codeText: c.sheet.open === "code" ? generatedText(model) : "",
    mockHint: !model.mockOn
      ? `The backend is not simulated: requests go to ${model.apiBase ? `the server at ${model.apiBase}` : "the real network"}.`
      : model.flow
        ? `The diagram "${model.flow.name}" answers the requests: its routes, its handlers, its tables. The tables start again with the preview.`
        : "Requests are answered by these routes, no network.",
    flowV: {
      on: model.flow !== null,
      apiBase: model.apiBase,
      name: model.flow?.name ?? "",
      tables: model.flow
        ? Object.entries(model.flow.db)
            .map(([t, d]) => `${t} (${d.rows.length})`)
            .join(", ")
        : "",
      routes: model.flow
        ? routesOf(model.flow).map((r) => ({
            k: r.id,
            label: `${r.method} ${r.path}`,
            detail: [
              r.statuses.length ? `answers ${r.statuses.join(", ")}` : "",
              r.body.length
                ? `body: ${r.body.map((f) => f.name).join(", ")}`
                : "",
              r.query.length
                ? `query: ${r.query.map((f) => f.name).join(", ")}`
                : "",
            ]
              .filter(Boolean)
              .join(" · "),
          }))
        : [],
      demos: FLOW_DEMOS.map((d) => ({ id: d.id, title: d.title })),
    },
    projectName: model.name,
    palette: PALETTE,
    sectionLib: SECTION_LIBRARY,
    actionTypes: ACTION_TYPES,
    demoList: DEMO_LIST,
  };
}

const NO_SEL: Sel = { kind: "none", id: "" };
const NO_DG: DiagramState = {
  collapsed: {},
  hover: "",
  selNode: "",
  selEdge: "",
  armed: "",
};
const NO_SHEET: Sheet = { open: "", text: "", error: "" };

export function coreOf(model: Model): Core {
  return {
    hist: start(model),
    tab: "design",
    bp: "desktop",
    pageId: model.pages[0].id,
    sel: NO_SEL,
    selKey: "",
    pane: "canvas",
    leftTab: "elements",
    evTab: "",
    run: startRun(model),
    drag: null,
    dg: NO_DG,
    prefix: "",
    ready: false,
    sheet: NO_SHEET,
    message: "",
  };
}

export function stateOf(model: Model): VbState {
  const core = coreOf(model);
  return { ...core, ...derive(core) };
}

export const initial: VbState = stateOf(demoOf("landing").make());

const CORE_KEYS = [
  "hist",
  "tab",
  "bp",
  "pageId",
  "sel",
  "selKey",
  "pane",
  "leftTab",
  "evTab",
  "run",
  "drag",
  "dg",
  "prefix",
  "ready",
  "sheet",
  "message",
] as const;

/** the core out of a state */
export function coreFrom(s: VbState): Core {
  const c: Record<string, unknown> = {};
  for (const k of CORE_KEYS) c[k] = s[k];
  return c as unknown as Core;
}

const reply = (a: Answer): Answer => a;

export class VisualBuilder extends Component<VbState> {
  view = view;

  constructor() {
    super();
    // one handler per request slot: the plugins answer with a message id, and the
    // id says which request it is (an id cannot carry data, a slot number can)
    const h = this as unknown as Record<string, unknown>;
    for (let i = 0; i < SLOTS; i++) {
      h[`httpOk${i}`] = (msg: Message, s: VbState) =>
        this._answer(s, i, {
          status: (msg.payload as { status?: number })?.status ?? 200,
          data: (msg.payload as { data?: unknown })?.data ?? null,
        });
      h[`httpErr${i}`] = (msg: Message, s: VbState) => {
        const p = (msg.payload ?? {}) as {
          status?: number;
          error?: string;
          data?: unknown;
        };
        return this._answer(
          s,
          i,
          p.status
            ? { status: p.status, data: p.data ?? null }
            : { status: 0, data: null, error: p.error ?? "Network error" },
        );
      };
      h[`mockDone${i}`] = (_msg: Message, s: VbState) => {
        const a = s.run.slots[i]?.answer;
        return a ? this._answer(s, i, a) : [];
      };
    }
  }

  // ---- helpers ----

  /** Change some of the core; everything worked out from it follows. */
  _commit(
    state: VbState,
    patch: Partial<Core>,
    extra: Effect[] = [],
  ): Effect[] {
    const next: Core = { ...coreFrom(state), ...patch };
    const d = derive(next);
    const saved = next.hist.present !== state.hist.present;
    return [
      store.merge("", { ...patch, ...d }),
      ...(saved
        ? [local.save(STORAGE_KEY, projectText(next.hist.present))]
        : []),
      ...extra,
      time.setTimeout("vb-sync", 0, "sync"),
    ];
  }

  /** a model edit: recorded in the history (and the selection kept valid) */
  _edit(
    state: VbState,
    model: Model,
    tag = "",
    patch: Partial<Core> = {},
  ): Effect[] {
    const hist = commit(state.hist, model, tag);
    return this._commit(
      state,
      this._valid({ ...coreFrom(state), hist, ...patch }),
    );
  }

  /** the selection and the page must exist in the model */
  _valid(c: Core): Core {
    const m = c.hist.present;
    const pageId = m.pages.some((p) => p.id === c.pageId)
      ? c.pageId
      : m.pages[0].id;
    let sel = c.sel;
    if (sel.kind === "element" && !findElement(m, sel.id)) sel = NO_SEL;
    if (sel.kind === "section" && !findSection(m, sel.id)) sel = NO_SEL;
    if (sel.kind === "page" && !m.pages.some((p) => p.id === sel.id))
      sel = NO_SEL;
    if (sel.kind === "key" && !m.keys.some((k) => k.key === sel.id))
      sel = NO_SEL;
    return { ...c, pageId, sel };
  }

  _model(state: VbState): Model {
    return state.hist.present;
  }

  /** the section that gets a new element: the selected one, or the last of the page */
  _targetSection(state: VbState): string {
    const m = this._model(state);
    if (state.sel.kind === "section") return state.sel.id;
    if (state.sel.kind === "element")
      return findElement(m, state.sel.id)?.section.id ?? "";
    const page = m.pages.find((p) => p.id === state.pageId) ?? m.pages[0];
    return page.sections[page.sections.length - 1]?.id ?? "";
  }

  _addElement(
    state: VbState,
    type: ElType,
    secId: string,
    at?: { x: number; y: number },
  ): Effect[] {
    let m = this._model(state);
    const page = m.pages.find((p) => p.id === state.pageId) ?? m.pages[0];
    if (!secId || !findSection(m, secId)) {
      const made = makeSection(m, "empty");
      m = addSectionTo(made.model, page.id, made.section);
      secId = made.section.id;
    }
    const made = makeElement(m, type);
    m = made.model;
    const bp = state.bp;
    m = {
      ...m,
      pages: m.pages.map((p) => ({
        ...p,
        sections: p.sections.map((s) => {
          if (s.id !== secId) return s;
          let next = addElement(s, made.el, at);
          if (at && bp !== "desktop")
            next = moveTo(next, bp, made.el.id, at.x, at.y) ?? next;
          return next;
        }),
      })),
    };
    return this._edit(state, m, "", {
      sel: { kind: "element", id: made.el.id },
      drag: null,
      pane: "canvas",
      message: `Added ${ELEMENTS[type].label}`,
    });
  }

  // ---- lifecycle ----

  enter(_msg: Message, state: VbState): Effect[] {
    return [
      local.prefix("gotPrefix"),
      local.keys("key"),
      local.load(STORAGE_KEY, "loaded"),
      ...(state.ready ? [time.setTimeout("vb-sync", 0, "sync")] : []),
    ];
  }

  leave(): Effect[] {
    return [local.unkeys(), time.cancel("vb-sync"), time.cancel("vb-notice")];
  }

  gotPrefix(msg: Message, state: VbState): Effect[] {
    return this._commit(state, { prefix: msg.payload as string });
  }

  /** the saved project, if there is a good one */
  loaded(msg: Message, state: VbState): Effect[] {
    if (state.ready) return [time.setTimeout("vb-sync", 0, "sync")];
    const text = (msg.payload as { text: string | null } | undefined)?.text;
    const parsed = text ? parseProject(text) : null;
    if (parsed && typeof parsed !== "string") {
      const core = coreOf(parsed);
      return this._commit(state, {
        ...core,
        prefix: state.prefix,
        ready: true,
        message: "Opened your saved project",
      });
    }
    return this._commit(state, { ready: true });
  }

  /** a debounced repaint of the svg parts: the diagram and the charts */
  sync(_msg: Message, state: VbState): Effect[] {
    return [...this._diagramFx(state, true), ...this._chartFx(state)];
  }

  chartMissing(): Effect[] {
    return [];
  }

  diagramMissing(_msg: Message, state: VbState): Effect[] {
    return this._diagramFx(state, true);
  }

  _diagramUi(state: VbState): DiagramUi {
    return { ...state.dg, prefix: state.prefix };
  }

  _diagramFx(state: VbState, mount: boolean): Effect[] {
    if (state.tab !== "diagram") return [];
    const placed = layoutGraph(
      buildGraph(this._model(state)),
      state.dg.collapsed,
    );
    const tree = diagramTree(placed, this._diagramUi(state));
    return [
      mount
        ? svg.mount(DIAGRAM, tree, undefined, "chartMissing")
        : svg.update(DIAGRAM, tree, "diagramMissing"),
    ];
  }

  _chartFx(state: VbState): Effect[] {
    if (state.tab === "diagram") return [];
    const m = this._model(state);
    const data = state.tab === "preview" ? state.run.data : initialData(m.keys);
    const scope = scopeOf(data);
    return state.stage.charts.flatMap((ch) => {
      const f = findElement(m, ch.id);
      if (!f) return [];
      return [
        svg.mount(
          `#${ch.domId}`,
          chartTree(ch.kind, chartPoints(f.el, scope)),
          undefined,
          "chartMissing",
        ),
      ];
    });
  }

  // ---- the chrome ----

  setTab(msg: Message, state: VbState): Effect[] {
    const tab = msg.payload as Tab;
    if (tab === state.tab) return [];
    if (tab === "preview") return this._startPreview(state, { tab });
    return this._commit(
      state,
      { tab, drag: null, dg: { ...state.dg, armed: "" } },
      this._cancelRun(state),
    );
  }

  setBp(msg: Message, state: VbState): Effect[] {
    return this._commit(state, { bp: msg.payload as Bp });
  }

  setPane(msg: Message, state: VbState): Effect[] {
    return this._commit(state, { pane: msg.payload as Pane });
  }

  setLeft(msg: Message, state: VbState): Effect[] {
    return this._commit(state, { leftTab: msg.payload as LeftTab });
  }

  setName(msg: Message, state: VbState): Effect[] {
    return this._edit(
      state,
      { ...this._model(state), name: msg.event?.value ?? "" },
      "project-name",
    );
  }

  dismiss(_msg: Message, state: VbState): Effect[] {
    return this._commit(state, { message: "" });
  }

  undo(_msg: Message, state: VbState): Effect[] {
    const hist = undo(state.hist);
    return hist === state.hist
      ? []
      : this._commit(
          state,
          this._valid({ ...coreFrom(state), hist, message: "Undone" }),
        );
  }

  redo(_msg: Message, state: VbState): Effect[] {
    const hist = redo(state.hist);
    return hist === state.hist
      ? []
      : this._commit(
          state,
          this._valid({ ...coreFrom(state), hist, message: "Redone" }),
        );
  }

  /** shortcuts from the keyboard plugin */
  key(msg: Message, state: VbState): Effect[] {
    const { key, ctrl, shift } = msg.payload as KeyPayload;
    if (state.tab === "preview") return [];
    if (ctrl && key === "z")
      return shift ? this.redo(msg, state) : this.undo(msg, state);
    if (ctrl && key === "y") return this.redo(msg, state);
    if (state.tab !== "design") {
      return key === "Escape"
        ? this._commit(state, { dg: { ...state.dg, armed: "", selEdge: "" } })
        : [];
    }
    if (key === "Escape")
      return this._commit(state, { sel: NO_SEL, drag: null });
    if (ctrl && key === "d") return this.elDup(msg, state);
    if (key === "Delete")
      return state.sel.kind === "section"
        ? this.secDel(msg, state)
        : this.elDel(msg, state);
    if (key.startsWith("Arrow") && state.sel.kind === "element") {
      const f = findElement(this._model(state), state.sel.id);
      if (!f) return [];
      const dx = key === "ArrowLeft" ? -1 : key === "ArrowRight" ? 1 : 0;
      const dy = key === "ArrowUp" ? -1 : key === "ArrowDown" ? 1 : 0;
      const r = layoutOf(f.section, state.bp)[f.el.id];
      if (!r) return [];
      const next = shift
        ? resizeTo(f.section, state.bp, f.el.id, r.w + dx, r.h + dy)
        : nudge(f.section, state.bp, f.el.id, dx, dy);
      return next
        ? this._edit(state, this._withSection(this._model(state), next))
        : [];
    }
    return [];
  }

  _withSection(
    m: Model,
    section: Model["pages"][number]["sections"][number],
  ): Model {
    return {
      ...m,
      pages: m.pages.map((p) => ({
        ...p,
        sections: p.sections.map((s) => (s.id === section.id ? section : s)),
      })),
    };
  }

  // ---- selection ----

  select(msg: Message, state: VbState): Effect[] {
    return this._commit(state, {
      sel: { kind: "element", id: msg.payload as string },
      pane: state.pane === "left" ? "right" : state.pane,
    });
  }

  /** the outline selects and shows the inspector on a narrow screen */
  pick(msg: Message, state: VbState): Effect[] {
    const [kind, id] = msg.payload as ["element" | "section" | "page", string];
    const m = this._model(state);
    const pageId =
      kind === "page"
        ? id
        : kind === "section"
          ? (findSection(m, id)?.page.id ?? state.pageId)
          : (findElement(m, id)?.page.id ?? state.pageId);
    return this._commit(state, { sel: { kind, id }, pageId, pane: "right" });
  }

  /** Enter or Space on a focused cell selects it */
  cellKey(msg: Message, state: VbState): Effect[] {
    const k = msg.event?.key;
    return k === "Enter" || k === " "
      ? this.select({ id: "select", payload: msg.payload }, state)
      : [];
  }

  clearSel(_msg: Message, state: VbState): Effect[] {
    return this._commit(state, { sel: NO_SEL });
  }

  selectSection(msg: Message, state: VbState): Effect[] {
    return this._commit(state, {
      sel: { kind: "section", id: msg.payload as string },
      pane: state.pane === "left" ? "right" : state.pane,
    });
  }

  // ---- adding things ----

  addEl(msg: Message, state: VbState): Effect[] {
    return this._addElement(
      state,
      msg.payload as ElType,
      this._targetSection(state),
    );
  }

  addSection(msg: Message, state: VbState): Effect[] {
    const m = this._model(state);
    const made = makeSection(m, msg.payload as SectionKind);
    const page = m.pages.find((p) => p.id === state.pageId) ?? m.pages[0];
    const at =
      state.sel.kind === "section"
        ? page.sections.findIndex((s) => s.id === state.sel.id) + 1
        : undefined;
    return this._edit(
      state,
      addSectionTo(made.model, page.id, made.section, at || undefined),
      "",
      {
        sel: { kind: "section", id: made.section.id },
        pane: "canvas",
        message: `Added section ${made.section.name}`,
      },
    );
  }

  secMove(msg: Message, state: VbState): Effect[] {
    const [id, by] = msg.payload as [string, -1 | 1];
    return this._edit(state, moveSection(this._model(state), id, by));
  }

  secDup(msg: Message, state: VbState): Effect[] {
    const r = duplicateSection(this._model(state), msg.payload as string);
    return r
      ? this._edit(state, r.model, "", { sel: { kind: "section", id: r.id } })
      : [];
  }

  secDel(msg: Message, state: VbState): Effect[] {
    const id =
      typeof msg.payload === "string"
        ? msg.payload
        : state.sel.kind === "section"
          ? state.sel.id
          : "";
    return id
      ? this._edit(state, deleteSection(this._model(state), id), "", {
          sel: NO_SEL,
        })
      : [];
  }

  elDup(msg: Message, state: VbState): Effect[] {
    const id =
      typeof msg.payload === "string"
        ? msg.payload
        : state.sel.kind === "element"
          ? state.sel.id
          : "";
    const r = id ? duplicateElement(this._model(state), id) : null;
    return r
      ? this._edit(state, r.model, "", { sel: { kind: "element", id: r.id } })
      : [];
  }

  elDel(msg: Message, state: VbState): Effect[] {
    const id =
      typeof msg.payload === "string"
        ? msg.payload
        : state.sel.kind === "element"
          ? state.sel.id
          : "";
    return id
      ? this._edit(state, removeElement(this._model(state), id), "", {
          sel: NO_SEL,
        })
      : [];
  }

  /** show / hide the selected element on the current device */
  elHide(_msg: Message, state: VbState): Effect[] {
    if (state.sel.kind !== "element") return [];
    const bp = state.bp;
    const m = this._model(state);
    return this._edit(state, {
      ...m,
      pages: m.pages.map((p) => ({
        ...p,
        sections: p.sections.map((s) => ({
          ...s,
          elements: s.elements.map((e) =>
            e.id === state.sel.id
              ? { ...e, hide: { ...e.hide, [bp]: !e.hide[bp] } }
              : e,
          ),
        })),
      })),
    });
  }

  // ---- drag and drop ----
  // A press on the library, on an element or on its corner starts a drag that the window
  // follows (`local.drag`, which tells what cell the pointer is over); moving a few pixels
  // makes it live (the cells and the place where it would land are shown), and letting go
  // over a cell drops it there. Not native drag and drop: that does not tell where the
  // pointer is over, and does not start every time.

  _press(state: VbState, drag: Drag): Effect[] {
    return [
      ...this._commit(state, {
        drag: { ...drag, live: false, cx: null, cy: null, over: "" },
      }),
      local.drag("dragMove"),
    ];
  }
  dragPalette(msg: Message, state: VbState): Effect[] {
    return this._press(state, { kind: "palette", type: msg.payload as ElType });
  }
  dragEl(msg: Message, state: VbState): Effect[] {
    return this._press(state, { kind: "move", id: String(msg.payload) });
  }
  dragResize(msg: Message, state: VbState): Effect[] {
    return this._press(state, { kind: "resize", id: String(msg.payload) });
  }
  dragSection(msg: Message, state: VbState): Effect[] {
    return this._press(state, {
      kind: "section",
      section: msg.payload as SectionKind,
    });
  }

  /** the pointer moves, anywhere on the screen, with a drag pressed */
  dragMove(msg: Message, state: VbState): Effect[] {
    const d = state.drag;
    if (!d) return [];
    const p = msg.payload as {
      x: number;
      y: number;
      done: boolean;
      over?: string | null;
    };
    // the first sample is where the pointer was pressed
    if (d.cx === null || d.cx === undefined) {
      return p.done
        ? this._commit(state, { drag: null })
        : this._commit(state, { drag: { ...d, cx: p.x, cy: p.y } });
    }
    const live =
      d.live === true ||
      Math.abs(p.x - d.cx) + Math.abs(p.y - (d.cy ?? p.y)) >= DRAG_SLOP;
    const over = live ? (p.over ?? "") : "";
    if (p.done) {
      const cell = live ? cellOf(over) : null;
      // a press that did not move is a click: it is left to the click
      if (!cell) return this._commit(state, { drag: null });
      return this.drop(
        { id: "drop", payload: [cell.section, cell.x, cell.y] },
        state,
      );
    }
    if (live === d.live && over === d.over) return [];
    return this._commit(state, {
      drag: { ...d, live, over },
      // an element that is moved is the one that is selected
      ...(live && !d.live && d.kind === "move"
        ? { sel: { kind: "element" as const, id: d.id } }
        : {}),
    });
  }

  /** the drag state, set by hand (the keyboard and the tests) */
  dragBegin(msg: Message, state: VbState): Effect[] {
    return this._commit(state, { drag: msg.payload as Drag });
  }
  dragEnd(_msg: Message, state: VbState): Effect[] {
    return state.drag ? this._commit(state, { drag: null }) : [];
  }

  /** dropped on the cell (x, y) of a section */
  drop(msg: Message, state: VbState): Effect[] {
    const [secId, x, y] = msg.payload as [string, number, number];
    const d = state.drag;
    if (!d) return [];
    const m = this._model(state);
    const bp = state.bp;
    if (d.kind === "palette")
      return this._addElement(state, d.type, secId, { x, y });
    if (d.kind === "move") {
      const f = findElement(m, d.id);
      const target = findSection(m, secId);
      if (!f || !target) return this._commit(state, { drag: null });
      if (f.section.id === secId) {
        const next = moveTo(f.section, bp, d.id, x, y);
        return next
          ? this._edit(state, this._withSection(m, next), "", { drag: null })
          : this._commit(state, { drag: null });
      }
      // to another section: it leaves the old grid and lands on the new one
      let model = removeElement(m, d.id);
      model = {
        ...model,
        pages: model.pages.map((p) => ({
          ...p,
          sections: p.sections.map((s) => {
            if (s.id !== secId) return s;
            let next = addElement(
              s,
              { ...f.el, pos: { desktop: { ...f.el.pos.desktop } } },
              { x, y },
            );
            if (bp !== "desktop") next = moveTo(next, bp, d.id, x, y) ?? next;
            return next;
          }),
        })),
      };
      return this._edit(state, model, "", {
        drag: null,
        sel: { kind: "element", id: d.id },
      });
    }
    if (d.kind === "resize") {
      const f = findElement(m, d.id);
      const r = f && layoutOf(f.section, bp)[d.id];
      if (!f || !r || f.section.id !== secId)
        return this._commit(state, { drag: null });
      const next = resizeTo(f.section, bp, d.id, x - r.x + 1, y - r.y + 1);
      return next
        ? this._edit(state, this._withSection(m, next), "", { drag: null })
        : this._commit(state, { drag: null });
    }
    return this._commit(state, { drag: null });
  }

  // ---- fields of every kind ----

  /** `f.edit` from the field part: (ctx, name) + what was typed */
  "f.edit"(msg: Message, state: VbState): Effect[] {
    const [ctx, name] = msg.payload as [string, string];
    const value = msg.event?.value ?? "";
    const r = applyEdit(this._model(state), ctx, name, value, state.bp);
    if (!r) return [];
    const patch: Partial<Core> = {};
    if (r.renamedKey && state.selKey === r.renamedKey.from)
      patch.selKey = r.renamedKey.to;
    if (
      r.renamedKey &&
      state.sel.kind === "key" &&
      state.sel.id === r.renamedKey.from
    )
      patch.sel = { kind: "key", id: r.renamedKey.to };
    return this._edit(state, r.model, r.tag, patch);
  }

  // ---- the inspector: events and actions ----

  evTab(msg: Message, state: VbState): Effect[] {
    return this._commit(state, { evTab: msg.payload as string });
  }

  _evOf(state: VbState): { id: string; event: EventName } | null {
    if (state.sel.kind !== "element") return null;
    const ins = state.inspector;
    const ev = ins.events.find((e) => e.active)?.name;
    return ev ? { id: state.sel.id, event: ev } : null;
  }

  actAdd(msg: Message, state: VbState): Effect[] {
    const t = this._evOf(state);
    if (!t) return [];
    const [chain, type] = msg.payload as [
      string,
      Parameters<typeof addAction>[4],
    ];
    return this._edit(
      state,
      addAction(this._model(state), t.id, t.event, chain, type),
      "",
      { evTab: t.event },
    );
  }

  actDel(msg: Message, state: VbState): Effect[] {
    const t = this._evOf(state);
    return t
      ? this._edit(
          state,
          deleteAction(
            this._model(state),
            t.id,
            t.event,
            msg.payload as string,
          ),
        )
      : [];
  }

  actMove(msg: Message, state: VbState): Effect[] {
    const t = this._evOf(state);
    const [path, by] = msg.payload as [string, -1 | 1];
    return t
      ? this._edit(
          state,
          shiftAction(this._model(state), t.id, t.event, path, by),
        )
      : [];
  }

  // ---- form fields of a Form element ----

  formFieldAdd(_msg: Message, state: VbState): Effect[] {
    if (state.sel.kind !== "element") return [];
    const m = this._model(state);
    return this._edit(state, {
      ...m,
      pages: m.pages.map((p) => ({
        ...p,
        sections: p.sections.map((s) => ({
          ...s,
          elements: s.elements.map((e) =>
            e.id === state.sel.id
              ? {
                  ...e,
                  fields: [
                    ...e.fields,
                    {
                      name: `field${e.fields.length + 1}`,
                      label: `Field ${e.fields.length + 1}`,
                      type: "text" as const,
                      required: "no" as const,
                      minLength: "",
                      maxLength: "",
                      min: "",
                      max: "",
                      pattern: "",
                      message: "",
                      options: "",
                    },
                  ],
                }
              : e,
          ),
        })),
      })),
    });
  }

  formFieldDel(msg: Message, state: VbState): Effect[] {
    if (state.sel.kind !== "element") return [];
    const m = this._model(state);
    return this._edit(state, {
      ...m,
      pages: m.pages.map((p) => ({
        ...p,
        sections: p.sections.map((s) => ({
          ...s,
          elements: s.elements.map((e) =>
            e.id === state.sel.id
              ? { ...e, fields: e.fields.filter((_, i) => i !== msg.payload) }
              : e,
          ),
        })),
      })),
    });
  }

  // ---- pages, keys, mocks ----

  pageAdd(_msg: Message, state: VbState): Effect[] {
    const m = this._model(state);
    const r = newPage(m, `Page ${m.pages.length + 1}`);
    return this._edit(state, r.model, "", {
      pageId: r.id,
      sel: { kind: "page", id: r.id },
    });
  }

  pageDel(msg: Message, state: VbState): Effect[] {
    return this._edit(
      state,
      deletePage(this._model(state), msg.payload as string),
      "",
      { sel: NO_SEL },
    );
  }

  pageGo(msg: Message, state: VbState): Effect[] {
    return this._commit(state, {
      pageId: msg.payload as string,
      sel: { kind: "page", id: msg.payload as string },
    });
  }

  keyAdd(_msg: Message, state: VbState): Effect[] {
    const m = this._model(state);
    let n = m.keys.length + 1;
    while (m.keys.some((k) => k.key === `key${n}`)) n++;
    return this._edit(
      state,
      {
        ...m,
        keys: [...m.keys, { key: `key${n}`, type: "string", initial: "" }],
      },
      "",
      { leftTab: "state", selKey: `key${n}` },
    );
  }

  keyDel(msg: Message, state: VbState): Effect[] {
    const m = this._model(state);
    return this._edit(
      state,
      { ...m, keys: m.keys.filter((k) => k.key !== msg.payload) },
      "",
      { selKey: "", sel: NO_SEL },
    );
  }

  mockAdd(_msg: Message, state: VbState): Effect[] {
    const m = this._model(state);
    const { model, id } = newId(m, "m");
    return this._edit(state, {
      ...model,
      mocks: [
        ...model.mocks,
        {
          id,
          method: "GET",
          path: "/api/new",
          status: 200,
          body: '{"ok": true}',
          delay: 300,
        },
      ],
    });
  }

  mockDel(msg: Message, state: VbState): Effect[] {
    const m = this._model(state);
    return this._edit(state, {
      ...m,
      mocks: m.mocks.filter((r) => r.id !== msg.payload),
    });
  }

  /** link the project to a demo diagram of Flow Studio (by its id) */
  flowConnect(msg: Message, state: VbState): Effect[] {
    const id = msg.event?.value ?? "";
    if (!FLOW_DEMOS.some((d) => d.id === id)) return [];
    const flow = flowDemoOf(id).make();
    return this._edit(
      state,
      { ...this._model(state), flow, mockOn: true },
      "",
      {
        message: `Linked to the diagram "${flow.name}": its routes answer the requests.`,
      },
    );
  }

  /** the address real requests go to when the backend is not simulated */
  apiBaseSet(msg: Message, state: VbState): Effect[] {
    return this._edit(
      state,
      { ...this._model(state), apiBase: (msg.event?.value ?? "").trim() },
      "api-base",
    );
  }

  flowDisconnect(_msg: Message, state: VbState): Effect[] {
    return this._edit(state, { ...this._model(state), flow: null }, "", {
      message: "The diagram is unlinked: the mock routes answer again.",
    });
  }

  /** link the project to a diagram pasted as JSON (the export of Flow Studio) */
  flowApply(_msg: Message, state: VbState): Effect[] {
    const r = parseFlow(state.sheet.text);
    if (typeof r === "string")
      return this._commit(state, { sheet: { ...state.sheet, error: r } });
    return this._edit(
      state,
      { ...this._model(state), flow: r, mockOn: true },
      "",
      {
        sheet: NO_SHEET,
        message: `Linked to the diagram "${r.name}": its routes answer the requests.`,
      },
    );
  }

  mockToggle(_msg: Message, state: VbState): Effect[] {
    const m = this._model(state);
    return this._edit(state, { ...m, mockOn: !m.mockOn });
  }

  // ---- the project: demos, export, import, code ----

  sheet(msg: Message, state: VbState): Effect[] {
    const open = msg.payload as Sheet["open"];
    return this._commit(state, {
      sheet:
        state.sheet.open === open ? NO_SHEET : { open, text: "", error: "" },
    });
  }

  loadDemo(msg: Message, state: VbState): Effect[] {
    const id = msg.payload as string;
    const model = id === "blank" ? emptyModel() : demoOf(id).make();
    const core = this._valid({
      ...coreOf(model),
      hist: commit(state.hist, model),
      prefix: state.prefix,
      ready: true,
    });
    return this._commit(
      state,
      { ...core, message: `Opened ${model.name}`, pageId: model.pages[0].id },
      this._cancelRun(state),
    );
  }

  exportJson(_msg: Message, state: VbState): Effect[] {
    const m = this._model(state);
    return [
      filesEffector.download(
        `${m.name.toLowerCase().replace(/\W+/g, "-") || "project"}.json`,
        projectText(m),
        "application/json",
        "exported",
      ),
    ];
  }

  exported(_msg: Message, state: VbState): Effect[] {
    return this._commit(state, { message: "Project exported as JSON" });
  }

  importText(msg: Message, state: VbState): Effect[] {
    return this._commit(state, {
      sheet: { ...state.sheet, text: msg.event?.value ?? "", error: "" },
    });
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

  importPicked(msg: Message, state: VbState): Effect[] {
    return this._commit(state, {
      sheet: { open: "import", text: (msg.payload as Picked).text, error: "" },
    });
  }

  importFailed(msg: Message, state: VbState): Effect[] {
    return this._commit(state, {
      sheet: { ...state.sheet, error: String(msg.payload) },
    });
  }

  importApply(_msg: Message, state: VbState): Effect[] {
    const r = parseProject(state.sheet.text);
    if (typeof r === "string")
      return this._commit(state, { sheet: { ...state.sheet, error: r } });
    const core = this._valid({
      ...coreOf(r),
      hist: commit(state.hist, r),
      prefix: state.prefix,
      ready: true,
    });
    return this._commit(state, {
      ...core,
      message: `Imported ${r.name}`,
      sheet: NO_SHEET,
    });
  }

  copyCode(_msg: Message, state: VbState): Effect[] {
    const text = generatedText(this._model(state));
    return this._commit(
      state,
      { sheet: { open: "code", text: "", error: "" } },
      [local.copy(text, "copied", "copyFailed")],
    );
  }

  copied(_msg: Message, state: VbState): Effect[] {
    return this._commit(state, {
      message: "Copied the pavlus code to the clipboard",
    });
  }

  copyFailed(_msg: Message, state: VbState): Effect[] {
    return this._commit(state, {
      message: "Could not use the clipboard: select the code and copy it",
    });
  }

  // ---- the diagram ----

  _selectNode(state: VbState, nodeId: string): Partial<Core> {
    const [kind, a, b] = nodeId.split(":");
    const m = this._model(state);
    if (kind === "e" || kind === "c" || kind === "h") {
      const f = findElement(m, a);
      return f
        ? {
            sel: { kind: "element", id: a },
            pageId: f.page.id,
            evTab: kind === "e" ? state.evTab : (b ?? ""),
            pane: "right",
          }
        : {};
    }
    if (kind === "k")
      return {
        sel: { kind: "key", id: a },
        selKey: a,
        leftTab: "state",
        pane: "right",
      };
    if (kind === "p")
      return { sel: { kind: "page", id: a }, pageId: a, pane: "right" };
    if (kind === "s") return { sel: { kind: "section", id: a }, pane: "right" };
    return {};
  }

  dgNode(msg: Message, state: VbState): Effect[] {
    const id = (msg.payload as { id: string }).id;
    // a port was picked: the click on a state key finishes the link
    if (state.dg.armed && id.startsWith("k:")) return this._link(state, id);
    return this._commit(state, {
      ...this._selectNode(state, id),
      dg: { ...state.dg, selNode: id, selEdge: "" },
    });
  }

  dgHover(msg: Message, state: VbState): Effect[] {
    const id = (msg.payload as { id: string }).id;
    if (id === state.dg.hover) return [];
    const dg = { ...state.dg, hover: id };
    return this._commit(
      state,
      { dg },
      this._diagramFx({ ...state, dg }, false),
    );
  }

  dgToggle(msg: Message, state: VbState): Effect[] {
    const id = (msg.payload as { id: string }).id;
    const dg = {
      ...state.dg,
      collapsed: { ...state.dg.collapsed, [id]: !state.dg.collapsed[id] },
    };
    return this._commit(
      state,
      { dg },
      this._diagramFx({ ...state, dg }, false),
    );
  }

  dgPort(msg: Message, state: VbState): Effect[] {
    const p = msg.payload as { el: string; event: string };
    const dg = { ...state.dg, armed: `${p.el}:${p.event}`, selEdge: "" };
    return this._commit(
      state,
      { dg, message: "Now click or release on a state key to link it" },
      this._diagramFx({ ...state, dg }, false),
    );
  }

  dgDrop(msg: Message, state: VbState): Effect[] {
    if (!state.dg.armed) return [];
    return this._link(state, (msg.payload as { id: string }).id);
  }

  _link(state: VbState, nodeId: string): Effect[] {
    const [elId, event] = state.dg.armed.split(":");
    const key = nodeId.slice(2);
    const model = addLink(this._model(state), elId, event as EventName, key);
    const dg = { ...state.dg, armed: "", selNode: `e:${elId}` };
    return this._edit(state, model, "", {
      dg,
      sel: { kind: "element", id: elId },
      evTab: event,
      message: `Linked ${event} to ${key}`,
    });
  }

  dgEdge(msg: Message, state: VbState): Effect[] {
    const dg = {
      ...state.dg,
      selEdge: (msg.payload as { id: string }).id,
      armed: "",
    };
    return this._commit(
      state,
      { dg },
      this._diagramFx({ ...state, dg }, false),
    );
  }

  dgBackground(_msg: Message, state: VbState): Effect[] {
    if (!state.dg.armed && !state.dg.selEdge && !state.dg.selNode) return [];
    const dg = { ...state.dg, armed: "", selEdge: "", selNode: "" };
    return this._commit(
      state,
      { dg },
      this._diagramFx({ ...state, dg }, false),
    );
  }

  dgRemove(_msg: Message, state: VbState): Effect[] {
    const m = this._model(state);
    const edge = buildGraph(m).edges.find((e) => e.id === state.dg.selEdge);
    const next = edge ? removeEdge(m, edge) : null;
    if (!next)
      return this._commit(state, {
        message:
          "This link comes from a text or an expression: edit that field to change it",
      });
    return this._edit(state, next, "", {
      dg: { ...state.dg, selEdge: "" },
      message: "Link removed",
    });
  }

  // ---- Preview: the interpreter ----

  _cancelRun(state: VbState): Effect[] {
    return state.run.slots.flatMap((s, i) =>
      s ? [time.cancel(`vb-mock-${i}`), http.cancel(`vb-req-${i}`)] : [],
    );
  }

  _startPreview(state: VbState, patch: Partial<Core>): Effect[] {
    const m = this._model(state);
    const env = envOf(m);
    const first = startRun(m);
    const page = m.pages.find((p) => p.id === state.pageId) ?? m.pages[0];
    const run0: Run = { ...first, page: page.id, location: page.slug };
    const step = this._loadEvents(
      m,
      { run: run0, requests: [], opens: [] },
      page.id,
      env,
    );
    return this._apply(
      state,
      step,
      { ...patch, drag: null, pane: "canvas" },
      this._cancelRun(state),
    );
  }

  /** the `load` events of the elements of a page */
  _loadEvents(
    m: Model,
    step: Step,
    pageId: string,
    env: ReturnType<typeof envOf>,
  ): Step {
    let cur = step;
    const page = m.pages.find((p) => p.id === pageId);
    for (const s of page?.sections ?? [])
      for (const el of s.elements)
        if (el.events.load?.length) {
          const next = fire(el, "load", cur.run, {}, env);
          cur = {
            run: next.run,
            requests: [...cur.requests, ...next.requests],
            opens: [...cur.opens, ...next.opens],
          };
        }
    return cur;
  }

  /** Stores a step: the run, the requests it asks for, what the page opens. */
  _apply(
    state: VbState,
    step: Step,
    patch: Partial<Core> = {},
    extra: Effect[] = [],
  ): Effect[] {
    const m = this._model(state);
    let run = step.run;
    const fx: Effect[] = [...extra];
    // a new page: its `load` events run
    if (state.tab === "preview" && run.page !== state.run.page) {
      const more = this._loadEvents(
        m,
        { run, requests: [], opens: [] },
        run.page,
        envOf(m),
      );
      run = more.run;
      step = {
        run,
        requests: [...step.requests, ...more.requests],
        opens: [...step.opens, ...more.opens],
      };
    }
    for (const r of step.requests) {
      if (m.mockOn && m.flow) {
        // the diagram is the backend: the request runs through it, against the
        // tables the preview has kept
        const a = callFlow(m.flow, run.db, {
          method: r.method,
          url: r.url,
          body: r.body,
          headers: r.headers,
        });
        const slots = run.slots.slice();
        const cur = slots[r.slot];
        if (cur)
          slots[r.slot] = {
            ...cur,
            answer: { status: a.status, data: a.data },
          };
        run = {
          ...run,
          slots,
          db: a.db,
          log: [
            ...run.log,
            `${r.method} ${r.url} -> ${a.status} (the diagram, ${a.delay} ms)`,
          ].slice(-40),
        };
        fx.push(
          time.setTimeout(
            `vb-mock-${r.slot}`,
            Math.min(a.delay, 1500),
            `mockDone${r.slot}`,
          ),
        );
      } else if (m.mockOn) {
        const res = routeMock(m.mocks, r.method, r.url);
        const slots = run.slots.slice();
        const cur = slots[r.slot];
        if (cur)
          slots[r.slot] = {
            ...cur,
            answer: { status: res.status, data: res.data },
          };
        run = { ...run, slots };
        fx.push(
          time.setTimeout(`vb-mock-${r.slot}`, res.delay, `mockDone${r.slot}`),
        );
      } else fx.push(this._httpFx(r, m.apiBase));
    }
    for (const url of step.opens) fx.push(local.open(url));
    if (run.notice && run.notice !== state.run.notice)
      fx.push(time.setTimeout("vb-notice", 3500, "noticeClear"));
    return this._commit(state, { ...patch, run }, fx);
  }

  _httpFx(r: HttpRequest, apiBase = ""): Effect {
    return http.request({
      id: `vb-req-${r.slot}`,
      url:
        apiBase && r.url.startsWith("/")
          ? apiBase.replace(/\/+$/, "") + r.url
          : r.url,
      method: r.method,
      headers: r.headers,
      body: r.body,
      onSuccess: `httpOk${r.slot}`,
      onError: `httpErr${r.slot}`,
    });
  }

  _answer(state: VbState, slot: number, a: Answer): Effect[] {
    if (state.tab !== "preview") return [];
    return this._apply(
      state,
      finish(state.run, slot, reply(a), envOf(this._model(state))),
    );
  }

  noticeClear(_msg: Message, state: VbState): Effect[] {
    return state.run.notice
      ? this._commit(state, { run: { ...state.run, notice: "" } })
      : [];
  }

  previewRestart(_msg: Message, state: VbState): Effect[] {
    return this._startPreview(state, {});
  }

  /** run the chain of an element's event */
  _fire(
    state: VbState,
    id: string,
    event: EventName,
    run: Run,
    extras: Record<string, unknown> = {},
  ): Effect[] {
    if (state.tab !== "preview") return [];
    const m = this._model(state);
    const f = findElement(m, id);
    if (!f) return [];
    return this._apply(state, fire(f.el, event, run, extras, envOf(m)));
  }

  _el(state: VbState, id: string): El | undefined {
    return findElement(this._model(state), id)?.el;
  }

  "e.onClick"(msg: Message, state: VbState): Effect[] {
    return this._fire(state, msg.payload as string, "click", state.run);
  }
  "e.onHover"(msg: Message, state: VbState): Effect[] {
    return this._fire(state, msg.payload as string, "hover", state.run);
  }
  "e.onFocus"(msg: Message, state: VbState): Effect[] {
    return this._fire(state, msg.payload as string, "focus", state.run);
  }
  "e.onBlur"(msg: Message, state: VbState): Effect[] {
    return this._fire(state, msg.payload as string, "blur", state.run);
  }

  "e.onInput"(msg: Message, state: VbState): Effect[] {
    const el = this._el(state, msg.payload as string);
    if (!el || state.tab !== "preview") return [];
    const value = msg.event?.value ?? "";
    const run = el.bind
      ? writeKey(state.run, envOf(this._model(state)), el.bind, value)
      : state.run;
    return this._fire(state, el.id, "input", run, { event: { value } });
  }

  "e.onChange"(msg: Message, state: VbState): Effect[] {
    const el = this._el(state, msg.payload as string);
    if (!el || state.tab !== "preview") return [];
    const env = envOf(this._model(state));
    const checked = msg.event?.checked ?? false;
    const value = msg.event?.value ?? "";
    const run = el.bind
      ? writeKey(
          state.run,
          env,
          el.bind,
          el.type === "checkbox" ? checked : value,
        )
      : state.run;
    return this._fire(state, el.id, "change", run, {
      event: { value, checked },
    });
  }

  "e.onKey"(msg: Message, state: VbState): Effect[] {
    if (msg.event?.key !== "Enter") return [];
    return this._fire(state, msg.payload as string, "enter", state.run, {
      event: { key: "Enter", value: msg.event.value ?? "" },
    });
  }

  /** a link: its click chain, then the navigation */
  "e.onLink"(msg: Message, state: VbState): Effect[] {
    const el = this._el(state, msg.payload as string);
    if (!el || state.tab !== "preview") return [];
    const m = this._model(state);
    const env = envOf(m);
    let step = fire(el, "click", state.run, {}, env);
    const page = m.pages.find((p) => p.id === el.props.page);
    const url = page ? page.slug : el.props.href;
    if (url) {
      const nav = execute([{ t: "navigate", url }], step.run, {}, env);
      step = {
        run: nav.run,
        requests: [...step.requests, ...nav.requests],
        opens: [...step.opens, ...nav.opens],
      };
    }
    return this._apply(state, step);
  }

  _rowOf(state: VbState, el: El, index: number): unknown {
    return listOf(el.props.source ?? "", scopeOf(state.run.data))[index];
  }

  /** a click on an item of a list or a card of a repeater, or a row of a table */
  "e.onItem"(msg: Message, state: VbState): Effect[] {
    const [id, index] = msg.payload as [string, number];
    const el = this._el(state, id);
    if (!el) return [];
    const item = this._rowOf(state, el, index);
    return this._fire(state, id, "click", state.run, {
      item,
      row: item,
      index,
    });
  }

  "e.onRemove"(msg: Message, state: VbState): Effect[] {
    const [id, index] = msg.payload as [string, number];
    const el = this._el(state, id);
    if (!el) return [];
    const item = this._rowOf(state, el, index);
    return this._fire(state, id, "remove", state.run, {
      item,
      row: item,
      index,
    });
  }

  "e.onRowAction"(msg: Message, state: VbState): Effect[] {
    const [id, index, action] = msg.payload as [string, number, string];
    const el = this._el(state, id);
    if (!el) return [];
    const row = this._rowOf(state, el, index);
    return this._fire(state, id, "rowAction", state.run, {
      row,
      item: row,
      index,
      action,
    });
  }

  _ui(state: VbState, id: string, patch: Partial<Run["ui"][string]>): Run {
    return {
      ...state.run,
      ui: { ...state.run.ui, [id]: { ...state.run.ui[id], ...patch } },
    };
  }

  "e.onSort"(msg: Message, state: VbState): Effect[] {
    const [id, col] = msg.payload as [string, string];
    const ui = state.run.ui[id];
    const dir = ui?.sort === col && ui.dir !== "desc" ? "desc" : "asc";
    return this._commit(state, {
      run: this._ui(state, id, { sort: col, dir, page: 0 }),
    });
  }

  /** a check box of a table: the row is checked or not; the rows checked are in `bind` */
  "e.onSelect"(msg: Message, state: VbState): Effect[] {
    const [id, index] = msg.payload as [string, number];
    const cur = new Set(state.run.ui[id]?.sel ?? []);
    if (cur.has(index)) cur.delete(index);
    else cur.add(index);
    return this._selected(
      state,
      id,
      [...cur].sort((a, b) => a - b),
    );
  }

  /** the check box of the header: every row that is shown, or none */
  "e.onSelectAll"(msg: Message, state: VbState): Effect[] {
    const id = String(msg.payload);
    const el = this._el(state, id);
    if (!el) return [];
    const shown = state.stage.sections
      .flatMap((s) => s.items)
      .find((i) => i.id === id)
      ?.rows.map((r) => r.index);
    const cur = new Set(state.run.ui[id]?.sel ?? []);
    const every = !!shown?.length && shown.every((i) => cur.has(i));
    for (const i of shown ?? []) every ? cur.delete(i) : cur.add(i);
    return this._selected(
      state,
      id,
      [...cur].sort((a, b) => a - b),
    );
  }

  /** the rows that are checked, and the key of the table that holds them (the rows themselves) */
  _selected(state: VbState, id: string, sel: number[]): Effect[] {
    const el = this._el(state, id);
    let run = this._ui(state, id, { sel });
    if (el?.bind) {
      const rows = listOf(
        el.props.source ?? "",
        scopeOf(run.data, { location: run.location }),
      );
      run = {
        ...run,
        data: setPath(
          run.data,
          el.bind,
          sel.filter((i) => i < rows.length).map((i) => rows[i]),
        ),
      };
    }
    return this._commit(state, { run });
  }

  "e.onPage"(msg: Message, state: VbState): Effect[] {
    const [id, by] = msg.payload as [string, number];
    const page = Math.max(0, (state.run.ui[id]?.page ?? 0) + by);
    return this._commit(state, { run: this._ui(state, id, { page }) });
  }

  "e.onSearch"(msg: Message, state: VbState): Effect[] {
    return this._commit(state, {
      run: this._ui(state, msg.payload as string, {
        q: msg.event?.value ?? "",
        page: 0,
      }),
    });
  }

  /** a tab was clicked, or an accordion title (it toggles) */
  "e.onTab"(msg: Message, state: VbState): Effect[] {
    const [id, label] = msg.payload as [string, string];
    const el = this._el(state, id);
    if (!el || state.tab !== "preview") return [];
    const cur = el.bind ? getPath(state.run.data, el.bind) : undefined;
    const value = el.type === "accordion" && cur === label ? "" : label;
    const run = el.bind
      ? { ...state.run, data: setPath(state.run.data, el.bind, value) }
      : state.run;
    return this._fire(state, id, "change", run, { value, event: { value } });
  }

  "e.onClose"(msg: Message, state: VbState): Effect[] {
    const el = this._el(state, msg.payload as string);
    if (!el || state.tab !== "preview") return [];
    const run = el.bind
      ? { ...state.run, data: setPath(state.run.data, el.bind, false) }
      : state.run;
    return this._fire(state, el.id, "close", run);
  }

  "e.onField"(msg: Message, state: VbState): Effect[] {
    const [id, name, kind] = msg.payload as [string, string, string];
    const el = this._el(state, id);
    if (!el || state.tab !== "preview") return [];
    const value =
      kind === "check"
        ? (msg.event?.checked ?? false)
        : (msg.event?.value ?? "");
    const f = el.fields.find((x) => x.name === name);
    const typed =
      f?.type === "number" && value !== "" ? coerce("number", value) : value;
    return this._fire(
      state,
      id,
      "input",
      formInput(el, state.run, name, typed),
      { field: name, value: typed, event: { value: typed } },
    );
  }

  "e.onSubmit"(msg: Message, state: VbState): Effect[] {
    const el = this._el(state, msg.payload as string);
    if (!el || state.tab !== "preview") return [];
    return this._apply(
      state,
      formSubmit(el, state.run, envOf(this._model(state))),
    );
  }
}

export const page = new VisualBuilder();
