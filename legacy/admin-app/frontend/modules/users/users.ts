import {
  Component,
  type Effect,
  type Message,
} from "@service-laboratory/pavlus";
import {
  httpEffector as http,
  loggerEffector as log,
  storeEffector as store,
} from "@service-laboratory/pavlus/plugins";
import listView from "./users-list.pavlus";
import tableView from "./users-table.pavlus";

export interface User {
  id: number;
  name: string;
  email: string;
  /** Role name, joined in by the backend. */
  role: string;
}

export interface UsersState {
  items: User[];
  status: "idle" | "loading" | "failed";
  selectedId: number | null;
  /** Read-only input from the parent. */
  filter?: string;
}

export const initialUsers: UsersState = {
  items: [],
  status: "idle",
  selectedId: null,
};

/**
 * The logic of the users component. Knows nothing about the dashboard:
 * paths are relative to its own state, reply ids are relative to itself.
 */
export class UsersList extends Component<UsersState> {
  view = listView;

  load(): Effect[] {
    return [
      store.set("status", "loading"),
      http.request({
        id: "users",
        url: "/api/users",
        onSuccess: "loaded",
        onError: "failed",
      }),
    ];
  }

  loaded(msg: Message): Effect[] {
    return [
      store.set("items", (msg.payload as { data: User[] }).data),
      store.set("status", "idle"),
    ];
  }

  failed(): Effect[] {
    return [store.set("status", "failed")];
  }

  select(msg: Message): Effect[] {
    return [store.set("selectedId", msg.payload)];
  }

  /** The delete goes to the API; the user leaves the list when it is confirmed. */
  remove(msg: Message): Effect[] {
    return [
      http.request({
        id: `remove:${msg.payload}`,
        method: "DELETE",
        url: `/api/users/${msg.payload}`,
        onSuccess: "removed",
        onError: "removeFailed",
      }),
    ];
  }

  removed(msg: Message, state: UsersState): Effect[] {
    const id = (msg.payload as { data: { deleted: number } }).data.deleted;
    return [
      store.set(
        "items",
        state.items.filter((u) => u.id !== id),
      ),
    ];
  }

  removeFailed(msg: Message): Effect[] {
    return [log.warn("user not removed", msg.payload)];
  }
}

/** Another look, same behavior: only the view differs. */
export class UsersTable extends UsersList {
  override view = tableView;
}

export const list = new UsersList();
export const table = new UsersTable();
