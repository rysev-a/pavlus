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
import view from "./permission-form.pavlus";

export interface PermissionFormState {
  route: Route | null;
  values: { code: string; description: string };
  status: "idle" | "loading" | "failed";
  saveStatus: "idle" | "saving" | "failed";
}

export const initialPermissionForm: PermissionFormState = {
  route: null,
  values: { code: "", description: "" },
  status: "idle",
  saveStatus: "idle",
};

/**
 * Create or edit one permission (`/auth/permissions/new`,
 * `/auth/permissions/:id/edit`). Editing keeps the permission's roles: only
 * its code and description change here.
 */
export class PermissionForm extends Component<PermissionFormState> {
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
          url: `/api/permissions/${id}`,
          onSuccess: "filled",
          onError: "loadFailed",
        }),
      ];
    }
    return [
      store.set("status", "idle"),
      store.set("saveStatus", "idle"),
      store.set("values", { code: "", description: "" }),
    ];
  }

  filled(msg: Message): Effect[] {
    const permission = (
      msg.payload as {
        data: { code: string; description: string };
      }
    ).data;
    return [
      store.set("values", {
        code: permission.code,
        description: permission.description,
      }),
      store.set("status", "idle"),
    ];
  }

  loadFailed(): Effect[] {
    return [store.set("status", "failed")];
  }

  setCode(msg: Message): Effect[] {
    return [store.set("values.code", msg.event?.value ?? "")];
  }

  setDescription(msg: Message): Effect[] {
    return [store.set("values.description", msg.event?.value ?? "")];
  }

  save(_msg: Message, s: PermissionFormState): Effect[] {
    const id = s.route?.params.id;
    const body = { code: s.values.code, description: s.values.description };
    return [
      store.set("saveStatus", "saving"),
      http.request(
        id
          ? {
              id: "save",
              method: "PUT",
              url: `/api/permissions/${id}`,
              body,
              onSuccess: "saved",
              onError: "saveFailed",
            }
          : {
              id: "save",
              method: "POST",
              url: "/api/permissions",
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
      router.navigate("/auth/permissions", { absolute: true }),
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
      log.warn("permission not saved", msg.payload),
    ];
  }
}

export const permissionForm = new PermissionForm();
