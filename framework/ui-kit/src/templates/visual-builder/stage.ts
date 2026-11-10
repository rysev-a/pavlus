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
  /** shown as a pill (a status), or to the right (a number) */
  pill: boolean;
  right: boolean;
  /** style: "text-align: right" | null */
  rightStyle: string | null;
}
export interface ColumnView {
  k: string;
  label: string;
  sort: string;
  /** nothing sorts by it now (its arrows are faint) */
  idle: boolean;
  right: boolean;
  /** style: "text-align: right" | null */
  rightStyle: string | null;
}
export interface RowView {
  k: string;
  index: number;
  checked: boolean;
  /** data-selected, "true" | null */
  selAttr: string | null;
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
  /** data-invalid, "true" | null */
  invalidAttr: string | null;
  /** the placeholder of a select, with a fallback */
  selectLabel: string;
  isText: boolean;
  isArea: boolean;
  isSelect: boolean;
  isCheck: boolean;
  isSwitch: boolean;
  isRadio: boolean;
  inputType: string;
  placeholder: string;
  description: string;
  /** the id of the control, for its label */
  fid: string;
  options: { k: string; label: string; selected: boolean }[];
}

/** everything one element needs to be drawn (the template switches on `kind`) */
export interface ElView {
  id: string;
  /** which kind it is: the template branches on these, not on === */
  isHeading: boolean;
  isText: boolean;
  isButton: boolean;
  isLink: boolean;
  isImage: boolean;
  isBadge: boolean;
  isProgress: boolean;
  isCard: boolean;
  isKpi: boolean;
  isInput: boolean;
  isTextarea: boolean;
  isSelect: boolean;
  isCheckbox: boolean;
  isList: boolean;
  isRepeater: boolean;
  isTable: boolean;
  isChart: boolean;
  isTabs: boolean;
  isAccordion: boolean;
  isModal: boolean;
  isForm: boolean;
  kind: string;
  /** grid placement */
  style: string;
  selected: boolean;
  /** data-sel, "true" | null */
  selAttr: string | null;
  /** aria-pressed, "true" | "false" */
  pressed: string;
  ghost: boolean;
  /** data-ghost, "true" | null */
  ghostAttr: string | null;
  /** drawn on the Design tab: a modal shows inline, controls are inert */
  design: boolean;
  /** data-inline of a modal, "true" | null */
  inlineAttr: string | null;
  tone: string;
  radius: string;
  size: string;
  align: string;
  weight: string;
  /** data-tone / data-radius / data-size / data-align / data-weight: the value, or null when empty */
  toneAttr: string | null;
  radiusAttr: string | null;
  sizeAttr: string | null;
  alignAttr: string | null;
  weightAttr: string | null;
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
  rowActions: { k: string; label: string; destructive: boolean }[];
  hasActions: boolean;
  /** a table with a check box on each row */
  selectable: boolean;
  allChecked: boolean;
  checkedCount: number;
  /** the columns the table has, with the check box and the actions */
  span: number;
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
  tabs: {
    k: string;
    label: string;
    active: boolean;
    /** aria-selected / aria-expanded, "true" | "false" */
    sel: string;
    expanded: string;
    panel: string;
  }[];
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
  /** what the pointer reports when it is over this cell: `section|x|y` */
  drop: string;
}

export interface SectionView {
  id: string;
  name: string;
  kind: string;
  bg: string;
  pad: string;
  selected: boolean;
  /** data-sel, "true" | null */
  selAttr: string | null;
  first: boolean;
  last: boolean;
  rows: number;
  gridStyle: string;
  items: ElView[];
  drops: DropCell[];
  /** the place where what is dragged would land, in this section */
  ghost: { style: string } | null;
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
  /** where the drag would land (a rectangle of the grid of one section) */
  ghost?: {
    section: string;
    x: number;
    y: number;
    w: number;
    h: number;
  } | null;
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
  const kinds: Record<string, boolean> = {};
  for (const k of [
    "heading",
    "text",
    "button",
    "link",
    "image",
    "badge",
    "progress",
    "card",
    "kpi",
    "input",
    "textarea",
    "select",
    "checkbox",
    "list",
    "repeater",
    "table",
    "chart",
    "tabs",
    "accordion",
    "modal",
    "form",
  ])
    kinds[k] = el.type === k;
  return {
    id: el.id,
    isHeading: kinds.heading,
    isText: kinds.text,
    isButton: kinds.button,
    isLink: kinds.link,
    isImage: kinds.image,
    isBadge: kinds.badge,
    isProgress: kinds.progress,
    isCard: kinds.card,
    isKpi: kinds.kpi,
    isInput: kinds.input,
    isTextarea: kinds.textarea,
    isSelect: kinds.select,
    isCheckbox: kinds.checkbox,
    isList: kinds.list,
    isRepeater: kinds.repeater,
    isTable: kinds.table,
    isChart: kinds.chart,
    isTabs: kinds.tabs,
    isAccordion: kinds.accordion,
    isModal: kinds.modal,
    isForm: kinds.form,
    kind: el.type,
    style: "",
    selected: false,
    selAttr: null,
    pressed: "false",
    ghost: false,
    ghostAttr: null,
    design: false,
    inlineAttr: null,
    toneAttr: s.tone ? s.tone : null,
    radiusAttr: s.radius ? s.radius : null,
    sizeAttr: s.size ? s.size : null,
    alignAttr: s.align ? s.align : null,
    weightAttr: s.weight ? s.weight : null,
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
    selectable: false,
    allChecked: false,
    checkedCount: 0,
    span: 1,
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

/**
 * A column of a table, from the text of `columns`: `name`, `name:Full name` (a header),
 * `amount|number` (to the right), `status|pill` (a pill), `joined|date`.
 */
export interface ColumnSpec {
  key: string;
  label: string;
  kind: "text" | "number" | "pill" | "date";
}
export function columnsOf(text: string): ColumnSpec[] {
  return csv(text).map((c) => {
    const [head, kind = ""] = c.split("|").map((x) => x.trim());
    const [key, ...label] = head.split(":");
    const k = key.trim();
    return {
      key: k,
      label: label.join(":").trim() || k,
      kind:
        (["number", "pill", "date"] as const).find((x) => x === kind) ?? "text",
    };
  });
}

const shown = (v: unknown, kind: ColumnSpec["kind"]): string => {
  if (kind === "date") {
    const d = new Date(String(v ?? ""));
    return Number.isNaN(d.getTime()) ? toText(v) : d.toISOString().slice(0, 10);
  }
  return toText(v);
};

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
  const specs = columnsOf(p.columns ?? "");
  const first = all.find((r) => r && typeof r === "object") as
    | Record<string, unknown>
    | undefined;
  const cols: ColumnSpec[] = specs.length
    ? specs
    : first
      ? Object.keys(first).map((key) => ({
          key,
          label: key,
          kind: "text" as const,
        }))
      : [];
  const names = cols.map((c) => c.key);
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
  v.columns = cols.map((c) => ({
    k: c.key,
    label: c.label,
    sort:
      ui?.sort === c.key
        ? ui.dir === "desc"
          ? "descending"
          : "ascending"
        : "none",
    idle: ui?.sort !== c.key,
    right: c.kind === "number",
    rightStyle: c.kind === "number" ? "text-align: right" : null,
  }));
  v.rowActions = csv(p.rowActions ?? "").map((label, i) => ({
    k: `${i}`,
    label,
    destructive: label === "Delete" || label === "Remove",
  }));
  v.hasActions = v.rowActions.length > 0;
  v.selectable = p.select === "yes";
  const checked = new Set(ui?.sel ?? []);
  v.checkedCount = [...checked].filter((i) => i < all.length).length;
  v.allChecked =
    entries.length > 0 && entries.every((e) => checked.has(e.index));
  v.span = cols.length + (v.selectable ? 1 : 0) + (v.hasActions ? 1 : 0);
  v.rows = entries.map((e) => ({
    k: `r${e.index}`,
    index: e.index,
    checked: checked.has(e.index),
    selAttr: checked.has(e.index) ? "true" : null,
    cells: cols.map((c) => ({
      k: c.key,
      text: shown(getPath(e.row, c.key), c.kind),
      pill: c.kind === "pill",
      right: c.kind === "number",
      rightStyle: c.kind === "number" ? "text-align: right" : null,
    })),
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
  v.selAttr = el.id === inp.selected ? "true" : null;
  v.pressed = el.id === inp.selected ? "true" : "false";
  v.ghost = !shown;
  v.ghostAttr = !shown ? "true" : null;
  v.design = inp.mode === "design";
  v.inlineAttr = inp.mode === "design" ? "true" : null;
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
        sel: l === current ? "true" : "false",
        expanded: l === current ? "true" : "false",
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
        sel: l === current ? "true" : "false",
        expanded: l === current ? "true" : "false",
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
          invalidAttr: err ? "true" : null,
          selectLabel: fd.placeholder || "Select...",
          isText: ![
            "textarea",
            "select",
            "checkbox",
            "switch",
            "radio",
          ].includes(fd.type),
          isArea: fd.type === "textarea",
          isSelect: fd.type === "select",
          isCheck: fd.type === "checkbox",
          isSwitch: fd.type === "switch",
          isRadio: fd.type === "radio",
          inputType: [
            "select",
            "textarea",
            "checkbox",
            "switch",
            "radio",
          ].includes(fd.type)
            ? "text"
            : fd.type,
          placeholder: fd.placeholder ?? "",
          description: fd.description ?? "",
          fid: `${el.id}-${fd.name}`,
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
        drop: `${section.id}|${x}|${y}`,
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
      selAttr: s.id === inp.selectedSection ? "true" : null,
      first: i === 0,
      last: i === all.length - 1,
      rows,
      gridStyle: `grid-template-rows: repeat(${inp.mode === "design" ? rows + 1 : rows}, ${ROW_PX}px)`,
      items,
      drops:
        inp.mode === "design" && inp.dragging ? dropCells(s, rows + 1) : [],
      ghost:
        inp.mode === "design" && inp.ghost && inp.ghost.section === s.id
          ? {
              style: `grid-column: ${inp.ghost.x + 1} / span ${inp.ghost.w}; grid-row: ${inp.ghost.y + 1} / span ${Math.max(1, Math.min(inp.ghost.h, rows + 1 - inp.ghost.y))}`,
            }
          : null,
      empty: items.length === 0,
    };
  });
  return { sections, empty: sections.length === 0, charts };
}
