/**
 * The users page (`/`): a mini-application, no different from the whole app.
 * It owns its slice of the state (`list`) — every write it makes lands there
 * and answers "paint", and the paint handler diffs the slice (the answer
 * arrives already sliced: the outlet's boundary knows the page's key) and
 * hands the patches to the dom plugin without a target; the boundary scopes
 * them to the right nodes. The slice is the id-keyed map of rows (`byId`, the
 * source of truth: a row's own writes land in its element) plus the table's
 * knobs — filter, page, page size, the matching `order` of row ids — computed
 * here so the template stays a pure function of the state.
 *
 * The rows themselves are keyed children (`each: "byId"` on the `row` child,
 * the `+Row#row(key=id)` of the template): each row's events arrive as
 * `row.<id>.…`, handled by the row's own component alone — this page never
 * sees them, exactly as it should: the row's business is the row's. What the
 * page handles is the table's own: the checkbox and the selection, the pager
 * and the filter, the sort, the edit and delete buttons (rendered by this
 * template, outside the embed, their messages addressed without a key).
 */
import {
  type Children,
  Component,
  type Effect,
  type Message,
  type Patch,
} from "@pavlus/frontend";
import {
  httpEffector as http,
  routerEffector as router,
  storeEffector as store,
} from "@pavlus/frontend/plugins";
import { DomPlugin } from "@pavlus/frontend/plugins/dom";
import {
  assertBinding,
  type ListBinding,
  type ListNote,
  listPatches,
} from "../list-patches.ts";
import type { ListState, RowState, SortKey, User } from "../state.ts";
import view from "./user-list.pavlus";
import { UserListHeader } from "./user-list-header/user-list-header.ts";
import { UserListRow } from "./user-list-row/user-list-row.ts";

/** The users matching the filter text: name, email, role or id. */
const filterUsers = (users: RowState[], q: string): RowState[] => {
  if (!q) return users;
  const needle = q.toLowerCase();
  return users.filter((u) =>
    [u.name, u.email, u.role, String(u.id)].some((f) =>
      f.toLowerCase().includes(needle),
    ),
  );
};

/** Sort by a column, one direction, numbers numeric and the rest lexical. */
const sortBy = (users: RowState[], by: SortKey, dir: 1 | -1): RowState[] =>
  [...users].sort((a, b) => {
    const x = a[by];
    const y = b[by];
    const c =
      typeof x === "number" && typeof y === "number"
        ? x - y
        : String(x).localeCompare(String(y));
    return dir * c;
  });

/**
 * The page's window of a list: clamped to the last page, with the page count.
 * The window is ids (`order`): the table loops over them and hands each row
 * its own element of `byId`.
 */
const pageOf = (
  users: RowState[],
  page: number,
  pageSize: number,
): { order: string[]; page: number; pages: number } => {
  const pages = Math.max(1, Math.ceil(users.length / pageSize));
  const p = Math.min(Math.max(1, page), pages);
  return {
    order: users
      .slice((p - 1) * pageSize, p * pageSize)
      .map((u) => String(u.id)),
    page: p,
    pages,
  };
};

/** Whether every row on the page is in the selection: the header's box. */
const allOf = (selected: string[], s: { order: string[] }): boolean =>
  s.order.length > 0 && s.order.every((id) => selected.includes(id));

/**
 * The `for id in order key id` block of user-list.pavlus, for the point-wise
 * list patches (../list-patches.ts): the marker ids are copied from the
 * compiled module (its itemStartId / itemEndId / list end), and the dev
 * assert in `paint` flags the binding going stale after template edits.
 */
export const rows: ListBinding<ListState, string> = {
  field: "order",
  keyOf: (id) => id,
  start: (key) => `#${key}33[`,
  end: (key) => `#${key}33]`,
  listEnd: "33e",
};

export class UserList extends Component<ListState> {
  view = view;

  /**
   * The page's header (the `+Header#header` embed): keyless — it sees the
   * page's whole state and its messages arrive as `header.…` at its own
   * component. The "new user" button is its concern, not the table's.
   */
  private readonly header = new UserListHeader();

  /**
   * The table's rows: one behavior for every `+Row#row(key=…)` instance. The
   * `each` makes the boundary keyed: the instance named by the key segment of
   * its message id (`row.<id>.…`) sees exactly `state.byId[id]` — never the
   * other rows — and its store writes land in the same element.
   */
  private readonly row = new UserListRow();

  /** The template's embedded children, by instance name (`row.<id>.*` routes there). */
  children: Children<ListState> = {
    header: {
      component: this.header,
      tag: "user-list-header",
    },
    row: {
      component: this.row,
      each: "byId",
      // the debug tree shows the rendered window (`order`), not every
      // loaded user — the runtime itself never calls this
      live: (s) => s.order,
      tag: "user-row",
    },
  };

  /** What the running handler did to `order`; spent by the answer that changed it. */
  private note: ListNote | undefined;

  /** Whether the list binding's markers were checked against the view once. */
  private bindingChecked = false;

  /**
   * The answer of a write: diff the slice, hand over the patches. The answer
   * that changed `order` spends the handler's note first (point-wise patches,
   * ../list-patches.ts) and falls back to the generic diff whenever there is
   * no note or the note does not verify.
   */
  paint(msg: Message): Effect[] {
    const { prev, next } = msg.payload as {
      prev: ListState;
      next: ListState;
    };
    // The table (and its markers) is rendered only outside "loading".
    if (!this.bindingChecked && next.status !== "loading") {
      this.bindingChecked = true;
      if (import.meta.env?.DEV) assertBinding(view, rows, next);
    }
    let patches: Patch[];
    if (prev.order !== next.order) {
      // this answer is the order write: the note (if any) belongs to it
      const note = this.note;
      this.note = undefined;
      patches =
        (note && listPatches(view, rows, prev, next, note)) ??
        view.diff(prev, next);
    } else {
      // another field's answer: its guards skip the list anyway
      patches = view.diff(prev, next);
    }
    return [DomPlugin.update(patches)];
  }

  /** The router activated this page (also on the first route). */
  enter(): Effect[] {
    return this.load();
  }

  /** Asked to load the users. */
  load(): Effect[] {
    return [
      store.set("status", "loading", { onSuccess: "paint" }),
      http.request({
        id: "users",
        url: "/api/users",
        onSuccess: "loaded",
        onError: "failed",
      }),
    ];
  }

  loaded(msg: Message, s: ListState): Effect[] {
    const users = (msg.payload as { data: User[] }).data;
    // The API's array becomes the id-keyed map — each element one row's own
    // state, carrying its star across a reload.
    const byId: Record<string, RowState> = {};
    for (const u of users)
      byId[String(u.id)] = {
        ...u,
        starred: s.byId[String(u.id)]?.starred ?? false,
      };
    return [
      store.set("byId", byId, { onSuccess: "paint" }),
      store.set("status", "idle", { onSuccess: "paint" }),
      store.set("error", "", { onSuccess: "paint" }),
      ...this.repage(s, { byId }),
    ];
  }

  failed(msg: Message): Effect[] {
    return [
      store.set("status", "failed", { onSuccess: "paint" }),
      store.set(
        "error",
        (msg.payload as { error?: string }).error ?? "could not load the users",
        { onSuccess: "paint" },
      ),
    ];
  }

  /** A row's edit button: that user's page. */
  edit(msg: Message): Effect[] {
    return [router.navigate(`/${msg.payload}/edit`)];
  }

  /** A row's delete button: a request, nothing to change yet. */
  remove(msg: Message): Effect[] {
    return [
      http.request({
        id: "remove",
        method: "DELETE",
        url: `/api/users/${msg.payload}`,
        onSuccess: "removed",
        onError: "failed",
      }),
    ];
  }

  /** The toolbar's filter: back to the first page of the matches. */
  search(msg: Message, s: ListState): Effect[] {
    return this.repage(s, { filter: msg.event?.value ?? "" });
  }

  /** The footer's pager: one page forward or back. */
  turn(msg: Message, s: ListState): Effect[] {
    return this.repage(s, { page: s.page + (msg.payload as number) });
  }

  /** The footer's select: a new page size, from the first page. */
  resize(msg: Message, s: ListState): Effect[] {
    return this.repage(s, {
      pageSize: Number(msg.event?.value ?? 10),
      page: 1,
    });
  }

  /** A header click: sort by that column, toggling the direction. */
  sort(msg: Message, s: ListState): Effect[] {
    const by = msg.payload as SortKey;
    const dir: 1 | -1 = s.sortKey === by ? (s.sortDir === 1 ? -1 : 1) : 1;
    this.note = { kind: "sort" }; // the intent, for the order answer
    return [
      store.set("sortKey", by, { onSuccess: "paint" }),
      store.set("sortDir", dir, { onSuccess: "paint" }),
      ...this.repage(s, { sortKey: by, sortDir: dir }),
    ];
  }

  /** A row's checkbox: add or drop the row from the selection. */
  pick(msg: Message, s: ListState): Effect[] {
    const id = String(msg.payload);
    const selected = s.selected.includes(id)
      ? s.selected.filter((x) => x !== id)
      : [...s.selected, id];
    return [
      store.set("selected", selected, { onSuccess: "paint" }),
      store.set("allOn", allOf(selected, s), { onSuccess: "paint" }),
    ];
  }

  /** The header's checkbox: every row on the page, or none. */
  pickAll(_m: Message, s: ListState): Effect[] {
    const ids = s.order;
    const all = ids.every((id) => s.selected.includes(id));
    const selected = all
      ? s.selected.filter((id) => !ids.includes(id))
      : [...s.selected, ...ids.filter((id) => !s.selected.includes(id))];
    return [
      store.set("selected", selected, { onSuccess: "paint" }),
      store.set("allOn", !all && s.order.length > 0, { onSuccess: "paint" }),
    ];
  }

  removed(msg: Message, s: ListState): Effect[] {
    const id = String(
      (msg.payload as { data: { deleted: number } }).data.deleted,
    );
    // The page's window keeps its rows only when the deleted row is on it and
    // the window neither slides (a later page's first row would move in) nor
    // gets clamped (it was an over-long last page): then the order answer is a
    // plain remove of the one key; otherwise the generic diff repaints it.
    const after = filterUsers(
      Object.values(s.byId).filter((u) => String(u.id) !== id),
      s.filter,
    );
    const pages = Math.max(1, Math.ceil(after.length / s.pageSize));
    const onPage = s.order.includes(id);
    const steady =
      onPage && s.page <= pages && after.length < s.page * s.pageSize;
    this.note = steady ? { kind: "remove", keys: [id] } : undefined;
    return [
      store.remove(`byId.${id}`, { onSuccess: "paint" }),
      store.set(
        "selected",
        s.selected.filter((x) => x !== id),
        { onSuccess: "paint" },
      ),
      ...this.repage(s, {
        byId: Object.fromEntries(
          Object.entries(s.byId).filter(([k]) => k !== id),
        ),
      }),
    ];
  }

  /** The bottom button: the database is rebuilt from its seed files. */
  reset(): Effect[] {
    return [
      http.request({
        id: "reset",
        method: "POST",
        url: "/api/reset",
        onSuccess: "resetDone",
        onError: "failed",
      }),
    ];
  }

  /** The reset went through: back to the defaults and a fresh load. */
  resetDone(_m: Message): Effect[] {
    // One write — one paint, one history entry — instead of one per field.
    // `byId` too: the reload must not carry the old rows' stars over.
    return [
      store.merge(
        {
          byId: {},
          filter: "",
          page: 1,
          pages: 1,
          pageSize: 10,
          selected: [],
          sortKey: "id",
          sortDir: 1,
        },
        { onSuccess: "paint" },
      ),
      ...this.load(),
    ];
  }

  /**
   * The one place the table's derived state is computed: filter the rows,
   * sort the matches, slice the page, write `order`, `total`, the clamped
   * page and whether the header's box should be on. `over` is the slice with
   * the incoming change already applied.
   */
  private repage(
    s: ListState,
    over: Partial<
      Pick<
        ListState,
        | "byId"
        | "filter"
        | "page"
        | "pageSize"
        | "sortKey"
        | "sortDir"
        | "selected"
      >
    >,
  ): Effect[] {
    const { byId = s.byId, filter = s.filter } = over;
    const page = over.page ?? s.page;
    const pageSize = over.pageSize ?? s.pageSize;
    const matched = sortBy(
      filterUsers(Object.values(byId), filter),
      over.sortKey ?? s.sortKey,
      over.sortDir ?? s.sortDir,
    );
    const slice = pageOf(matched, page, pageSize);
    // The knobs themselves land in the store too, not just their effects: the
    // next repage (a delete, a reload) must filter by what the user typed.
    const knobs: Effect[] = [];
    if (over.filter !== undefined)
      knobs.push(store.set("filter", filter, { onSuccess: "paint" }));
    if (over.pageSize !== undefined)
      knobs.push(store.set("pageSize", pageSize, { onSuccess: "paint" }));
    return [
      ...knobs,
      store.set("order", slice.order, { onSuccess: "paint" }),
      store.set("total", matched.length, { onSuccess: "paint" }),
      store.set("page", slice.page, { onSuccess: "paint" }),
      store.set("pages", slice.pages, { onSuccess: "paint" }),
      store.set("allOn", allOf(over.selected ?? s.selected, slice), {
        onSuccess: "paint",
      }),
    ];
  }
}
