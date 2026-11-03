import {
  Component,
  type Effect,
  type Message,
} from "@service-laboratory/pavlus";
import { patch } from "../admin-shell/shell.ts";
import {
  applyFilter,
  type Filter,
  filtersOf,
  type ToolbarAction,
  toolbarAction,
} from "./filters.ts";
import view from "./filter-bar.pavlus";

interface Order {
  id: string;
  who: string;
  status: string;
}

export interface FilterBarState {
  orders: Order[];
  active: string;
  query: string;
  filters: Filter[];
  shown: Order[];
  names: string;
  actions: ToolbarAction[];
}

const ORDERS: Order[] = [
  { id: "1001", who: "Ann Lee", status: "new" },
  { id: "1002", who: "Jon Park", status: "packed" },
  { id: "1003", who: "Eva Stone", status: "new" },
  { id: "1004", who: "Max Roy", status: "shipped" },
];
const DEFS: [string, string][] = [
  ["all", "All"],
  ["new", "New"],
  ["packed", "Packed"],
  ["shipped", "Shipped"],
];
const passes = (o: Order, id: string) => o.status === id;
const text = (o: Order) => `${o.id} ${o.who}`;

/** Pure: everything the template shows for a filter and a query. */
export function derive(active: string, query: string) {
  const shown = applyFilter(ORDERS, active, query, passes, text);
  return {
    active,
    query,
    filters: filtersOf(DEFS, active, ORDERS, passes),
    shown,
    names: shown.map((o) => o.who).join(", ") || "nobody",
  };
}

export const initial: FilterBarState = {
  orders: ORDERS,
  ...derive("all", ""),
  actions: [toolbarAction("new", "New order")],
};

export class FilterBarPage extends Component<FilterBarState> {
  view = view;

  "bar.pick"(msg: Message, state: FilterBarState): Effect[] {
    return patch(derive(msg.payload as string, state.query));
  }

  "bar.search"(msg: Message, state: FilterBarState): Effect[] {
    return patch(derive(state.active, msg.event?.value ?? ""));
  }
}

export const page = new FilterBarPage();
