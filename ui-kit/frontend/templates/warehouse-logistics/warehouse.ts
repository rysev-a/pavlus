import { pad2 } from "../../blocks/admin-shell/shell.ts";
import type { Appt, DockDef } from "../../blocks/dock-schedule/docks.ts";
import {
  codeOf,
  type Location,
  type ZoneDef,
} from "../../blocks/location-grid/locations.ts";
import type { PickLine } from "../../blocks/pick-list/picks.ts";

// ---- the building

export const ZONES: ZoneDef[] = [
  { id: "A", name: "Zone A", sub: "Ambient dry goods" },
  { id: "B", name: "Zone B", sub: "Chilled, 2 to 6 C" },
  { id: "C", name: "Zone C", sub: "Bulk pallets" },
  { id: "D", name: "Zone D", sub: "Fast pick face" },
];

/** Aisles and bays of each zone. */
const SHAPE: Record<string, { aisles: number; bays: number }> = {
  A: { aisles: 4, bays: 8 },
  B: { aisles: 2, bays: 8 },
  C: { aisles: 2, bays: 6 },
  D: { aisles: 3, bays: 8 },
};

export interface Sku {
  id: string;
  name: string;
  zone: string;
  /** What one place of its zone holds. */
  cap: number;
  /** The reorder level as a share of today's stock (above 1 means running low). */
  factor: number;
  supplier: string;
}

export const SKUS: Sku[] = [
  {
    id: "RIC-BAS-5K",
    name: "Basmati rice 5 kg",
    zone: "A",
    cap: 60,
    factor: 0.5,
    supplier: "Golden Grain",
  },
  {
    id: "PAS-FUS-500",
    name: "Fusilli pasta 500 g",
    zone: "A",
    cap: 60,
    factor: 0.45,
    supplier: "Pasta Nostra",
  },
  {
    id: "OIL-OLV-1L",
    name: "Olive oil 1 L",
    zone: "A",
    cap: 60,
    factor: 0.5,
    supplier: "Olivar Sur",
  },
  {
    id: "FLR-WHT-1K",
    name: "Wheat flour 1 kg",
    zone: "A",
    cap: 60,
    factor: 0.4,
    supplier: "Mill & Co",
  },
  {
    id: "COF-BEAN-1K",
    name: "Coffee beans 1 kg",
    zone: "A",
    cap: 60,
    factor: 1.35,
    supplier: "Harbor Roasters",
  },
  {
    id: "MLK-OAT-1L",
    name: "Oat milk 1 L",
    zone: "B",
    cap: 40,
    factor: 0.5,
    supplier: "Nordic Oat",
  },
  {
    id: "EGG-FR-12",
    name: "Free-range eggs, 12",
    zone: "B",
    cap: 40,
    factor: 1.2,
    supplier: "Meadow Farm",
  },
  {
    id: "YOG-GRK-500",
    name: "Greek yogurt 500 g",
    zone: "B",
    cap: 40,
    factor: 0.5,
    supplier: "Athena Dairy",
  },
  {
    id: "CHS-GOU-200",
    name: "Gouda 200 g",
    zone: "B",
    cap: 40,
    factor: 0.55,
    supplier: "Athena Dairy",
  },
  {
    id: "WAT-SPK-12",
    name: "Sparkling water, 12-pack",
    zone: "C",
    cap: 120,
    factor: 0.5,
    supplier: "Alpine Springs",
  },
  {
    id: "PPR-A4-5",
    name: "Copy paper A4, 5 reams",
    zone: "C",
    cap: 120,
    factor: 0.4,
    supplier: "Papyrus",
  },
  {
    id: "DET-LQD-5L",
    name: "Detergent 5 L",
    zone: "C",
    cap: 120,
    factor: 0.6,
    supplier: "CleanWorks",
  },
  {
    id: "TEA-GRN-50",
    name: "Green tea, 50 bags",
    zone: "D",
    cap: 30,
    factor: 0.5,
    supplier: "Leaf & Cup",
  },
  {
    id: "BAT-AA-24",
    name: "AA batteries, 24",
    zone: "D",
    cap: 30,
    factor: 1.5,
    supplier: "Voltaic",
  },
  {
    id: "CBL-USB-1M",
    name: "USB-C cable 1 m",
    zone: "D",
    cap: 30,
    factor: 0.5,
    supplier: "Voltaic",
  },
  {
    id: "SOP-HND-300",
    name: "Hand soap 300 ml",
    zone: "D",
    cap: 30,
    factor: 0.45,
    supplier: "CleanWorks",
  },
];

export const skuName = (id: string): string =>
  SKUS.find((s) => s.id === id)?.name ?? id;

/** Pure: the places of the building, filled the same way every time. */
export function seedLocations(): Location[] {
  const out: Location[] = [];
  ZONES.forEach((zone, z) => {
    const { aisles, bays } = SHAPE[zone.id];
    const here = SKUS.filter((s) => s.zone === zone.id);
    for (let aisle = 1; aisle <= aisles; aisle++) {
      for (let bay = 1; bay <= bays; bay++) {
        const pick = (aisle * 5 + bay * 3 + z) % (here.length + 2);
        const sku = here[pick];
        const cap = sku?.cap ?? here[0].cap;
        const pct = ((aisle * 37 + bay * 53 + z * 11) % 88) + 10;
        out.push({
          code: codeOf(zone.id, aisle, bay),
          zone: zone.id,
          aisle,
          bay,
          sku: sku?.id ?? "",
          qty: sku ? Math.round((cap * pct) / 100) : 0,
          cap,
        });
      }
    }
  });
  return out;
}

export const LOCATIONS: Location[] = seedLocations();

/** Pure: the stock of every product, summed over its places. */
export function totals(list: Location[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const l of list)
    if (l.sku && l.qty > 0) out[l.sku] = (out[l.sku] ?? 0) + l.qty;
  return out;
}

/** No product is left without a reorder level, even one with nothing on the shelves. */
export const MIN_FLOOR = 24;

/** The reorder level of every product, worked out from the starting stock. */
export const MINIMUMS: Record<string, number> = (() => {
  const t = totals(LOCATIONS);
  return Object.fromEntries(
    SKUS.map((s) => [
      s.id,
      Math.max(MIN_FLOOR, Math.round((t[s.id] ?? 0) * s.factor)),
    ]),
  );
})();

// ---- moving stock

export interface Take {
  loc: string;
  qty: number;
}

/** Pure: where to take `qty` of a product from, in the order of the codes; null if there is not enough. */
export function allocate(
  list: Location[],
  sku: string,
  qty: number,
): Take[] | null {
  const here = list
    .filter((l) => l.sku === sku && l.qty > 0)
    .sort((a, b) => a.code.localeCompare(b.code));
  const takes: Take[] = [];
  let need = qty;
  for (const l of here) {
    if (need <= 0) break;
    const n = Math.min(l.qty, need);
    takes.push({ loc: l.code, qty: n });
    need -= n;
  }
  return need > 0 ? null : takes;
}

export interface Put {
  loc: string;
  qty: number;
}

/**
 * Pure: put `qty` of a product away. It fills the places that already hold it,
 * then empty places of its zone. `left` is what did not fit.
 */
export function putaway(
  list: Location[],
  sku: string,
  qty: number,
): { locations: Location[]; puts: Put[]; left: number } {
  const zone = SKUS.find((s) => s.id === sku)?.zone ?? "";
  const cap = SKUS.find((s) => s.id === sku)?.cap ?? 0;
  const order = [
    ...list.filter((l) => l.sku === sku && l.qty < l.cap),
    ...list.filter((l) => l.zone === zone && l.qty === 0),
  ].sort(
    (a, b) =>
      Number(a.qty === 0) - Number(b.qty === 0) || a.code.localeCompare(b.code),
  );
  const puts: Put[] = [];
  let left = qty;
  const next = new Map<string, Location>();
  for (const l of order) {
    if (left <= 0) break;
    const room = (l.qty === 0 ? cap : l.cap) - l.qty;
    const n = Math.min(room, left);
    if (n <= 0) continue;
    puts.push({ loc: l.code, qty: n });
    next.set(l.code, {
      ...l,
      sku,
      cap: l.qty === 0 ? cap : l.cap,
      qty: l.qty + n,
    });
    left -= n;
  }
  return {
    locations: list.map((l) => next.get(l.code) ?? l),
    puts,
    left,
  };
}

/** Pure: the places with some stock taken out (never below zero); an empty place forgets its product. */
export function takeOut(list: Location[], takes: Take[]): Location[] {
  const by = new Map<string, number>();
  for (const t of takes) by.set(t.loc, (by.get(t.loc) ?? 0) + t.qty);
  return list.map((l) => {
    const n = by.get(l.code);
    if (!n) return l;
    const qty = Math.max(0, l.qty - n);
    return { ...l, qty, sku: qty === 0 ? "" : l.sku };
  });
}

// ---- movements

export type MoveType = "in" | "out" | "pick" | "move" | "count";

export interface Movement {
  id: string;
  time: string;
  type: MoveType;
  sku: string;
  qty: number;
  from: string;
  to: string;
  who: string;
}

export const MOVE_FILTERS: [string, string][] = [
  ["all", "All"],
  ["in", "Received"],
  ["pick", "Picked"],
  ["out", "Shipped"],
  ["move", "Moved"],
  ["count", "Counted"],
];

/** Pure: the clock of the building after `n` actions (09:40 and 3 minutes each). */
export function stamp(n: number): string {
  const m = 9 * 60 + 40 + n * 3;
  return `${pad2(Math.floor(m / 60))}:${pad2(m % 60)}`;
}

const mv = (
  id: string,
  time: string,
  type: MoveType,
  sku: string,
  qty: number,
  from: string,
  to: string,
  who: string,
): Movement => ({ id, time, type, sku, qty, from, to, who });

export const MOVEMENTS: Movement[] = [
  mv("m9", "09:31", "pick", "MLK-OAT-1L", 12, "B-01-04", "PACK-2", "Ola"),
  mv("m8", "09:24", "in", "WAT-SPK-12", 60, "DOCK-2", "C-01-03", "Piotr"),
  mv("m7", "09:12", "out", "TEA-GRN-50", 30, "PACK-1", "DOCK-3", "Ola"),
  mv("m6", "08:58", "move", "RIC-BAS-5K", 24, "A-02-06", "A-01-02", "Piotr"),
  mv("m5", "08:41", "count", "EGG-FR-12", 0, "B-02-05", "B-02-05", "Sana"),
  mv("m4", "08:20", "pick", "OIL-OLV-1L", 18, "A-03-01", "PACK-1", "Ola"),
  mv("m3", "07:55", "in", "CBL-USB-1M", 90, "DOCK-1", "D-03-04", "Piotr"),
  mv("m2", "07:30", "out", "PPR-A4-5", 40, "PACK-2", "DOCK-4", "Sana"),
  mv("m1", "07:05", "in", "FLR-WHT-1K", 120, "DOCK-1", "A-04-05", "Piotr"),
];

export const movePasses = (m: Movement, id: string): boolean => m.type === id;

export const moveText = (m: Movement): string =>
  `${m.id} ${m.sku} ${skuName(m.sku)} ${m.from} ${m.to} ${m.who}`;

// ---- orders

export type OrderType = "inbound" | "outbound";
export type OrderStatus =
  | "expected"
  | "arrived"
  | "received"
  | "new"
  | "picking"
  | "packed"
  | "shipped";

export interface OrderLine {
  sku: string;
  qty: number;
}

export interface Order {
  id: string;
  type: OrderType;
  party: string;
  lines: OrderLine[];
  status: OrderStatus;
  due: string;
}

export const STATUS_TEXT: Record<OrderStatus, string> = {
  expected: "Expected",
  arrived: "At the dock",
  received: "Received",
  new: "New",
  picking: "Picking",
  packed: "Packed",
  shipped: "Shipped",
};

export const isOpen = (o: Order): boolean =>
  o.status !== "received" && o.status !== "shipped";

export const units = (o: Order): number =>
  o.lines.reduce((n, l) => n + l.qty, 0);

/** Pure: the next status of an order, or the same one at the end. */
export function nextStatus(o: Order): OrderStatus {
  const chain: Record<OrderType, OrderStatus[]> = {
    inbound: ["expected", "arrived", "received"],
    outbound: ["new", "picking", "packed", "shipped"],
  };
  const list = chain[o.type];
  return list[Math.min(list.length - 1, list.indexOf(o.status) + 1)];
}

export const ORDER_FILTERS: [string, string][] = [
  ["all", "All"],
  ["open", "Open"],
  ["inbound", "Inbound"],
  ["outbound", "Outbound"],
];

export const orderPasses = (o: Order, id: string): boolean =>
  id === "open" ? isOpen(o) : o.type === id;

const ol = (sku: string, qty: number): OrderLine => ({ sku, qty });

export const ORDERS: Order[] = [
  {
    id: "IN-1042",
    type: "inbound",
    party: "Nordfrakt, flour and pasta",
    status: "received",
    due: "Today 07:00",
    lines: [ol("FLR-WHT-1K", 120)],
  },
  {
    id: "IN-1045",
    type: "inbound",
    party: "FreshMove, chilled",
    status: "arrived",
    due: "Today 09:00",
    lines: [ol("EGG-FR-12", 80), ol("YOG-GRK-500", 60)],
  },
  {
    id: "IN-1047",
    type: "inbound",
    party: "Baltic Lines, ambient",
    status: "expected",
    due: "Today 10:00",
    lines: [ol("PAS-FUS-500", 90), ol("RIC-BAS-5K", 48)],
  },
  {
    id: "IN-1051",
    type: "inbound",
    party: "Voltaic, electronics",
    status: "expected",
    due: "Tomorrow 08:00",
    lines: [ol("BAT-AA-24", 120), ol("CBL-USB-1M", 60)],
  },
  {
    id: "OUT-2210",
    type: "outbound",
    party: "QuickParcel, 3 stores",
    status: "shipped",
    due: "Today 08:00",
    lines: [ol("TEA-GRN-50", 30)],
  },
  {
    id: "OUT-2214",
    type: "outbound",
    party: "Eurotrans, Harbor Market",
    status: "new",
    due: "Today 12:00",
    lines: [
      ol("MLK-OAT-1L", 24),
      ol("RIC-BAS-5K", 12),
      ol("OIL-OLV-1L", 18),
      ol("TEA-GRN-50", 20),
    ],
  },
  {
    id: "OUT-2215",
    type: "outbound",
    party: "Dalex, Corner Deli",
    status: "new",
    due: "Today 14:00",
    lines: [ol("EGG-FR-12", 30), ol("CHS-GOU-200", 24)],
  },
  {
    id: "OUT-2216",
    type: "outbound",
    party: "Eurotrans, Green Grocer",
    status: "picking",
    due: "Today 11:00",
    lines: [ol("WAT-SPK-12", 40), ol("DET-LQD-5L", 24), ol("SOP-HND-300", 18)],
  },
];

/** The next orders a customer may place, one after the other. */
export const NEXT_OUTBOUND: [string, OrderLine[]][] = [
  ["Dalex, Riverside Cafe", [ol("COF-BEAN-1K", 12), ol("MLK-OAT-1L", 24)]],
  ["QuickParcel, 2 stores", [ol("PAS-FUS-500", 36), ol("FLR-WHT-1K", 24)]],
  ["Eurotrans, Old Town Bakery", [ol("FLR-WHT-1K", 60), ol("EGG-FR-12", 20)]],
];

/** Pure: a new outbound order (number `seq` of the session). */
export function newOutbound(seq: number): Order {
  const [party, lines] = NEXT_OUTBOUND[seq % NEXT_OUTBOUND.length];
  return {
    id: `OUT-${2217 + seq}`,
    type: "outbound",
    party,
    lines,
    status: "new",
    due: "Tomorrow 09:00",
  };
}

/** Pure: the pick list of an order: every line taken from the places that hold it; null if some product is short. */
export function pickListFor(list: Location[], order: Order): PickLine[] | null {
  const lines: PickLine[] = [];
  const left = [...list];
  for (const line of order.lines) {
    const takes = allocate(left, line.sku, line.qty);
    if (!takes) return null;
    for (const t of takes) {
      const at = left.findIndex((l) => l.code === t.loc);
      left[at] = { ...left[at], qty: left[at].qty - t.qty };
      lines.push({
        id: `${order.id}-${t.loc}`,
        loc: t.loc,
        sku: line.sku,
        name: skuName(line.sku),
        qty: t.qty,
        picked: false,
      });
    }
  }
  return lines;
}

/** Pure: the first product of an order that the warehouse cannot cover, or empty. */
export function shortOf(list: Location[], order: Order): string {
  const stock = totals(list);
  return order.lines.find((l) => (stock[l.sku] ?? 0) < l.qty)?.sku ?? "";
}

/** The pick list of the order that is already being picked at the start. */
export const SEED_PICKS: Record<string, PickLine[]> = (() => {
  const order = ORDERS.find((o) => o.id === "OUT-2216");
  const lines = order ? (pickListFor(LOCATIONS, order) ?? []) : [];
  return {
    "OUT-2216": lines.map((l, i) => ({ ...l, picked: i === 0 })),
  };
})();

// ---- alerts

export interface Alert {
  sku: string;
  total: number;
  min: number;
  /** Places that hold it. */
  places: number;
  /** Units on open inbound orders. */
  onOrder: number;
  level: "out" | "low";
}

/** Pure: the products below their reorder level, the emptiest first. */
export function alertsOf(
  list: Location[],
  minimums: Record<string, number>,
  orders: Order[],
): Alert[] {
  const stock = totals(list);
  return SKUS.flatMap((s): Alert[] => {
    const total = stock[s.id] ?? 0;
    const min = minimums[s.id] ?? 0;
    if (total >= min) return [];
    return [
      {
        sku: s.id,
        total,
        min,
        places: list.filter((l) => l.sku === s.id && l.qty > 0).length,
        onOrder: orders
          .filter((o) => o.type === "inbound" && isOpen(o))
          .flatMap((o) => o.lines)
          .filter((l) => l.sku === s.id)
          .reduce((n, l) => n + l.qty, 0),
        level: total === 0 ? "out" : "low",
      },
    ];
  }).sort(
    (a, b) => a.total / Math.max(1, a.min) - b.total / Math.max(1, b.min),
  );
}

/** Pure: how much to order: back up to twice the reorder level, in whole 6s. */
export function reorderQty(total: number, min: number): number {
  const want = Math.max(6, min * 2 - total);
  return Math.ceil(want / 6) * 6;
}

/** Pure: an inbound order that restocks a product. */
export function reorderOf(sku: string, qty: number, seq: number): Order {
  const supplier = SKUS.find((s) => s.id === sku)?.supplier ?? "Supplier";
  return {
    id: `IN-${1052 + seq}`,
    type: "inbound",
    party: `${supplier}, reorder`,
    lines: [{ sku, qty }],
    status: "expected",
    due: "Tomorrow 10:00",
  };
}

// ---- docks

export const DOCKS: DockDef[] = [
  { id: "d1", name: "Door 1", kind: "Inbound" },
  { id: "d2", name: "Door 2", kind: "Inbound" },
  { id: "d3", name: "Door 3", kind: "Outbound" },
  { id: "d4", name: "Door 4", kind: "Both" },
  { id: "d5", name: "Door 5", kind: "Both" },
  { id: "d6", name: "Door 6", kind: "Outbound" },
];

export const DOCK_FIRST = 6;
export const DOCK_HOURS = 12;
export const NOW_HOUR = 9;

const ap = (
  id: string,
  dock: string,
  start: number,
  span: number,
  carrier: string,
  ref: string,
  kind: Appt["kind"],
  status: Appt["status"],
): Appt => ({ id, dock, start, span, carrier, ref, kind, status });

export const APPTS: Appt[] = [
  ap("a1", "d1", 1, 2, "Nordfrakt", "IN-1042", "inbound", "done"),
  ap("a2", "d1", 4, 3, "Baltic Lines", "IN-1047", "inbound", "scheduled"),
  ap("a3", "d2", 3, 2, "FreshMove", "IN-1045", "inbound", "arrived"),
  ap("a4", "d3", 2, 2, "QuickParcel", "OUT-2210", "outbound", "done"),
  ap("a5", "d3", 6, 3, "Eurotrans", "OUT-2214", "outbound", "scheduled"),
  ap("a6", "d4", 5, 1, "Dalex", "OUT-2215", "outbound", "scheduled"),
  ap("a7", "d5", 2, 2, "Voltaic Freight", "", "inbound", "done"),
  ap("a8", "d6", 2, 2, "Eurotrans", "OUT-2216", "outbound", "scheduled"),
];

/** Pure: `09:00` for an hour index of the dock grid. */
export const hourText = (i: number): string => `${pad2(DOCK_FIRST + i)}:00`;

export interface DockDraft {
  carrier: string;
  ref: string;
  span: string;
}

/** Pure: what is wrong with a dock booking. */
export function validateAppt(d: DockDraft): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!d.carrier.trim()) errors.carrier = "Name the carrier.";
  return errors;
}

/** Pure: the kind of truck for an order reference (inbound orders start with IN). */
export const kindOf = (ref: string): Appt["kind"] =>
  ref.startsWith("OUT") ? "outbound" : "inbound";
