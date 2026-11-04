// The Phone Retail CRM. All its data lives in IndexedDB (the `idb` plugin) and,
// while the page is open, in `state.db`: a handler changes the state and asks the
// plugin to write the same rows. One generic list (blocks/crud-table) and one
// generic form (blocks/crud-form) serve every table: entities.ts says how each
// looks. Everything below is a pure function of (message, state).
import {
  Component,
  type Effect,
  type Message,
} from "@service-laboratory/pavlus";
import {
  routerEffector as router,
  storeEffector as store,
} from "@service-laboratory/pavlus/plugins";
import {
  type NavGroup,
  notice,
  patch,
  type ShellAction,
  type ShellUser,
} from "../../blocks/admin-shell/shell.ts";
import {
  type Draft,
  draftOf,
  fieldsView,
  type FieldView,
  reduceDraft,
  rowOf,
  validateDraft,
} from "../../blocks/crud-form/form.ts";
import {
  initialTable,
  reduceTable,
  type TableProps,
  type TableState,
  tableView,
} from "../../blocks/crud-table/table.ts";
import { filesEffector, type Picked } from "../../files.ts";
import { idbEffector, type Loaded } from "../../idb.ts";
import { ENTITIES, type Entity, entityOf } from "./entities.ts";
import view from "./phone-retail-crm.pavlus";
import {
  type Db,
  dbCounts,
  emptyDb,
  parseSnapshot,
  snapshotOf,
  snapshotText,
  bytesOf,
} from "./snapshot-bridge.ts";
import { seedDb, TODAY } from "./seed.ts";
import {
  type BudgetDashboardProps,
  budgetDashboard,
  type OrdersDashboardProps,
  ordersDashboard,
  type ShopsMapProps,
  shopsMap,
} from "./stats.ts";

export const DB_NAME = "phone-retail-crm";

type Table = keyof Db;
type Row = Record<string, unknown> & { id: number };

// ---- the screens ----

const GROUPS: {
  title: string;
  items: { id: string; label: string; icon: string; table?: Table }[];
}[] = [
  {
    title: "Auth",
    items: [
      { id: "users", label: "Users", icon: "k-ai-users", table: "users" },
      { id: "roles", label: "Roles", icon: "k-ai-briefcase", table: "roles" },
      {
        id: "permissions",
        label: "Permissions",
        icon: "k-ai-key",
        table: "permissions",
      },
      {
        id: "sessions",
        label: "Sessions",
        icon: "k-ai-login",
        table: "sessions",
      },
    ],
  },
  {
    title: "Products",
    items: [
      {
        id: "manufacturers",
        label: "Manufacturers",
        icon: "k-ai-warehouse",
        table: "manufacturers",
      },
      { id: "models", label: "Models", icon: "k-ai-tag", table: "models" },
      {
        id: "products",
        label: "Products",
        icon: "k-ai-box",
        table: "products",
      },
    ],
  },
  {
    title: "Shops",
    items: [
      { id: "shops", label: "Shops", icon: "k-ai-home", table: "shops" },
      { id: "shopsMap", label: "Shops map", icon: "k-ai-flag" },
      {
        id: "shopCategories",
        label: "Shop categories",
        icon: "k-ai-grid",
        table: "shopCategories",
      },
    ],
  },
  {
    title: "Orders",
    items: [
      { id: "orders", label: "Orders", icon: "k-ai-cart", table: "orders" },
      { id: "sales", label: "Sales statistics", icon: "k-ai-chart" },
    ],
  },
  {
    title: "Budget",
    items: [
      { id: "budget", label: "Budget dashboard", icon: "k-ai-dollar" },
      {
        id: "budgetEntries",
        label: "Budget entries",
        icon: "k-ai-receipt",
        table: "budget",
      },
    ],
  },
  {
    title: "System",
    items: [{ id: "settings", label: "Settings", icon: "k-icon-settings" }],
  },
];

const SPECIAL = ["shopsMap", "sales", "budget", "settings"];

const USER: ShellUser = {
  name: "Dana Whitfield",
  role: "Administrator",
  initials: "DW",
};

/** The navigation with the number of rows as a badge. */
function navOf(db: Db): NavGroup[] {
  return GROUPS.map((g) => ({
    title: g.title,
    items: g.items.map((i) => ({
      id: i.id,
      label: i.label,
      icon: i.icon,
      badge: i.table ? String(db[i.table].length) : undefined,
    })),
  }));
}

const labelOf = (screen: string): string =>
  GROUPS.flatMap((g) => g.items).find((i) => i.id === screen)?.label ?? "";

// ---- the state ----

export interface Confirm {
  open: boolean;
  /** the ids to delete (a list for the ticked rows) */
  ids: number[];
  text: string;
}

export interface SettingsView {
  counts: { id: string; label: string; count: number }[];
  total: number;
  size: string;
  importError: string;
  askReset: boolean;
  busy: boolean;
}

export type View =
  "loading" | "list" | "form" | "shopsMap" | "sales" | "budget" | "settings";

export interface CrmState {
  status: "loading" | "ready" | "failed";
  error: string;
  db: Db;
  screen: string;
  mode: "list" | "form";
  table: TableState;
  editId: number;
  draft: Draft;
  errors: Record<string, string>;
  confirm: Confirm;
  /** why a delete is not allowed, shown above the list */
  guardNote: string;
  pickedShop: string;
  navOpen: boolean;
  notice: string;
  settings: SettingsView;
  // derived
  groups: NavGroup[];
  user: ShellUser;
  actions: ShellAction[];
  title: string;
  subtitle: string;
  view: View;
  grid: TableProps & {
    title: string;
    addLabel: string;
    placeholder: string;
    empty: string;
  };
  form: {
    title: string;
    description: string;
    fields: FieldView[];
    saveLabel: string;
    editing: boolean;
    problems: number;
  };
  sales: OrdersDashboardProps;
  budgetDash: BudgetDashboardProps;
  map: ShopsMapProps;
}

const NO_CONFIRM: Confirm = { open: false, ids: [], text: "" };

const ACTIONS: ShellAction[] = [
  {
    id: "export",
    label: "Export JSON",
    icon: "k-ai-arrow-down",
    variant: "outline",
  },
];

/** The part of the state the user changes (everything else follows from it). */
type Core = Pick<
  CrmState,
  | "db"
  | "screen"
  | "mode"
  | "table"
  | "editId"
  | "draft"
  | "errors"
  | "pickedShop"
  | "settings"
  | "status"
>;

const ctxOf = (c: Core): Db => c.db;

const fieldsOf = (e: Entity, c: Core): FieldView[] =>
  fieldsView(e.fields, c.draft, c.errors, ctxOf(c));

/** The rows of a table, untyped (the entities treat every table the same way). */
const rowsOf = (db: Db, table: Table): Row[] => db[table] as unknown as Row[];

/** Pure: everything the template shows that follows from the core. */
export function derive(
  c: Core,
): Pick<
  CrmState,
  | "groups"
  | "title"
  | "subtitle"
  | "view"
  | "grid"
  | "form"
  | "sales"
  | "budgetDash"
  | "map"
> {
  const e = entityOf(c.screen);
  const view: View =
    c.status !== "ready"
      ? "loading"
      : c.screen === "shopsMap" ||
          c.screen === "sales" ||
          c.screen === "budget" ||
          c.screen === "settings"
        ? c.screen
        : e
          ? c.mode
          : "list";
  const empty = {
    ...tableView([], [], [], c.table),
    title: "",
    addLabel: "",
    placeholder: "",
    empty: "",
  };
  const grid =
    view === "list" && e
      ? {
          ...tableView(
            rowsOf(c.db, e.key),
            e.columns(c.db),
            e.filters(c.db),
            c.table,
          ),
          title: e.plural,
          addLabel: `New ${e.singular}`,
          placeholder: `Search ${e.plural.toLowerCase()}...`,
          empty: `No ${e.plural.toLowerCase()} match.`,
        }
      : empty;
  const form =
    view === "form" && e
      ? {
          title: c.editId ? `Edit ${e.singular}` : `New ${e.singular}`,
          description: e.description,
          fields: fieldsOf(e, c),
          saveLabel: c.editId ? "Save changes" : `Create ${e.singular}`,
          editing: c.editId > 0,
          problems: Object.keys(c.errors).length,
        }
      : {
          title: "",
          description: "",
          fields: [],
          saveLabel: "",
          editing: false,
          problems: 0,
        };
  const loaded = c.status === "ready";
  return {
    groups: navOf(c.db),
    title: labelOf(c.screen),
    subtitle:
      e && view === "list"
        ? e.description
        : view === "form" && e
          ? e.plural
          : `Today is ${TODAY}`,
    view,
    grid,
    form,
    sales:
      loaded && view === "sales"
        ? ordersDashboard(c.db.orders, c.db.shops, TODAY)
        : EMPTY_SALES,
    budgetDash:
      loaded && view === "budget"
        ? budgetDashboard(c.db.budget, TODAY)
        : EMPTY_BUDGET,
    map:
      loaded && view === "shopsMap"
        ? shopsMap(c.db.shops, c.db.shopCategories, c.db.orders, c.pickedShop)
        : EMPTY_MAP,
  };
}

const EMPTY_SALES = ordersDashboard([], [], TODAY);
const EMPTY_BUDGET = budgetDashboard([], TODAY);
const EMPTY_MAP = shopsMap([], [], [], "");

export function settingsOf(
  db: Db,
  prev: Partial<SettingsView> = {},
): SettingsView {
  const counts = dbCounts(db);
  const text = snapshotText(snapshotOf(db, `${TODAY}T00:00:00`));
  return {
    counts: ENTITIES.map((e) => ({
      id: e.key,
      label: e.plural,
      count: counts[e.key],
    })),
    total: Object.values(counts).reduce((a, b) => a + b, 0),
    size: `${Math.max(1, Math.round(bytesOf(text) / 1024))} kB`,
    importError: prev.importError ?? "",
    askReset: prev.askReset ?? false,
    busy: prev.busy ?? false,
  };
}

export function initialState(): CrmState {
  const db = emptyDb();
  const core: Core = {
    db,
    screen: "users",
    mode: "list",
    table: initialTable("name"),
    editId: 0,
    draft: {},
    errors: {},
    pickedShop: "",
    settings: settingsOf(db),
    status: "loading",
  };
  return {
    ...core,
    error: "",
    confirm: NO_CONFIRM,
    guardNote: "",
    navOpen: false,
    notice: "",
    user: USER,
    actions: ACTIONS,
    ...derive(core),
  };
}

export const initial: CrmState = initialState();

const nextId = (rows: { id: number }[]): number =>
  rows.reduce((m, r) => Math.max(m, r.id), 0) + 1;

/** Pure: a table with new rows (what a save or a delete does to the database). */
const withRows = (db: Db, table: Table, rows: Row[]): Db => {
  const byId = new Map(rows.map((r) => [r.id, r]));
  const seen = new Set<number>();
  const merged = rowsOf(db, table).map((r) => {
    const n = byId.get(r.id);
    if (n) seen.add(r.id);
    return n ?? r;
  });
  return {
    ...db,
    [table]: [...merged, ...rows.filter((r) => !seen.has(r.id))],
  };
};

export class PhoneRetailCrm extends Component<CrmState> {
  view = view;

  // ---- start: load the database, or seed it ----

  /** The router shows the page: ask IndexedDB for the data. */
  enter(_msg: Message, state: CrmState): Effect[] {
    if (state.status === "ready") return [];
    return [
      idbEffector.load(
        DB_NAME,
        ENTITIES.map((e) => e.key as string),
        "loaded",
        "dbFailed",
      ),
    ];
  }

  loaded(msg: Message, state: CrmState): Effect[] {
    const { data, empty } = msg.payload as Loaded;
    if (empty) {
      // first visit: sample data, kept in the database from now on
      const db = seedDb();
      return [
        ...this._commit(state, { db, status: "ready" }),
        idbEffector.replaceAll(
          DB_NAME,
          db as unknown as Record<string, unknown[]>,
          "persisted",
          "dbFailed",
        ),
        ...notice("Sample data created in your browser"),
      ];
    }
    const db: Db = { ...emptyDb(), ...(data as unknown as Partial<Db>) };
    return this._commit(state, { db, status: "ready" });
  }

  persisted(): Effect[] {
    return [];
  }

  dbFailed(msg: Message, state: CrmState): Effect[] {
    const text = String(msg.payload ?? "the database failed");
    // without IndexedDB (a private window) the CRM still works on the seed, for this visit
    if (state.status === "loading") {
      return [
        ...this._commit(state, { db: seedDb(), status: "ready" }),
        ...notice(
          `IndexedDB is not available (${text}): your changes will not be kept`,
        ),
      ];
    }
    return notice(`Could not save: ${text}`);
  }

  // ---- commit: change the core, derive the rest ----

  _commit(
    state: CrmState,
    change: Partial<Core>,
    extra: Partial<CrmState> = {},
  ): Effect[] {
    const core: Core = { ...pickCore(state), ...change };
    return patch({ ...change, ...extra, ...derive(core) });
  }

  // ---- navigation ----

  "nav.go"(msg: Message, state: CrmState): Effect[] {
    const screen = String(msg.payload);
    const e = entityOf(screen);
    return this._commit(
      state,
      {
        screen,
        mode: "list",
        table: initialTable(e?.sortKey ?? "", e ? state.table.pageSize : 10),
        editId: 0,
        draft: {},
        errors: {},
        pickedShop: "",
        settings: settingsOf(state.db, { importError: "" }),
      },
      { confirm: NO_CONFIRM, guardNote: "", navOpen: false },
    );
  }

  "top.toggle"(_msg: Message, state: CrmState): Effect[] {
    return [store.set("navOpen", !state.navOpen)];
  }
  closeNav(): Effect[] {
    return [store.set("navOpen", false)];
  }
  "top.dismiss"(): Effect[] {
    return [store.set("notice", "")];
  }
  clearNotice(): Effect[] {
    return [store.set("notice", "")];
  }
  "top.action"(msg: Message, state: CrmState): Effect[] {
    return msg.payload === "export" ? this._export(state) : [];
  }

  // ---- the data table ----

  _table(
    name: string,
    msg: Message,
    state: CrmState,
    payload: unknown = msg.payload,
  ): Effect[] {
    const e = entityOf(state.screen);
    if (!e) return [];
    const visible = (st: TableState): number[] =>
      tableView(
        rowsOf(state.db, e.key),
        e.columns(state.db),
        e.filters(state.db),
        st,
      ).rows.map((r) => r.id);
    const table = reduceTable(state.table, name, payload, visible);
    const page = tableView(
      rowsOf(state.db, e.key),
      e.columns(state.db),
      e.filters(state.db),
      table,
    ).page;
    return this._commit(state, { table: { ...table, page } });
  }

  "table.search"(msg: Message, state: CrmState): Effect[] {
    return this._table("search", msg, state, msg.event?.value ?? "");
  }
  "table.sort"(msg: Message, state: CrmState): Effect[] {
    return this._table("sort", msg, state);
  }
  "table.filter"(msg: Message, state: CrmState): Effect[] {
    return this._table("filter", msg, state, [
      msg.payload,
      msg.event?.value ?? "",
    ]);
  }
  "table.toggleAll"(msg: Message, state: CrmState): Effect[] {
    return this._table("toggleAll", msg, state);
  }
  "table.toggleRow"(msg: Message, state: CrmState): Effect[] {
    return this._table("toggleRow", msg, state);
  }
  "table.prev"(msg: Message, state: CrmState): Effect[] {
    return this._table("prev", msg, state);
  }
  "table.next"(msg: Message, state: CrmState): Effect[] {
    return this._table("next", msg, state);
  }
  "table.goto"(msg: Message, state: CrmState): Effect[] {
    return this._table("goto", msg, state);
  }
  "table.pageSize"(msg: Message, state: CrmState): Effect[] {
    return this._table("pageSize", msg, state, msg.event?.value);
  }

  // ---- create and update ----

  _open(state: CrmState, id: number): Effect[] {
    const e = entityOf(state.screen);
    if (!e) return [];
    const row: Record<string, unknown> = id
      ? (rowsOf(state.db, e.key).find((r) => r.id === id) ?? e.blank(state.db))
      : e.blank(state.db);
    const draft: Draft = {
      ...draftOf(e.fields, row, state.db),
      __id: String(id),
    };
    return this._commit(
      state,
      { mode: "form", editId: id, draft, errors: {} },
      { confirm: NO_CONFIRM, guardNote: "" },
    );
  }

  "table.add"(_msg: Message, state: CrmState): Effect[] {
    return this._open(state, 0);
  }
  "table.edit"(msg: Message, state: CrmState): Effect[] {
    return this._open(state, Number(msg.payload));
  }

  _formChange(name: string, msg: Message, state: CrmState): Effect[] {
    const e = entityOf(state.screen);
    if (!e) return [];
    const draft = reduceDraft(
      e.fields,
      state.draft,
      name,
      msg.payload,
      msg.event,
      state.db,
    );
    // the messages of fields that were wrong go away as the form is corrected
    const errors = Object.keys(state.errors).length
      ? validateDraft(e.fields, draft, state.db)
      : state.errors;
    return this._commit(state, { draft, errors });
  }
  "form.change"(msg: Message, state: CrmState): Effect[] {
    return this._formChange("change", msg, state);
  }
  "form.toggle"(msg: Message, state: CrmState): Effect[] {
    return this._formChange("toggle", msg, state);
  }
  "form.check"(msg: Message, state: CrmState): Effect[] {
    return this._formChange("check", msg, state);
  }
  "form.checkAll"(msg: Message, state: CrmState): Effect[] {
    return this._formChange("checkAll", msg, state);
  }
  "form.checkNone"(msg: Message, state: CrmState): Effect[] {
    return this._formChange("checkNone", msg, state);
  }
  "form.lineAdd"(msg: Message, state: CrmState): Effect[] {
    return this._formChange("lineAdd", msg, state);
  }
  "form.lineRemove"(msg: Message, state: CrmState): Effect[] {
    return this._formChange("lineRemove", msg, state);
  }
  "form.lineSet"(msg: Message, state: CrmState): Effect[] {
    return this._formChange("lineSet", msg, state);
  }

  "form.cancel"(_msg: Message, state: CrmState): Effect[] {
    return this._commit(
      state,
      { mode: "list", editId: 0, draft: {}, errors: {} },
      { confirm: NO_CONFIRM },
    );
  }

  "form.save"(_msg: Message, state: CrmState): Effect[] {
    const e = entityOf(state.screen);
    if (!e) return [];
    const errors = validateDraft(e.fields, state.draft, state.db);
    if (Object.keys(errors).length > 0) return this._commit(state, { errors });
    const rows = rowsOf(state.db, e.key);
    const base: Record<string, unknown> = state.editId
      ? (rows.find((r) => r.id === state.editId) ?? e.blank(state.db))
      : e.blank(state.db);
    let row = rowOf(e.fields, state.draft, base, state.db) as Row;
    row = { ...row, id: state.editId || nextId(rows) };
    if (e.beforeSave) row = e.beforeSave(row, state.db) as Row;
    const db = withRows(state.db, e.key, [row]);
    return [
      ...this._commit(state, {
        db,
        mode: "list",
        editId: 0,
        draft: {},
        errors: {},
      }),
      idbEffector.put(DB_NAME, e.key, [row], "dbFailed"),
      ...notice(
        `${capital(e.singular)} ${state.editId ? "updated" : "created"}: ${e.label(row, db)}`,
      ),
    ];
  }

  // ---- delete, with a question first ----

  _ask(state: CrmState, ids: number[]): Effect[] {
    const e = entityOf(state.screen);
    if (!e || ids.length === 0) return [];
    const rows = rowsOf(state.db, e.key).filter((r) => ids.includes(r.id));
    // a row that others depend on stays: say why
    for (const r of rows) {
      const why = e.guardDelete?.(r, state.db);
      if (why)
        return this._commit(
          state,
          {},
          {
            guardNote: `${why}, so it cannot be deleted.`,
            confirm: NO_CONFIRM,
          },
        );
    }
    const text =
      rows.length === 1
        ? `Delete ${e.singular} “${e.label(rows[0], state.db)}”? This cannot be undone.`
        : `Delete ${rows.length} ${e.plural.toLowerCase()}? This cannot be undone.`;
    return this._commit(
      state,
      {},
      { guardNote: "", confirm: { open: true, ids, text } },
    );
  }

  "table.remove"(msg: Message, state: CrmState): Effect[] {
    return this._ask(state, [Number(msg.payload)]);
  }
  "table.removeSelected"(_msg: Message, state: CrmState): Effect[] {
    return this._ask(state, state.table.selected);
  }
  "form.remove"(_msg: Message, state: CrmState): Effect[] {
    return this._ask(state, [state.editId]);
  }

  confirmNo(state: CrmState): Effect[] {
    return this._commit(state, {}, { confirm: NO_CONFIRM, guardNote: "" });
  }

  confirmYes(_msg: Message, state: CrmState): Effect[] {
    const e = entityOf(state.screen);
    if (!e || !state.confirm.open) return [];
    const ids = state.confirm.ids;
    const gone = rowsOf(state.db, e.key).filter((r) => ids.includes(r.id));
    let db: Db = {
      ...state.db,
      [e.key]: rowsOf(state.db, e.key).filter((r) => !ids.includes(r.id)),
    } as Db;
    const effects: Effect[] = [
      idbEffector.remove(DB_NAME, e.key, ids, "dbFailed"),
    ];
    for (const r of gone) {
      for (const c of e.cleanup?.(r, state.db) ?? []) {
        if (c.table === "sessions" && e.key === "users") {
          // a deleted user's sessions go with them
          const sids = c.rows.map((x: Row) => x.id);
          db = {
            ...db,
            sessions: db.sessions.filter((s) => !sids.includes(s.id)),
          };
          if (sids.length)
            effects.push(
              idbEffector.remove(DB_NAME, "sessions", sids, "dbFailed"),
            );
        } else if (c.rows.length) {
          db = withRows(db, c.table, c.rows);
          effects.push(idbEffector.put(DB_NAME, c.table, c.rows, "dbFailed"));
        }
      }
    }
    const table = {
      ...state.table,
      selected: state.table.selected.filter((x) => !ids.includes(x)),
    };
    return [
      ...this._commit(
        state,
        { db, table, mode: "list", editId: 0, draft: {} },
        { confirm: NO_CONFIRM, guardNote: "" },
      ),
      ...effects,
      ...notice(
        ids.length === 1
          ? `${capital(e.singular)} deleted`
          : `${ids.length} ${e.plural.toLowerCase()} deleted`,
      ),
    ];
  }

  // ---- the shops map ----

  "map.map.pick"(msg: Message, state: CrmState): Effect[] {
    return this._commit(state, { pickedShop: String(msg.payload) });
  }

  // ---- settings: export, import, reset ----

  _export(state: CrmState): Effect[] {
    const text = snapshotText(snapshotOf(state.db, `${TODAY}T00:00:00`));
    return [
      filesEffector.download(
        `phone-retail-crm-${TODAY}.json`,
        text,
        "application/json",
        "exported",
      ),
    ];
  }

  settingsExport(_msg: Message, state: CrmState): Effect[] {
    return this._export(state);
  }

  exported(): Effect[] {
    return notice("Exported all data as JSON");
  }

  settingsImport(): Effect[] {
    return [
      filesEffector.pick(
        ".json,application/json",
        "importPicked",
        "importFailed",
      ),
    ];
  }

  importFailed(msg: Message, state: CrmState): Effect[] {
    return this._commit(state, {
      settings: {
        ...state.settings,
        importError: `Could not read the file: ${String(msg.payload)}`,
      },
    });
  }

  importPicked(msg: Message, state: CrmState): Effect[] {
    const { name, text } = msg.payload as Picked;
    const result = parseSnapshot(text);
    if (!result.ok) {
      return this._commit(state, {
        settings: {
          ...state.settings,
          importError: `${name}: ${result.error}`,
        },
      });
    }
    const db = result.db;
    return [
      ...this._commit(state, {
        db,
        settings: settingsOf(db, { importError: "" }),
        table: initialTable("name"),
      }),
      idbEffector.replaceAll(
        DB_NAME,
        db as unknown as Record<string, unknown[]>,
        "persisted",
        "dbFailed",
      ),
      ...notice(
        `Imported ${name}: ${Object.values(dbCounts(db)).reduce((a, b) => a + b, 0)} rows`,
      ),
    ];
  }

  settingsAskReset(_msg: Message, state: CrmState): Effect[] {
    return this._commit(state, {
      settings: { ...state.settings, askReset: true },
    });
  }
  settingsCancelReset(_msg: Message, state: CrmState): Effect[] {
    return this._commit(state, {
      settings: { ...state.settings, askReset: false },
    });
  }
  settingsReset(_msg: Message, state: CrmState): Effect[] {
    const db = seedDb();
    return [
      ...this._commit(state, {
        db,
        settings: settingsOf(db),
        table: initialTable("name"),
      }),
      idbEffector.replaceAll(
        DB_NAME,
        db as unknown as Record<string, unknown[]>,
        "persisted",
        "dbFailed",
      ),
      ...notice("All data was reset to the sample data"),
    ];
  }

  /** The nav of a narrow screen closes after a click; the router is not used inside the template. */
  goHome(): Effect[] {
    return [router.navigate("/templates")];
  }
}

const capital = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

const pickCore = (s: CrmState): Core => ({
  db: s.db,
  screen: s.screen,
  mode: s.mode,
  table: s.table,
  editId: s.editId,
  draft: s.draft,
  errors: s.errors,
  pickedShop: s.pickedShop,
  settings: s.settings,
  status: s.status,
});

export const page = new PhoneRetailCrm();
