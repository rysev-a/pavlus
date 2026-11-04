import {
  Component,
  type Effect,
  type Message,
  type Route,
} from "@service-laboratory/pavlus";
import {
  httpEffector as http,
  loggerEffector as log,
  routerEffector as router,
  storeEffector as store,
} from "@service-laboratory/pavlus/plugins";
import view from "./user-form.pavlus";

export interface UserFormState {
  /** Set by the router; `params.id` decides create (no id) or edit. */
  route: Route | null;
  /** The roles for the select, loaded with the form. */
  roles: { id: number; name: string }[];
  values: { name: string; email: string; roleId: string };
  status: "idle" | "loading" | "failed";
  saveStatus: "idle" | "saving" | "failed";
}

export const initialUserForm: UserFormState = {
  route: null,
  roles: [],
  values: { name: "", email: "", roleId: "" },
  status: "idle",
  saveStatus: "idle",
};

/**
 * Create or edit one user (`/auth/users/new`, `/auth/users/:id/edit`). The
 * router hands over the route on `enter`: an id loads the user, no id starts
 * an empty form. A successful save goes back to the list.
 */
export class UserForm extends Component<UserFormState> {
  view = view;

  // Shown as the label in the debug panel's Apps tab (same form under two
  // routes: the creator and the editor both read "user-form").
  tag = "user-form";

  enter(msg: Message): Effect[] {
    const route = msg.payload as Route;
    const id = route.params.id;
    const effects: Effect[] = [
      store.set("status", "loading"),
      store.set("saveStatus", "idle"),
      http.request({
        id: "roles",
        url: "/api/roles",
        onSuccess: "rolesLoaded",
        onError: "loadFailed",
      }),
    ];
    if (id) {
      effects.push(
        http.request({
          id: "current",
          url: `/api/users/${id}`,
          onSuccess: "filled",
          onError: "loadFailed",
        }),
      );
    } else {
      effects.push(
        store.set("values", { name: "", email: "", roleId: "" }),
        store.set("status", "idle"),
      );
    }
    return effects;
  }

  rolesLoaded(msg: Message): Effect[] {
    return [
      store.set(
        "roles",
        (msg.payload as { data: UserFormState["roles"] }).data,
      ),
    ];
  }

  filled(msg: Message): Effect[] {
    const user = (
      msg.payload as { data: { name: string; email: string; role_id: number } }
    ).data;
    return [
      store.set("values", {
        name: user.name,
        email: user.email,
        roleId: String(user.role_id),
      }),
      store.set("status", "idle"),
    ];
  }

  loadFailed(): Effect[] {
    return [store.set("status", "failed")];
  }

  setName(msg: Message): Effect[] {
    return [store.set("values.name", msg.event?.value ?? "")];
  }

  setEmail(msg: Message): Effect[] {
    return [store.set("values.email", msg.event?.value ?? "")];
  }

  setRole(msg: Message): Effect[] {
    return [store.set("values.roleId", msg.event?.value ?? "")];
  }

  save(_msg: Message, s: UserFormState): Effect[] {
    const id = s.route?.params.id;
    const body = {
      name: s.values.name,
      email: s.values.email,
      role_id: Number(s.values.roleId),
    };
    return [
      store.set("saveStatus", "saving"),
      http.request(
        id
          ? {
              id: "save",
              method: "PUT",
              url: `/api/users/${id}`,
              body,
              onSuccess: "saved",
              onError: "saveFailed",
            }
          : {
              id: "save",
              method: "POST",
              url: "/api/users",
              body,
              onSuccess: "saved",
              onError: "saveFailed",
            },
      ),
    ];
  }

  saved(): Effect[] {
    return [
      store.set("saveStatus", "idle"),
      router.navigate("/auth/users", { absolute: true }),
    ];
  }

  // The links carry absolute app paths; the default navigate would resolve
  // them against this routed page's base.
  navigate(msg: Message): Effect[] {
    return typeof msg.payload === "string"
      ? [router.navigate(msg.payload, { absolute: true })]
      : [];
  }

  saveFailed(msg: Message): Effect[] {
    return [
      store.set("saveStatus", "failed"),
      log.warn("user not saved", msg.payload),
    ];
  }
}

export const userForm = new UserForm();
