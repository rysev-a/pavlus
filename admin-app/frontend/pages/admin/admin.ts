import {
  type Children,
  Component,
  type ComponentCtx,
  type Message,
} from "@service-laboratory/pavlus";
import view from "./admin.pavlus";
import {
  initialRoles,
  roles,
  type RolesState,
} from "../../modules/roles/roles.ts";

export interface AdminState {
  roles: RolesState;
}

export const initialAdmin: AdminState = { roles: initialRoles };

/** The `/admin` page: roles, and who has them. */
export class Admin extends Component<AdminState> {
  view = view;

  children: Children<AdminState> = {
    roles: { component: roles, key: "roles", tag: "roles-page" },
  };

  // Entered by the router: start loading the roles.
  enter(_msg: Message, _s: AdminState, { send }: ComponentCtx) {
    return send("roles", "load");
  }
}

export const admin = new Admin();
