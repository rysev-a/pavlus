// The model of a Visual Builder project: pages -> sections -> elements, the
// state keys the elements subscribe to, the events and action chains, and the
// mock routes. Plain JSON-able data (it is saved, exported and undone as one
// value). Everything here is pure; the other files work on this shape.

import type { Model as FlowModel } from "../flow-studio/model.ts";

export const COLS = 12;
/** the height of one grid row, in px (the CSS uses the same number) */
export const ROW_PX = 40;

export type Bp = "desktop" | "tablet" | "mobile";
export const BPS: Bp[] = ["desktop", "tablet", "mobile"];
/** the width of the page frame per device (desktop fills the canvas) */
export const BP_WIDTH: Record<Bp, number> = {
  desktop: 1040,
  tablet: 768,
  mobile: 390,
};

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type ElType =
  | "heading"
  | "text"
  | "button"
  | "input"
  | "textarea"
  | "select"
  | "checkbox"
  | "image"
  | "badge"
  | "progress"
  | "card"
  | "list"
  | "table"
  | "link"
  | "form"
  | "kpi"
  | "chart"
  | "tabs"
  | "accordion"
  | "modal"
  | "repeater";

export type EventName =
  | "click"
  | "hover"
  | "input"
  | "change"
  | "focus"
  | "blur"
  | "enter"
  | "submit"
  | "invalid"
  | "remove"
  | "rowAction"
  | "close"
  | "load";

export const EVENT_LABEL: Record<EventName, string> = {
  click: "click",
  hover: "hover (mouseenter)",
  input: "input",
  change: "change",
  focus: "focus",
  blur: "blur",
  enter: "enter key",
  submit: "submit (valid)",
  invalid: "invalid submit",
  remove: "remove item",
  rowAction: "row action",
  close: "close",
  load: "page load / preview start",
};

// ---- actions ----

export type ActionType =
  | "set"
  | "toggle"
  | "push"
  | "remove"
  | "http"
  | "navigate"
  | "notice";

export interface Action {
  t: ActionType;
  /** state key or path (`user.name`) */
  key?: string;
  /** an expression: the value to set / push */
  value?: string;
  /** remove: an expression, the index (or the item) to remove */
  index?: string;
  /** navigate: a URL or `/page-slug`; notice: the text (both interpolated) */
  url?: string;
  text?: string;
  // http
  method?: string;
  headers?: string;
  /** an expression */
  body?: string;
  /** the key that receives the response (or `okPath` of it) */
  okKey?: string;
  okPath?: string;
  errKey?: string;
  loadingKey?: string;
  /** runs after a successful answer / after a failure */
  then?: Action[];
  catch?: Action[];
}

export const ACTION_LABEL: Record<ActionType, string> = {
  set: "Set state key",
  toggle: "Toggle boolean",
  push: "Push onto array",
  remove: "Remove from array",
  http: "HTTP request",
  navigate: "Navigate",
  notice: "Show notice",
};

// ---- state keys and mocks ----

export type KeyType = "string" | "number" | "boolean" | "json";
export interface StateKey {
  key: string;
  type: KeyType;
  /** the initial value as text (JSON for `json`) */
  initial: string;
}

export interface MockRoute {
  id: string;
  method: string;
  path: string;
  status: number;
  /** a JSON text; "$param:id" and "$query:q" are replaced by the request's */
  body: string;
  delay: number;
}

// ---- elements ----

export interface FormField {
  name: string;
  label: string;
  type:
    | "text"
    | "email"
    | "number"
    | "password"
    | "textarea"
    | "select"
    | "checkbox";
  required: "yes" | "no";
  minLength: string;
  maxLength: string;
  min: string;
  max: string;
  pattern: string;
  message: string;
  options: string;
}

export interface ElStyle {
  tone?: string;
  radius?: string;
  size?: string;
  align?: string;
  weight?: string;
}

export interface El {
  id: string;
  type: ElType;
  /** the grid cell on desktop; tablet and mobile may have their own */
  pos: { desktop: Rect; tablet?: Rect; mobile?: Rect };
  /** devices where the element is not shown */
  hide: Partial<Record<Bp, boolean>>;
  props: Record<string, string>;
  /** an expression; empty = always visible */
  visible: string;
  /** two-way bound state key (inputs, forms, tabs, modal) */
  bind: string;
  style: ElStyle;
  fields: FormField[];
  events: Partial<Record<EventName, Action[]>>;
}

export type SectionKind =
  | "empty"
  | "hero"
  | "features"
  | "pricing"
  | "form"
  | "table"
  | "dashboard"
  | "footer";

export interface Section {
  id: string;
  kind: SectionKind;
  name: string;
  /** minimum height in grid rows */
  rows: number;
  bg: string;
  pad: string;
  elements: El[];
}

export interface Page {
  id: string;
  name: string;
  slug: string;
  sections: Section[];
}

export interface Model {
  name: string;
  pages: Page[];
  keys: StateKey[];
  mocks: MockRoute[];
  mockOn: boolean;
  /**
   * A Flow Studio design that answers the requests instead of the mock routes: the
   * diagram is the backend, and its tables are kept for the length of a preview.
   */
  flow: FlowModel | null;
  /** the counter that makes ids */
  seq: number;
}

// ---- the catalogue ----

export type FieldKind = "text" | "area" | "expr" | "choice" | "key" | "page";
export interface FieldSpec {
  name: string;
  label: string;
  kind: FieldKind;
  choices?: string[];
  hint?: string;
}

export interface ElDef {
  label: string;
  group: "Content" | "Inputs" | "Data" | "Layout";
  w: number;
  h: number;
  props: FieldSpec[];
  defaults: Record<string, string>;
  events: EventName[];
  /** the event of a new link made in the diagram */
  primary: EventName;
  /** gets a "Bound state key" field */
  bindable?: boolean;
  /** the state key holds the value the element edits */
  bindHint?: string;
  hasFields?: boolean;
}

const tone = ["", "primary", "secondary", "muted", "accent", "destructive"];

export const ELEMENTS: Record<ElType, ElDef> = {
  heading: {
    label: "Heading",
    group: "Content",
    w: 6,
    h: 1,
    props: [
      { name: "text", label: "Text", kind: "text" },
      {
        name: "level",
        label: "Level",
        kind: "choice",
        choices: ["1", "2", "3"],
      },
    ],
    defaults: { text: "A heading", level: "2" },
    events: ["click", "hover"],
    primary: "click",
  },
  text: {
    label: "Text",
    group: "Content",
    w: 6,
    h: 2,
    props: [{ name: "text", label: "Text", kind: "area" }],
    defaults: { text: "Some text. Show state with {state.name}." },
    events: ["click", "hover"],
    primary: "click",
  },
  button: {
    label: "Button",
    group: "Content",
    w: 3,
    h: 1,
    props: [
      { name: "text", label: "Label", kind: "text" },
      {
        name: "variant",
        label: "Variant",
        kind: "choice",
        choices: ["default", "secondary", "outline", "destructive"],
      },
      {
        name: "disabled",
        label: "Disabled when",
        kind: "expr",
        hint: "expression",
      },
    ],
    defaults: { text: "Button", variant: "default", disabled: "" },
    events: ["click", "hover", "focus", "blur"],
    primary: "click",
  },
  link: {
    label: "Link",
    group: "Content",
    w: 3,
    h: 1,
    props: [
      { name: "text", label: "Text", kind: "text" },
      { name: "page", label: "Go to page", kind: "page" },
      { name: "href", label: "or URL", kind: "text", hint: "https://..." },
    ],
    defaults: { text: "A link", page: "", href: "" },
    events: ["click", "hover"],
    primary: "click",
  },
  image: {
    label: "Image",
    group: "Content",
    w: 4,
    h: 4,
    props: [
      { name: "src", label: "Image URL", kind: "text" },
      { name: "alt", label: "Alt text", kind: "text" },
    ],
    defaults: { src: "", alt: "Picture" },
    events: ["click", "hover"],
    primary: "click",
  },
  badge: {
    label: "Badge",
    group: "Content",
    w: 2,
    h: 1,
    props: [
      { name: "text", label: "Text", kind: "text" },
      {
        name: "variant",
        label: "Variant",
        kind: "choice",
        choices: [
          "default",
          "secondary",
          "outline",
          "destructive",
          "success",
          "warning",
        ],
      },
    ],
    defaults: { text: "New", variant: "default" },
    events: ["click", "hover"],
    primary: "click",
  },
  progress: {
    label: "Progress",
    group: "Content",
    w: 4,
    h: 1,
    props: [
      { name: "label", label: "Label", kind: "text" },
      { name: "value", label: "Value 0-100", kind: "expr" },
    ],
    defaults: { label: "Progress", value: "40" },
    events: ["click", "hover"],
    primary: "click",
  },
  card: {
    label: "Card",
    group: "Content",
    w: 4,
    h: 3,
    props: [
      { name: "title", label: "Title", kind: "text" },
      { name: "text", label: "Text", kind: "area" },
    ],
    defaults: { title: "Card title", text: "Card text." },
    events: ["click", "hover"],
    primary: "click",
  },
  input: {
    label: "Input",
    group: "Inputs",
    w: 4,
    h: 2,
    props: [
      { name: "label", label: "Label", kind: "text" },
      { name: "placeholder", label: "Placeholder", kind: "text" },
      {
        name: "type",
        label: "Type",
        kind: "choice",
        choices: ["text", "email", "number", "password"],
      },
    ],
    defaults: { label: "Label", placeholder: "Type here", type: "text" },
    events: ["input", "change", "focus", "blur", "enter", "hover"],
    primary: "input",
    bindable: true,
    bindHint: "the key holds the text",
  },
  textarea: {
    label: "Textarea",
    group: "Inputs",
    w: 4,
    h: 3,
    props: [
      { name: "label", label: "Label", kind: "text" },
      { name: "placeholder", label: "Placeholder", kind: "text" },
    ],
    defaults: { label: "Message", placeholder: "Write..." },
    events: ["input", "change", "focus", "blur", "hover"],
    primary: "input",
    bindable: true,
  },
  select: {
    label: "Select",
    group: "Inputs",
    w: 4,
    h: 2,
    props: [
      { name: "label", label: "Label", kind: "text" },
      {
        name: "options",
        label: "Options",
        kind: "text",
        hint: "a, b, c  or  {state.list}",
      },
    ],
    defaults: { label: "Choose", options: "One, Two, Three" },
    events: ["change", "focus", "blur", "hover"],
    primary: "change",
    bindable: true,
  },
  checkbox: {
    label: "Checkbox",
    group: "Inputs",
    w: 4,
    h: 1,
    props: [{ name: "label", label: "Label", kind: "text" }],
    defaults: { label: "I agree" },
    events: ["change", "focus", "blur", "hover"],
    primary: "change",
    bindable: true,
    bindHint: "the key holds true / false",
  },
  form: {
    label: "Form",
    group: "Inputs",
    w: 6,
    h: 7,
    props: [
      { name: "title", label: "Title", kind: "text" },
      { name: "submitLabel", label: "Submit label", kind: "text" },
      { name: "errorsKey", label: "Errors key (json)", kind: "key" },
      { name: "okText", label: "Message after a valid submit", kind: "text" },
    ],
    defaults: {
      title: "Contact us",
      submitLabel: "Send",
      errorsKey: "",
      okText: "",
    },
    events: ["submit", "invalid", "input", "hover"],
    primary: "submit",
    bindable: true,
    bindHint: "a json key: the values of the fields",
    hasFields: true,
  },
  list: {
    label: "List",
    group: "Data",
    w: 5,
    h: 5,
    props: [
      {
        name: "source",
        label: "Array (expression)",
        kind: "expr",
        hint: "state.todos",
      },
      {
        name: "itemText",
        label: "Item text",
        kind: "text",
        hint: "{item.title}",
      },
      {
        name: "removable",
        label: "Remove button",
        kind: "choice",
        choices: ["no", "yes"],
      },
      { name: "empty", label: "Empty text", kind: "text" },
    ],
    defaults: {
      source: "state.items",
      itemText: "{item}",
      removable: "no",
      empty: "Nothing here yet.",
    },
    events: ["click", "remove", "hover"],
    primary: "click",
  },
  table: {
    label: "Table",
    group: "Data",
    w: 8,
    h: 7,
    props: [
      {
        name: "source",
        label: "Array (expression)",
        kind: "expr",
        hint: "state.users",
      },
      {
        name: "columns",
        label: "Columns",
        kind: "text",
        hint: "name, email  (blank = all)",
      },
      {
        name: "filter",
        label: "Row filter (row)",
        kind: "expr",
        hint: "contains(row.name, state.q)",
      },
      {
        name: "search",
        label: "Search box",
        kind: "choice",
        choices: ["no", "yes"],
      },
      { name: "pageSize", label: "Rows per page (0 = all)", kind: "text" },
      {
        name: "rowActions",
        label: "Row actions",
        kind: "text",
        hint: "Edit, Delete",
      },
      { name: "empty", label: "Empty text", kind: "text" },
    ],
    defaults: {
      source: "state.rows",
      columns: "",
      filter: "",
      search: "no",
      pageSize: "0",
      rowActions: "",
      empty: "No rows.",
    },
    events: ["click", "rowAction", "hover"],
    primary: "click",
  },
  repeater: {
    label: "Repeater",
    group: "Data",
    w: 12,
    h: 4,
    props: [
      {
        name: "source",
        label: "Array (expression)",
        kind: "expr",
        hint: "state.plans",
      },
      { name: "title", label: "Card title", kind: "text", hint: "{item.name}" },
      { name: "text", label: "Card text", kind: "text", hint: "{item.price}" },
      { name: "footer", label: "Card footer", kind: "text" },
    ],
    defaults: {
      source: "state.items",
      title: "{item.title}",
      text: "{item.text}",
      footer: "",
    },
    events: ["click", "hover"],
    primary: "click",
  },
  kpi: {
    label: "KPI",
    group: "Data",
    w: 3,
    h: 3,
    props: [
      { name: "label", label: "Label", kind: "text" },
      {
        name: "value",
        label: "Value",
        kind: "text",
        hint: '{sum(state.orders, "amount")}',
      },
      { name: "delta", label: "Note", kind: "text" },
    ],
    defaults: { label: "Total", value: "{len(state.items)}", delta: "" },
    events: ["click", "hover"],
    primary: "click",
  },
  chart: {
    label: "Chart",
    group: "Data",
    w: 6,
    h: 6,
    props: [
      {
        name: "kind",
        label: "Kind",
        kind: "choice",
        choices: ["bar", "line", "pie"],
      },
      { name: "title", label: "Title", kind: "text" },
      {
        name: "source",
        label: "Array (expression)",
        kind: "expr",
        hint: "state.sales",
      },
      { name: "labelField", label: "Label field", kind: "text" },
      { name: "valueField", label: "Value field", kind: "text" },
      { name: "filter", label: "Row filter (row)", kind: "expr" },
    ],
    defaults: {
      kind: "bar",
      title: "Chart",
      source: "state.rows",
      labelField: "label",
      valueField: "value",
      filter: "",
    },
    events: ["click", "hover"],
    primary: "click",
  },
  tabs: {
    label: "Tabs",
    group: "Layout",
    w: 6,
    h: 4,
    props: [
      { name: "tabs", label: "Tab labels", kind: "text", hint: "One, Two" },
      { name: "panels", label: "Panels (| between)", kind: "area" },
    ],
    defaults: {
      tabs: "Overview, Details",
      panels: "Overview text | Details text",
    },
    events: ["change", "hover"],
    primary: "change",
    bindable: true,
    bindHint: "the key holds the active tab label",
  },
  accordion: {
    label: "Accordion",
    group: "Layout",
    w: 6,
    h: 5,
    props: [
      { name: "titles", label: "Titles", kind: "text", hint: "First, Second" },
      { name: "panels", label: "Panels (| between)", kind: "area" },
    ],
    defaults: {
      titles: "First, Second",
      panels: "First answer | Second answer",
    },
    events: ["change", "hover"],
    primary: "change",
    bindable: true,
    bindHint: "the key holds the open title",
  },
  modal: {
    label: "Modal",
    group: "Layout",
    w: 4,
    h: 3,
    props: [
      { name: "title", label: "Title", kind: "text" },
      { name: "text", label: "Text", kind: "area" },
      { name: "closeLabel", label: "Close label", kind: "text" },
    ],
    defaults: { title: "Hello", text: "A dialog.", closeLabel: "Close" },
    events: ["close", "hover"],
    primary: "close",
    bindable: true,
    bindHint: "a boolean key: the modal is open when true",
  },
};

/** the events an element can have: its own and `load` */
export const eventsOf = (type: ElType): EventName[] => [
  ...ELEMENTS[type].events,
  "load",
];

export const EL_TYPES = Object.keys(ELEMENTS) as ElType[];

export const STYLE_CHOICES = {
  tone,
  radius: ["", "none", "sm", "md", "lg", "full"],
  size: ["", "sm", "md", "lg", "xl"],
  align: ["", "start", "center", "end"],
  weight: ["", "normal", "medium", "bold"],
};

export const BG_CHOICES = [
  "none",
  "muted",
  "card",
  "primary",
  "secondary",
  "accent",
];
export const PAD_CHOICES = ["none", "sm", "md", "lg"];

export const SECTION_LABEL: Record<SectionKind, string> = {
  empty: "Empty",
  hero: "Hero",
  features: "Features",
  pricing: "Pricing",
  form: "Contact form",
  table: "Data table",
  dashboard: "Dashboard",
  footer: "Footer",
};

// ---- ids and lookups ----

export function newId(m: Model, prefix: string): { model: Model; id: string } {
  return { model: { ...m, seq: m.seq + 1 }, id: `${prefix}${m.seq + 1}` };
}

export function emptyModel(): Model {
  const m: Model = {
    name: "Untitled",
    pages: [],
    keys: [],
    mocks: [],
    mockOn: true,
    flow: null,
    seq: 0,
  };
  return addPage(m, "Home", "/").model;
}

export function addPage(
  m: Model,
  name: string,
  slug: string,
): { model: Model; id: string } {
  const { model, id } = newId(m, "p");
  const page: Page = { id, name, slug, sections: [] };
  return { model: { ...model, pages: [...model.pages, page] }, id };
}

export function makeElement(m: Model, type: ElType): { model: Model; el: El } {
  const { model, id } = newId(m, "e");
  const def = ELEMENTS[type];
  const el: El = {
    id,
    type,
    pos: { desktop: { x: 0, y: 0, w: def.w, h: def.h } },
    hide: {},
    props: { ...def.defaults },
    visible: "",
    bind: "",
    style: {},
    fields: type === "form" ? defaultFormFields() : [],
    events: {},
  };
  return { model, el };
}

export function defaultFormFields(): FormField[] {
  return [
    blankField("name", "Name", "text", "yes"),
    {
      ...blankField("email", "Email", "email", "yes"),
      message: "Enter a valid email",
    },
  ];
}

export function blankField(
  name: string,
  label: string,
  type: FormField["type"] = "text",
  required: "yes" | "no" = "no",
): FormField {
  return {
    name,
    label,
    type,
    required,
    minLength: "",
    maxLength: "",
    min: "",
    max: "",
    pattern: "",
    message: "",
    options: "",
  };
}

export interface Found {
  page: Page;
  section: Section;
  el: El;
}

export function findElement(m: Model, id: string): Found | null {
  for (const page of m.pages)
    for (const section of page.sections) {
      const el = section.elements.find((e) => e.id === id);
      if (el) return { page, section, el };
    }
  return null;
}

export function findSection(
  m: Model,
  id: string,
): { page: Page; section: Section } | null {
  for (const page of m.pages) {
    const section = page.sections.find((s) => s.id === id);
    if (section) return { page, section };
  }
  return null;
}

export const allElements = (m: Model): El[] =>
  m.pages.flatMap((p) => p.sections.flatMap((s) => s.elements));

export function mapSections(
  m: Model,
  fn: (s: Section, p: Page) => Section,
): Model {
  return {
    ...m,
    pages: m.pages.map((p) => ({
      ...p,
      sections: p.sections.map((s) => fn(s, p)),
    })),
  };
}

export function mapElement(m: Model, id: string, fn: (e: El) => El): Model {
  return mapSections(m, (s) =>
    s.elements.some((e) => e.id === id)
      ? { ...s, elements: s.elements.map((e) => (e.id === id ? fn(e) : e)) }
      : s,
  );
}

export function removeElement(m: Model, id: string): Model {
  return mapSections(m, (s) =>
    s.elements.some((e) => e.id === id)
      ? { ...s, elements: s.elements.filter((e) => e.id !== id) }
      : s,
  );
}

/** A copy of an element with new ids, one row below the original. */
export function duplicateElement(
  m: Model,
  id: string,
): { model: Model; id: string } | null {
  const f = findElement(m, id);
  if (!f) return null;
  const { model, id: nid } = newId(m, "e");
  const copy: El = JSON.parse(JSON.stringify(f.el));
  copy.id = nid;
  for (const bp of BPS) {
    const r = copy.pos[bp];
    if (r) copy.pos[bp] = { ...r, y: r.y + r.h };
  }
  return {
    model: mapSections(model, (s) =>
      s.id === f.section.id ? { ...s, elements: [...s.elements, copy] } : s,
    ),
    id: nid,
  };
}

export function stateKey(m: Model, path: string): StateKey | undefined {
  const root = path.split(".")[0];
  return m.keys.find((k) => k.key === root);
}

export const isIdent = (s: string): boolean =>
  /^[A-Za-z_][A-Za-z0-9_]*$/.test(s);
