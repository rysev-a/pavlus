/**
 * The application state and its shape. This is data, only data: the views
 * render it, the handlers replace it through the store, and it never holds
 * components or DOM nodes — so the same state renders on the server and in
 * the browser. Each page owns one slice of it, the route included.
 */

import type { Route } from "@service-laboratory/pavlus";

/** One row of the list: what `GET /api/users` answers. */
export interface User {
  id: number;
  name: string;
  email: string;
  role_id: number;
  /** The role's name, joined in by the backend. */
  role: string;
}

/** What `GET /api/roles` answers: the options of the form's select. */
export interface Role {
  id: number;
  name: string;
}

/**
 * One entry of the sidebar's menu: where it points and what it says. The
 * icon is a name the stylesheet resolves (`.ui-sidebar-icon[data-icon=…]`).
 */
export interface MenuItem {
  path: string;
  title: string;
  icon?: string;
}

/** The form's own values. `id: null` creates, a number edits. */
export interface FormState {
  id: number | null;
  name: string;
  email: string;
  /** The role's id as a string: what a `<select>` holds. */
  roleId: string;
}

/** The columns the table can sort by. */
export type SortKey = "id" | "name" | "email" | "role";

/** The slice the users page reads and paints. */
export interface ListState {
  /** Every user, as the API answered; the page slices it into `rows`. */
  users: User[];
  /** The current page's rows: computed by the handlers, never in the view. */
  rows: User[];
  /** How many users match the filter. */
  total: number;
  /** The toolbar's filter text, matched against every field. */
  filter: string;
  /** One-based page number. */
  page: number;
  /** How many pages the matches fill (at least one). */
  pages: number;
  /** Rows per page, from the footer's select. */
  pageSize: number;
  /** The list request: "loading" until it answers. */
  status: "idle" | "loading" | "failed";
  /** The last list failure, shown until the next success. */
  error: string;
  /** The checked rows' ids, in click order. */
  selected: number[];
  /** Whether every row on the page is checked — the header's box. */
  allOn: boolean;
  /** The column the table is sorted by, and its direction (1 up, -1 down). */
  sortKey: SortKey;
  sortDir: 1 | -1;
}

/**
 * The slice an open form reads: its values (null until the page filled them)
 * and the last save error. The role options come in as a prop from the shell.
 */
export interface FormSlice {
  form: FormState | null;
  error: string;
}

export interface AppState {
  /** Where we are; null until the router plugin reports it. */
  route: Route | null;
  /** The sidebar's menu: one item per section, in display order. */
  menu: MenuItem[];
  /** The role catalogue, loaded once and passed to the forms as a prop. */
  roles: Role[];
  /** The users page (`/`), embedded by the shell's `+outlet`. */
  list: ListState;
  /** The edit page (`/:id/edit`). */
  edit: FormSlice;
  /** The create page (`/new`). */
  new: FormSlice;
}

export const initialState: AppState = {
  route: null,
  menu: [{ path: "/", title: "Users", icon: "users" }],
  roles: [],
  list: {
    users: [],
    rows: [],
    total: 0,
    filter: "",
    page: 1,
    pages: 1,
    pageSize: 10,
    status: "idle",
    error: "",
    selected: [],
    allOn: false,
    sortKey: "id",
    sortDir: 1,
  },
  edit: { form: null, error: "" },
  new: { form: null, error: "" },
};
