import type { Tone } from "../admin-shell/shell.ts";

export type Align = "left" | "right" | "center";
export type SortDir = "asc" | "desc";

export interface ColumnDef {
  key: string;
  label: string;
  align?: Align;
  sortable?: boolean;
}

/** What the template shows for a column: sort state is already worked out. */
export interface Column {
  key: string;
  label: string;
  align: Align;
  sortable: boolean;
  sorted: boolean;
  /** The sort arrow's idle look (from `sorted`). */
  idle: boolean;
  dir: SortDir | "";
}

export type CellKind = "text" | "strong" | "pill" | "mono" | "number" | "meter";

export interface Cell {
  kind: CellKind;
  text: string;
  sub: string;
  tone: Tone;
  /** A meter's fill, 0 to 100. */
  pct: number;
  align: Align;
  /** The kind flags the template branches on (the kinds in their order). */
  isPill: boolean;
  isStrong: boolean;
  isMeter: boolean;
  isMono: boolean;
  isNumber: boolean;
}

export interface RowAction {
  id: string;
  label: string;
  icon: string;
  variant: "outline" | "default" | "ghost" | "destructive" | "secondary";
  disabled: boolean;
}

export interface Row {
  id: string;
  selected: boolean;
  /** The row's `data-selected` attribute (from `selected`). */
  dataSelected: "true" | null;
  cells: Cell[];
  actions: RowAction[];
}

export interface Sort {
  key: string;
  dir: SortDir;
}

const cell = (
  kind: CellKind,
  text: string,
  rest: Partial<Cell> = {},
): Cell => ({
  kind,
  text,
  sub: "",
  tone: "default",
  pct: 0,
  align: "left",
  isPill: kind === "pill",
  isStrong: kind === "strong",
  isMeter: kind === "meter",
  isMono: kind === "mono",
  isNumber: kind === "number",
  ...rest,
});

/** Cells: the constructors a template uses to describe a value. */
export const text = (value: string | number): Cell =>
  cell("text", String(value));
export const mono = (value: string | number): Cell =>
  cell("mono", String(value));
export const number = (value: string | number): Cell =>
  cell("number", String(value), { align: "right" });
/** A title with a second line under it. */
export const strong = (title: string, sub = ""): Cell =>
  cell("strong", title, { sub });
/** A status pill. */
export const pill = (label: string, tone: Tone = "default"): Cell =>
  cell("pill", label, { tone });
/** A bar with its value as text. */
export const meter = (pct: number, tone: Tone, label: string): Cell =>
  cell("meter", label, { pct, tone });

/** A row action: a small button. */
export function action(
  id: string,
  label: string,
  opts: Partial<Omit<RowAction, "id" | "label">> = {},
): RowAction {
  return { icon: "", variant: "outline", disabled: false, ...opts, id, label };
}

/** Pure: the columns with the state of the sorting worked out. */
export function columnsOf(defs: ColumnDef[], sort: Sort | null): Column[] {
  return defs.map((d) => {
    const sorted = sort?.key === d.key;
    return {
      key: d.key,
      label: d.label,
      align: d.align ?? "left",
      sortable: d.sortable ?? false,
      sorted,
      idle: !sorted,
      dir: sorted && sort ? sort.dir : "",
    };
  });
}

/**
 * Pure: one row. `byKey` maps a column key to its cell; a missing key is an
 * empty cell. The cells come out in the order of the columns, aligned like
 * their column unless the cell has an alignment of its own.
 */
export function rowOf(
  columns: ColumnDef[],
  id: string,
  byKey: Record<string, Cell>,
  actions: RowAction[] = [],
  selected = false,
): Row {
  return {
    id,
    selected,
    dataSelected: selected ? "true" : null,
    actions,
    cells: columns.map((c) => {
      const given = byKey[c.key] ?? text("");
      const align = c.align ?? given.align;
      return { ...given, align };
    }),
  };
}

/** Pure: click on a header: the first click sorts up, the next one down. */
export function toggleSort(sort: Sort | null, key: string): Sort {
  if (sort && sort.key === key) {
    return { key, dir: sort.dir === "asc" ? "desc" : "asc" };
  }
  return { key, dir: "asc" };
}

/** Pure: a sorted copy (numbers by value, text by `localeCompare`). */
export function sortBy<T>(
  list: T[],
  sort: Sort | null,
  value: (item: T, key: string) => string | number,
): T[] {
  if (!sort) return list;
  const sign = sort.dir === "asc" ? 1 : -1;
  return [...list].sort((a, b) => {
    const x = value(a, sort.key);
    const y = value(b, sort.key);
    if (typeof x === "number" && typeof y === "number") return (x - y) * sign;
    return String(x).localeCompare(String(y)) * sign;
  });
}
