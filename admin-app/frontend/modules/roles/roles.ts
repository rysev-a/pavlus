import {
  Component,
  type Effect,
  type Message,
} from "@service-laboratory/pavlus";
import {
  httpEffector as http,
  storeEffector as store,
} from "@service-laboratory/pavlus/plugins";
import view from "./roles.pavlus";

export interface Role {
  id: number;
  name: string;
  description: string;
  /** How many users have this role (computed by the backend). */
  users: number;
}

export interface RolesState {
  items: Role[];
  status: "idle" | "loading" | "failed";
}

export const initialRoles: RolesState = { items: [], status: "idle" };

/** Knows nothing about the dashboard: paths and reply ids are its own. */
export class Roles extends Component<RolesState> {
  view = view;

  load(): Effect[] {
    return [
      store.set("status", "loading"),
      http.request({
        id: "roles",
        url: "/api/roles",
        onSuccess: "loaded",
        onError: "failed",
      }),
    ];
  }

  loaded(msg: Message): Effect[] {
    return [
      store.set("items", (msg.payload as { data: Role[] }).data),
      store.set("status", "idle"),
    ];
  }

  failed(): Effect[] {
    return [store.set("status", "failed")];
  }
}

export const roles = new Roles();
