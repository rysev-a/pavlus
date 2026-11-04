import {
  Component,
  type Effect,
  type Message,
} from "@service-laboratory/pavlus";
import {
  httpEffector as http,
  loggerEffector as log,
  routerEffector as router,
  storeEffector as store,
} from "@service-laboratory/pavlus/plugins";
import view from "./table.pavlus";

export interface Row {
  id: number;
}

export interface TableState<T extends Row> {
  items: T[];
  status: "idle" | "loading" | "failed";
  /** The ticked ids, across pages. */
  selected: number[];
  /** The page (1-based) and the page sizes the footer's select offers. */
  page: number;
  pageSize: number;
  pageSizes: number[];
  /** The toolbar: the search text and the ticked facet values. */
  query: string;
  facet: string[];
  /** The filtered, paged slice with its bookkeeping, kept by `derived`. */
  rows: T[];
  total: number;
  pageCount: number;
  pages: number[];
  allSelected: boolean;
}

export const initialTable = <T extends Row>(): TableState<T> => ({
  items: [],
  status: "idle",
  selected: [],
  page: 1,
  pageSize: 10,
  pageSizes: [10, 20, 30, 50],
  query: "",
  facet: [],
  rows: [],
  total: 0,
  pageCount: 1,
  pages: [1],
  allSelected: false,
});

/** The status facet of the toolbar (like the shadcn tasks example). */
export interface FacetFilter {
  field: string;
  label: string;
  options: string[];
}

/**
 * What the shell passes to a table page (see the routing table in `app.ts`).
 * The paths are absolute app paths; `endpoint` is where the rows come from
 * and where the deletes go (`DELETE <endpoint>/<ids>`).
 */
export interface TableProps {
  /** Index signature so the framework accepts these as route props. */
  [key: string]: unknown;
  section: string;
  title: string;
  subtitle: string;
  columns: { title: string; field: string }[];
  endpoint: string;
  createPath: string | null;
  editPath: string | null;
  searchable: boolean;
  searchPlaceholder: string | null;
  facetFilter: FacetFilter | null;
}

/** What a handler sees: its slice plus the props merged in by the router. */
type Merged<T extends Row> = TableState<T> & TableProps;

/**
 * The shadcn "tasks" data table: a toolbar (search, a faceted filter, reset),
 * a table with row checkboxes and a delete per row, and a pagination footer.
 * The logic is shared by every table of the app; the columns and the toolbar
 * come in as props, the row type is the caller's.
 */
export class DataTable<T extends Row> extends Component<TableState<T>> {
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

  loaded(msg: Message, s: TableState<T>): Effect[] {
    const items = (msg.payload as { data: T[] }).data;
    return [
      store.set("items", items),
      store.set("status", "idle"),
      ...this.derived({ ...s, items }),
    ];
  }

  failed(): Effect[] {
    return [store.set("status", "failed")];
  }

  /**
   * Recomputes the view from the state: the search text filters over the
   * columns, the facet over its field, then the page slice and the header
   * checkbox. Every change goes through here, so the page can never point
   * past the end (the clamped page comes back as an effect).
   */
  private derived(s: TableState<T>): Effect[] {
    const cfg = s as unknown as Merged<T>;
    const q = s.query.trim().toLowerCase();
    const facetField = cfg.facetFilter?.field;
    const filtered = s.items.filter((item) => {
      const values = item as unknown as Record<string, unknown>;
      if (q) {
        const hit = cfg.columns.some((c) =>
          String(values[c.field] ?? "")
            .toLowerCase()
            .includes(q),
        );
        if (!hit) return false;
      }
      if (facetField && s.facet.length > 0) {
        if (!s.facet.includes(String(values[facetField] ?? ""))) return false;
      }
      return true;
    });
    const pageCount = Math.max(1, Math.ceil(filtered.length / s.pageSize));
    const page = Math.min(Math.max(1, s.page), pageCount);
    const start = (page - 1) * s.pageSize;
    const rows = filtered.slice(start, start + s.pageSize);
    const pages = Array.from({ length: pageCount }, (_, i) => i + 1);
    const allSelected =
      rows.length > 0 && rows.every((r) => s.selected.includes(r.id));
    return [
      store.set("rows", rows),
      store.set("total", filtered.length),
      store.set("pageCount", pageCount),
      store.set("pages", pages),
      store.set("page", page),
      store.set("allSelected", allSelected),
    ];
  }

  setQuery(msg: Message, s: TableState<T>): Effect[] {
    const query = msg.event?.value ?? "";
    return [
      store.set("query", query),
      ...this.derived({ ...s, query, page: 1 }),
    ];
  }

  toggleFacet(msg: Message, s: TableState<T>): Effect[] {
    const option = (msg.payload as [string, string])[1];
    const facet = s.facet.includes(option)
      ? s.facet.filter((v) => v !== option)
      : [...s.facet, option];
    return [
      store.set("facet", facet),
      ...this.derived({ ...s, facet, page: 1 }),
    ];
  }

  resetFilters(_msg: Message, s: TableState<T>): Effect[] {
    return [
      store.set("query", ""),
      store.set("facet", []),
      ...this.derived({ ...s, query: "", facet: [], page: 1 }),
    ];
  }

  setPageSize(msg: Message, s: TableState<T>): Effect[] {
    const pageSize = Number(msg.event?.value ?? s.pageSize);
    return [
      store.set("pageSize", pageSize),
      ...this.derived({ ...s, pageSize, page: 1 }),
    ];
  }

  goToPage(msg: Message, s: TableState<T>): Effect[] {
    const page = Number(msg.payload);
    return [...this.derived({ ...s, page })];
  }

  goToPrev(_msg: Message, s: TableState<T>): Effect[] {
    return [...this.derived({ ...s, page: s.page - 1 })];
  }

  goToNext(_msg: Message, s: TableState<T>): Effect[] {
    return [...this.derived({ ...s, page: s.page + 1 })];
  }

  toggleRow(msg: Message, s: TableState<T>): Effect[] {
    const id = msg.payload as number;
    const selected = s.selected.includes(id)
      ? s.selected.filter((v) => v !== id)
      : [...s.selected, id];
    return [
      store.set("selected", selected),
      ...this.derived({ ...s, selected }),
    ];
  }

  /** The header checkbox: all of the page's rows in or out, keeping the rest. */
  togglePage(_msg: Message, s: TableState<T>): Effect[] {
    const inPage = s.rows.map((r) => r.id);
    const selected = s.allSelected
      ? s.selected.filter((id) => !inPage.includes(id))
      : [...new Set([...s.selected, ...inPage])];
    return [
      store.set("selected", selected),
      ...this.derived({ ...s, selected }),
    ];
  }

  /** One trash click: gone at once, no confirmation anywhere. */
  removeRow(msg: Message): Effect[] {
    return [
      http.request({
        id: `remove:${msg.payload}`,
        method: "DELETE",
        url: `${this.endpoint}/${msg.payload}`,
        onSuccess: "removed",
        onError: "deleteFailed",
      }),
    ];
  }

  /** The footer's "Delete selected": one DELETE with the ticked ids. */
  removeSelected(_msg: Message, s: TableState<T>): Effect[] {
    if (s.selected.length === 0) return [];
    const ids = s.selected.join(",");
    return [
      http.request({
        id: `remove:${ids}`,
        method: "DELETE",
        url: `${this.endpoint}/${ids}`,
        onSuccess: "removed",
        onError: "deleteFailed",
      }),
    ];
  }

  /** The reply's ids (a number from a single delete, an array from a bulk). */
  removed(msg: Message, s: TableState<T>): Effect[] {
    const gone = (msg.payload as { data: { deleted: number | number[] } }).data
      .deleted;
    const ids = Array.isArray(gone) ? gone : [gone];
    const items = s.items.filter((item) => !ids.includes(item.id));
    const selected = s.selected.filter((id) => !ids.includes(id));
    return [
      store.set("items", items),
      store.set("selected", selected),
      ...this.derived({ ...s, items, selected }),
    ];
  }

  deleteFailed(msg: Message): Effect[] {
    return [log.warn("could not delete", msg.payload)];
  }

  // The props carry absolute app paths; the default navigate would resolve
  // them against this routed child's base.
  navigate(msg: Message): Effect[] {
    return typeof msg.payload === "string"
      ? [router.navigate(msg.payload, { absolute: true })]
      : [];
  }
}
