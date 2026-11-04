/**
 * The application: one pure component. A handler never touches the DOM and
 * never changes state in place — it returns effects. The order matters and
 * is the whole idea:
 *
 *   [store.set(...), dom.update()]
 *
 * the store applies the write first, then the dom plugin re-diffs the view
 * against the state that already has it. The repaint is a decision the
 * handler makes per change: a state change alone paints nothing, and a
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

export class App extends Component<AppState> {
  view = view;

  /** `createApp({ mount })` dispatches this once the view is in the DOM. */
  mounted(): Effect[] {
    return [
      store.set("status", "loading"),
      store.set("error", ""),
      // Show "Loading..." now; the writes alone would not paint anything.
      dom.update(),
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
      store.set("status", "idle"),
      store.set("error", ""),
      store.set("users", users),
      dom.update(),
    ];
  }

  "roles.loaded"(msg: Message): Effect[] {
    const roles = (msg.payload as { data: AppState["roles"] }).data;
    return [store.set("roles", roles), dom.update()];
  }

  "users.failed"(msg: Message): Effect[] {
    return [
      store.set("status", "failed"),
      store.set(
        "error",
        (msg.payload as { error?: string }).error ?? "could not load the users",
      ),
      dom.update(),
    ];
  }

  "roles.failed"(msg: Message): Effect[] {
    return [
      store.set(
        "error",
        (msg.payload as { error?: string }).error ?? "could not load the roles",
      ),
      dom.update(),
    ];
  }

  newUser(): Effect[] {
    return [
      store.set("form", { id: null, name: "", email: "", roleId: "" }),
      dom.update(),
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
    return [store.set("form", form), dom.update()];
  }

  cancelForm(): Effect[] {
    return [store.set("form", null), dom.update()];
  }

  formName(msg: Message): Effect[] {
    return [store.set("form.name", msg.event?.value ?? ""), dom.update()];
  }

  formEmail(msg: Message): Effect[] {
    return [store.set("form.email", msg.event?.value ?? ""), dom.update()];
  }

  formRole(msg: Message): Effect[] {
    return [store.set("form.roleId", msg.event?.value ?? ""), dom.update()];
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
      store.set("users", [...s.users, user]),
      store.set("form", null),
      dom.update(),
    ];
  }

  "user.saved"(msg: Message, s: AppState): Effect[] {
    const user = (msg.payload as { data: User }).data;
    return [
      store.set(
        "users",
        s.users.map((u) => (u.id === user.id ? user : u)),
      ),
      store.set("form", null),
      dom.update(),
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
      ),
      dom.update(),
    ];
  }

  "user.failed"(msg: Message): Effect[] {
    return [
      store.set(
        "error",
        (msg.payload as { error?: string }).error ?? "could not save",
      ),
      dom.update(),
    ];
  }
}

export const app = new App();
