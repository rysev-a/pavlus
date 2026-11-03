// The data and the pure logic of the freight admin: shipments, stops, charges,
// invoices and the numbers on the overview. The page shows what `derive`
// works out from a small `Core`.
import { money, type Tone } from "../../blocks/admin-shell/shell.ts";
import {
  type Column,
  columnsOf,
  type ColumnDef,
  pill,
  rowOf,
  type Row,
  sortBy,
  strong,
  text,
  action,
  number,
  mono,
  type Sort,
} from "../../blocks/data-grid/grid.ts";
import { type Filter } from "../../blocks/list-filter/filters.ts";
import { card, type Card } from "../../blocks/stat-cards/cards.ts";
import {
  listAction,
  statusRow,
  type StatusRow,
} from "../../blocks/status-list/rows.ts";
import {
  item as meterItem,
  type Item,
} from "../../blocks/progress-list/items.ts";
import {
  columns as barColumns,
  type Column as BarColumn,
} from "../../blocks/bar-chart/chart.ts";
import {
  type DocItem,
  type DocRow,
  docRows,
  type Progress,
  progressOf,
} from "../../blocks/customs-checklist/customs.ts";
import {
  type Rate,
  rateColumns,
  rateRows,
  type RateRow,
} from "../../blocks/rate-table/rates.ts";
import { RATES } from "../../blocks/quote-calculator/quote.ts";
import {
  type Stop,
  type StopView,
  stopViews,
} from "../../blocks/route-timeline/route.ts";
import {
  type Lane,
  lanesOf,
  type Mode,
  modeIcon,
  modeLabel,
  type ShipStatus,
  statusLabel,
  statusTone,
  STATUSES,
  type TrackItem,
} from "../../blocks/shipment-tracker/tracker.ts";
import {
  addDays,
  daysBetween,
  shortDate,
} from "../../blocks/month-archive/dates.ts";
import { dowOf } from "../../blocks/month-archive/dates.ts";

export const TODAY = "2026-11-03";

export interface Shipment {
  id: string;
  ref: string;
  status: ShipStatus;
  origin: string;
  destination: string;
  carrier: string;
  mode: Mode;
  customer: string;
  /** kg */
  weight: number;
  /** The pick-up date. */
  start: string;
  /** Planned days door to door. */
  days: number;
  /** How far along it is, 0 to 100 (ignored when booked or delivered). */
  pct: number;
  /** Days behind the plan (negative: ahead). */
  late: number;
  /** The freight price in euros. */
  price: number;
}

const s = (
  n: number,
  status: ShipStatus,
  origin: string,
  destination: string,
  carrier: string,
  mode: Mode,
  customer: string,
  weight: number,
  start: string,
  days: number,
  pct: number,
  late: number,
  price: number,
): Shipment => ({
  id: `s${n}`,
  ref: `FRT-${n}`,
  status,
  origin,
  destination,
  carrier,
  mode,
  customer,
  weight,
  start,
  days,
  pct,
  late,
  price,
});

export const SHIPMENTS: Shipment[] = [
  s(
    20418,
    "booked",
    "Rotterdam",
    "Warsaw",
    "Nordline",
    "road",
    "Kowalski Foods",
    8400,
    "2026-11-05",
    3,
    0,
    0,
    1480,
  ),
  s(
    20421,
    "booked",
    "Lyon",
    "Barcelona",
    "BudgetHaul",
    "road",
    "Maison Verte",
    3200,
    "2026-11-06",
    3,
    0,
    0,
    640,
  ),
  s(
    20411,
    "transit",
    "Shanghai",
    "Hamburg",
    "BlueWave",
    "sea",
    "Brightside Retail",
    18200,
    "2026-10-28",
    30,
    62,
    0,
    2850,
  ),
  s(
    20405,
    "transit",
    "Milan",
    "Vienna",
    "AlpRail",
    "rail",
    "Moretti Design",
    9600,
    "2026-11-02",
    3,
    40,
    0,
    780,
  ),
  s(
    20402,
    "transit",
    "Hamburg",
    "Stockholm",
    "NordRail",
    "rail",
    "Fjord Furniture",
    12100,
    "2026-11-01",
    5,
    55,
    0,
    1190,
  ),
  s(
    20397,
    "customs",
    "Istanbul",
    "Lyon",
    "TransAnatolia",
    "road",
    "Atelier Soie",
    6700,
    "2026-10-30",
    6,
    66,
    0,
    2120,
  ),
  s(
    20380,
    "customs",
    "Singapore",
    "Rotterdam",
    "OceanLine",
    "sea",
    "Kappa Electronics",
    14800,
    "2026-10-12",
    22,
    85,
    0,
    3190,
  ),
  s(
    20390,
    "delayed",
    "Dubai",
    "Frankfurt",
    "SkyBridge",
    "air",
    "Aurum Jewellers",
    640,
    "2026-11-01",
    3,
    55,
    3,
    5400,
  ),
  s(
    20388,
    "delayed",
    "Porto",
    "Paris",
    "EuroExpress",
    "road",
    "Quinta do Vale",
    5200,
    "2026-11-01",
    3,
    50,
    2,
    1750,
  ),
  s(
    20372,
    "delivered",
    "Gdansk",
    "Oslo",
    "Nordline",
    "road",
    "Hansen Timber",
    11000,
    "2026-10-29",
    3,
    100,
    0,
    1620,
  ),
  s(
    20366,
    "delivered",
    "Antwerp",
    "Madrid",
    "EuroExpress",
    "road",
    "Casa Lumbre",
    7300,
    "2026-10-24",
    3,
    100,
    -1,
    2210,
  ),
  s(
    20359,
    "delivered",
    "Busan",
    "Rotterdam",
    "BlueWave",
    "sea",
    "Nova Gadgets",
    16500,
    "2026-09-28",
    30,
    100,
    2,
    2990,
  ),
  s(
    20344,
    "delivered",
    "Valencia",
    "Lisbon",
    "BudgetHaul",
    "road",
    "Sol Ceramics",
    4100,
    "2026-10-14",
    3,
    100,
    0,
    690,
  ),
];

// ---- dates and stops --------------------------------------------------------

/** Pure: the planned arrival (the start plus the planned days). */
export const plannedEnd = (x: Shipment): string => addDays(x.start, x.days);

/** Pure: the arrival that is expected now (or happened), the delay included. */
export const etaOf = (x: Shipment): string => addDays(plannedEnd(x), x.late);

interface Spec {
  place: string;
  kind: Stop["kind"];
}

/** Pure: the places a shipment goes through, by mode. */
export function specsOf(x: Shipment): Spec[] {
  const o = x.origin;
  const d = x.destination;
  if (x.mode === "sea") {
    return [
      { place: `${o} warehouse`, kind: "origin" },
      { place: `Port of ${o}`, kind: "port" },
      { place: `Port of ${d}`, kind: "port" },
      { place: `Customs, ${d}`, kind: "customs" },
      { place: `${d} depot`, kind: "destination" },
    ];
  }
  if (x.mode === "air") {
    return [
      { place: `${o} warehouse`, kind: "origin" },
      { place: `${o} airport`, kind: "hub" },
      { place: `${d} airport`, kind: "hub" },
      { place: `Customs, ${d}`, kind: "customs" },
      { place: `${d} depot`, kind: "destination" },
    ];
  }
  if (x.mode === "rail") {
    return [
      { place: `${o} depot`, kind: "origin" },
      { place: `${o} rail terminal`, kind: "hub" },
      { place: `${d} rail terminal`, kind: "hub" },
      { place: `${d} depot`, kind: "destination" },
    ];
  }
  return [
    { place: `${o} depot`, kind: "origin" },
    { place: "Regional hub", kind: "hub" },
    { place: "Border crossing", kind: "customs" },
    { place: `${d} depot`, kind: "destination" },
  ];
}

/** Pure: the index of the last stop the cargo reached (-1: not yet left). */
export function reachedOf(x: Shipment): number {
  const specs = specsOf(x);
  const last = specs.length - 1;
  if (x.status === "booked") return -1;
  if (x.status === "delivered") return last;
  if (x.status === "customs") {
    return Math.max(
      0,
      specs.findIndex((p) => p.kind === "customs"),
    );
  }
  return Math.max(0, Math.min(last - 1, Math.floor((x.pct / 100) * last)));
}

export function stopsOf(x: Shipment): Stop[] {
  const specs = specsOf(x);
  const last = specs.length - 1;
  return specs.map((p, i) => {
    const planned = addDays(x.start, Math.round((x.days * i) / last));
    return {
      id: `${x.id}-${i}`,
      place: p.place,
      kind: p.kind,
      planned,
      actual: addDays(planned, i === 0 ? 0 : x.late),
      note:
        i === reachedOf(x) && x.status === "delayed"
          ? "Waiting for a free slot, the carrier is rebooking."
          : i === reachedOf(x) && x.status === "customs"
            ? "Documents are being checked by the border office."
            : "",
    };
  });
}

export const stopViewsOf = (x: Shipment): StopView[] =>
  stopViews(stopsOf(x), reachedOf(x), x.status === "delivered");

/** Pure: the progress used by the board: delivered is 100, booked is 0. */
export function progressOf2(x: Shipment): number {
  if (x.status === "delivered") return 100;
  if (x.status === "booked") return 0;
  return Math.round((reachedOf(x) / (specsOf(x).length - 1)) * 100);
}

export const trackItemOf = (x: Shipment): TrackItem => ({
  id: x.id,
  ref: x.ref,
  status: x.status,
  origin: x.origin,
  destination: x.destination,
  carrier: x.carrier,
  mode: x.mode,
  pct: progressOf2(x),
  eta: shortDate(etaOf(x)),
});

// ---- charges and invoices ----------------------------------------------------

export interface Charge {
  label: string;
  amount: number;
}

/** Pure: what the customer pays for a shipment, line by line. */
export function chargesOf(x: Shipment): Charge[] {
  const fuel = Math.round(x.price * RATES[x.mode].fuel);
  const lines: Charge[] = [
    {
      label: `Freight, ${x.weight.toLocaleString("en-US")} kg by ${modeLabel(x.mode).toLowerCase()}`,
      amount: x.price,
    },
    { label: "Fuel surcharge", amount: fuel },
    { label: "Terminal handling", amount: 35 },
  ];
  if (x.mode !== "road" || x.status === "customs") {
    lines.push({ label: "Customs clearance", amount: 55 });
  }
  return lines;
}

export const totalOf = (lines: Charge[]): number =>
  lines.reduce((sum, l) => sum + l.amount, 0);

export interface Invoice {
  id: string;
  shipmentId: string;
  customer: string;
  issued: string;
  due: string;
  amount: number;
}

/** Pure: an invoice for every shipment that has been picked up. */
export function invoicesOf(list: Shipment[]): Invoice[] {
  return list
    .filter((x) => x.status !== "booked")
    .map((x) => ({
      id: `INV-${x.ref.slice(4)}`,
      shipmentId: x.id,
      customer: x.customer,
      issued: x.start,
      due: addDays(x.start, 30),
      amount: totalOf(chargesOf(x)),
    }))
    .sort((a, b) => b.issued.localeCompare(a.issued));
}

export type InvoiceStatus = "paid" | "open" | "overdue";

export function invoiceStatus(inv: Invoice, paid: string[]): InvoiceStatus {
  if (paid.includes(inv.id)) return "paid";
  return inv.due < TODAY ? "overdue" : "open";
}

export const INVOICE_TONE: Record<InvoiceStatus, Tone> = {
  paid: "success",
  open: "info",
  overdue: "destructive",
};

// ---- documents -----------------------------------------------------------------

const doc = (
  id: string,
  title: string,
  note: string,
  required: boolean,
  state: DocItem["state"],
): DocItem => ({ id, title, note, required, state });

/** Pure: the paperwork of a shipment, as far along as the shipment is. */
export function seedDocs(x: Shipment): DocItem[] {
  const state =
    x.status === "delivered"
      ? "approved"
      : x.status === "booked"
        ? "missing"
        : "uploaded";
  const cross = x.mode !== "road" || x.status === "customs";
  const list = [
    doc(
      "inv",
      "Commercial invoice",
      "Value, buyer, seller and Incoterm.",
      true,
      state === "missing" ? "uploaded" : "approved",
    ),
    doc("pack", "Packing list", "Boxes, weights and marks.", true, state),
    doc(
      x.mode === "air" ? "awb" : x.mode === "sea" ? "bol" : "cmr",
      x.mode === "air"
        ? "Air waybill"
        : x.mode === "sea"
          ? "Bill of lading"
          : "CMR consignment note",
      "Signed by the carrier.",
      true,
      state,
    ),
  ];
  if (cross) {
    list.push(
      doc(
        "coo",
        "Certificate of origin",
        "Needed for the reduced duty rate.",
        false,
        x.status === "customs" ? "missing" : state,
      ),
      doc(
        "decl",
        "Customs declaration",
        "Filed by the broker before arrival.",
        true,
        x.status === "customs" ? "uploaded" : state,
      ),
    );
  }
  return list;
}

export const docsFor = (list: Shipment[]): Record<string, DocItem[]> =>
  Object.fromEntries(list.map((x) => [x.id, seedDocs(x)]));

// ---- numbers -----------------------------------------------------------------

export interface Kpis {
  onTimeRate: number;
  avgTransit: number;
  active: number;
  delayed: number;
  inCustoms: number;
  delivered: number;
}

export function kpis(list: Shipment[]): Kpis {
  const done = list.filter((x) => x.status === "delivered");
  const onTime = done.filter((x) => x.late <= 0).length;
  const total = done.reduce((n, x) => n + x.days + x.late, 0);
  return {
    onTimeRate:
      done.length === 0 ? 0 : Math.round((onTime / done.length) * 100),
    avgTransit:
      done.length === 0 ? 0 : Math.round((total / done.length) * 10) / 10,
    active: list.filter((x) => x.status !== "delivered").length,
    delayed: list.filter((x) => x.status === "delayed").length,
    inCustoms: list.filter((x) => x.status === "customs").length,
    delivered: done.length,
  };
}

/** Pure: pick-ups per week for the last `weeks` weeks (oldest first). */
export function pickupsPerWeek(
  list: Shipment[],
  weeks = 6,
): { id: string; label: string; value: number }[] {
  const monday = addDays(TODAY, -dowOf(TODAY));
  return Array.from({ length: weeks }, (_, i) => {
    const from = addDays(monday, -7 * (weeks - 1 - i));
    const to = addDays(from, 6);
    return {
      id: from,
      label: shortDate(from),
      value: list.filter((x) => x.start >= from && x.start <= to).length,
    };
  });
}

// ---- rates -------------------------------------------------------------------

export interface RateLane {
  id: string;
  label: string;
  rates: Rate[];
}

const r = (
  id: string,
  carrier: string,
  mode: Mode,
  price: number,
  days: number,
  reliability: number,
  note: string,
): Rate => ({ id, carrier, mode, price, days, reliability, note });

export const LANES: RateLane[] = [
  {
    id: "rtm-waw",
    label: "Rotterdam to Warsaw, 12 pallets",
    rates: [
      r("n", "Nordline", "road", 1480, 3, 94, "Full truck, tail lift"),
      r(
        "a",
        "AlpRail Cargo",
        "rail",
        1120,
        5,
        90,
        "Terminal to terminal, door delivery +€90",
      ),
      r("e", "EuroExpress", "road", 1890, 2, 96, "Two drivers, no stops"),
      r("b", "BudgetHaul", "road", 980, 6, 81, "Groupage, shared truck"),
      r(
        "s",
        "SkyBridge Air",
        "air",
        3650,
        1,
        97,
        "Airport to airport, next day",
      ),
    ],
  },
  {
    id: "sha-ham",
    label: "Shanghai to Hamburg, one 40 ft container",
    rates: [
      r("bw", "BlueWave", "sea", 2850, 30, 91, "Direct service, weekly"),
      r("ol", "OceanLine", "sea", 3190, 26, 94, "Fast service via Singapore"),
      r(
        "ts",
        "TransSiberian",
        "rail",
        4900,
        17,
        83,
        "Block train, customs at Brest",
      ),
      r("sb", "SkyBridge Air", "air", 9400, 3, 97, "Priority, 2,000 kg limit"),
    ],
  },
  {
    id: "mil-vie",
    label: "Milan to Vienna, 6 pallets",
    rates: [
      r(
        "ar",
        "AlpRail Cargo",
        "rail",
        640,
        2,
        92,
        "Night train, door delivery",
      ),
      r("nl", "Nordline", "road", 780, 1, 95, "Direct, one driver"),
      r("bh", "BudgetHaul", "road", 520, 3, 80, "Groupage"),
    ],
  },
];

// ---- the grids ----------------------------------------------------------------

export const SHIP_FILTERS: [string, string][] = [
  ["all", "All"],
  ...STATUSES.map((x): [string, string] => [x.id, x.label]),
];

const SHIP_COLUMNS: ColumnDef[] = [
  { key: "ref", label: "Shipment", sortable: true },
  { key: "route", label: "Route" },
  { key: "carrier", label: "Carrier", sortable: true },
  { key: "eta", label: "ETA", sortable: true },
  { key: "status", label: "Status" },
];

export const shipColumns = (sort: Sort | null): Column[] =>
  columnsOf(SHIP_COLUMNS, sort);

const kg = (n: number): string => `${n.toLocaleString("en-US")} kg`;

/** Pure: the shipments that pass a status filter and a search, sorted. */
export function shownShipments(
  list: Shipment[],
  filter: string,
  query: string,
  sort: Sort | null,
): Shipment[] {
  const q = query.trim().toLowerCase();
  const passed = list.filter(
    (x) =>
      (filter === "all" || x.status === filter) &&
      (!q ||
        `${x.ref} ${x.origin} ${x.destination} ${x.carrier} ${x.customer}`
          .toLowerCase()
          .includes(q)),
  );
  return sortBy(passed, sort ?? { key: "eta", dir: "asc" }, (x, key) =>
    key === "ref"
      ? x.ref
      : key === "carrier"
        ? x.carrier
        : key === "weight"
          ? x.weight
          : etaOf(x),
  );
}

export function shipRows(list: Shipment[], selected: string): Row[] {
  return list.map((x) =>
    rowOf(
      SHIP_COLUMNS,
      x.id,
      {
        ref: strong(x.ref, x.customer),
        route: text(`${modeIcon(x.mode)} ${x.origin} → ${x.destination}`),
        carrier: text(x.carrier),
        eta: text(shortDate(etaOf(x))),
        status: pill(statusLabel(x.status), statusTone(x.status)),
      },
      [],
      x.id === selected,
    ),
  );
}

const CHARGE_COLUMNS: ColumnDef[] = [
  { key: "label", label: "Charge" },
  { key: "amount", label: "Amount", align: "right" },
];
export const chargeColumns = (): Column[] => columnsOf(CHARGE_COLUMNS, null);
export function chargeRows(lines: Charge[]): Row[] {
  return [
    ...lines.map((l, i) =>
      rowOf(CHARGE_COLUMNS, `c${i}`, {
        label: text(l.label),
        amount: number(money(l.amount, "€", 0)),
      }),
    ),
    rowOf(CHARGE_COLUMNS, "total", {
      label: strong("Total"),
      amount: number(money(totalOf(lines), "€", 0)),
    }),
  ];
}

const INVOICE_COLUMNS: ColumnDef[] = [
  { key: "id", label: "Invoice", sortable: true },
  { key: "customer", label: "Customer", sortable: true },
  { key: "issued", label: "Issued", sortable: true },
  { key: "due", label: "Due" },
  { key: "amount", label: "Amount", align: "right", sortable: true },
  { key: "status", label: "Status" },
];
export const invoiceColumns = (sort: Sort | null): Column[] =>
  columnsOf(INVOICE_COLUMNS, sort);

export const INVOICE_FILTERS: [string, string][] = [
  ["all", "All"],
  ["open", "Open"],
  ["overdue", "Overdue"],
  ["paid", "Paid"],
];

export function shownInvoices(
  list: Invoice[],
  paid: string[],
  filter: string,
  sort: Sort | null,
): Invoice[] {
  const passed = list.filter(
    (i) => filter === "all" || invoiceStatus(i, paid) === filter,
  );
  return sortBy(passed, sort ?? { key: "issued", dir: "desc" }, (i, key) =>
    key === "id"
      ? i.id
      : key === "customer"
        ? i.customer
        : key === "amount"
          ? i.amount
          : i.issued,
  );
}

export function invoiceRows(list: Invoice[], paid: string[]): Row[] {
  return list.map((i) => {
    const status = invoiceStatus(i, paid);
    return rowOf(
      INVOICE_COLUMNS,
      i.id,
      {
        id: mono(i.id),
        customer: text(i.customer),
        issued: text(shortDate(i.issued)),
        due: text(shortDate(i.due)),
        amount: number(money(i.amount, "€", 0)),
        status: pill(
          status === "paid"
            ? "Paid"
            : status === "overdue"
              ? "Overdue"
              : "Open",
          INVOICE_TONE[status],
        ),
      },
      status === "paid"
        ? []
        : [action("pay", "Mark paid", { variant: "outline" })],
    );
  });
}

// ---- the core and what it shows ---------------------------------------------

export interface Core {
  docs: Record<string, DocItem[]>;
  paid: string[];
  filter: string;
  query: string;
  sort: Sort | null;
  selected: string;
  lane: string;
  rateSort: Sort | null;
  rateSelected: string;
  invoiceFilter: string;
  invoiceSort: Sort | null;
  customsId: string;
}

export const startCore = (): Core => ({
  docs: docsFor(SHIPMENTS),
  paid: ["INV-20366", "INV-20372", "INV-20344"],
  filter: "all",
  query: "",
  sort: null,
  selected: "",
  lane: LANES[0].id,
  rateSort: { key: "price", dir: "asc" },
  rateSelected: "",
  invoiceFilter: "all",
  invoiceSort: null,
  customsId: "s20397",
});

export const shipmentOf = (id: string): Shipment | undefined =>
  SHIPMENTS.find((x) => x.id === id);

const countFilters = (
  defs: [string, string][],
  active: string,
  pass: (id: string) => number,
  total: number,
): Filter[] =>
  defs.map(([id, label]) => ({
    id,
    label,
    active: id === active,
    count: id === "all" ? total : pass(id),
  }));

export interface Derived {
  kpiCards: Card[];
  statusMeters: Item[];
  pickups: BarColumn[];
  attention: StatusRow[];
  shipFilters: Filter[];
  shipColumns: Column[];
  shipRows: Row[];
  shipFooter: string;
  detailTitle: string;
  detailCards: Card[];
  detailStops: StopView[];
  detailDocs: DocRow[];
  detailProgress: Progress;
  chargeColumns: Column[];
  chargeRows: Row[];
  detailSub: string;
  lanes: Lane[];
  laneOptions: { value: string; label: string; selected: boolean }[];
  rateColumns: Column[];
  rateRows: RateRow[];
  invoiceCards: Card[];
  invoiceFilters: Filter[];
  invoiceColumns: Column[];
  invoiceRows: Row[];
  customsFilters: Filter[];
  customsRows: DocRow[];
  customsProgress: Progress;
  customsTitle: string;
}

export function derive(core: Core): Derived {
  const k = kpis(SHIPMENTS);
  const invoices = invoicesOf(SHIPMENTS);
  const detail = shipmentOf(core.selected) ?? SHIPMENTS[0];
  const detailDocs = core.docs[detail.id] ?? [];
  const lines = chargesOf(detail);
  const lane = LANES.find((l) => l.id === core.lane) ?? LANES[0];
  const customs = shipmentOf(core.customsId) ?? SHIPMENTS[0];
  const customsDocs = core.docs[customs.id] ?? [];
  const byStatus = (st: ShipStatus) =>
    SHIPMENTS.filter((x) => x.status === st).length;
  const unpaid = invoices.filter((i) => !core.paid.includes(i.id));
  const overdue = unpaid.filter((i) => i.due < TODAY);
  const sum = (list: Invoice[]) => list.reduce((n, i) => n + i.amount, 0);
  const needsPaper = SHIPMENTS.filter(
    (x) =>
      x.status !== "delivered" &&
      (core.docs[x.id] ?? []).some((d) => d.required),
  );
  return {
    kpiCards: [
      card("ontime", "On-time delivery", `${k.onTimeRate}%`, {
        icon: "k-ai-flag",
        tone: k.onTimeRate >= 85 ? "success" : "warning",
        hint: `${k.delivered} delivered this period`,
      }),
      card("transit", "Average transit", `${k.avgTransit} days`, {
        icon: "k-ai-truck",
        tone: "info",
        hint: "Door to door, delivered shipments",
      }),
      card("active", "Active shipments", String(k.active), {
        icon: "k-ai-box",
        tone: "default",
        hint: `${k.inCustoms} in customs`,
      }),
      card("delayed", "Delayed", String(k.delayed), {
        icon: "k-ai-alert",
        tone: k.delayed > 0 ? "destructive" : "success",
        hint: k.delayed > 0 ? "Needs a call to the carrier" : "Nothing late",
      }),
    ],
    statusMeters: STATUSES.map((st) =>
      meterItem(st.id, st.label, byStatus(st.id), SHIPMENTS.length, {
        tone: st.tone,
        text: String(byStatus(st.id)),
      }),
    ),
    pickups: barColumns(
      pickupsPerWeek(SHIPMENTS).map((p, i, all) => ({
        ...p,
        show: true,
        tone: i === all.length - 1 ? ("default" as Tone) : ("muted" as Tone),
      })),
    ),
    attention: SHIPMENTS.filter(
      (x) => x.status === "delayed" || x.status === "customs",
    ).map((x) =>
      statusRow(
        x.id,
        `${x.ref}: ${x.origin} → ${x.destination}`,
        statusLabel(x.status),
        statusTone(x.status),
        {
          sub: `${x.customer} · ${x.carrier}`,
          facts: [
            { label: "ETA", value: shortDate(etaOf(x)) },
            {
              label: "Behind plan",
              value: x.late > 0 ? `${x.late} days` : "none",
            },
          ],
          actions: [listAction("open", "Open", { variant: "outline" })],
        },
      ),
    ),
    shipFilters: countFilters(
      SHIP_FILTERS,
      core.filter,
      (id) => SHIPMENTS.filter((x) => x.status === id).length,
      SHIPMENTS.length,
    ),
    shipColumns: shipColumns(core.sort),
    shipRows: shipRows(
      shownShipments(SHIPMENTS, core.filter, core.query, core.sort),
      core.selected,
    ),
    shipFooter: `${shownShipments(SHIPMENTS, core.filter, core.query, core.sort).length} of ${SHIPMENTS.length} shipments`,
    detailTitle: `${detail.ref}: ${detail.origin} to ${detail.destination}`,
    detailSub: `${detail.customer} · ${detail.carrier} · ${modeLabel(detail.mode)}`,
    detailCards: [
      card("st", "Status", statusLabel(detail.status), {
        icon: "k-ai-truck",
        tone:
          detail.status === "delivered"
            ? "success"
            : detail.status === "delayed"
              ? "destructive"
              : detail.status === "customs"
                ? "warning"
                : detail.status === "booked"
                  ? "info"
                  : "default",
        hint:
          detail.late > 0
            ? `${detail.late} days behind`
            : detail.late < 0
              ? `${-detail.late} day ahead`
              : "On the plan",
      }),
      card(
        "eta",
        detail.status === "delivered" ? "Delivered" : "ETA",
        shortDate(etaOf(detail)),
        {
          icon: "k-ai-flag",
          tone: "info",
          hint: `Planned ${shortDate(plannedEnd(detail))}`,
        },
      ),
      card("w", "Weight", kg(detail.weight), {
        icon: "k-ai-box",
        tone: "default",
        hint: `Picked up ${shortDate(detail.start)}`,
      }),
      card("ch", "Total charges", money(totalOf(lines), "€", 0), {
        icon: "k-ai-dollar",
        tone: "success",
        hint: `${lines.length} lines`,
      }),
    ],
    detailStops: stopViewsOf(detail),
    detailDocs: docRows(detailDocs),
    detailProgress: progressOf(detailDocs),
    chargeColumns: chargeColumns(),
    chargeRows: chargeRows(lines),
    lanes: lanesOf(SHIPMENTS.map(trackItemOf)),
    laneOptions: LANES.map((l) => ({
      value: l.id,
      label: l.label,
      selected: l.id === core.lane,
    })),
    rateColumns: rateColumns(core.rateSort),
    rateRows: rateRows(lane.rates, core.rateSort, core.rateSelected),
    invoiceCards: [
      card("out", "Outstanding", money(sum(unpaid), "€", 0), {
        icon: "k-ai-receipt",
        tone: "info",
        hint: `${unpaid.length} invoices`,
      }),
      card("over", "Overdue", money(sum(overdue), "€", 0), {
        icon: "k-ai-alert",
        tone: overdue.length ? "destructive" : "success",
        hint: `${overdue.length} invoices`,
      }),
      card(
        "paid",
        "Paid",
        money(sum(invoices.filter((i) => core.paid.includes(i.id))), "€", 0),
        {
          icon: "k-ai-dollar",
          tone: "success",
          hint: `${invoices.length - unpaid.length} invoices`,
        },
      ),
    ],
    invoiceFilters: countFilters(
      INVOICE_FILTERS,
      core.invoiceFilter,
      (id) => invoices.filter((i) => invoiceStatus(i, core.paid) === id).length,
      invoices.length,
    ),
    invoiceColumns: invoiceColumns(core.invoiceSort),
    invoiceRows: invoiceRows(
      shownInvoices(invoices, core.paid, core.invoiceFilter, core.invoiceSort),
      core.paid,
    ),
    customsFilters: needsPaper.map((x) => ({
      id: x.id,
      label: x.ref,
      active: x.id === core.customsId,
      count: progressOf(core.docs[x.id] ?? []).requiredLeft,
    })),
    customsRows: docRows(customsDocs),
    customsProgress: progressOf(customsDocs),
    customsTitle: `${customs.ref}: ${customs.origin} to ${customs.destination}`,
  };
}

export { daysBetween };
