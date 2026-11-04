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
import view from "./role-form.pavlus";

export interface RoleFormState {
  route: Route | null;
  values: { name: string; description: string };
  status: "idle" | "loading" | "failed";
  saveStatus: "idle" | "saving" | "failed";
}

export const initialRoleForm: RoleFormState = {
  route: null,
  values: { name: "", description: "" },
  status: "idle",
  saveStatus: "idle",
};

/** Create or edit one role (`/auth/roles/new`, `/auth/roles/:id/edit`). */
export class RoleForm extends Component<RoleFormState> {
  view = view;

  enter(msg: Message): Effect[] {
    const route = msg.payload as Route;
    const id = route.params.id;
    if (id) {
      return [
        store.set("status", "loading"),
        store.set("saveStatus", "idle"),
        http.request({
          id: "current",
          url: `/api/roles/${id}`,
          onSuccess: "filled",
          onError: "loadFailed",
        }),
      ];
    }
    return [
      store.set("status", "idle"),
      store.set("saveStatus", "idle"),
      store.set("values", { name: "", description: "" }),
    ];
  }

  filled(msg: Message): Effect[] {
    const role = (
      msg.payload as { data: { name: string; description: string } }
    ).data;
    return [
      store.set("values", { name: role.name, description: role.description }),
      store.set("status", "idle"),
    ];
  }

  loadFailed(): Effect[] {
    return [store.set("status", "failed")];
  }

  setName(msg: Message): Effect[] {
    return [store.set("values.name", msg.event?.value ?? "")];
  }

  setDescription(msg: Message): Effect[] {
    return [store.set("values.description", msg.event?.value ?? "")];
  }

  save(_msg: Message, s: RoleFormState): Effect[] {
    const id = s.route?.params.id;
    return [
      store.set("saveStatus", "saving"),
      http.request(
        id
          ? {
              id: "save",
              method: "PUT",
              url: `/api/roles/${id}`,
              body: { name: s.values.name, description: s.values.description },
              onSuccess: "saved",
              onError: "saveFailed",
            }
          : {
              id: "save",
              method: "POST",
              url: "/api/roles",
              body: { name: s.values.name, description: s.values.description },
              onSuccess: "saved",
              onError: "saveFailed",
            },
      ),
    ];
  }

  saved(): Effect[] {
    return [
      store.set("saveStatus", "idle"),
      router.navigate("/auth/roles", { absolute: true }),
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
      log.warn("role not saved", msg.payload),
    ];
  }
}

export const roleForm = new RoleForm();
