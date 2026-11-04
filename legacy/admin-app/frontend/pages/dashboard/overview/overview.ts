import {
  type Children,
  Component,
  type ComponentCtx,
  type Message,
} from "@service-laboratory/pavlus";
import {
  loggerEffector as log,
  storeEffector as store,
} from "@service-laboratory/pavlus/plugins";
import view from "./overview.pavlus";
import {
  initialUsers,
  list,
  table,
  type UsersState,
} from "../../../modules/users/users.ts";

export interface OverviewState {
  filter: string;
  /** A component value: the template renders it with `+{usersComponent}`. */
  usersComponent: Component<UsersState>;
  /** State of the `users` child (see `children`). */
  users: UsersState;
}

export const initialOverview: OverviewState = {
  filter: "",
  usersComponent: list,
  users: initialUsers,
};

/** The `/dashboard` sub-page: the users, as a list or a table. */
export class Overview extends Component<OverviewState> {
  view = view;

  // `users` here, `#users` in the template and `state.users` are the same name.
  children: Children<OverviewState> = {
    users: {
      select: (s) => s.usersComponent, // follows the component in the state
      key: "users",
      props: (s) => ({ filter: s.filter }), // data flows down through the dashboard
      // the agent cannot see through `select`: this tag is its stable name
      tag: "users-view",
    },
  };

  // Entered by the router: start loading the users.
  enter(_msg: Message, _s: OverviewState, { send }: ComponentCtx) {
    return send("users", "load");
  }

  reload(_msg: Message, _s: OverviewState, { send }: ComponentCtx) {
    return send("users", "load");
  }

  filterInput(msg: Message) {
    return [store.set("filter", msg.event?.value ?? "")];
  }

  // The state of the users survives the swap (both share a shape).
  switchView(_msg: Message, s: OverviewState) {
    return [
      store.set("usersComponent", s.usersComponent === table ? list : table),
    ];
  }

  // A parent can observe what its child handles.
  "users.remove"(msg: Message) {
    return [log.info("user removed", msg.payload)];
  }
}

export const overview = new Overview();
