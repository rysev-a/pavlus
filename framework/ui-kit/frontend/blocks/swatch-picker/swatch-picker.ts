import { Component, type Effect, type Message } from "@pavlus/frontend";
import { storeEffector as store } from "@pavlus/frontend/plugins";
import view from "./swatch-picker.pavlus";

/** A color of a product: an HSL triple, so no literal color string is needed. */
export interface Swatch {
  id: string;
  label: string;
  h: number;
  s: number;
  l: number;
}

export interface VariantDef {
  colors: Swatch[];
  sizes: string[];
  /** Units left by `"<color>|<size>"`; a missing key is sold out. */
  stock: Record<string, number>;
}

export interface Selection {
  color: string;
  size: string;
}

export const stockKey = (color: string, size: string): string =>
  `${color}|${size}`;

export const stockOf = (def: VariantDef, color: string, size: string): number =>
  def.stock[stockKey(color, size)] ?? 0;

/** Units of a color over all its sizes. */
export const colorStock = (def: VariantDef, color: string): number =>
  def.sizes.reduce((n, size) => n + stockOf(def, color, size), 0);

/**
 * A selection that can be bought: the color stays, and when its size is sold
 * out in that color the first size that is not takes its place (or "").
 */
export function settle(def: VariantDef, sel: Selection): Selection {
  if (stockOf(def, sel.color, sel.size) > 0) return sel;
  const size = def.sizes.find((s) => stockOf(def, sel.color, s) > 0) ?? "";
  return { color: sel.color, size };
}

/** Choose a color, then fix the size; a sold-out color cannot be chosen. */
export function chooseColor(
  def: VariantDef,
  sel: Selection,
  color: string,
): Selection {
  if (!def.colors.some((c) => c.id === color) || colorStock(def, color) === 0)
    return sel;
  return settle(def, { ...sel, color });
}

/** Choose a size if it is in stock in the chosen color. */
export function chooseSize(
  def: VariantDef,
  sel: Selection,
  size: string,
): Selection {
  return stockOf(def, sel.color, size) > 0 ? { ...sel, size } : sel;
}

export interface PickerView {
  colorTitle: string;
  colors: (Swatch & { active: boolean; soldOut: boolean })[];
  sizeTitle: string;
  sizes: { id: string; active: boolean; soldOut: boolean }[];
  /** "Only 2 left", "In stock", "Sold out in this color". */
  note: string;
  low: boolean;
  /** The chosen variant can be bought. */
  canBuy: boolean;
  left: number;
}

/** What the view prints for a selection. */
export function pickerOf(def: VariantDef, sel: Selection): PickerView {
  const color = def.colors.find((c) => c.id === sel.color);
  const left = stockOf(def, sel.color, sel.size);
  const canBuy = left > 0;
  return {
    colorTitle: `Color: ${color?.label ?? ""}`,
    colors: def.colors.map((c) => ({
      ...c,
      active: c.id === sel.color,
      soldOut: colorStock(def, c.id) === 0,
    })),
    sizeTitle: sel.size ? `Size: ${sel.size}` : "Size",
    sizes: def.sizes.map((size) => ({
      id: size,
      active: size === sel.size,
      soldOut: stockOf(def, sel.color, size) === 0,
    })),
    note: !canBuy
      ? "Sold out in this color"
      : left <= 3
        ? `Only ${left} left`
        : "In stock, ships in 2 days",
    low: canBuy && left <= 3,
    canBuy,
    left,
  };
}

// ---- the page of the block ----

const DEF: VariantDef = {
  colors: [
    { id: "ink", label: "Ink", h: 220, s: 14, l: 14 },
    { id: "sand", label: "Sand", h: 38, s: 38, l: 74 },
    { id: "forest", label: "Forest", h: 150, s: 32, l: 26 },
    { id: "rust", label: "Rust", h: 15, s: 62, l: 42 },
    { id: "sky", label: "Sky", h: 205, s: 70, l: 70 },
  ],
  sizes: ["XS", "S", "M", "L", "XL"],
  stock: {
    "ink|S": 8,
    "ink|M": 12,
    "ink|L": 5,
    "ink|XL": 1,
    "sand|XS": 2,
    "sand|S": 6,
    "sand|M": 3,
    "forest|M": 2,
    "forest|L": 9,
    "forest|XL": 4,
    "rust|S": 1,
  },
};

export interface PageState {
  selection: Selection;
  picker: PickerView;
}

const start: Selection = settle(DEF, { color: "ink", size: "M" });

export const initial: PageState = {
  selection: start,
  picker: pickerOf(DEF, start),
};

export class SwatchPickerPage extends Component<PageState> {
  view = view;

  /** `color(id)` and `size(id)`: the sizes in stock change with the color. */
  "picker.color"(msg: Message, state: PageState): Effect[] {
    const next = chooseColor(DEF, state.selection, String(msg.payload));
    return [
      store.set("selection", next),
      store.set("picker", pickerOf(DEF, next)),
    ];
  }

  "picker.size"(msg: Message, state: PageState): Effect[] {
    const next = chooseSize(DEF, state.selection, String(msg.payload));
    return [
      store.set("selection", next),
      store.set("picker", pickerOf(DEF, next)),
    ];
  }
}

export const page = new SwatchPickerPage();
