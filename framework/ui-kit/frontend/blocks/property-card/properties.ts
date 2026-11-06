import { money, type Tone } from "../admin-shell/shell.ts";

export type PropertyStatus = "active" | "pending" | "sold" | "draft";
export type PropertyKind = "house" | "apartment" | "loft" | "cottage";

export interface Property {
  id: string;
  title: string;
  address: string;
  city: string;
  price: number;
  beds: number;
  baths: number;
  /** Living area in square meters. */
  area: number;
  kind: PropertyKind;
  status: PropertyStatus;
  agent: string;
  /** ISO day it was listed. */
  listed: string;
}

export interface PropertyView {
  id: string;
  title: string;
  address: string;
  price: string;
  facts: string;
  status: string;
  tone: Tone;
  /** 0..5: which gradient the picture uses. */
  art: string;
  emoji: string;
  selected: boolean;
  /** `92% match`, or empty. */
  match: string;
}

export const STATUS_TONE: Record<PropertyStatus, Tone> = {
  active: "success",
  pending: "warning",
  sold: "muted",
  draft: "info",
};

const EMOJI: Record<PropertyKind, string> = {
  house: "🏡",
  apartment: "🏢",
  loft: "🏙️",
  cottage: "🌳",
};

export const price = (n: number): string => money(n, "$", 0);

/** Pure: `3 bed · 2 bath · 128 m²`. */
export const factsOf = (p: Property): string =>
  `${p.beds} bed · ${p.baths} bath · ${p.area} m²`;

/** Pure: the cards for a list; `matches` maps a property id to a score 0..100. */
export function propertyViews(
  list: Property[],
  selected = "",
  matches: Record<string, number> = {},
): PropertyView[] {
  return list.map((p) => ({
    id: p.id,
    title: p.title,
    address: `${p.address}, ${p.city}`,
    price: price(p.price),
    facts: factsOf(p),
    status: p.status,
    tone: STATUS_TONE[p.status],
    art: String(Math.floor(p.price / 1000) % 6),
    emoji: EMOJI[p.kind],
    selected: p.id === selected,
    match: matches[p.id] === undefined ? "" : `${matches[p.id]}% match`,
  }));
}
