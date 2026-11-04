/**
 * The logic of a data table (the shadcn "data table"): a search box, sortable
 * columns, a checkbox on every row, row actions and pages. Pure: the rows and
 * the state of the table go in, the props of `view.pavlus` come out.
 */

/** What a cell shows: a kind decides the markup, `tone` colours a pill. */
export interface Cell {
  kind: "text" | "strong" | "pill" | "mono" | "number";
  text: string;
  /** a second line under a `strong` cell */
  sub?: string;
  /** a pill's tone: success, warning, destructive, info, muted, default */
  tone?: string;
  /** set by `tableView` from the column */
  align?: "left" | "right";
}

export interface ColumnDef<R> {
  key: string;
  label: string;
  align?: "left" | "right";
  sortable?: boolean;
  /** The value the search and the sort read (a string or a number). */
  value: (row: R) => string | number;
  /** How the cell looks (default: the value as text). */
  cell?: (row: R) => Cell;
  /** Part of the text the search box looks in (default: true). */
  searchable?: boolean;
}

/** An extra filter in the toolbar: a select that keeps rows whose field equals a value. */
export interface FilterDef<R> {
  key: string;
  label: string;
  options: { value: string; label: string }[];
  /** The value of the row to compare with the choice. */
  value: (row: R) => string;
}

export interface TableState {
  query: string;
  sortKey: string;
  sortDir: "asc" | "desc";
  /** 1-based */
  page: number;
  pageSize: number;
  /** the ids ticked (they stay ticked across pages) */
  selected: number[];
  /** the choice of every filter (`""` = all) */
  filters: Record<string, string>;
}

export const PAGE_SIZES = [10, 25, 50, 100];

export const initialTable = (sortKey = "", pageSize = 10): TableState => ({
  query: "",
  sortKey,
  sortDir: "asc",
  page: 1,
  pageSize,
  selected: [],
  filters: {},
});

/** What the part takes: everything already computed. */
export interface TableProps {
  columns: {
    key: string;
    label: string;
    align: "left" | "right";
    sortable: boolean;
    sorted: boolean;
    dir: "asc" | "desc";
  }[];
  rows: { id: number; selected: boolean; cells: Cell[] }[];
  query: string;
  filters: {
    key: string;
    label: string;
    value: string;
    options: { value: string; label: string; active: boolean }[];
  }[];
  /** rows that match (before paging) and rows there are */
  total: number;
  all: number;
  page: number;
  pages: number;
  /** `11-20` of the matching rows */
  range: string;
  pageSize: number;
  pageSizes: { value: number; active: boolean }[];
  selectedCount: number;
  allSelected: boolean;
  someSelected: boolean;
  /** pages to jump to: 1 2 3 ... */
  jumps: { n: number; active: boolean }[];
}

const textOf = (v: string | number): string => String(v).toLowerCase();

/** Pure: the rows that match the search and the filters. */
export function matching<R>(
  rows: R[],
  defs: ColumnDef<R>[],
  filters: FilterDef<R>[],
  st: TableState,
): R[] {
  const q = st.query.trim().toLowerCase();
  const searchable = defs.filter((d) => d.searchable !== false);
  return rows.filter((row) => {
    for (const f of filters) {
      const want = st.filters[f.key];
      if (want && f.value(row) !== want) return false;
    }
    if (!q) return true;
    return searchable.some((d) => textOf(d.value(row)).includes(q));
  });
}

/** Pure: a sorted copy (numbers by value, text by locale-free comparison, ties by id). */
export function sorted<R extends { id: number }>(
  rows: R[],
  defs: ColumnDef<R>[],
  st: TableState,
): R[] {
  const def = defs.find((d) => d.key === st.sortKey);
  if (!def) return rows;
  const sign = st.sortDir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const x = def.value(a);
    const y = def.value(b);
    const c =
      typeof x === "number" && typeof y === "number"
        ? x - y
        : textOf(x) < textOf(y)
          ? -1
          : textOf(x) > textOf(y)
            ? 1
            : 0;
    return c * sign || a.id - b.id;
  });
}

/** Pure: the window of page numbers around the current one (at most 5). */
export function jumpsOf(
  page: number,
  pages: number,
): { n: number; active: boolean }[] {
  const from = Math.max(1, Math.min(page - 2, pages - 4));
  const to = Math.min(pages, from + 4);
  const out: { n: number; active: boolean }[] = [];
  for (let n = from; n <= to; n++) out.push({ n, active: n === page });
  return out;
}

/** Pure: the whole table for the state: search, filters, sort, paging, ticks. */
export function tableView<R extends { id: number }>(
  rows: R[],
  defs: ColumnDef<R>[],
  filters: FilterDef<R>[],
  st: TableState,
): TableProps {
  const found = sorted(matching(rows, defs, filters, st), defs, st);
  const pages = Math.max(1, Math.ceil(found.length / st.pageSize));
  const page = Math.min(Math.max(1, st.page), pages);
  const start = (page - 1) * st.pageSize;
  const shown = found.slice(start, start + st.pageSize);
  const ticked = new Set(st.selected);
  const onPage = shown.filter((r) => ticked.has(r.id)).length;
  return {
    columns: defs.map((d) => ({
      key: d.key,
      label: d.label,
      align: d.align ?? "left",
      sortable: d.sortable !== false,
      sorted: st.sortKey === d.key,
      dir: st.sortKey === d.key ? st.sortDir : "asc",
    })),
    rows: shown.map((r) => ({
      id: r.id,
      selected: ticked.has(r.id),
      cells: defs.map((d) => ({
        ...(d.cell?.(r) ?? { kind: "text" as const, text: String(d.value(r)) }),
        align: d.align ?? ("left" as const),
      })),
    })),
    query: st.query,
    filters: filters.map((f) => ({
      key: f.key,
      label: f.label,
      value: st.filters[f.key] ?? "",
      options: f.options.map((o) => ({
        ...o,
        active: (st.filters[f.key] ?? "") === o.value,
      })),
    })),
    total: found.length,
    all: rows.length,
    page,
    pages,
    range: found.length === 0 ? "0" : `${start + 1}-${start + shown.length}`,
    pageSize: st.pageSize,
    pageSizes: PAGE_SIZES.map((value) => ({
      value,
      active: value === st.pageSize,
    })),
    selectedCount: st.selected.length,
    allSelected: shown.length > 0 && onPage === shown.length,
    someSelected: onPage > 0 && onPage < shown.length,
    jumps: jumpsOf(page, pages),
  };
}

/** Pure: a message of the table changes its state. Returns the new state. */
export function reduceTable<R extends { id: number }>(
  st: TableState,
  msg: string,
  payload: unknown,
  visibleIds: (st: TableState) => number[],
): TableState {
  switch (msg) {
    case "search":
      return { ...st, query: String(payload ?? ""), page: 1 };
    case "sort": {
      const key = String(payload);
      return st.sortKey === key
        ? { ...st, sortDir: st.sortDir === "asc" ? "desc" : "asc", page: 1 }
        : { ...st, sortKey: key, sortDir: "asc", page: 1 };
    }
    case "prev":
      return { ...st, page: Math.max(1, st.page - 1) };
    case "next":
      return { ...st, page: st.page + 1 };
    case "goto":
      return { ...st, page: Math.max(1, Number(payload) || 1) };
    case "pageSize":
      return { ...st, pageSize: Number(payload) || st.pageSize, page: 1 };
    case "filter": {
      const [key, value] = payload as [string, string];
      return { ...st, filters: { ...st.filters, [key]: value }, page: 1 };
    }
    case "toggleRow": {
      const id = Number(payload);
      return {
        ...st,
        selected: st.selected.includes(id)
          ? st.selected.filter((x) => x !== id)
          : [...st.selected, id],
      };
    }
    case "toggleAll": {
      const ids = visibleIds(st);
      const all = ids.length > 0 && ids.every((id) => st.selected.includes(id));
      return {
        ...st,
        selected: all
          ? st.selected.filter((id) => !ids.includes(id))
          : [...new Set([...st.selected, ...ids])],
      };
    }
    case "clearSelection":
      return { ...st, selected: [] };
    default:
      return st;
  }
}
