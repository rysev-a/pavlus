import {
  Component,
  type Effect,
  type Message,
} from "@service-laboratory/pavlus";
import {
  httpEffector as http,
  routerEffector as router,
  storeEffector as store,
} from "@service-laboratory/pavlus/plugins";
import view from "./list.pavlus";

export interface Row {
  id: number;
}

export interface ListState<T extends Row> {
  items: T[];
  status: "idle" | "loading" | "failed";
}

export const initialList = <T extends Row>(): ListState<T> => ({
  items: [],
  status: "idle",
});

/**
 * What the shell passes to a list page (see the routing table in `app.ts`):
 * what the page is called, which columns the table has, and where its
 * actions go. A `createPath` or `editPath` of `null` hides the action.
 */
export interface ListProps {
  /** Index signature so the framework accepts these as route props. */
  [key: string]: unknown;
  /** The section's class on the `<section>`, e.g. `shop-orders`. */
  section: string;
  title: string;
  subtitle: string;
  columns: { title: string; field: string }[];
  /** Where the "New" button goes. */
  createPath: string | null;
  /** The base of the per-row Edit links, `"<base>/:id/edit"`. */
  editPath: string | null;
}

/**
 * A page that is one table of rows from one endpoint. The logic is shared by
 * every list of the app (sessions, orders, tasks...); the columns and the
 * actions come in as props, the row type is the caller's.
 */
export class DataList<T extends Row> extends Component<ListState<T>> {
  view = view;

  constructor(readonly endpoint: string) {
    super();
  }

  load(): Effect[] {
    return [
      store.set("status", "loading"),
      http.request({
        id: "items",
        url: this.endpoint,
        onSuccess: "loaded",
        onError: "failed",
      }),
    ];
  }

  // Entered by the router: start loading.
  enter(): Effect[] {
    return this.load();
  }

  loaded(msg: Message): Effect[] {
    return [
      store.set("items", (msg.payload as { data: T[] }).data),
      store.set("status", "idle"),
    ];
  }

  failed(): Effect[] {
    return [store.set("status", "failed")];
  }

  // The props carry absolute app paths (`/auth/users/new`), while the default
  // navigate would resolve them against this routed child's base.
  navigate(msg: Message): Effect[] {
    return typeof msg.payload === "string"
      ? [router.navigate(msg.payload, { absolute: true })]
      : [];
  }
}
