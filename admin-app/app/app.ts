/**
 * The application: one pure component. A handler never touches the DOM and
 * never changes state in place — it returns effects. Plugins never talk to
 * each other; everything goes through the application, and the repaint is
 * the application's decision, made in a message:
 *
 *   store.set(..., paint)              // paint = { onSuccess: "paint" }
 *   → the store answers "paint" with `{ prev, next }` once the write landed
 *   → the "paint" handler relays the pair: dom.update(prev, next)
 *   → the dom plugin diffs prev → next and patches the DOM
 *
 * A state change alone paints nothing — a no-op write never answers — and a
 * handler that only asks for data (`submitForm`) paints nothing at all.
 */
import {
  Component,
  type Effect,
  type Message,
} from "@service-laboratory/pavlus";
import {
  domEffector as dom,
  httpEffector as http,
  storeEffector as store,
} from "@service-laboratory/pavlus/plugins";
import view from "./app.pavlus";
import type { AppState, FormState, User } from "./state.ts";

/** Every write answers this message; the repaint happens in "paint". */
const paint = { onSuccess: "paint" } as const;

export class App extends Component<AppState> {
  view = view;

  /**
   * The store answered a write with `{ prev, next }` — the state before and
   * after it. The application turns that answer into the repaint. The pair
   * is frozen when the write lands, so the paints of one batch chain
   * exactly (S0→S1, then S1→S2) no matter when the messages drain.
   */
  paint(msg: Message): Effect[] {
    const { prev, next } = msg.payload as { prev: AppState; next: AppState };
    return [dom.update(prev, next)];
  }

  /** `createApp({ mount })` dispatches this once the view is in the DOM. */
  mounted(): Effect[] {
    return [
      store.set("status", "loading", paint),
      store.set("error", "", paint),
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
    const users = (msg.payload as { data: User[] }).data;
    return [
      store.set("status", "idle", paint),
      store.set("error", "", paint),
      store.set("users", users, paint),
    ];
  }

  "roles.loaded"(msg: Message): Effect[] {
    const roles = (msg.payload as { data: AppState["roles"] }).data;
    return [store.set("roles", roles, paint)];
  }

  "users.failed"(msg: Message): Effect[] {
    return [
      store.set("status", "failed", paint),
      store.set(
        "error",
        (msg.payload as { error?: string }).error ?? "could not load the users",
        paint,
      ),
    ];
  }

  "roles.failed"(msg: Message): Effect[] {
    return [
      store.set(
        "error",
        (msg.payload as { error?: string }).error ?? "could not load the roles",
        paint,
      ),
    ];
  }

  newUser(): Effect[] {
    return [
      store.set("form", { id: null, name: "", email: "", roleId: "" }, paint),
    ];
  }

  /** The row's edit button: the form opens filled, with the id set. */
  editUser(msg: Message): Effect[] {
    const u = msg.payload as User;
    const form: FormState = {
      id: u.id,
      name: u.name,
      email: u.email,
      roleId: String(u.role_id),
    };
    return [store.set("form", form, paint)];
  }

  cancelForm(): Effect[] {
    return [store.set("form", null, paint)];
  }

  formName(msg: Message): Effect[] {
    return [store.set("form.name", msg.event?.value ?? "", paint)];
  }

  formEmail(msg: Message): Effect[] {
    return [store.set("form.email", msg.event?.value ?? "", paint)];
  }

  formRole(msg: Message): Effect[] {
    return [store.set("form.roleId", msg.event?.value ?? "", paint)];
  }

  /**
   * A request, not a state change: nothing to paint yet. The answer comes
   * back as `user.created` / `user.saved` / `user.failed`.
   */
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

  "user.created"(msg: Message, s: AppState): Effect[] {
    const user = (msg.payload as { data: User }).data;
    return [
      store.set("users", [...s.users, user], paint),
      store.set("form", null, paint),
    ];
  }

  "user.saved"(msg: Message, s: AppState): Effect[] {
    const user = (msg.payload as { data: User }).data;
    return [
      store.set(
        "users",
        s.users.map((u) => (u.id === user.id ? user : u)),
        paint,
      ),
      store.set("form", null, paint),
    ];
  }

  removeUser(msg: Message): Effect[] {
    const id = msg.payload as number;
    return [
      http.request({
        id: "remove",
        method: "DELETE",
        url: `/api/users/${id}`,
        onSuccess: "user.removed",
        onError: "user.failed",
      }),
    ];
  }

  "user.removed"(msg: Message, s: AppState): Effect[] {
    const id = (msg.payload as { data: { deleted: number } }).data.deleted;
    return [
      store.set(
        "users",
        s.users.filter((u) => u.id !== id),
        paint,
      ),
    ];
  }

  "user.failed"(msg: Message): Effect[] {
    return [
      store.set(
        "error",
        (msg.payload as { error?: string }).error ?? "could not save",
        paint,
      ),
    ];
  }
}

export const app = new App();
