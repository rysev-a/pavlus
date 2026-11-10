// The inspector: which fields the selection shows, and how an edit of a field
// changes the model. Every field carries a `ctx` string (what it edits) and a
// `name`; one message `edit(ctx, name)` + the typed value does the rest, so the
// template needs no code per field.
import { exprError, parseInitial, refsOf, templateError } from "./bind.ts";
import {
  type FlowRoute,
  routeAction,
  routesOf,
} from "../flow-studio/flowlink.ts";
import { matchPath, parseUrl } from "./mock.ts";
import {
  type Chain,
  blankAction,
  getAction,
  moveAction,
  removeAction,
  updateAction,
  appendAction,
} from "./chain.ts";
import { layoutOf, setRect } from "./grid.ts";
import {
  ACTION_LABEL,
  type Action,
  type ActionType,
  BG_CHOICES,
  type Bp,
  type El,
  ELEMENTS,
  EVENT_LABEL,
  type EventName,
  type FieldSpec,
  type FormField,
  type KeyType,
  type MockRoute,
  type Model,
  PAD_CHOICES,
  STYLE_CHOICES,
  allElements,
  eventsOf,
  findElement,
  findSection,
  mapElement,
  mapSections,
} from "./model.ts";
import { editEvent } from "./chain.ts";
import { mapPage, uniqueSlug } from "./pages.ts";

export interface Choice {
  v: string;
  label: string;
  selected: boolean;
}

export interface FieldView {
  ctx: string;
  name: string;
  label: string;
  value: string;
  isText: boolean;
  isArea: boolean;
  isChoice: boolean;
  isKey: boolean;
  isNumber: boolean;
  choices: Choice[];
  hint: string;
  error: string;
  invalid: string | null;
  id: string;
}

export function field(
  ctx: string,
  name: string,
  label: string,
  value: string,
  kind: FieldSpec["kind"] | "number",
  choices: string[] = [],
  hint = "",
  error = "",
): FieldView {
  const k = kind === "page" ? "choice" : kind;
  return {
    ctx,
    name,
    label,
    value,
    isText: k === "text" || k === "expr",
    isArea: k === "area",
    isChoice: k === "choice",
    isKey: k === "key",
    isNumber: k === "number",
    choices: choices.map((c) => ({
      v: c,
      label: c === "" ? "(default)" : c,
      selected: c === value,
    })),
    hint,
    error,
    invalid: error ? "true" : null,
    id: `f-${ctx}-${name}`.replace(/[^\w-]/g, "_"),
  };
}

export interface ChainRowView {
  k: string;
  isAction: boolean;
  isLabel: boolean;
  isAdd: boolean;
  path: string;
  /** the chain a row belongs to (an add row: the chain it appends to) */
  chain: string;
  indent: string;
  title: string;
  fields: FieldView[];
  canUp: boolean;
  canDown: boolean;
  /** disabled: cannot move further */
  upDisabled: boolean;
  downDisabled: boolean;
  label: string;
}

export interface InspectorView {
  mode: "none" | "element" | "section" | "page" | "key";
  /** which mode it is: the template branches on these, not on === */
  isNone: boolean;
  isElement: boolean;
  isSection: boolean;
  isPage: boolean;
  isKey: boolean;
  title: string;
  subtitle: string;
  elId: string;
  props: FieldView[];
  bind: FieldView | null;
  visible: FieldView | null;
  styles: FieldView[];
  layout: FieldView[];
  hiddenHere: boolean;
  deviceNote: string;
  formFields: { k: string; i: number; title: string; fields: FieldView[] }[];
  isForm: boolean;
  events: {
    name: EventName;
    label: string;
    count: number;
    active: boolean;
    /** aria-selected, "true" | "false" */
    sel: string;
  }[];
  evLabel: string;
  chain: ChainRowView[];
  chainEmpty: boolean;
  fields: FieldView[];
}

export const ACTION_TYPES: { id: ActionType; label: string }[] = (
  Object.keys(ACTION_LABEL) as ActionType[]
).map((id) => ({ id, label: ACTION_LABEL[id] }));

const NONE: InspectorView = {
  mode: "none",
  isNone: true,
  isElement: false,
  isSection: false,
  isPage: false,
  isKey: false,
  title: "Nothing selected",
  subtitle: "Click an element, a section or a page.",
  elId: "",
  props: [],
  bind: null,
  visible: null,
  styles: [],
  layout: [],
  hiddenHere: false,
  deviceNote: "",
  formFields: [],
  isForm: false,
  events: [],
  evLabel: "",
  chain: [],
  chainEmpty: true,
  fields: [],
};

// ---- the fields of an action ----

/** the route an action calls, when it is one of the diagram: `GET /customers` */
function routeLabel(routes: FlowRoute[], a: Action): string {
  const url = a.url ?? "";
  const path = parseUrl(url.replace(/\{[^}]*\}/g, "x")).path;
  const hit = routes.find(
    (r) =>
      r.method === (a.method || "GET").toUpperCase() &&
      matchPath(r.path, path) !== null,
  );
  return hit ? `${hit.method} ${hit.path}` : "";
}

export function actionFields(
  ctx: string,
  a: Action,
  routes: FlowRoute[] = [],
): FieldView[] {
  const f = (
    name: keyof Action,
    label: string,
    kind: FieldSpec["kind"] | "number",
    choices?: string[],
    hint = "",
  ): FieldView => {
    const value = String((a[name] as string | undefined) ?? "");
    const err =
      kind === "expr"
        ? exprError(value)
        : kind === "text" || kind === "area"
          ? templateError(value)
          : "";
    return field(ctx, name, label, value, kind, choices, hint, err);
  };
  // every action can have a condition
  const when = f(
    "when",
    "Only when (expression)",
    "expr",
    [],
    "empty = always  ·  action == 'Delete'",
  );
  return [when, ...ownFields(a, f, ctx, routes)];
}

function ownFields(
  a: Action,
  f: (
    name: keyof Action,
    label: string,
    kind: FieldSpec["kind"] | "number",
    choices?: string[],
    hint?: string,
  ) => FieldView,
  ctx: string,
  routes: FlowRoute[],
): FieldView[] {
  switch (a.t) {
    case "set":
      return [
        f("key", "State key", "key", [], "key or path: user.name"),
        f(
          "value",
          "Value (expression)",
          "expr",
          [],
          'state.count + 1  or  "text"  or  event.value',
        ),
      ];
    case "toggle":
      return [f("key", "Boolean key", "key")];
    case "push":
      return [
        f("key", "Array key", "key"),
        f(
          "value",
          "Item (expression)",
          "expr",
          [],
          'obj("title", state.draft)',
        ),
      ];
    case "remove":
      return [
        f("key", "Array key", "key"),
        f("index", "Index or item (expression)", "expr", [], "index  or  item"),
      ];
    case "navigate":
      return [f("url", "URL or /page", "text", [], "/pricing")];
    case "notice":
      return [f("text", "Text", "text", [], "Saved {state.name}")];
    case "http":
      return [
        ...(routes.length
          ? [
              field(
                ctx,
                "flowRoute",
                "Route of the diagram",
                routeLabel(routes, a),
                "choice",
                ["", ...routes.map((r) => `${r.method} ${r.path}`)],
                "Fills in the method, the url, the body and where the answer goes",
              ),
            ]
          : []),
        f("method", "Method", "choice", [
          "GET",
          "POST",
          "PUT",
          "PATCH",
          "DELETE",
        ]),
        f("url", "URL", "text", [], "/api/users/{row.id}"),
        f("headers", "Headers (Name: value per line)", "area"),
        f("body", "JSON body (expression)", "expr", [], "state.form"),
        f("okKey", "onSuccess: store response in", "key"),
        f("okPath", "...only this path of it", "text", [], "data.users"),
        f("errKey", "onError: store error in", "key"),
        f("loadingKey", "Loading flag key", "key"),
      ];
  }
}

function chainView(
  elId: string,
  event: EventName,
  chain: Chain,
  routes: FlowRoute[] = [],
): ChainRowView[] {
  const out: ChainRowView[] = [];
  const emit = (list: Chain, prefix: string, depth: number): void => {
    list.forEach((a, i) => {
      const path = prefix ? `${prefix}.${i}` : String(i);
      const ctx = `act:${elId}:${event}:${path}`;
      out.push({
        k: `a${path}`,
        isAction: true,
        isLabel: false,
        isAdd: false,
        path,
        chain: prefix,
        indent: `margin-left: ${depth * 14}px`,
        title: `${i + 1}. ${ACTION_LABEL[a.t]}`,
        fields: actionFields(ctx, a, routes),
        canUp: i > 0,
        canDown: i < list.length - 1,
        upDisabled: i === 0,
        downDisabled: i >= list.length - 1,
        label: "",
      });
      if (a.t === "http") {
        for (const branch of ["then", "catch"] as const) {
          const bp = `${path}.${branch}`;
          out.push({
            k: `l${bp}`,
            isAction: false,
            isLabel: true,
            isAdd: false,
            path: bp,
            chain: bp,
            indent: `margin-left: ${(depth + 1) * 14}px`,
            title: "",
            fields: [],
            canUp: false,
            canDown: false,
            upDisabled: true,
            downDisabled: true,
            label:
              branch === "then"
                ? "then (after a success)"
                : "catch (after an error)",
          });
          emit(a[branch] ?? [], bp, depth + 1);
          out.push(addRow(bp, depth + 1));
        }
      }
    });
  };
  emit(chain, "", 0);
  out.push(addRow("", 0));
  return out;
}

const addRow = (chain: string, depth: number): ChainRowView => ({
  k: `add${chain}`,
  isAction: false,
  isLabel: false,
  isAdd: true,
  path: chain,
  chain,
  indent: `margin-left: ${depth * 14}px`,
  title: "",
  fields: [],
  canUp: false,
  canDown: false,
  upDisabled: true,
  downDisabled: true,
  label: "",
});

// ---- the whole inspector ----

export function inspectorOf(
  m: Model,
  sel: { kind: string; id: string },
  bp: Bp,
  evTab: string,
): InspectorView {
  if (sel.kind === "element") {
    const f = findElement(m, sel.id);
    if (!f) return NONE;
    const { el, section } = f;
    const def = ELEMENTS[el.type];
    const ctx = `el:${el.id}`;
    const props = def.props.map((s) => {
      const v = el.props[s.name] ?? "";
      const err =
        s.kind === "expr"
          ? exprError(v)
          : s.kind === "text" || s.kind === "area"
            ? templateError(v)
            : "";
      return field(
        s.kind === "page" ? `${ctx}` : ctx,
        s.name,
        s.label,
        v,
        s.kind,
        s.kind === "choice"
          ? s.choices
          : s.kind === "page"
            ? ["", ...m.pages.map((p) => p.id)]
            : [],
        s.hint ?? "",
        err,
      );
    });
    // a page choice shows page names
    for (const p of props)
      if (p.isChoice && p.name === "page")
        p.choices = [
          { v: "", label: "(none)", selected: p.value === "" },
          ...m.pages.map((pg) => ({
            v: pg.id,
            label: `${pg.name} ${pg.slug}`,
            selected: p.value === pg.id,
          })),
        ];
    const events = eventsOf(el.type).map((name) => ({
      name,
      label: EVENT_LABEL[name],
      count: (el.events[name] ?? []).length,
      active: false,
      sel: "false",
    }));
    const active = (
      events.find((e) => e.name === evTab) ??
      events.find((e) => e.count > 0) ??
      events[0]
    ).name;
    for (const e of events) {
      e.active = e.name === active;
      e.sel = e.name === active ? "true" : "false";
    }
    const chain = el.events[active] ?? [];
    const rect = layoutOf(section, bp)[el.id];
    const layoutFields = rect
      ? (["x", "y", "w", "h"] as const).map((n) =>
          field(
            `lay:${el.id}`,
            n,
            { x: "Column", y: "Row", w: "Width", h: "Height" }[n],
            String(rect[n] + (n === "x" || n === "y" ? 1 : 0)),
            "number",
          ),
        )
      : [];
    return {
      ...NONE,
      mode: "element",
      isNone: false,
      isElement: true,
      title: `${def.label}`,
      subtitle: `${el.id} · ${section.name}`,
      elId: el.id,
      props,
      bind: def.bindable
        ? field(
            `bind:${el.id}`,
            "bind",
            "Bound state key",
            el.bind,
            "key",
            [],
            def.bindHint ?? "two-way bound",
          )
        : null,
      visible: field(
        `vis:${el.id}`,
        "visible",
        "Visible when (expression)",
        el.visible,
        "expr",
        [],
        "empty = always  e.g. state.count > 0",
        exprError(el.visible),
      ),
      styles: (["tone", "radius", "size", "align", "weight"] as const).map(
        (n) =>
          field(
            `style:${el.id}`,
            n,
            {
              tone: "Colour role",
              radius: "Radius",
              size: "Size",
              align: "Alignment",
              weight: "Font weight",
            }[n],
            el.style[n] ?? "",
            "choice",
            STYLE_CHOICES[n],
          ),
      ),
      layout: layoutFields,
      hiddenHere: !!el.hide[bp],
      deviceNote:
        bp === "desktop"
          ? ""
          : bp === "tablet"
            ? "Tablet shares the desktop layout until you move something here."
            : "Mobile stacks the elements until you move something here.",
      isForm: el.type === "form",
      formFields: el.fields.map((fd, i) => ({
        k: `${i}`,
        i,
        title: fd.label || fd.name,
        fields: formFieldViews(`form:${el.id}:${i}`, fd),
      })),
      events,
      evLabel: EVENT_LABEL[active],
      chain: chainView(el.id, active, chain, m.flow ? routesOf(m.flow) : []),
      chainEmpty: chain.length === 0,
    };
  }
  if (sel.kind === "section") {
    const f = findSection(m, sel.id);
    if (!f) return NONE;
    const s = f.section;
    const ctx = `sec:${s.id}`;
    return {
      ...NONE,
      mode: "section",
      isNone: false,
      isSection: true,
      title: "Section",
      subtitle: `${s.id} · ${f.page.name}`,
      fields: [
        field(ctx, "name", "Name", s.name, "text"),
        field(ctx, "bg", "Background", s.bg, "choice", BG_CHOICES),
        field(ctx, "pad", "Padding", s.pad, "choice", PAD_CHOICES),
        field(ctx, "rows", "Minimum height (rows)", String(s.rows), "number"),
      ],
    };
  }
  if (sel.kind === "key") {
    const k = m.keys.find((x) => x.key === sel.id);
    if (!k) return NONE;
    const used = allElements(m).filter((e) =>
      [...Object.values(e.props), e.visible, e.bind].some(
        (t) => refsOf(t).includes(k.key) || e.bind.split(".")[0] === k.key,
      ),
    );
    return {
      ...NONE,
      mode: "key",
      isNone: false,
      isKey: true,
      title: `State key: ${k.key}`,
      subtitle: `${used.length} element${used.length === 1 ? "" : "s"} read it`,
      fields: keyFields({ ...m, keys: [k] })[0].fields,
    };
  }
  if (sel.kind === "page") {
    const p = m.pages.find((x) => x.id === sel.id);
    if (!p) return NONE;
    return {
      ...NONE,
      mode: "page",
      isNone: false,
      isPage: true,
      title: "Page",
      subtitle: p.id,
      fields: [
        field(`page:${p.id}`, "name", "Name", p.name, "text"),
        field(
          `page:${p.id}`,
          "slug",
          "URL slug",
          p.slug,
          "text",
          [],
          "/pricing",
        ),
      ],
    };
  }
  return NONE;
}

function formFieldViews(ctx: string, fd: FormField): FieldView[] {
  return [
    field(ctx, "name", "Field name", fd.name, "text"),
    field(ctx, "label", "Label", fd.label, "text"),
    field(ctx, "type", "Type", fd.type, "choice", [
      "text",
      "email",
      "number",
      "password",
      "url",
      "tel",
      "date",
      "textarea",
      "select",
      "radio",
      "checkbox",
      "switch",
    ]),
    field(ctx, "required", "Required", fd.required, "choice", ["yes", "no"]),
    field(ctx, "placeholder", "Placeholder", fd.placeholder ?? "", "text"),
    field(
      ctx,
      "description",
      "Help text (under the field)",
      fd.description ?? "",
      "text",
    ),
    field(ctx, "minLength", "Min length", fd.minLength, "number"),
    field(ctx, "maxLength", "Max length", fd.maxLength, "number"),
    field(ctx, "min", "Min (number)", fd.min, "number"),
    field(ctx, "max", "Max (number)", fd.max, "number"),
    field(
      ctx,
      "pattern",
      "Pattern (regex)",
      fd.pattern,
      "text",
      [],
      "^[A-Z]{2}[0-9]+$",
    ),
    field(
      ctx,
      "options",
      "Options (select, radio)",
      fd.options,
      "text",
      [],
      "a, b, c",
    ),
    field(
      ctx,
      "message",
      "Error message",
      fd.message,
      "text",
      [],
      "shown instead of the default",
    ),
  ];
}

export function keyFields(
  m: Model,
): { k: string; key: string; fields: FieldView[]; error: string }[] {
  return m.keys.map((k) => {
    const ctx = `key:${k.key}`;
    const error = parseInitial(k).error;
    return {
      k: k.key,
      key: k.key,
      error,
      fields: [
        field(ctx, "key", "Key", k.key, "text"),
        field(ctx, "type", "Type", k.type, "choice", [
          "string",
          "number",
          "boolean",
          "json",
        ]),
        k.type === "json"
          ? field(
              ctx,
              "initial",
              "Initial value (JSON)",
              k.initial,
              "area",
              [],
              "",
              error,
            )
          : field(
              ctx,
              "initial",
              "Initial value",
              k.initial,
              "text",
              [],
              "",
              error,
            ),
      ],
    };
  });
}

export function mockFields(
  m: Model,
): { k: string; id: string; fields: FieldView[] }[] {
  return m.mocks.map((r) => {
    const ctx = `mock:${r.id}`;
    let bodyErr = "";
    try {
      if (r.body.trim()) JSON.parse(r.body);
    } catch (e) {
      bodyErr = e instanceof Error ? e.message : "Invalid JSON";
    }
    return {
      k: r.id,
      id: r.id,
      fields: [
        field(ctx, "method", "Method", r.method, "choice", [
          "GET",
          "POST",
          "PUT",
          "PATCH",
          "DELETE",
          "*",
        ]),
        field(ctx, "path", "Path", r.path, "text", [], "/api/users/:id"),
        field(ctx, "status", "Status", String(r.status), "number"),
        field(ctx, "delay", "Delay (ms)", String(r.delay), "number"),
        field(
          ctx,
          "body",
          "Response JSON",
          r.body,
          "area",
          [],
          '"$param:id" and "$query:q" fill from the request',
          bodyErr,
        ),
      ],
    };
  });
}

// ---- edits ----

const toInt = (v: string, fallback = 0): number => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? n : fallback;
};

export interface Edited {
  model: Model;
  /** typing in one field merges into one undo step */
  tag: string;
  /** a page that was renamed / a key renamed: what the UI should follow */
  renamedKey?: { from: string; to: string };
}

/** Applies the value of the field (`ctx`, `name`) to the model. */
export function applyEdit(
  m: Model,
  ctx: string,
  name: string,
  value: string,
  bp: Bp,
): Edited | null {
  const [kind, ...rest] = ctx.split(":");
  const tag = `${ctx}:${name}`;
  switch (kind) {
    case "el":
      return {
        tag,
        model: mapElement(m, rest[0], (e) => ({
          ...e,
          props: { ...e.props, [name]: value },
        })),
      };
    case "vis":
      return {
        tag,
        model: mapElement(m, rest[0], (e) => ({ ...e, visible: value })),
      };
    case "bind":
      return {
        tag,
        model: mapElement(m, rest[0], (e) => ({ ...e, bind: value.trim() })),
      };
    case "style":
      return {
        tag,
        model: mapElement(m, rest[0], (e) => ({
          ...e,
          style: { ...e.style, [name]: value },
        })),
      };
    case "lay": {
      const f = findElement(m, rest[0]);
      if (!f) return null;
      const n = toInt(value, 1);
      const patch =
        name === "x" || name === "y" ? { [name]: n - 1 } : { [name]: n };
      const next = setRect(f.section, bp, rest[0], patch);
      return next
        ? {
            tag,
            model: mapSections(m, (s) => (s.id === f.section.id ? next : s)),
          }
        : null;
    }
    case "sec":
      return {
        tag,
        model: mapSections(m, (s) =>
          s.id === rest[0]
            ? {
                ...s,
                [name]:
                  name === "rows"
                    ? Math.min(60, Math.max(1, toInt(value, 1)))
                    : value,
              }
            : s,
        ),
      };
    case "page":
      return {
        tag,
        model: mapPage(m, rest[0], (p) => ({
          ...p,
          [name]:
            name === "slug" ? uniqueSlug(m, value.trim() || "/", p.id) : value,
        })),
      };
    case "form":
      return {
        tag,
        model: mapElement(m, rest[0], (e) => ({
          ...e,
          fields: e.fields.map((fd, i) =>
            i === Number(rest[1]) ? { ...fd, [name]: value } : fd,
          ),
        })),
      };
    case "key": {
      const old = rest[0];
      if (name === "key") {
        const to = value.trim();
        if (
          !/^[A-Za-z_][A-Za-z0-9_]*$/.test(to) ||
          m.keys.some((k) => k.key === to)
        )
          return null;
        return {
          tag,
          model: {
            ...m,
            keys: m.keys.map((k) => (k.key === old ? { ...k, key: to } : k)),
          },
          renamedKey: { from: old, to },
        };
      }
      return {
        tag,
        model: {
          ...m,
          keys: m.keys.map((k) =>
            k.key === old
              ? { ...k, [name]: name === "type" ? (value as KeyType) : value }
              : k,
          ),
        },
      };
    }
    case "mock":
      return {
        tag,
        model: {
          ...m,
          mocks: m.mocks.map((r) =>
            r.id === rest[0]
              ? ({
                  ...r,
                  [name]:
                    name === "status" || name === "delay"
                      ? Math.max(0, toInt(value))
                      : value,
                } as MockRoute)
              : r,
          ),
        },
      };
    case "act": {
      const [elId, event, path] = rest;
      if (name === "flowRoute") {
        // a route of the diagram fills in the action
        const route = m.flow
          ? routesOf(m.flow).find((r) => `${r.method} ${r.path}` === value)
          : undefined;
        return {
          tag: "",
          model: editEvent(m, elId, event as EventName, (c) =>
            updateAction(c, path, (a) =>
              route ? { ...a, ...routeAction(route) } : a,
            ),
          ),
        };
      }
      return {
        tag,
        model: editEvent(m, elId, event as EventName, (c) =>
          updateAction(c, path, (a) => ({ ...a, [name]: value })),
        ),
      };
    }
  }
  return null;
}

export const addAction = (
  m: Model,
  elId: string,
  event: EventName,
  chain: string,
  t: ActionType,
): Model =>
  editEvent(m, elId, event, (c) => appendAction(c, chain, blankAction(t)));

export const deleteAction = (
  m: Model,
  elId: string,
  event: EventName,
  path: string,
): Model => editEvent(m, elId, event, (c) => removeAction(c, path));

export const shiftAction = (
  m: Model,
  elId: string,
  event: EventName,
  path: string,
  by: -1 | 1,
): Model => editEvent(m, elId, event, (c) => moveAction(c, path, by));

export const actionAt = (
  m: Model,
  elId: string,
  event: EventName,
  path: string,
): Action | null => {
  const e: El | undefined = findElement(m, elId)?.el;
  return e ? getAction(e.events[event] ?? [], path) : null;
};
