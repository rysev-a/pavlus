// What the canvas and the preview show: for every element of the current page
// a flat "view" (strings and flags, nothing to compute in the template),
// worked out from the model, the device, and the state (the initial values on
// the Design tab, the live ones in Preview). Pure.
import {
  type Scope,
  evalExpr,
  fill,
  getPath,
  listOf,
  scopeOf,
  toText,
  truthy,
} from "./bind.ts";
import { chartPoints, chartSummary } from "./charts.ts";
import { type Layout, layoutOf, sectionRows } from "./grid.ts";
import {
  type Bp,
  COLS,
  type El,
  type Model,
  type Page,
  type Section,
  ROW_PX,
} from "./model.ts";
import type { UiState } from "./actions.ts";

export interface Cell {
  k: string;
  text: string;
}
export interface ColumnView {
  k: string;
  label: string;
  sort: string;
}
export interface RowView {
  k: string;
  index: number;
  cells: Cell[];
}
export interface FieldInput {
  k: string;
  name: string;
  label: string;
  value: string;
  checked: boolean;
  error: string;
  invalid: string | null;
  isText: boolean;
  isArea: boolean;
  isSelect: boolean;
  isCheck: boolean;
  inputType: string;
  options: { k: string; label: string; selected: boolean }[];
}

/** everything one element needs to be drawn (the template switches on `kind`) */
export interface ElView {
  id: string;
  kind: string;
  /** grid placement */
  style: string;
  selected: boolean;
  ghost: boolean;
  /** drawn on the Design tab: a modal shows inline, controls are inert */
  design: boolean;
  tone: string;
  radius: string;
  size: string;
  align: string;
  weight: string;
  label: string;
  text: string;
  title: string;
  placeholder: string;
  inputType: string;
  variant: string;
  h1: boolean;
  h2: boolean;
  h3: boolean;
  value: string;
  checked: boolean;
  disabled: boolean;
  src: string;
  hasSrc: boolean;
  alt: string;
  href: string;
  percent: number;
  percentText: string;
  options: { k: string; label: string; selected: boolean }[];
  // list, repeater
  items: {
    k: string;
    index: number;
    title: string;
    text: string;
    footer: string;
  }[];
  removable: boolean;
  empty: string;
  isEmpty: boolean;
  // table
  columns: ColumnView[];
  rows: RowView[];
  rowActions: string[];
  hasActions: boolean;
  searchBox: boolean;
  q: string;
  paged: boolean;
  pageNo: number;
  pages: number;
  total: number;
  prevOff: boolean;
  nextOff: boolean;
  // kpi
  delta: string;
  // chart
  chartId: string;
  summary: string;
  chartKind: string;
  // tabs, accordion
  tabs: { k: string; label: string; active: boolean; panel: string }[];
  panel: string;
  open: boolean;
  closeLabel: string;
  // form
  fields: FieldInput[];
  submitLabel: string;
  formError: string;
  sent: boolean;
  okText: string;
}

export interface DropCell {
  k: string;
  x: number;
  y: number;
  style: string;
  label: string;
}

export interface SectionView {
  id: string;
  name: string;
  kind: string;
  bg: string;
  pad: string;
  selected: boolean;
  first: boolean;
  last: boolean;
  rows: number;
  gridStyle: string;
  items: ElView[];
  drops: DropCell[];
  empty: boolean;
}

export interface StageView {
  sections: SectionView[];
  empty: boolean;
  /** the charts to (re)draw: element id, kind, points */
  charts: { id: string; domId: string; kind: string }[];
}

export interface StageIn {
  model: Model;
  page: Page | undefined;
  bp: Bp;
  mode: "design" | "preview";
  data: Record<string, unknown>;
  ui: Record<string, UiState>;
  selected: string;
  selectedSection: string;
  /** show the drop cells (a drag is going on) */
  dragging: boolean;
  location: string;
}

const csv = (s: string): string[] =>
  s
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);

const num = (x: unknown): number => {
  const n = typeof x === "number" ? x : parseFloat(String(x));
  return Number.isFinite(n) ? n : 0;
};

const gridArea = (r: { x: number; y: number; w: number; h: number }): string =>
  `grid-column: ${r.x + 1} / span ${r.w}; grid-row: ${r.y + 1} / span ${r.h}`;

export const chartDomId = (id: string): string => `vb-chart-${id}`;

function blank(el: El): ElView {
  const s = el.style;
  return {
    id: el.id,
    kind: el.type,
    style: "",
    selected: false,
    ghost: false,
    design: false,
    tone: s.tone ?? "",
    radius: s.radius ?? "",
    size: s.size ?? "",
    align: s.align ?? "",
    weight: s.weight ?? "",
    label: "",
    text: "",
    title: "",
    placeholder: "",
    inputType: "text",
    variant: "default",
    h1: false,
    h2: false,
    h3: false,
    value: "",
    checked: false,
    disabled: false,
    src: "",
    hasSrc: false,
    alt: "",
    href: "",
    percent: 0,
    percentText: "0%",
    options: [],
    items: [],
    removable: false,
    empty: "",
    isEmpty: false,
    columns: [],
    rows: [],
    rowActions: [],
    hasActions: false,
    searchBox: false,
    q: "",
    paged: false,
    pageNo: 1,
    pages: 1,
    total: 0,
    prevOff: true,
    nextOff: true,
    delta: "",
    chartId: "",
    summary: "",
    chartKind: "",
    tabs: [],
    panel: "",
    open: false,
    closeLabel: "",
    fields: [],
    submitLabel: "",
    formError: "",
    sent: false,
    okText: "",
  };
}

const optionList = (labels: string[], value: string) =>
  labels.map((l, i) => ({ k: `${i}`, label: l, selected: l === value }));

function tableView(
  el: El,
  v: ElView,
  scope: Scope,
  ui: UiState | undefined,
): void {
  const p = el.props;
  const all = listOf(p.source ?? "", scope);
  let entries = all.map((row, index) => ({ row, index }));
  if (p.filter?.trim())
    entries = entries.filter((e) =>
      truthy(p.filter, { ...scope, row: e.row, index: e.index }, true),
    );
  const cols = csv(p.columns ?? "");
  const first = all.find((r) => r && typeof r === "object") as
    | Record<string, unknown>
    | undefined;
  const names = cols.length ? cols : first ? Object.keys(first) : [];
  const q = (ui?.q ?? "").toLowerCase();
  v.searchBox = p.search === "yes";
  v.q = ui?.q ?? "";
  if (q)
    entries = entries.filter((e) =>
      names.some((c) => toText(getPath(e.row, c)).toLowerCase().includes(q)),
    );
  if (ui?.sort) {
    const col = ui.sort;
    const dir = ui.dir === "desc" ? -1 : 1;
    entries = [...entries].sort((a, b) => {
      const x = getPath(a.row, col);
      const y = getPath(b.row, col);
      return (
        (typeof x === "number" && typeof y === "number"
          ? x - y
          : toText(x).localeCompare(toText(y))) * dir
      );
    });
  }
  v.total = entries.length;
  const size = Math.max(0, Math.floor(num(p.pageSize)));
  v.paged = size > 0 && entries.length > size;
  v.pages = size > 0 ? Math.max(1, Math.ceil(entries.length / size)) : 1;
  v.pageNo = Math.min(Math.max(1, (ui?.page ?? 0) + 1), v.pages);
  if (size > 0) entries = entries.slice((v.pageNo - 1) * size, v.pageNo * size);
  v.prevOff = v.pageNo <= 1;
  v.nextOff = v.pageNo >= v.pages;
  v.columns = names.map((c) => ({
    k: c,
    label: c,
    sort:
      ui?.sort === c
        ? ui.dir === "desc"
          ? "descending"
          : "ascending"
        : "none",
  }));
  v.rowActions = csv(p.rowActions ?? "");
  v.hasActions = v.rowActions.length > 0;
  v.rows = entries.map((e) => ({
    k: `r${e.index}`,
    index: e.index,
    cells: names.map((c) => ({ k: c, text: toText(getPath(e.row, c)) })),
  }));
  v.empty = fill(p.empty ?? "", scope);
  v.isEmpty = entries.length === 0;
}

/** The view of one element; null when it is not visible in Preview. */
export function elView(
  el: El,
  r: { x: number; y: number; w: number; h: number },
  inp: StageIn,
): ElView | null {
  const scope = scopeOf(inp.data, { location: inp.location });
  const shown = truthy(el.visible, scope, true);
  if (!shown && inp.mode === "preview") return null;
  const v = blank(el);
  const p = el.props;
  const f = (k: string): string => fill(p[k] ?? "", scope);
  const ui = inp.ui[el.id];
  v.style = gridArea(r);
  v.selected = el.id === inp.selected;
  v.ghost = !shown;
  v.design = inp.mode === "design";
  const bound = el.bind ? getPath(inp.data, el.bind) : undefined;
  switch (el.type) {
    case "heading":
      v.text = f("text");
      v.h1 = p.level === "1";
      v.h2 = p.level === "2" || !["1", "3"].includes(p.level);
      v.h3 = p.level === "3";
      break;
    case "text":
      v.text = f("text");
      break;
    case "button":
      v.text = f("text");
      v.variant = p.variant || "default";
      v.disabled = p.disabled?.trim()
        ? truthy(p.disabled, scope, false)
        : false;
      break;
    case "link": {
      v.text = f("text");
      const page = inp.model.pages.find((x) => x.id === p.page);
      v.href = page ? page.slug : f("href");
      break;
    }
    case "image":
      v.src = f("src");
      v.hasSrc = v.src.trim() !== "";
      v.alt = f("alt");
      break;
    case "badge":
      v.text = f("text");
      v.variant = p.variant || "default";
      break;
    case "progress": {
      v.label = f("label");
      const r2 = evalExpr(p.value ?? "", scope);
      const n = Math.min(100, Math.max(0, r2.ok ? num(r2.value) : 0));
      v.percent = n;
      v.percentText = `${Math.round(n)}%`;
      break;
    }
    case "card":
      v.title = f("title");
      v.text = f("text");
      break;
    case "kpi":
      v.label = f("label");
      v.text = f("value");
      v.delta = f("delta");
      break;
    case "input":
    case "textarea":
      v.label = f("label");
      v.placeholder = f("placeholder");
      v.inputType = p.type || "text";
      v.value = bound === undefined || bound === null ? "" : toText(bound);
      break;
    case "select": {
      v.label = f("label");
      v.value = bound === undefined || bound === null ? "" : toText(bound);
      v.options = optionList(csv(f("options")), v.value);
      break;
    }
    case "checkbox":
      v.label = f("label");
      v.checked = bound === true || bound === "true";
      break;
    case "list": {
      const items = listOf(p.source ?? "", scope);
      v.items = items.map((item, index) => ({
        k: `i${index}`,
        index,
        title: fill(p.itemText || "{item}", { ...scope, item, index }),
        text: "",
        footer: "",
      }));
      v.removable = p.removable === "yes";
      v.empty = f("empty");
      v.isEmpty = items.length === 0;
      break;
    }
    case "repeater": {
      const items = listOf(p.source ?? "", scope);
      v.items = items.map((item, index) => {
        const sc = { ...scope, item, index };
        return {
          k: `i${index}`,
          index,
          title: fill(p.title ?? "", sc),
          text: fill(p.text ?? "", sc),
          footer: fill(p.footer ?? "", sc),
        };
      });
      v.isEmpty = items.length === 0;
      v.empty = "No items.";
      break;
    }
    case "table":
      tableView(el, v, scope, ui);
      break;
    case "chart": {
      v.title = f("title");
      v.chartId = chartDomId(el.id);
      v.chartKind = p.kind || "bar";
      v.summary = chartSummary(chartPoints(el, scope));
      break;
    }
    case "tabs": {
      const labels = csv(f("tabs"));
      const panels = (p.panels ?? "")
        .split("|")
        .map((x) => fill(x.trim(), scope));
      const current =
        bound === undefined || bound === null || bound === ""
          ? labels[0]
          : toText(bound);
      v.tabs = labels.map((l, i) => ({
        k: `${i}`,
        label: l,
        active: l === current,
        panel: panels[i] ?? "",
      }));
      v.panel = v.tabs.find((t) => t.active)?.panel ?? "";
      break;
    }
    case "accordion": {
      const titles = csv(f("titles"));
      const panels = (p.panels ?? "")
        .split("|")
        .map((x) => fill(x.trim(), scope));
      const current =
        bound === undefined || bound === null ? "" : toText(bound);
      v.tabs = titles.map((l, i) => ({
        k: `${i}`,
        label: l,
        active: l === current,
        panel: panels[i] ?? "",
      }));
      break;
    }
    case "modal":
      v.title = f("title");
      v.text = f("text");
      v.closeLabel = f("closeLabel") || "Close";
      v.open = bound === true || bound === "true";
      break;
    case "form": {
      v.title = f("title");
      v.submitLabel = f("submitLabel") || "Send";
      const values = (
        bound && typeof bound === "object" ? bound : {}
      ) as Record<string, unknown>;
      const errors = ui?.errors ?? {};
      v.sent = !!ui?.sent;
      v.formError = Object.keys(errors).length
        ? `${Object.keys(errors).length} field(s) need attention`
        : "";
      v.fields = el.fields.map((fd, i) => {
        const val = values[fd.name];
        const err = errors[fd.name] ?? "";
        return {
          k: `${i}`,
          name: fd.name,
          label: fd.label + (fd.required === "yes" ? " *" : ""),
          value: val === undefined || val === null ? "" : toText(val),
          checked: val === true,
          error: err,
          invalid: err ? "true" : null,
          isText: !["textarea", "select", "checkbox"].includes(fd.type),
          isArea: fd.type === "textarea",
          isSelect: fd.type === "select",
          isCheck: fd.type === "checkbox",
          inputType:
            fd.type === "select" ||
            fd.type === "textarea" ||
            fd.type === "checkbox"
              ? "text"
              : fd.type,
          options: optionList(
            csv(fd.options),
            val === undefined ? "" : toText(val),
          ),
        };
      });
      break;
    }
  }
  return v;
}

function dropCells(section: Section, rows: number): DropCell[] {
  const out: DropCell[] = [];
  for (let y = 0; y < rows; y++)
    for (let x = 0; x < COLS; x++)
      out.push({
        k: `${x}-${y}`,
        x,
        y,
        style: `grid-column: ${x + 1}; grid-row: ${y + 1}`,
        label: `Column ${x + 1}, row ${y + 1} of ${section.name}`,
      });
  return out;
}

export function stageOf(inp: StageIn): StageView {
  const page = inp.page;
  const charts: StageView["charts"] = [];
  const sections: SectionView[] = (page?.sections ?? []).map((s, i, all) => {
    const layout: Layout = layoutOf(s, inp.bp);
    const items: ElView[] = [];
    for (const el of s.elements) {
      const r = layout[el.id];
      if (!r) continue;
      const v = elView(el, r, inp);
      if (!v) continue;
      items.push(v);
      if (el.type === "chart")
        charts.push({ id: el.id, domId: v.chartId, kind: v.chartKind });
    }
    const rows = sectionRows(s, inp.bp);
    return {
      id: s.id,
      name: s.name,
      kind: s.kind,
      bg: s.bg,
      pad: s.pad,
      selected: s.id === inp.selectedSection,
      first: i === 0,
      last: i === all.length - 1,
      rows,
      gridStyle: `grid-template-rows: repeat(${inp.mode === "design" ? rows + 1 : rows}, ${ROW_PX}px)`,
      items,
      drops:
        inp.mode === "design" && inp.dragging ? dropCells(s, rows + 1) : [],
      empty: items.length === 0,
    };
  });
  return { sections, empty: sections.length === 0, charts };
}
