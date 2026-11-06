/**
 * The admin panel of Orbit: the module `admin`. Only an administrator gets in
 * (the shell hides the item for others, and every handler and `derive` checks
 * again). Four sections:
 *  - Overview: KPI cards, new users and posts per month, the most active people.
 *  - Users: the table of all users (search, filters, sort, pages, ticked rows,
 *    bulk ban / unban), a create / update form, a delete that cascades, and the
 *    page with all the data of one user.
 *  - Data: a list and a form for every other table, from entities.ts.
 *  - Settings: export / import all the data as JSON, reset to the sample data.
 *
 * The list and the form are the generic blocks crud-table and crud-form, as in
 * the Phone Retail CRM; entities.ts says how each table looks.
 */
import type { Effect } from "@pavlus/frontend";
import type { Area } from "../../../../blocks/area-chart/area.ts";
import type { Column } from "../../../../blocks/bar-chart/chart.ts";
import {
  type Draft,
  draftOf,
  type FieldView,
  fieldsView,
  reduceDraft,
  rowOf,
  validateDraft,
} from "../../../../blocks/crud-form/form.ts";
import {
  initialTable,
  reduceTable,
  type TableProps,
  type TableState,
  tableView,
} from "../../../../blocks/crud-table/table.ts";
import { filesEffector, type Picked } from "../../../../files.ts";
import {
  byId,
  type Handler,
  type Module,
  nextId,
  type OrbitState,
  type Update,
} from "../../core.ts";
import { type Db, emptyDb, NOW, type TableName } from "../../schema.ts";
import { seedDb } from "../../seed.ts";
import {
  bytesOf,
  dbCounts,
  parseSnapshot,
  snapshotOf,
  snapshotText,
} from "../../snapshot.ts";
import { describeSideEffects, planDelete, putOf, removeOf } from "./cascade.ts";
import {
  type Ctx,
  DATA_ENTITIES,
  ENTITIES,
  type Entity,
  entityOf,
} from "./entities.ts";
import {
  type DetailProps,
  group,
  type OverviewProps,
  overview,
  userDetail,
} from "./stats.ts";

export type Section = "overview" | "users" | "data" | "settings";
export type AdminView =
  | "denied"
  | "overview"
  | "list"
  | "form"
  | "detail"
  | "settings";

export interface Confirm {
  open: boolean;
  ids: number[];
  text: string;
}

type Grid = TableProps & {
  title: string;
  addLabel: string;
  placeholder: string;
  empty: string;
};
interface FormView {
  title: string;
  description: string;
  fields: FieldView[];
  saveLabel: string;
  editing: boolean;
  problems: number;
}

export interface AdminState {
  // what the administrator does
  section: Section;
  /** the table of the Data section */
  entity: string;
  mode: "list" | "form" | "detail";
  table: TableState;
  editId: number;
  draft: Draft;
  errors: Record<string, string>;
  confirm: Confirm;
  /** why a delete was refused */
  guardNote: string;
  detailId: number;
  detailPages: Record<string, number>;
  importError: string;
  askReset: boolean;
  /** the size of an export, worked out when the settings open */
  size: string;
  // derived
  allowed: boolean;
  view: AdminView;
  tabs: { id: Section; label: string; icon: string; active: boolean }[];
  entities: { value: string; label: string; active: boolean }[];
  grid: Grid;
  form: FormView;
  /** the id of the user being edited, to offer "View all data" */
  formUser: number;
  bulk: { show: boolean; count: number; canView: boolean };
  overview: OverviewProps;
  detail: DetailProps | null;
  counts: { id: string; label: string; count: string }[];
  total: string;
}

const NO_CONFIRM: Confirm = { open: false, ids: [], text: "" };
const TABS: { id: Section; label: string; icon: string }[] = [
  { id: "overview", label: "Overview", icon: "k-ai-chart" },
  { id: "users", label: "Users", icon: "k-ai-users" },
  { id: "data", label: "Data", icon: "k-ai-box" },
  { id: "settings", label: "Settings", icon: "k-icon-settings" },
];

const EMPTY_FORM: FormView = {
  title: "",
  description: "",
  fields: [],
  saveLabel: "",
  editing: false,
  problems: 0,
};
const emptyGrid = (table: TableState): Grid => ({
  ...tableView([], [], [], table),
  title: "",
  addLabel: "",
  placeholder: "",
  empty: "",
});
const EMPTY_OVERVIEW = overview(emptyDb(), NOW);

// ---- who and what ----

/** Is the signed-in user an active administrator? */
export function isAdmin(s: Pick<OrbitState, "db" | "me">): boolean {
  const me = byId(s.db.users).get(s.me);
  return me !== undefined && me.role === "admin" && me.status === "active";
}

const ctxOf = (s: OrbitState): Ctx => ({ db: s.db, me: s.me, now: s.now });

/** The table the list and the form work on (none in the overview and the settings). */
function currentEntity(a: AdminState): Entity | undefined {
  if (a.section === "users") return entityOf("users");
  if (a.section === "data") return entityOf(a.entity) ?? DATA_ENTITIES[0];
  return undefined;
}

type Row = Record<string, unknown> & { id: number };
const rowsOf = (db: Db, t: TableName): Row[] => db[t] as unknown as Row[];

const CLEAN = {
  mode: "list" as const,
  editId: 0,
  draft: {} as Draft,
  errors: {},
  confirm: NO_CONFIRM,
  guardNote: "",
  detailId: 0,
  detailPages: {},
};

export function initialAdmin(): AdminState {
  const table = initialTable("name");
  return {
    section: "overview",
    entity: DATA_ENTITIES[0].key,
    table,
    ...CLEAN,
    importError: "",
    askReset: false,
    size: "",
    allowed: false,
    view: "denied",
    tabs: [],
    entities: [],
    grid: emptyGrid(table),
    form: EMPTY_FORM,
    formUser: 0,
    bulk: { show: false, count: 0, canView: false },
    overview: EMPTY_OVERVIEW,
    detail: null,
    counts: [],
    total: "0",
  };
}

// ---- derive ----

export function derive(s: OrbitState): AdminState {
  const a = s.admin;
  if (!isAdmin(s))
    return {
      ...initialAdmin(),
      section: a.section,
      allowed: false,
      view: "denied",
    };
  const e = currentEntity(a);
  const ctx = ctxOf(s);
  const detail =
    a.section === "users" && a.mode === "detail"
      ? userDetail(s.db, a.detailId, a.detailPages)
      : null;
  let view: AdminView =
    a.section === "overview"
      ? "overview"
      : a.section === "settings"
        ? "settings"
        : a.mode === "form"
          ? "form"
          : detail
            ? "detail"
            : "list";
  if (!e && (view === "list" || view === "form")) view = "overview";

  let grid = emptyGrid(a.table);
  let table = a.table;
  if (view === "list" && e) {
    const g = tableView(
      rowsOf(s.db, e.key),
      e.columns(ctx),
      e.filters(ctx),
      a.table,
    );
    grid = {
      ...g,
      title: e.plural,
      addLabel: `New ${e.singular}`,
      placeholder:
        a.section === "users"
          ? "Search by name, email or city..."
          : `Search ${e.plural.toLowerCase()}...`,
      empty: `No ${e.plural.toLowerCase()} match.`,
    };
    table = { ...a.table, page: g.page };
  }
  const form: FormView =
    view === "form" && e
      ? {
          title: a.editId ? `Edit ${e.singular}` : `New ${e.singular}`,
          description: e.description,
          fields: fieldsView(e.fields, a.draft, a.errors, ctx),
          saveLabel: a.editId ? "Save changes" : `Create ${e.singular}`,
          editing: a.editId > 0,
          problems: Object.keys(a.errors).length,
        }
      : EMPTY_FORM;
  const counts = view === "settings" ? dbCounts(s.db) : null;
  return {
    ...a,
    table,
    allowed: true,
    view,
    tabs: TABS.map((t) => ({ ...t, active: t.id === a.section })),
    entities: DATA_ENTITIES.map((x) => ({
      value: x.key,
      label: `${x.plural} (${group(rowsOf(s.db, x.key).length)})`,
      active: x.key === (e?.key ?? a.entity),
    })),
    grid,
    form,
    formUser: view === "form" && a.section === "users" ? a.editId : 0,
    bulk: {
      show:
        view === "list" && a.section === "users" && a.table.selected.length > 0,
      count: a.table.selected.length,
      canView: a.table.selected.length === 1,
    },
    overview: view === "overview" ? overview(s.db, s.now) : EMPTY_OVERVIEW,
    detail,
    counts: counts
      ? ENTITIES.map((x) => ({
          id: x.key,
          label: x.plural,
          count: group((counts as Record<string, number>)[x.key] ?? 0),
        }))
      : [],
    total: counts
      ? group(
          Object.entries(counts).reduce(
            (n, [k, v]) => (k === "session" ? n : n + (v as number)),
            0,
          ),
        )
      : "0",
  };
}

// ---- handlers ----

const guarded =
  (h: Handler): Handler =>
  (p, ev, s) =>
    isAdmin(s) ? h(p, ev, s) : { notice: "Admins only" };

const slice = (
  patch: Partial<AdminState>,
  rest: Omit<Update, "slice"> = {},
): Update => ({ slice: patch as Record<string, unknown>, ...rest });

function exportText(s: OrbitState): string {
  return snapshotText(snapshotOf(s.db, s.now));
}
const sizeOf = (db: Db, now: string): string =>
  `${Math.max(1, Math.round(bytesOf(snapshotText(snapshotOf(db, now))) / 1024))} kB`;

/** The slice patch after a section or a table changes: a fresh list. */
function fresh(
  a: AdminState,
  section: Section,
  entity: string,
): Partial<AdminState> {
  const e = section === "users" ? entityOf("users") : entityOf(entity);
  return {
    section,
    entity,
    ...CLEAN,
    table: initialTable(e?.sortKey ?? "", a.table.pageSize),
    importError: "",
    askReset: false,
  };
}

function tableStep(name: string, payload: unknown, s: OrbitState): Update {
  const a = s.admin;
  const e = currentEntity(a);
  if (!e) return {};
  const ctx = ctxOf(s);
  const visible = (st: TableState): number[] =>
    tableView(rowsOf(s.db, e.key), e.columns(ctx), e.filters(ctx), st).rows.map(
      (r) => r.id,
    );
  return slice({ table: reduceTable<Row>(a.table, name, payload, visible) });
}

function openForm(s: OrbitState, id: number): Update {
  const a = s.admin;
  const e = currentEntity(a);
  if (!e) return {};
  const ctx = ctxOf(s);
  const found = id ? rowsOf(s.db, e.key).find((r) => r.id === id) : undefined;
  if (id && !found) return {};
  const draft: Draft = {
    ...draftOf(e.fields, found ?? e.blank(ctx), ctx),
    __id: String(id),
  };
  return slice({
    mode: "form",
    editId: id,
    draft,
    errors: {},
    confirm: NO_CONFIRM,
    guardNote: "",
  });
}

function formStep(
  name: string,
  payload: unknown,
  ev: Parameters<Handler>[1],
  s: OrbitState,
): Update {
  const a = s.admin;
  const e = currentEntity(a);
  if (!e) return {};
  const ctx = ctxOf(s);
  const draft = reduceDraft(e.fields, a.draft, name, payload, ev, ctx);
  const errors = Object.keys(a.errors).length
    ? validateDraft(e.fields, draft, ctx)
    : a.errors;
  return slice({ draft, errors });
}

/** Asks before deleting: refuses when a rule says no, else shows what goes with the rows. */
function ask(s: OrbitState, ids: number[]): Update {
  const a = s.admin;
  const e = currentEntity(a);
  if (!e) return {};
  const present = byId(rowsOf(s.db, e.key) as { id: number }[]);
  const rows = ids
    .map((id) => present.get(id))
    .filter((r): r is Row => r !== undefined);
  if (rows.length === 0) return {};
  const why =
    e.guardDelete?.(rows, ctxOf(s)) ||
    planDelete(
      s.db,
      e.key,
      rows.map((r) => r.id),
    ).refused;
  if (why) return slice({ guardNote: `${why}.`, confirm: NO_CONFIRM });
  const plan = planDelete(
    s.db,
    e.key,
    rows.map((r) => r.id),
  );
  const side = describeSideEffects(plan, e.key, rows.length);
  const what =
    rows.length === 1
      ? `${e.singular} “${e.label(rows[0], s.db)}”`
      : `${rows.length} ${e.plural.toLowerCase()}`;
  return slice({
    guardNote: "",
    confirm: {
      open: true,
      ids: rows.map((r) => r.id),
      text: `Delete ${what}?${side ? ` This also deletes or edits: ${side}.` : ""} This cannot be undone.`,
    },
  });
}

const capital = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

/** The database to keep after an import or a reset: the signed-in user stays signed in when they still exist. */
function withSession(db: Db, me: number): Db {
  return {
    ...db,
    session: db.users.some((u) => u.id === me) ? [{ id: 1, userId: me }] : [],
  };
}

const handlers: Record<string, Handler> = {
  section: (p, _e, s) => {
    const section = String(p) as Section;
    if (!TABS.some((t) => t.id === section)) return;
    return slice({
      ...fresh(s.admin, section, s.admin.entity),
      size: section === "settings" ? sizeOf(s.db, s.now) : s.admin.size,
    });
  },
  entity: (_p, ev, s) => {
    const key = ev?.value ?? "";
    if (!DATA_ENTITIES.some((x) => x.key === key)) return;
    return slice(fresh(s.admin, "data", key));
  },

  // the data table
  "table.search": (_p, ev, s) => tableStep("search", ev?.value ?? "", s),
  "table.sort": (p, _e, s) => tableStep("sort", p, s),
  "table.filter": (p, ev, s) => tableStep("filter", [p, ev?.value ?? ""], s),
  "table.toggleAll": (p, _e, s) => tableStep("toggleAll", p, s),
  "table.toggleRow": (p, _e, s) => tableStep("toggleRow", p, s),
  "table.prev": (p, _e, s) => tableStep("prev", p, s),
  "table.next": (p, _e, s) => tableStep("next", p, s),
  "table.goto": (p, _e, s) => tableStep("goto", p, s),
  "table.pageSize": (_p, ev, s) => tableStep("pageSize", ev?.value, s),
  "table.add": (_p, _e, s) => openForm(s, 0),
  "table.edit": (p, _e, s) => openForm(s, Number(p)),
  "table.remove": (p, _e, s) => ask(s, [Number(p)]),
  "table.removeSelected": (_p, _e, s) => ask(s, s.admin.table.selected),

  // the form
  "form.change": (p, ev, s) => formStep("change", p, ev, s),
  "form.toggle": (p, ev, s) => formStep("toggle", p, ev, s),
  "form.check": (p, ev, s) => formStep("check", p, ev, s),
  "form.checkAll": (p, ev, s) => formStep("checkAll", p, ev, s),
  "form.checkNone": (p, ev, s) => formStep("checkNone", p, ev, s),
  "form.lineAdd": (p, ev, s) => formStep("lineAdd", p, ev, s),
  "form.lineRemove": (p, ev, s) => formStep("lineRemove", p, ev, s),
  "form.lineSet": (p, ev, s) => formStep("lineSet", p, ev, s),
  "form.cancel": (_p, _e, s) =>
    slice({
      mode:
        s.admin.mode === "form" &&
        s.admin.detailId > 0 &&
        s.admin.section === "users"
          ? "detail"
          : "list",
      editId: 0,
      draft: {},
      errors: {},
      confirm: NO_CONFIRM,
      guardNote: "",
    }),
  "form.remove": (_p, _e, s) => ask(s, [s.admin.editId]),
  "form.save": (_p, _e, s) => {
    const a = s.admin;
    const e = currentEntity(a);
    if (!e) return;
    const ctx = ctxOf(s);
    const errors = validateDraft(e.fields, a.draft, ctx);
    if (Object.keys(errors).length > 0) return slice({ errors });
    const rows = rowsOf(s.db, e.key);
    const base: Record<string, unknown> = a.editId
      ? (rows.find((r) => r.id === a.editId) ?? e.blank(ctx))
      : e.blank(ctx);
    let row = {
      ...rowOf(e.fields, a.draft, base, ctx),
      id: a.editId || nextId(rows),
    } as Row;
    if (e.beforeSave) row = e.beforeSave(row, ctx, a.draft) as Row;
    const back =
      a.section === "users" && a.detailId > 0 && a.editId > 0
        ? "detail"
        : "list";
    return slice(
      { mode: back, editId: 0, draft: {}, errors: {} },
      {
        put: { [e.key]: [row] } as Update["put"],
        notice: `${capital(e.singular)} ${a.editId ? "updated" : "created"}: ${e.label(row, { ...s.db, [e.key]: [...rows.filter((r) => r.id !== row.id), row] } as unknown as Db)}`,
      },
    );
  },

  // delete, with a question first
  confirmNo: () => slice({ confirm: NO_CONFIRM, guardNote: "" }),
  confirmYes: (_p, _e, s) => {
    const a = s.admin;
    const e = currentEntity(a);
    if (!e || !a.confirm.open) return;
    const ids = a.confirm.ids;
    const present = byId(rowsOf(s.db, e.key) as { id: number }[]);
    const rows = ids
      .map((id) => present.get(id))
      .filter((r): r is Row => r !== undefined);
    const why =
      e.guardDelete?.(rows, ctxOf(s)) || planDelete(s.db, e.key, ids).refused;
    if (why) return slice({ confirm: NO_CONFIRM, guardNote: `${why}.` });
    const plan = planDelete(s.db, e.key, ids);
    const gone = new Set(ids);
    return slice(
      {
        confirm: NO_CONFIRM,
        guardNote: "",
        mode: "list",
        editId: 0,
        draft: {},
        detailId: 0,
        table: {
          ...a.table,
          selected: a.table.selected.filter((x) => !gone.has(x)),
        },
      },
      {
        remove: removeOf(plan),
        put: putOf(plan) as Update["put"],
        notice:
          ids.length === 1
            ? `${capital(e.singular)} deleted`
            : `${ids.length} ${e.plural.toLowerCase()} deleted`,
      },
    );
  },

  // users: bulk ban, and the page with all the data of one user
  bulkBan: (_p, _e, s) => setStatus(s, "banned"),
  bulkUnban: (_p, _e, s) => setStatus(s, "active"),
  viewTicked: (_p, _e, s) =>
    s.admin.table.selected.length === 1
      ? slice({
          mode: "detail",
          detailId: s.admin.table.selected[0],
          detailPages: {},
          confirm: NO_CONFIRM,
          guardNote: "",
        })
      : undefined,
  viewUser: (p, _e, s) =>
    byId(s.db.users).has(Number(p))
      ? slice(
          {
            section: "users",
            mode: "detail",
            detailId: Number(p),
            detailPages: {},
            confirm: NO_CONFIRM,
            guardNote: "",
          },
          { go: { screen: "admin" } },
        )
      : undefined,
  detailBack: () =>
    slice({
      mode: "list",
      detailId: 0,
      detailPages: {},
      confirm: NO_CONFIRM,
      guardNote: "",
    }),
  detailEdit: (_p, _e, s) => openForm(s, s.admin.detailId),
  detailRemove: (_p, _e, s) => ask(s, [s.admin.detailId]),
  detailPage: (p, _e, s) => {
    const [key, step] = p as [string, number];
    const cur = s.admin.detailPages[key] ?? 1;
    return slice({
      detailPages: {
        ...s.admin.detailPages,
        [key]: Math.max(1, cur + Number(step)),
      },
    });
  },
  openWall: (_p, _e, s) =>
    s.admin.detailId > 0
      ? { go: { screen: "wall", params: { userId: s.admin.detailId } } }
      : undefined,

  // settings: export, import, reset
  settingsExport: (_p, _e, s) => ({
    effects: [
      filesEffector.download(
        `orbit-social-${s.now.slice(0, 10)}.json`,
        exportText(s),
        "application/json",
        "admin.exported",
      ),
    ],
  }),
  exported: () => ({ notice: "Exported all data as JSON" }),
  settingsImport: () => ({
    effects: [
      filesEffector.pick(
        ".json,application/json",
        "admin.importPicked",
        "admin.importFailed",
      ),
    ] as Effect[],
  }),
  importFailed: (p) =>
    slice({ importError: `Could not read the file: ${String(p)}` }),
  importPicked: (p, _e, s) => {
    const { name, text } = p as Picked;
    const r = parseSnapshot(text);
    if (!r.ok) return slice({ importError: `${name}: ${r.error}` });
    const db = withSession(r.db, s.me);
    const rows = Object.entries(dbCounts(db)).reduce(
      (n, [k, v]) => (k === "session" ? n : n + (v as number)),
      0,
    );
    return slice(
      {
        ...fresh(s.admin, "settings", s.admin.entity),
        size: sizeOf(db, s.now),
      },
      { replaceDb: db, notice: `Imported ${name}: ${group(rows)} rows` },
    );
  },
  settingsAskReset: () => slice({ askReset: true }),
  settingsCancelReset: () => slice({ askReset: false }),
  settingsReset: (_p, _e, s) => {
    const db = withSession(seedDb(), s.me);
    return slice(
      {
        ...fresh(s.admin, "settings", s.admin.entity),
        size: sizeOf(db, s.now),
      },
      { replaceDb: db, notice: "All data was reset to the sample data" },
    );
  },
};

/** Bans or unbans the ticked users (never the administrator doing it). */
function setStatus(s: OrbitState, status: "active" | "banned"): Update {
  const ids = new Set(s.admin.table.selected);
  const users = byId(s.db.users);
  const rows = [...ids]
    .map((id) => users.get(id))
    .filter(
      (u): u is NonNullable<typeof u> =>
        u !== undefined &&
        u.status !== status &&
        !(status === "banned" && u.id === s.me),
    );
  const skipped =
    status === "banned" && ids.has(s.me) ? " (you cannot ban yourself)" : "";
  if (rows.length === 0)
    return slice(
      { table: { ...s.admin.table, selected: [] } },
      {
        notice: `Nobody to ${status === "banned" ? "ban" : "unban"}${skipped}`,
      },
    );
  return slice(
    { table: { ...s.admin.table, selected: [] } },
    {
      put: { users: rows.map((u) => ({ ...u, status })) },
      notice: `${rows.length} user${rows.length === 1 ? "" : "s"} ${status === "banned" ? "banned" : "unbanned"}${skipped}`,
    },
  );
}

export const adminModule: Module<AdminState> = {
  key: "admin",
  screens: ["admin"],
  initial: initialAdmin,
  derive,
  enter: (params, s) => {
    if (!isAdmin(s)) return;
    const userId = Number(params?.userId);
    if (userId > 0 && byId(s.db.users).has(userId))
      return slice({
        section: "users",
        mode: "detail",
        detailId: userId,
        detailPages: {},
        confirm: NO_CONFIRM,
        guardNote: "",
      });
    return undefined;
  },
  handlers: Object.fromEntries(
    Object.entries(handlers).map(([k, h]) => [k, guarded(h)]),
  ),
};
