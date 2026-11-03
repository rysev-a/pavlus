import { money } from "../admin-shell/shell.ts";

/** One line of a menu or a price list. */
export interface Entry {
  id: string;
  /** An emoji for the tile. */
  icon: string;
  name: string;
  /** `Starters`, `Monthly plan`... */
  group: string;
  sub: string;
  price: number;
  /** What was typed in the price box (kept while it is not valid). */
  draft: string;
  on: boolean;
}

export interface EntryView {
  id: string;
  icon: string;
  name: string;
  sub: string;
  group: string;
  draft: string;
  on: boolean;
  /** `On the menu`, `Sold out`. */
  state: string;
  error: string;
  /** `$14.50` shown when the box is not being edited wrongly. */
  shown: string;
}

export const entry = (
  id: string,
  icon: string,
  name: string,
  group: string,
  price: number,
  sub = "",
  on = true,
): Entry => ({
  id,
  icon,
  name,
  group,
  sub,
  price,
  draft: price.toFixed(2),
  on,
});

/** Pure: a price typed by hand: a number above zero with at most two decimals, or null. */
export function parsePrice(text: string): number | null {
  const t = text.trim().replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return null;
  const n = Number(t);
  return n > 0 ? n : null;
}

/** Pure: the list with a price typed in; a bad price is kept as a draft only. */
export function typePrice(list: Entry[], id: string, text: string): Entry[] {
  const price = parsePrice(text);
  return list.map((e) =>
    e.id !== id ? e : { ...e, draft: text, price: price ?? e.price },
  );
}

/** Pure: the list with one line switched on or off. */
export function toggle(list: Entry[], id: string): Entry[] {
  return list.map((e) => (e.id === id ? { ...e, on: !e.on } : e));
}

/** Pure: the lines ready to draw. */
export function rowsOf(
  list: Entry[],
  on = "On the menu",
  off = "Sold out",
): EntryView[] {
  return list.map((e) => ({
    id: e.id,
    icon: e.icon,
    name: e.name,
    sub: e.sub,
    group: e.group,
    draft: e.draft,
    on: e.on,
    state: e.on ? on : off,
    error: parsePrice(e.draft) === null ? "Enter a price like 12.50" : "",
    shown: money(e.price),
  }));
}

/** Pure: how many lines are on. */
export const onCount = (list: Entry[]): number =>
  list.filter((e) => e.on).length;
