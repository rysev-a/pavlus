import { Component, type Effect, type Message } from "@service-laboratory/pavlus";
import { storeEffector as store } from "@service-laboratory/pavlus/plugins";
import view from "./crud-form.pavlus";
import {
  type Draft,
  type FieldDef,
  draftOf,
  fieldsView,
  type FieldView,
  reduceDraft,
  rowOf,
  validateDraft,
} from "./form.ts";

const ROLES = ["Admin", "Editor", "Viewer"];
const PERMS = ["users.view", "users.edit", "orders.view", "orders.refund", "reports.export", "settings.edit"];
const PRODUCTS: Record<string, number> = { "1": 999, "2": 799, "3": 449 };

/** What the demo's fields look things up in. */
const ctx = {};

const DEFS: FieldDef<typeof ctx>[] = [
  { key: "name", label: "Name", kind: "text", required: true, placeholder: "Ann Stone" },
  { key: "email", label: "Email", kind: "email", required: true, hint: "Used to sign in." },
  { key: "role", label: "Role", kind: "select", required: true, options: () => ROLES.map((r) => ({ value: r, label: r })) },
  { key: "age", label: "Age", kind: "number", min: 18, max: 99 },
  { key: "bio", label: "Bio", kind: "textarea", rows: 3 },
  { key: "active", label: "Active", kind: "switch", hint: "The person can sign in" },
  { key: "perms", label: "Permissions", kind: "checks", options: () => PERMS.map((p) => ({ value: p, label: p })) },
  {
    key: "lines",
    label: "Order",
    kind: "lines",
    options: () => [
      { value: "1", label: "Phone Pro 256 GB" },
      { value: "2", label: "Phone 128 GB" },
      { value: "3", label: "Phone Lite 64 GB" },
    ],
    priceOf: (id) => String(PRODUCTS[id] ?? 0),
  },
];

interface DemoState {
  draft: Draft;
  errors: Record<string, string>;
  shape: {
    title: string;
    description: string;
    fields: FieldView[];
    saveLabel: string;
    editing: boolean;
    problems: number;
  };
  saved: string;
}

const shapeOf = (draft: Draft, errors: Record<string, string>): DemoState["shape"] => ({
  title: "New person",
  description: "Fields marked * are required.",
  fields: fieldsView(DEFS, draft, errors, ctx),
  saveLabel: "Create",
  editing: false,
  problems: Object.keys(errors).length,
});

const blank = draftOf(DEFS, { role: "Viewer", active: true, lines: [{ productId: 2, qty: 1, price: 799 }] }, ctx);

export const initial: DemoState = { draft: blank, errors: {}, shape: shapeOf(blank, {}), saved: "Nothing saved yet." };

export class CrudFormDemo extends Component<DemoState> {
  view = view;

  _change(name: string, msg: Message, state: DemoState): Effect[] {
    const draft = reduceDraft(DEFS, state.draft, name, msg.payload, msg.event, ctx);
    // the messages of a field that was wrong go away as it is edited
    const errors = Object.keys(state.errors).length ? validateDraft(DEFS, draft, ctx) : state.errors;
    return [store.set("draft", draft), store.set("errors", errors), store.set("shape", shapeOf(draft, errors))];
  }

  "form.change"(msg: Message, state: DemoState): Effect[] {
    return this._change("change", msg, state);
  }
  "form.toggle"(msg: Message, state: DemoState): Effect[] {
    return this._change("toggle", msg, state);
  }
  "form.check"(msg: Message, state: DemoState): Effect[] {
    return this._change("check", msg, state);
  }
  "form.checkAll"(msg: Message, state: DemoState): Effect[] {
    return this._change("checkAll", msg, state);
  }
  "form.checkNone"(msg: Message, state: DemoState): Effect[] {
    return this._change("checkNone", msg, state);
  }
  "form.lineAdd"(msg: Message, state: DemoState): Effect[] {
    return this._change("lineAdd", msg, state);
  }
  "form.lineRemove"(msg: Message, state: DemoState): Effect[] {
    return this._change("lineRemove", msg, state);
  }
  "form.lineSet"(msg: Message, state: DemoState): Effect[] {
    return this._change("lineSet", msg, state);
  }

  "form.save"(_msg: Message, state: DemoState): Effect[] {
    const errors = validateDraft(DEFS, state.draft, ctx);
    if (Object.keys(errors).length) {
      return [store.set("errors", errors), store.set("shape", shapeOf(state.draft, errors))];
    }
    const row = rowOf(DEFS, state.draft, {}, ctx);
    return [
      store.set("errors", {}),
      store.set("shape", shapeOf(state.draft, {})),
      store.set("saved", `Saved: ${JSON.stringify(row)}`),
    ];
  }

  "form.cancel"(): Effect[] {
    return [
      store.set("draft", blank),
      store.set("errors", {}),
      store.set("shape", shapeOf(blank, {})),
      store.set("saved", "Cancelled."),
    ];
  }
}

export const page = new CrudFormDemo();
