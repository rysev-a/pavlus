/**
 * The application state and its shape. This is data, only data: the view
 * renders it, the handlers replace it through the store, and it never holds
 * components or DOM nodes — so the same state renders on the server and in
 * the browser.
 */

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

/** The open form, or null when it is closed. `id: null` creates, a number edits. */
export interface FormState {
  id: number | null;
  name: string;
  email: string;
  /** The role's id as a string: what a `<select>` holds. */
  roleId: string;
}

export interface AppState {
  users: User[];
  roles: Role[];
  /** The list request: "loading" until it answers. */
  status: "idle" | "loading" | "failed";
  /** The last failure (load, save or remove), shown until the next success. */
  error: string;
  form: FormState | null;
}

export const initialState: AppState = {
  users: [],
  roles: [],
  status: "idle",
  error: "",
  form: null,
};
