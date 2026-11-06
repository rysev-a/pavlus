import type { Effect } from "@pavlus/frontend";
import {
  storeEffector as store,
  timeEffector as time,
} from "@pavlus/frontend/plugins";

/** What the sidebar and the top bar of the shell take as props. */
export interface NavItem {
  id: string;
  label: string;
  icon: string;
  badge?: string;
  /** A real address for the link (an app with URL routing); default `#<id>`. */
  href?: string;
}
export interface NavGroup {
  title: string;
  items: NavItem[];
}
export interface ShellAction {
  id: string;
  label: string;
  icon: string;
  variant: "default" | "outline" | "secondary" | "ghost";
}
export interface ShellUser {
  name: string;
  role: string;
  initials: string;
}

/** Pure: the label of a navigation item (the title of its view). */
export function titleOf(groups: NavGroup[], id: string): string {
  for (const group of groups) {
    const item = group.items.find((i) => i.id === id);
    if (item) return item.label;
  }
  return "";
}

/** Pure: the same groups with the badge of one item changed (`""` removes it). */
export function withBadge(
  groups: NavGroup[],
  id: string,
  badge: string,
): NavGroup[] {
  return groups.map((g) => ({
    ...g,
    items: g.items.map((i) => (i.id === id ? { ...i, badge } : i)),
  }));
}

/** Store effects for several top-level fields at once. */
export function patch(values: Record<string, unknown>): Effect[] {
  return Object.entries(values).map(([key, value]) => store.set(key, value));
}

export const NOTICE_MS = 3200;

/** A short message in the top bar that goes away by itself (`clearNotice`). */
export function notice(text: string): Effect[] {
  return [
    store.set("notice", text),
    time.setTimeout("notice", NOTICE_MS, "clearNotice"),
  ];
}

/** `1234.5` becomes `1,234.50`: a stable money format (no locale involved). */
export function money(value: number, symbol = "$", decimals = 2): string {
  const [whole, cents] = Math.abs(value).toFixed(decimals).split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${value < 0 ? "-" : ""}${symbol}${grouped}${cents ? `.${cents}` : ""}`;
}

/** The tones every dashboard block understands (`k-adm-t-<tone>`). */
export type Tone =
  | "default"
  | "success"
  | "warning"
  | "destructive"
  | "info"
  | "muted";

/** Pure: a percentage kept between 0 and 100 and rounded. */
export const clampPct = (value: number): number =>
  Math.max(0, Math.min(100, Math.round(value)));

/** Pure: part of a whole as a percentage (0 when the whole is 0). */
export const share = (part: number, whole: number): number =>
  whole <= 0 ? 0 : clampPct((part / whole) * 100);

/** Pure: how worrying a load is: green, amber or red. */
export function loadTone(pct: number): Tone {
  if (pct >= 90) return "destructive";
  if (pct >= 75) return "warning";
  return "success";
}

/** `5` becomes `05`. */
export const pad2 = (n: number): string => (n < 10 ? `0${n}` : String(n));

/** The initials of a name: `Ann Lee` becomes `AL`. */
export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w.slice(0, 1).toUpperCase())
    .join("");
}
