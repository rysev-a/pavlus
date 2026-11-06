import type { Tone } from "../admin-shell/shell.ts";
import { clampPct, loadTone, pad2 } from "../admin-shell/shell.ts";

/** One storage place: a bay on an aisle of a zone. */
export interface Location {
  /** `A-02-05`. */
  code: string;
  zone: string;
  aisle: number;
  bay: number;
  /** The product stored here, or empty. */
  sku: string;
  qty: number;
  cap: number;
}

export interface ZoneDef {
  id: string;
  name: string;
  sub: string;
}

export interface CellView {
  id: string;
  /** The short label: the bay number. */
  bay: string;
  pct: number;
  /** `A-02-05: 40 of 60 Olive oil`. */
  title: string;
  /** An alert on the place (a product that is running out). */
  mark: boolean;
  selected: boolean;
  /** Greyed out: it does not match the search. */
  dim: boolean;
  empty: boolean;
}

export interface AisleView {
  id: string;
  label: string;
  cells: CellView[];
}

export interface ZoneView {
  id: string;
  name: string;
  sub: string;
  pct: number;
  tone: Tone;
  /** `72% full`. */
  fill: string;
  aisles: AisleView[];
}

/** Pure: `A`, 2, 5 becomes `A-02-05`. */
export const codeOf = (zone: string, aisle: number, bay: number): string =>
  `${zone}-${pad2(aisle)}-${pad2(bay)}`;

/** Pure: how full a place is, 0 to 100. */
export const fillOf = (l: Location): number =>
  l.cap <= 0 ? 0 : clampPct((l.qty / l.cap) * 100);

/** Pure: how full a group of places is. */
export function fillOfAll(list: Location[]): number {
  const cap = list.reduce((n, l) => n + l.cap, 0);
  const qty = list.reduce((n, l) => n + l.qty, 0);
  return cap <= 0 ? 0 : clampPct((qty / cap) * 100);
}

/** Pure: places that hold nothing. */
export const freeCount = (list: Location[]): number =>
  list.filter((l) => l.qty === 0).length;

/** Pure: does a place match a search (its code or its product)? Empty matches all. */
export function matches(
  l: Location,
  names: Record<string, string>,
  query: string,
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    l.code.toLowerCase().includes(q) ||
    l.sku.toLowerCase().includes(q) ||
    (names[l.sku] ?? "").toLowerCase().includes(q)
  );
}

/** Pure: the grid to draw. `alerts` are the products that need attention. */
export function zonesOf(
  defs: ZoneDef[],
  list: Location[],
  opts: {
    selected: string;
    query: string;
    names: Record<string, string>;
    alerts: string[];
    only: string;
  },
): ZoneView[] {
  return defs
    .filter((z) => opts.only === "all" || z.id === opts.only)
    .map((zone) => {
      const here = list.filter((l) => l.zone === zone.id);
      const aisles = [...new Set(here.map((l) => l.aisle))].sort(
        (a, b) => a - b,
      );
      const pct = fillOfAll(here);
      return {
        id: zone.id,
        name: zone.name,
        sub: zone.sub,
        pct,
        tone: loadTone(pct),
        fill: `${pct}% full`,
        aisles: aisles.map((aisle) => ({
          id: `${zone.id}${aisle}`,
          label: `Aisle ${pad2(aisle)}`,
          cells: here
            .filter((l) => l.aisle === aisle)
            .sort((a, b) => a.bay - b.bay)
            .map((l): CellView => {
              const name = opts.names[l.sku] ?? l.sku;
              return {
                id: l.code,
                bay: String(l.bay),
                pct: fillOf(l),
                title:
                  l.qty > 0
                    ? `${l.code}: ${l.qty} of ${l.cap}, ${name}`
                    : `${l.code}: empty`,
                mark: l.qty > 0 && opts.alerts.includes(l.sku),
                selected: l.code === opts.selected,
                dim: !matches(l, opts.names, opts.query),
                empty: l.qty === 0,
              };
            }),
        })),
      };
    });
}
