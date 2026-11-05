/**
 * The users page (`/`): a mini-application, no different from the whole app.
 * It owns its slice of the state (`list`) — every write it makes lands there
 * and answers "paint", and the paint handler diffs the slice (the answer
 * arrives already sliced: the outlet's boundary knows the page's key) and
 * hands the patches to the dom plugin without a target; the boundary scopes
 * them to the right nodes. The slice is the full user list plus the table's
 * knobs — filter, page, page size — and `rows`, the current page's slice,
 * computed here so the template stays a pure function of the state. The rows
 * themselves are a child component (user-list-row.ts, the `+Row#row` of the
 * template): its events arrive prefixed `row.`, handled here for the table's
 * concerns and by the child for its own; its writes answer `row.paint`,
 * handled here because the row's DOM is part of this page's view.
 */
import {
  Component,
  type Children,
  type Effect,
  type Message,
} from "@service-laboratory/pavlus";
import { DomPlugin } from "@service-laboratory/pavlus/plugins/dom";
import {
  httpEffector as http,
  routerEffector as router,
  storeEffector as store,
} from "@service-laboratory/pavlus/plugins";
import view from "./user-list.pavlus";
import { UserListRow } from "./user-list-row/user-list-row.ts";
import type { ListState, SortKey, User } from "../state.ts";

/** The users matching the filter text: name, email, role or id. */
const filterUsers = (users: User[], q: string): User[] => {
  if (!q) return users;
  const needle = q.toLowerCase();
  return users.filter((u) =>
    [u.name, u.email, u.role, String(u.id)].some((f) =>
      f.toLowerCase().includes(needle),
    ),
  );
};

/** The page's slice of a list: clamped to the last page, with the page count. */
const pageOf = (
  users: User[],
  page: number,
  pageSize: number,
): { rows: User[]; page: number; pages: number } => {
  const pages = Math.max(1, Math.ceil(users.length / pageSize));
  const p = Math.min(Math.max(1, page), pages);
  return {
    rows: users.slice((p - 1) * pageSize, p * pageSize),
    page: p,
    pages,
  };
};

/** Sort by a column, one direction, numbers numeric and the rest lexical. */
const sortBy = (users: User[], by: SortKey, dir: 1 | -1): User[] =>
  [...users].sort((a, b) => {
    const x = a[by];
    const y = b[by];
    const c =
      typeof x === "number" && typeof y === "number"
        ? x - y
        : String(x).localeCompare(String(y));
    return dir * c;
  });

/** Whether every row on the page is in the selection: the header's box. */
const allOf = (selected: number[], s: { rows: User[] }): boolean =>
  s.rows.length > 0 && s.rows.every((u) => selected.includes(u.id));

export class UserList extends Component<ListState> {
  view = view;

  /** The table's rows: one behavior for every `+Row#row` iteration. */
  private readonly row = new UserListRow();

  /** The template's embedded children, by instance name (`row.*` routes there). */
  children: Children<ListState> = {
    row: { component: this.row, tag: "user-row" },
  };

  /** The answer of a write: diff the slice, hand over the patches. */
  paint(msg: Message): Effect[] {
    const { prev, next } = msg.payload as {
      prev: ListState;
      next: ListState;
    };
    console.log(prev, next);
    console.log(view.diff(prev, next));
    return [DomPlugin.update(view.diff(prev, next))];
  }

  /**
   * A row's write answered: the reply comes back as `row.paint` (the row's
   * boundary prefixed it), and the page repaints — the row's DOM is part of
   * its view, so this diff produces the row's patches too, with ids that
   * carry the loop key and the embed (see UserListRow).
   */
  "row.paint"(msg: Message): Effect[] {
    return this.paint(msg);
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
    return [
      store.set("users", users, { onSuccess: "paint" }),
      store.set("status", "idle", { onSuccess: "paint" }),
      store.set("error", "", { onSuccess: "paint" }),
      ...this.repage(s, { users }),
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

  /** The header's button: the create page. */
  newUser(): Effect[] {
    return [router.navigate("/new")];
  }

  /** A row's edit button: that user's page. */
  "row.edit"(msg: Message): Effect[] {
    const user = msg.payload as User;
    return [router.navigate(`/${user.id}/edit`)];
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
    const users = sortBy(s.users, by, dir);
    return [
      store.set("users", users, { onSuccess: "paint" }),
      store.set("sortKey", by, { onSuccess: "paint" }),
      store.set("sortDir", dir, { onSuccess: "paint" }),
      ...this.repage(s, { users }),
    ];
  }

  /** A row's checkbox: add or drop the row from the selection. */
  "row.pick"(msg: Message, s: ListState): Effect[] {
    const id = msg.payload as number;
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
    const ids = s.rows.map((u) => u.id);
    const all = ids.every((id) => s.selected.includes(id));
    const selected = all
      ? s.selected.filter((id) => !ids.includes(id))
      : [...s.selected, ...ids.filter((id) => !s.selected.includes(id))];
    return [
      store.set("selected", selected, { onSuccess: "paint" }),
      store.set("allOn", !all && s.rows.length > 0, { onSuccess: "paint" }),
    ];
  }

  /** A row's delete button: a request, nothing to change yet. */
  "row.remove"(msg: Message): Effect[] {
    return [
      http.request({
        id: "remove",
        method: "DELETE",
        url: `/api/users/${msg.payload as number}`,
        onSuccess: "removed",
        onError: "failed",
      }),
    ];
  }

  removed(msg: Message, s: ListState): Effect[] {
    const id = (msg.payload as { data: { deleted: number } }).data.deleted;
    const users = s.users.filter((u) => u.id !== id);
    return [
      store.set("users", users, { onSuccess: "paint" }),
      store.set(
        "selected",
        s.selected.filter((x) => x !== id),
        { onSuccess: "paint" },
      ),
      store.set(
        "starred",
        s.starred.filter((x) => x !== id),
        { onSuccess: "paint" },
      ),
      ...this.repage(s, { users }),
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
    return [
      store.set("filter", "", { onSuccess: "paint" }),
      store.set("page", 1, { onSuccess: "paint" }),
      store.set("pages", 1, { onSuccess: "paint" }),
      store.set("pageSize", 10, { onSuccess: "paint" }),
      store.set("selected", [], { onSuccess: "paint" }),
      store.set("starred", [], { onSuccess: "paint" }),
      store.set("sortKey", "id", { onSuccess: "paint" }),
      store.set("sortDir", 1, { onSuccess: "paint" }),
      ...this.load(),
    ];
  }

  /**
   * The one place the table's derived state is computed: filter the users,
   * slice the page, write `rows`, `total`, the clamped page and whether the
   * header's box should be on. `over` is the slice with the incoming change
   * already applied.
   */
  private repage(
    s: ListState,
    over: Partial<
      Pick<ListState, "users" | "filter" | "page" | "pageSize" | "selected">
    >,
  ): Effect[] {
    const { users = s.users, filter = s.filter } = over;
    const page = over.page ?? s.page;
    const pageSize = over.pageSize ?? s.pageSize;
    const selected = over.selected ?? s.selected;
    const matched = filterUsers(users, filter);
    const slice = pageOf(matched, page, pageSize);
    const view = { rows: slice.rows, selected };
    // The knobs themselves land in the store too, not just their effects: the
    // next repage (a delete, a reload) must filter by what the user typed.
    const knobs: Effect[] = [];
    if (over.filter !== undefined)
      knobs.push(store.set("filter", filter, { onSuccess: "paint" }));
    if (over.pageSize !== undefined)
      knobs.push(store.set("pageSize", pageSize, { onSuccess: "paint" }));
    return [
      ...knobs,
      store.set("rows", slice.rows, { onSuccess: "paint" }),
      store.set("total", matched.length, { onSuccess: "paint" }),
      store.set("page", slice.page, { onSuccess: "paint" }),
      store.set("pages", slice.pages, { onSuccess: "paint" }),
      store.set("allOn", allOf(selected, view), { onSuccess: "paint" }),
    ];
  }
}
