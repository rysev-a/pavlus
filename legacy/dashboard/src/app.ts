import {
  Component,
  type Effect,
  type Message,
} from "@service-laboratory/pavlus";
import {
  httpEffector as http,
  storeEffector as store,
} from "@service-laboratory/pavlus/plugins";
import view from "./dashboard.pavlus";

/** A row of the list: what `GET /api/users` answers. */
export interface User {
  id: number;
  name: string;
  email: string;
  role_id: number;
  role: string;
}

/** What `GET /api/roles` answers. */
export interface Role {
  id: number;
  name: string;
}

export interface AppState {
  users: User[];
  roles: Role[];
  /** The list request: "loading" until it answers. */
  status: "idle" | "loading" | "failed";
  /** The last failure (load or save), shown until the next success. */
  error: string;
  /** The open form, or null. `id: null` creates, a number edits. */
  form: {
    id: number | null;
    name: string;
    email: string;
    roleId: string;
  } | null;
}

export const initialState: AppState = {
  users: [],
  roles: [],
  status: "idle",
  error: "",
  form: null,
};

/**
 * The whole app: one component. `createApp` mounts it and reads
 * `updateDomOnStateChange` — that flag is what repaints the view on every
 * state change. Without it nothing would touch the DOM: the handlers only
 * change state and ask plugins for effects.
 */
export class Dashboard extends Component<AppState> {
  view = view;
  // The flag `createApp` reads: follow the state, repaint on every change.
  updateDomOnStateChange = true;

  /** In the DOM: load the list and the roles for the form's select. */
  mounted(): Effect[] {
    return [
      store.set("status", "loading"),
      http.request({
        id: "users",
        url: "/api/users",
        onSuccess: "users.loaded",
        onError: "users.failed",
      }),
      http.request({
        id: "roles",
        url: "/api/roles",
        onSuccess: "roles.loaded",
        onError: "roles.failed",
      }),
    ];
  }

  "users.loaded"(msg: Message): Effect[] {
    // The chain: this write answers with `users.changed` once the list
    // really changed, and that message closes the form.
    return [
      store.set("status", "idle"),
      store.set("error", ""),
      store.set("users", (msg.payload as { data: User[] }).data, {
        onSuccess: "users.changed",
      }),
    ];
  }

  /** The store answered the write: the next decision (close the form). */
  "users.changed"(): Effect[] {
    return [store.set("form", null)];
  }

  "roles.loaded"(msg: Message): Effect[] {
    return [store.set("roles", (msg.payload as { data: Role[] }).data)];
  }

  "users.failed"(msg: Message): Effect[] {
    return [
      store.set("status", "failed"),
      store.set(
        "error",
        (msg.payload as { error?: string }).error ?? "could not load the users",
      ),
    ];
  }

  "roles.failed"(msg: Message): Effect[] {
    return [
      store.set(
        "error",
        (msg.payload as { error?: string }).error ?? "could not load the roles",
      ),
    ];
  }

  newUser(): Effect[] {
    return [store.set("form", { id: null, name: "", email: "", roleId: "" })];
  }

  editUser(msg: Message): Effect[] {
    const u = msg.payload as User;
    return [
      store.set("form", {
        id: u.id,
        name: u.name,
        email: u.email,
        roleId: String(u.role_id),
      }),
    ];
  }

  cancelForm(): Effect[] {
    return [store.set("form", null)];
  }

  formName(msg: Message): Effect[] {
    return [store.set("form.name", msg.event?.value ?? "")];
  }

  formEmail(msg: Message): Effect[] {
    return [store.set("form.email", msg.event?.value ?? "")];
  }

  formRole(msg: Message): Effect[] {
    return [store.set("form.roleId", msg.event?.value ?? "")];
  }

  submitForm(_msg: Message, s: AppState): Effect[] {
    if (!s.form) return [];
    const body = {
      name: s.form.name,
      email: s.form.email,
      role_id: Number(s.form.roleId),
    };
    return [
      s.form.id
        ? http.request({
            id: "save",
            method: "PUT",
            url: `/api/users/${s.form.id}`,
            body,
            onSuccess: "user.saved",
            onError: "user.failed",
          })
        : http.request({
            id: "save",
            method: "POST",
            url: "/api/users",
            body,
            onSuccess: "user.created",
            onError: "user.failed",
          }),
    ];
  }

  /** A new user landed: append it, and let the chain close the form. */
  "user.created"(msg: Message, s: AppState): Effect[] {
    const user = (msg.payload as { data: User }).data;
    return [
      store.set("users", [...s.users, user], { onSuccess: "users.changed" }),
    ];
  }

  /**
   * An edit landed: the other style — replace the row and close the form
   * right here. (It could chain the same way: give the set an `onSuccess`.)
   */
  "user.saved"(msg: Message, s: AppState): Effect[] {
    const user = (msg.payload as { data: User }).data;
    return [
      store.set(
        "users",
        s.users.map((u) => (u.id === user.id ? user : u)),
      ),
      store.set("form", null),
    ];
  }

  "user.failed"(msg: Message): Effect[] {
    return [
      store.set(
        "error",
        (msg.payload as { error?: string }).error ?? "could not save",
      ),
    ];
  }
}

export const app = new Dashboard();
