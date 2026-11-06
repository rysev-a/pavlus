import { money } from "../admin-shell/shell.ts";
import {
  type Column,
  columnsOf,
  type Sort,
  sortBy,
} from "../data-grid/grid.ts";
import { type Mode, modeIcon, modeLabel } from "../shipment-tracker/tracker.ts";

export interface Rate {
  id: string;
  carrier: string;
  mode: Mode;
  /** The price for the shipment in euros. */
  price: number;
  /** Door to door, in days. */
  days: number;
  /** Share of deliveries on time in the last year, in percent. */
  reliability: number;
  note: string;
}

export type RateKey = "carrier" | "price" | "days" | "reliability";

export interface RateRow {
  id: string;
  carrier: string;
  mode: string;
  modeIcon: string;
  priceText: string;
  /** `+€120 (12%)` over the cheapest, or empty for the cheapest. */
  extraText: string;
  daysText: string;
  reliability: number;
  reliabilityText: string;
  tone: "success" | "warning" | "destructive";
  note: string;
  badges: string[];
  selected: boolean;
}

export const RATE_COLUMNS = [
  { key: "carrier", label: "Carrier", sortable: true },
  { key: "price", label: "Price", sortable: true, align: "right" as const },
  { key: "days", label: "Transit", sortable: true, align: "right" as const },
  { key: "reliability", label: "On time", sortable: true },
];

export const rateColumns = (sort: Sort | null): Column[] =>
  columnsOf(RATE_COLUMNS, sort);

/**
 * Pure: how good an offer is overall, lower is better: price counts half,
 * speed 30% and reliability 20%, each against the best offer in the list.
 */
export function valueScore(rate: Rate, all: Rate[]): number {
  const minPrice = Math.min(...all.map((r) => r.price));
  const minDays = Math.min(...all.map((r) => r.days));
  const maxRel = Math.max(...all.map((r) => r.reliability));
  return (
    0.5 * (rate.price / minPrice) +
    0.3 * (rate.days / minDays) +
    0.2 * (maxRel / Math.max(1, rate.reliability))
  );
}

/** Pure: the ids of the cheapest, the fastest, the most reliable and the best value. */
export function winners(rates: Rate[]): {
  cheapest: string;
  fastest: string;
  reliable: string;
  value: string;
} {
  const best = (score: (r: Rate) => number): string =>
    [...rates].sort(
      (a, b) => score(a) - score(b) || a.id.localeCompare(b.id),
    )[0]?.id ?? "";
  return {
    cheapest: best((r) => r.price),
    fastest: best((r) => r.days),
    reliable: best((r) => -r.reliability),
    value: best((r) => valueScore(r, rates)),
  };
}

const keyValue = (r: Rate, key: string): string | number =>
  key === "price"
    ? r.price
    : key === "days"
      ? r.days
      : key === "reliability"
        ? r.reliability
        : r.carrier;

/** Pure: the offers as rows, sorted, with their badges. */
export function rateRows(
  rates: Rate[],
  sort: Sort | null,
  selected: string,
): RateRow[] {
  if (rates.length === 0) return [];
  const win = winners(rates);
  const cheapest = Math.min(...rates.map((r) => r.price));
  return sortBy(rates, sort ?? { key: "price", dir: "asc" }, keyValue).map(
    (r) => {
      const badges: string[] = [];
      if (r.id === win.value) badges.push("Best value");
      if (r.id === win.cheapest) badges.push("Cheapest");
      if (r.id === win.fastest) badges.push("Fastest");
      if (r.id === win.reliable) badges.push("Most reliable");
      const extra = r.price - cheapest;
      return {
        id: r.id,
        carrier: r.carrier,
        mode: modeLabel(r.mode),
        modeIcon: modeIcon(r.mode),
        priceText: money(r.price, "€", 0),
        extraText:
          extra > 0
            ? `+${money(extra, "€", 0)} (${Math.round((extra / cheapest) * 100)}%)`
            : "",
        daysText: `${r.days} ${r.days === 1 ? "day" : "days"}`,
        reliability: r.reliability,
        reliabilityText: `${r.reliability}%`,
        tone:
          r.reliability >= 92
            ? "success"
            : r.reliability >= 85
              ? "warning"
              : "destructive",
        note: r.note,
        badges,
        selected: r.id === selected,
      };
    },
  );
}
