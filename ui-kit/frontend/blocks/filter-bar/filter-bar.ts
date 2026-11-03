import {
  Component,
  type Effect,
  type Message,
} from "@service-laboratory/pavlus";
import { storeEffector as store } from "@service-laboratory/pavlus/plugins";
import pageView from "./filter-bar.pavlus";

// ---- what a shop declares ----

export interface Option {
  id: string;
  label: string;
}

export interface GroupDef {
  id: string;
  label: string;
  options: Option[];
  /** Several options at once (dogs and cats), or one at a time. */
  multi: boolean;
  /** Adds a first chip with this label that clears the group. */
  allLabel?: string;
}

export interface RangeDef {
  id: string;
  label: string;
  min: number;
  max: number;
  step: number;
  /** How the value is printed (a price). */
  format: (value: number) => string;
}

export interface BarDef {
  placeholder: string;
  groups: GroupDef[];
  /** On/off switches: "In stock only". */
  toggles: Option[];
  ranges: RangeDef[];
  sorts: Option[];
  /** The default sort: the first one. */
  noun: [string, string];
}

/** What the visitor chose: all a shop needs to filter its list. */
export interface Filters {
  query: string;
  /** Group id -> the chosen options (empty: all). */
  picks: Record<string, string[]>;
  flags: Record<string, boolean>;
  /** Range id -> the chosen maximum. */
  ranges: Record<string, number>;
  sort: string;
}

export const startFilters = (def: BarDef): Filters => ({
  query: "",
  picks: Object.fromEntries(def.groups.map((g) => [g.id, []])),
  flags: Object.fromEntries(def.toggles.map((t) => [t.id, false])),
  ranges: Object.fromEntries(def.ranges.map((r) => [r.id, r.max])),
  sort: def.sorts[0]?.id ?? "",
});

// ---- pure reducers ----

export const setQuery = (f: Filters, query: string): Filters => ({
  ...f,
  query,
});

export const setSort = (f: Filters, sort: string): Filters => ({ ...f, sort });

/** Choose an option: toggles it in a multi group, replaces it in a single one. */
export function pick(
  f: Filters,
  def: BarDef,
  group: string,
  option: string,
): Filters {
  const g = def.groups.find((x) => x.id === group);
  if (!g) return f;
  const now = f.picks[group] ?? [];
  let next: string[];
  if (option === "") next = [];
  else if (now.includes(option)) next = now.filter((o) => o !== option);
  else next = g.multi ? [...now, option] : [option];
  return { ...f, picks: { ...f.picks, [group]: next } };
}

export const flip = (f: Filters, id: string): Filters => ({
  ...f,
  flags: { ...f.flags, [id]: !f.flags[id] },
});

export function slide(f: Filters, def: BarDef, id: string, value: number) {
  const r = def.ranges.find((x) => x.id === id);
  if (!r || !Number.isFinite(value)) return f;
  const clamped = Math.min(r.max, Math.max(r.min, value));
  return { ...f, ranges: { ...f.ranges, [id]: clamped } };
}

/** Everything cleared, the sort kept. */
export const cleared = (def: BarDef, f: Filters): Filters => ({
  ...startFilters(def),
  sort: f.sort,
});

/** Something besides the sort is set. */
export function isDirty(f: Filters, def: BarDef): boolean {
  return (
    f.query.trim() !== "" ||
    Object.values(f.picks).some((p) => p.length > 0) ||
    Object.values(f.flags).some(Boolean) ||
    def.ranges.some((r) => (f.ranges[r.id] ?? r.max) < r.max)
  );
}

// ---- helpers for the shops' own filtering ----

/** Every word of the query is in the text (case and accents ignored). */
export function matches(query: string, text: string): boolean {
  const plain = (s: string) =>
    s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const haystack = plain(text);
  return plain(query)
    .split(/\s+/)
    .filter(Boolean)
    .every((word) => haystack.includes(word));
}

/** A group with nothing chosen lets everything through; else one value must match. */
export function inPicks(picks: string[] | undefined, values: string[]) {
  return !picks || picks.length === 0 || values.some((v) => picks.includes(v));
}

/** A sorted copy: by a number (`dir` 1 up, -1 down), ties by title. */
export function sortedBy<T>(
  items: T[],
  value: (item: T) => number,
  dir: 1 | -1,
  title: (item: T) => string,
): T[] {
  return [...items].sort(
    (a, b) => (value(a) - value(b)) * dir || title(a).localeCompare(title(b)),
  );
}

/** "12 products", "1 product", "No products". */
export function countLabel(n: number, noun: [string, string]): string {
  if (n === 0) return `No ${noun[1]}`;
  return `${n} ${n === 1 ? noun[0] : noun[1]}`;
}

// ---- the view's props ----

export interface BarView {
  query: string;
  placeholder: string;
  groups: {
    id: string;
    label: string;
    hasAll: boolean;
    allLabel: string;
    allActive: boolean;
    options: { id: string; label: string; active: boolean }[];
  }[];
  toggles: { id: string; label: string; on: boolean }[];
  ranges: {
    id: string;
    label: string;
    min: number;
    max: number;
    step: number;
    value: number;
    text: string;
  }[];
  sorts: { id: string; label: string; selected: boolean }[];
  resultLabel: string;
  dirty: boolean;
}

export function barOf(def: BarDef, f: Filters, count: number): BarView {
  return {
    query: f.query,
    placeholder: def.placeholder,
    groups: def.groups.map((g) => {
      const chosen = f.picks[g.id] ?? [];
      return {
        id: g.id,
        label: g.label,
        hasAll: Boolean(g.allLabel),
        allLabel: g.allLabel ?? "",
        allActive: chosen.length === 0,
        options: g.options.map((o) => ({
          ...o,
          active: chosen.includes(o.id),
        })),
      };
    }),
    toggles: def.toggles.map((t) => ({ ...t, on: Boolean(f.flags[t.id]) })),
    ranges: def.ranges.map((r) => {
      const value = f.ranges[r.id] ?? r.max;
      return {
        id: r.id,
        label: r.label,
        min: r.min,
        max: r.max,
        step: r.step,
        value,
        text: value >= r.max ? "Any" : r.format(value),
      };
    }),
    sorts: def.sorts.map((s) => ({ ...s, selected: s.id === f.sort })),
    resultLabel: countLabel(count, def.noun),
    dirty: isDirty(f, def),
  };
}

// ---- a base class for a shop that owns a filter bar named `bar` ----

/**
 * The messages of `+FilterBar#bar(...)` arrive as `bar.search`, `bar.pick`,
 * `bar.flip`, `bar.slide`, `bar.sort`, `bar.clear`. A shop extends this class,
 * says what its bar is (`barDef`), and writes `_apply`, which turns the new
 * filters into effects (the filtered list, the bar's props).
 */
export abstract class FilterHost<
  S extends { filters: Filters },
> extends Component<S> {
  abstract readonly barDef: BarDef;
  abstract _apply(filters: Filters, state: S): Effect[];

  "bar.search"(msg: Message, s: S): Effect[] {
    return this._apply(setQuery(s.filters, String(msg.event?.value ?? "")), s);
  }

  "bar.pick"(msg: Message, s: S): Effect[] {
    const [group, option] = msg.payload as [string, string];
    return this._apply(pick(s.filters, this.barDef, group, option), s);
  }

  "bar.flip"(msg: Message, s: S): Effect[] {
    return this._apply(flip(s.filters, String(msg.payload)), s);
  }

  "bar.slide"(msg: Message, s: S): Effect[] {
    const value = Number(msg.event?.value);
    return this._apply(
      slide(s.filters, this.barDef, String(msg.payload), value),
      s,
    );
  }

  "bar.sort"(msg: Message, s: S): Effect[] {
    return this._apply(setSort(s.filters, String(msg.event?.value ?? "")), s);
  }

  "bar.clear"(_msg: Message, s: S): Effect[] {
    return this._apply(cleared(this.barDef, s.filters), s);
  }
}

// ---- the page of the block: a bar over a small list ----

interface Fruit {
  id: string;
  name: string;
  kind: string;
  season: string;
  price: number;
  stock: boolean;
}

const FRUIT: Fruit[] = [
  {
    id: "apple",
    name: "Apple",
    kind: "orchard",
    season: "autumn",
    price: 180,
    stock: true,
  },
  {
    id: "pear",
    name: "Pear",
    kind: "orchard",
    season: "autumn",
    price: 220,
    stock: true,
  },
  {
    id: "cherry",
    name: "Cherry",
    kind: "stone",
    season: "summer",
    price: 640,
    stock: false,
  },
  {
    id: "peach",
    name: "Peach",
    kind: "stone",
    season: "summer",
    price: 410,
    stock: true,
  },
  {
    id: "plum",
    name: "Plum",
    kind: "stone",
    season: "summer",
    price: 330,
    stock: true,
  },
  {
    id: "strawberry",
    name: "Strawberry",
    kind: "berry",
    season: "spring",
    price: 520,
    stock: true,
  },
  {
    id: "blueberry",
    name: "Blueberry",
    kind: "berry",
    season: "summer",
    price: 780,
    stock: false,
  },
  {
    id: "raspberry",
    name: "Raspberry",
    kind: "berry",
    season: "summer",
    price: 690,
    stock: true,
  },
];

const demoDef: BarDef = {
  placeholder: "Search fruit",
  groups: [
    {
      id: "kind",
      label: "Kind",
      multi: true,
      allLabel: "All",
      options: [
        { id: "orchard", label: "Orchard" },
        { id: "stone", label: "Stone fruit" },
        { id: "berry", label: "Berries" },
      ],
    },
    {
      id: "season",
      label: "Season",
      multi: false,
      allLabel: "Any",
      options: [
        { id: "spring", label: "Spring" },
        { id: "summer", label: "Summer" },
        { id: "autumn", label: "Autumn" },
      ],
    },
  ],
  toggles: [{ id: "stock", label: "In stock only" }],
  ranges: [
    {
      id: "price",
      label: "Price per kg",
      min: 100,
      max: 800,
      step: 50,
      format: (v) => `up to $${(v / 100).toFixed(2)}`,
    },
  ],
  sorts: [
    { id: "name", label: "Name" },
    { id: "low", label: "Price: low to high" },
    { id: "high", label: "Price: high to low" },
  ],
  noun: ["fruit", "fruits"],
};

/** The filtered, sorted names for a set of filters. */
export function visibleFruit(f: Filters): Fruit[] {
  const list = FRUIT.filter(
    (x) =>
      matches(f.query, `${x.name} ${x.kind} ${x.season}`) &&
      inPicks(f.picks.kind, [x.kind]) &&
      inPicks(f.picks.season, [x.season]) &&
      (!f.flags.stock || x.stock) &&
      x.price <= (f.ranges.price ?? Infinity),
  );
  if (f.sort === "low")
    return sortedBy(
      list,
      (x) => x.price,
      1,
      (x) => x.name,
    );
  if (f.sort === "high")
    return sortedBy(
      list,
      (x) => x.price,
      -1,
      (x) => x.name,
    );
  return sortedBy(
    list,
    () => 0,
    1,
    (x) => x.name,
  );
}

export interface PageState {
  filters: Filters;
  bar: BarView;
  rows: { id: string; text: string }[];
}

const rowsOf = (f: Filters) =>
  visibleFruit(f).map((x) => ({
    id: x.id,
    text: `${x.name} · ${x.kind}, ${x.season} · $${(x.price / 100).toFixed(2)}/kg${x.stock ? "" : " · sold out"}`,
  }));

const start = startFilters(demoDef);

export const initial: PageState = {
  filters: start,
  bar: barOf(demoDef, start, visibleFruit(start).length),
  rows: rowsOf(start),
};

export class FilterBarPage extends FilterHost<PageState> {
  view = pageView;
  readonly barDef = demoDef;

  _apply(filters: Filters): Effect[] {
    const rows = rowsOf(filters);
    return [
      store.set("filters", filters),
      store.set("bar", barOf(demoDef, filters, rows.length)),
      store.set("rows", rows),
    ];
  }
}

export const page = new FilterBarPage();
