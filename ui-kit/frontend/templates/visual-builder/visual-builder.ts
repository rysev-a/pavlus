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
import {
  Component,
  type Effect,
  type Message,
} from "@service-laboratory/pavlus";
import {
  httpEffector as http,
  storeEffector as store,
  svgEffector as svg,
  timeEffector as time,
} from "@service-laboratory/pavlus/plugins";
import { filesEffector, type Picked } from "../../files.ts";
import { type KeyPayload, localEffector as local } from "../../local.ts";
import {
  type HttpRequest,
  type Run,
  type Step,
  SLOTS,
  envOf,
  execute,
  fire,
  finish,
  formInput,
  formSubmit,
  startRun,
  writeKey,
  type Answer,
} from "./actions.ts";
import {
  coerce,
  getPath,
  initialData,
  listOf,
  scopeOf,
  setPath,
} from "./bind.ts";
import {
  addSectionTo,
  deleteSection,
  duplicateSection,
  mapPage,
  moveSection,
  newPage,
  deletePage,
} from "./pages.ts";
import { chartPoints } from "./charts.ts";
import { chartTree } from "./charts.ts";
import {
  type DiagramUi,
  addLink,
  buildGraph,
  countActions,
  diagramTree,
  layoutGraph,
  removeEdge,
} from "./diagram.ts";
import { DEMOS, demoOf } from "./demos.ts";
import { generatedText } from "./codegen.ts";
import { addElement, layoutOf, moveTo, nudge, resizeTo } from "./grid.ts";
import {
  type History,
  canRedo,
  canUndo,
  commit,
  redo,
  start,
  undo,
} from "./history.ts";
import {
  type FieldView,
  type InspectorView,
  ACTION_TYPES,
  addAction,
  applyEdit,
  deleteAction,
  inspectorOf,
  keyFields,
  mockFields,
  shiftAction,
} from "./inspector.ts";
import { parseProject, projectText } from "./io.ts";
import { routeMock } from "./mock.ts";
import {
  type Bp,
  type El,
  ELEMENTS,
  EL_TYPES,
  type ElType,
  type EventName,
  type Model,
  SECTION_LABEL,
  type SectionKind,
  allElements,
  duplicateElement,
  emptyModel,
  findElement,
  findSection,
  makeElement,
  newId,
  removeElement,
} from "./model.ts";
import { type StageView, stageOf } from "./stage.ts";
import { makeSection } from "./sections.ts";
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

export type Drag =
  | { kind: "palette"; type: ElType }
  | { kind: "move"; id: string }
  | { kind: "resize"; id: string }
  | { kind: "section"; section: SectionKind };

export interface DiagramState {
  collapsed: Record<string, boolean>;
  hover: string;
  selNode: string;
  selEdge: string;
  armed: string;
}

export interface Sheet {
  open: "" | "import" | "code" | "demos";
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
          dragging: c.drag !== null,
          location: c.run.location,
        });
  const elements = allElements(model);
  const edge = c.dg.selEdge
    ? buildGraph(model).edges.find((e) => e.id === c.dg.selEdge)
    : undefined;
  return {
    model,
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
    mockHint: model.mockOn
      ? "Requests are answered by these routes, no network."
      : "The mock server is off: requests go to the real network.",
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

  dragPalette(msg: Message): Effect[] {
    return [
      time.setTimeout("vb-drag", 0, "dragBegin", {
        kind: "palette",
        type: msg.payload,
      }),
    ];
  }
  dragEl(msg: Message): Effect[] {
    return [
      time.setTimeout("vb-drag", 0, "dragBegin", {
        kind: "move",
        id: msg.payload,
      }),
    ];
  }
  dragResize(msg: Message): Effect[] {
    return [
      time.setTimeout("vb-drag", 0, "dragBegin", {
        kind: "resize",
        id: msg.payload,
      }),
    ];
  }
  dragSection(msg: Message): Effect[] {
    return [
      time.setTimeout("vb-drag", 0, "dragBegin", {
        kind: "section",
        section: msg.payload,
      }),
    ];
  }
  /** the drag state is set after the browser started the drag (changing the DOM inside `dragstart` can cancel it) */
  dragBegin(msg: Message, state: VbState): Effect[] {
    return this._commit(state, { drag: msg.payload as Drag });
  }
  dragEnd(_msg: Message, state: VbState): Effect[] {
    return state.drag ? this._commit(state, { drag: null }) : [];
  }
  over(): Effect[] {
    return [];
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
      if (m.mockOn) {
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
      } else fx.push(this._httpFx(r));
    }
    for (const url of step.opens) fx.push(local.open(url));
    if (run.notice && run.notice !== state.run.notice)
      fx.push(time.setTimeout("vb-notice", 3500, "noticeClear"));
    return this._commit(state, { ...patch, run }, fx);
  }

  _httpFx(r: HttpRequest): Effect {
    return http.request({
      id: `vb-req-${r.slot}`,
      url: r.url,
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
