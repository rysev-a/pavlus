import type { Tone } from "../admin-shell/shell.ts";

export type ShipStatus =
  | "booked"
  | "transit"
  | "customs"
  | "delivered"
  | "delayed";
export type Mode = "road" | "rail" | "sea" | "air";

export const STATUSES: { id: ShipStatus; label: string; tone: Tone }[] = [
  { id: "booked", label: "Booked", tone: "info" },
  { id: "transit", label: "In transit", tone: "default" },
  { id: "customs", label: "Customs", tone: "warning" },
  { id: "delayed", label: "Delayed", tone: "destructive" },
  { id: "delivered", label: "Delivered", tone: "success" },
];

export const MODES: { id: Mode; label: string; icon: string }[] = [
  { id: "road", label: "Road", icon: "🚚" },
  { id: "rail", label: "Rail", icon: "🚆" },
  { id: "sea", label: "Sea", icon: "🚢" },
  { id: "air", label: "Air", icon: "✈️" },
];

export const modeIcon = (mode: Mode): string =>
  MODES.find((m) => m.id === mode)?.icon ?? "📦";
export const modeLabel = (mode: Mode): string =>
  MODES.find((m) => m.id === mode)?.label ?? "";
export const statusLabel = (s: ShipStatus): string =>
  STATUSES.find((x) => x.id === s)?.label ?? "";
export const statusTone = (s: ShipStatus): Tone =>
  STATUSES.find((x) => x.id === s)?.tone ?? "default";

/** What the board needs to know about a shipment. */
export interface TrackItem {
  id: string;
  ref: string;
  status: ShipStatus;
  origin: string;
  destination: string;
  carrier: string;
  mode: Mode;
  /** How far along the route it is, 0 to 100. */
  pct: number;
  /** `Nov 9`, or the delivery date. */
  eta: string;
}

export interface TrackCard {
  id: string;
  ref: string;
  route: string;
  carrier: string;
  icon: string;
  pct: number;
  pctText: string;
  eta: string;
}

export interface Lane {
  id: ShipStatus;
  label: string;
  tone: Tone;
  count: number;
  cards: TrackCard[];
}

/** Pure: a lane for every status, in the order of the board, with its shipments. */
export function lanesOf(items: TrackItem[]): Lane[] {
  return STATUSES.map((s) => {
    const cards = items
      .filter((x) => x.status === s.id)
      .sort((a, b) => b.pct - a.pct || a.ref.localeCompare(b.ref))
      .map((x) => ({
        id: x.id,
        ref: x.ref,
        route: `${x.origin} → ${x.destination}`,
        carrier: x.carrier,
        icon: modeIcon(x.mode),
        pct: Math.max(0, Math.min(100, Math.round(x.pct))),
        pctText:
          x.status === "delivered"
            ? "Delivered"
            : `${Math.round(x.pct)}% of the way`,
        eta: x.eta,
      }));
    return {
      id: s.id,
      label: s.label,
      tone: s.tone,
      count: cards.length,
      cards,
    };
  });
}
