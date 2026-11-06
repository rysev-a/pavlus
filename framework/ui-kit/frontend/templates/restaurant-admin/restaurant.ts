import {
  money,
  pad2,
  share,
  type Tone,
} from "../../blocks/admin-shell/shell.ts";
import { type Column, columns } from "../../blocks/bar-chart/chart.ts";
import { type Entry, entry } from "../../blocks/catalog-editor/catalog.ts";
import type {
  TableDef,
  TableState,
  TableStatus,
} from "../../blocks/floor-plan/floor.ts";
import { minutesSince } from "../../blocks/floor-plan/floor.ts";
import { type Item, item } from "../../blocks/progress-list/items.ts";
import type { Line, Ticket } from "../../blocks/order-board/orders.ts";
import {
  listAction,
  type StatusRow,
  statusRow,
} from "../../blocks/status-list/rows.ts";

/** The service clock: second 0 of the page is 19:05 on a Tuesday evening. */
export const START_MINUTE = 19 * 60 + 5;

/** Pure: `19:05` for a clock reading (seconds since the page opened). */
export function wallText(clock: number): string {
  const m = START_MINUTE + Math.floor(clock / 60);
  return `${pad2(Math.floor(m / 60) % 24)}:${pad2(m % 60)}`;
}

/** Pure: the minute of the day for a clock reading. */
export const wallMinute = (clock: number): number =>
  START_MINUTE + Math.floor(clock / 60);

/** Pure: `20:30` to the minute of the day (1230). */
export function minuteOf(text: string): number {
  const [h, m] = text.split(":").map(Number);
  return h * 60 + m;
}

export const minuteText = (m: number): string =>
  `${pad2(Math.floor(m / 60) % 24)}:${pad2(m % 60)}`;

// ---- the floor

export const TABLES: TableDef[] = [
  {
    id: "t1",
    label: "1",
    seats: 2,
    col: 1,
    row: 1,
    w: 1,
    h: 1,
    shape: "round",
  },
  {
    id: "t2",
    label: "2",
    seats: 2,
    col: 2,
    row: 1,
    w: 1,
    h: 1,
    shape: "round",
  },
  {
    id: "t3",
    label: "3",
    seats: 4,
    col: 3,
    row: 1,
    w: 1,
    h: 1,
    shape: "square",
  },
  {
    id: "t4",
    label: "4",
    seats: 4,
    col: 4,
    row: 1,
    w: 1,
    h: 1,
    shape: "square",
  },
  { id: "t5", label: "5", seats: 6, col: 5, row: 1, w: 2, h: 1, shape: "wide" },
  {
    id: "t6",
    label: "6",
    seats: 2,
    col: 1,
    row: 2,
    w: 1,
    h: 1,
    shape: "round",
  },
  {
    id: "t7",
    label: "7",
    seats: 4,
    col: 2,
    row: 2,
    w: 1,
    h: 1,
    shape: "square",
  },
  {
    id: "t8",
    label: "8",
    seats: 4,
    col: 3,
    row: 2,
    w: 1,
    h: 1,
    shape: "square",
  },
  {
    id: "t9",
    label: "9",
    seats: 4,
    col: 4,
    row: 2,
    w: 1,
    h: 1,
    shape: "square",
  },
  {
    id: "t10",
    label: "10",
    seats: 2,
    col: 5,
    row: 2,
    w: 1,
    h: 1,
    shape: "round",
  },
  {
    id: "t11",
    label: "11",
    seats: 2,
    col: 6,
    row: 2,
    w: 1,
    h: 1,
    shape: "round",
  },
  {
    id: "t12",
    label: "12",
    seats: 8,
    col: 1,
    row: 3,
    w: 3,
    h: 1,
    shape: "wide",
  },
  {
    id: "t13",
    label: "13",
    seats: 4,
    col: 4,
    row: 3,
    w: 1,
    h: 1,
    shape: "square",
  },
  {
    id: "t14",
    label: "14",
    seats: 6,
    col: 5,
    row: 3,
    w: 2,
    h: 1,
    shape: "wide",
  },
];

const seat = (
  id: string,
  status: TableStatus,
  guests: number,
  minutes: number,
): TableState => ({ id, status, guests, since: -minutes * 60 });

export const TABLE_STATES: TableState[] = [
  seat("t1", "ordered", 2, 31),
  seat("t2", "free", 0, 0),
  seat("t3", "paying", 4, 74),
  seat("t4", "seated", 3, 4),
  seat("t5", "ordered", 6, 22),
  seat("t6", "free", 0, 0),
  seat("t7", "ordered", 4, 15),
  seat("t8", "free", 0, 0),
  seat("t9", "ordered", 4, 40),
  seat("t10", "seated", 2, 2),
  seat("t11", "free", 0, 0),
  seat("t12", "free", 0, 0),
  seat("t13", "paying", 3, 66),
  seat("t14", "free", 0, 0),
];

/** The waiter of each table. */
export const SERVERS: Record<string, string> = {
  t1: "Ana",
  t2: "Ana",
  t3: "Ana",
  t4: "Ana",
  t5: "Leo",
  t6: "Ana",
  t7: "Leo",
  t8: "Leo",
  t9: "Leo",
  t10: "Leo",
  t11: "Leo",
  t12: "Mia",
  t13: "Mia",
  t14: "Mia",
};

export interface TableAction {
  id: "next" | "clear";
  label: string;
  variant: "default" | "outline";
  icon: string;
}

/** Pure: the buttons of a table for its status. */
export function tableActions(status: TableStatus): TableAction[] {
  const next: Record<TableStatus, string> = {
    free: "Seat guests",
    seated: "Take the order",
    ordered: "Bring the bill",
    paying: "Paid, clear the table",
  };
  const acts: TableAction[] = [
    {
      id: "next",
      label: next[status],
      variant: "default",
      icon: "k-icon-check",
    },
  ];
  if (status === "seated" || status === "ordered") {
    acts.push({ id: "clear", label: "Clear", variant: "outline", icon: "" });
  }
  return acts;
}

/** Pure: how many guests a table gets when it is seated at the desk. */
export const defaultGuests = (def: TableDef): number =>
  Math.max(1, Math.min(def.seats, def.seats <= 2 ? 2 : def.seats - 1));

// ---- the menu

export const MENU: Entry[] = [
  entry("bruschetta", "🍞", "Bruschetta", "Starters", 8, "tomato, basil"),
  entry("soup", "🍅", "Tomato soup", "Starters", 7.5, "with basil oil"),
  entry("caesar", "🥗", "Caesar salad", "Starters", 9.5),
  entry("burrata", "🧀", "Burrata", "Starters", 12, "with roasted peppers"),
  entry("risotto", "🍄", "Mushroom risotto", "Mains", 16.5, "vegetarian"),
  entry("carbonara", "🍝", "Carbonara", "Mains", 15, "guanciale, pecorino"),
  entry("pizza", "🍕", "Margherita pizza", "Mains", 13, "wood fired"),
  entry("bass", "🐟", "Sea bass", "Mains", 21, "grilled, with fennel", false),
  entry("steak", "🥩", "Rib-eye steak", "Mains", 26, "300 g, with fries"),
  entry("lamb", "🍖", "Lamb shank", "Mains", 24, "slow cooked"),
  entry("tiramisu", "🍰", "Tiramisu", "Desserts", 7),
  entry("panna", "🍮", "Panna cotta", "Desserts", 6.5, "berry sauce"),
  entry("lemonade", "🍋", "Lemonade", "Drinks", 4),
  entry("wine", "🍷", "House red, glass", "Drinks", 8.5),
  entry("beer", "🍺", "Craft lager", "Drinks", 5.5),
  entry("espresso", "☕", "Espresso", "Drinks", 3),
];

export const MENU_FILTERS: [string, string][] = [
  ["all", "All"],
  ["starters", "Starters"],
  ["mains", "Mains"],
  ["desserts", "Desserts"],
  ["drinks", "Drinks"],
  ["off", "Sold out"],
];

/** Pure: does a menu line pass a filter tab? */
export const menuPasses = (e: Entry, id: string): boolean =>
  id === "off" ? !e.on : e.group.toLowerCase() === id;

// ---- tickets

/** Dishes of an order: `[menu id, quantity, note]`. They repeat in turn. */
export const ORDER_TEMPLATES: [string, number, string][][] = [
  [
    ["risotto", 2, ""],
    ["caesar", 1, "no croutons"],
    ["wine", 2, ""],
  ],
  [
    ["carbonara", 2, ""],
    ["bruschetta", 1, ""],
    ["lemonade", 2, ""],
  ],
  [
    ["steak", 1, "medium rare"],
    ["pizza", 1, ""],
    ["beer", 2, ""],
  ],
  [
    ["lamb", 2, ""],
    ["burrata", 1, ""],
    ["espresso", 2, ""],
  ],
  [
    ["bass", 1, "no butter"],
    ["soup", 1, ""],
    ["panna", 2, ""],
  ],
];

/** Pure: the lines of an order, leaving out what is sold out (never empty). */
export function ticketLines(
  menu: Entry[],
  template: [string, number, string][],
): Line[] {
  const on = menu.filter((e) => e.on);
  const lines = template.flatMap(([id, qty, note]) => {
    const found = on.find((e) => e.id === id);
    return found ? [{ qty, name: found.name, note }] : [];
  });
  if (lines.length > 0) return lines;
  return on.slice(0, 2).map((e) => ({ qty: 1, name: e.name, note: "" }));
}

/** Pure: what the lines cost, by the names on the menu. */
export function linesTotal(menu: Entry[], lines: Line[]): number {
  return (
    Math.round(
      lines.reduce(
        (n, l) => n + l.qty * (menu.find((e) => e.name === l.name)?.price ?? 0),
        0,
      ) * 100,
    ) / 100
  );
}

/** Pure: the new ticket number `seq` for a table. */
export function newTicket(
  menu: Entry[],
  seq: number,
  table: TableDef,
  server: string,
  clock: number,
): Ticket {
  const template = ORDER_TEMPLATES[seq % ORDER_TEMPLATES.length];
  return {
    id: `o${50 + seq}`,
    title: `Table ${table.label}`,
    who: server,
    lines: ticketLines(menu, template),
    stage: "new",
    placedAt: clock,
    doneAt: null,
  };
}

export const SEED_TICKETS: Ticket[] = [
  {
    id: "o44",
    title: "Table 5",
    who: "Leo",
    stage: "cooking",
    placedAt: -22 * 60,
    doneAt: null,
    lines: [
      { qty: 3, name: "Margherita pizza", note: "" },
      { qty: 2, name: "Carbonara", note: "" },
      { qty: 1, name: "Caesar salad", note: "dressing apart" },
    ],
  },
  {
    id: "o45",
    title: "Table 9",
    who: "Leo",
    stage: "cooking",
    placedAt: -12 * 60,
    doneAt: null,
    lines: [
      { qty: 2, name: "Rib-eye steak", note: "medium" },
      { qty: 2, name: "House red, glass", note: "" },
    ],
  },
  {
    id: "o46",
    title: "Table 1",
    who: "Ana",
    stage: "ready",
    placedAt: -9 * 60,
    doneAt: null,
    lines: [
      { qty: 1, name: "Burrata", note: "" },
      { qty: 1, name: "Mushroom risotto", note: "" },
    ],
  },
  {
    id: "o47",
    title: "Table 7",
    who: "Leo",
    stage: "new",
    placedAt: -80,
    doneAt: null,
    lines: [
      { qty: 4, name: "Bruschetta", note: "" },
      { qty: 4, name: "Craft lager", note: "" },
    ],
  },
  {
    id: "o43",
    title: "Table 3",
    who: "Ana",
    stage: "served",
    placedAt: -52 * 60,
    doneAt: -20 * 60,
    lines: [
      { qty: 2, name: "Lamb shank", note: "" },
      { qty: 2, name: "Tiramisu", note: "" },
    ],
  },
];

/** What a table's open checks come to, by table id. */
export const SEED_CHECKS: Record<string, number> = {
  t1: 41,
  t3: 128.5,
  t5: 142,
  t7: 68,
  t9: 97.5,
  t13: 86,
};

// ---- reservations

export type ResStatus = "booked" | "seated" | "cancelled";

export interface Reservation {
  id: string;
  name: string;
  party: number;
  /** Minute of the day. */
  at: number;
  note: string;
  status: ResStatus;
  table: string;
}

export const RESERVATIONS: Reservation[] = [
  {
    id: "r1",
    name: "Okafor",
    party: 4,
    at: minuteOf("19:00"),
    note: "Birthday, cake at 21:00",
    status: "seated",
    table: "t3",
  },
  {
    id: "r2",
    name: "Lindqvist",
    party: 2,
    at: minuteOf("19:30"),
    note: "Window if possible",
    status: "booked",
    table: "",
  },
  {
    id: "r3",
    name: "Moreau",
    party: 6,
    at: minuteOf("19:45"),
    note: "Two high chairs",
    status: "booked",
    table: "",
  },
  {
    id: "r4",
    name: "Tanaka",
    party: 2,
    at: minuteOf("20:00"),
    note: "",
    status: "booked",
    table: "",
  },
  {
    id: "r5",
    name: "Haddad",
    party: 4,
    at: minuteOf("20:15"),
    note: "Allergy: nuts",
    status: "booked",
    table: "",
  },
  {
    id: "r6",
    name: "Rossi",
    party: 3,
    at: minuteOf("20:30"),
    note: "",
    status: "booked",
    table: "",
  },
  {
    id: "r7",
    name: "Novak",
    party: 8,
    at: minuteOf("21:00"),
    note: "Company dinner, one bill",
    status: "booked",
    table: "",
  },
  {
    id: "r8",
    name: "Silva",
    party: 2,
    at: minuteOf("21:30"),
    note: "Anniversary",
    status: "booked",
    table: "",
  },
  {
    id: "r9",
    name: "Kim",
    party: 5,
    at: minuteOf("18:30"),
    note: "Called to cancel",
    status: "cancelled",
    table: "",
  },
];

export const RES_FILTERS: [string, string][] = [
  ["all", "All"],
  ["booked", "Waiting"],
  ["seated", "Seated"],
  ["cancelled", "Cancelled"],
];

export const resPasses = (r: Reservation, id: string): boolean =>
  r.status === id;

/** Pure: the free tables that can take a party, the smallest first. */
export function tablesFor(
  defs: TableDef[],
  states: TableState[],
  party: number,
): TableDef[] {
  return defs
    .filter(
      (d) =>
        d.seats >= party &&
        (states.find((s) => s.id === d.id)?.status ?? "free") === "free",
    )
    .sort((a, b) => a.seats - b.seats || Number(a.label) - Number(b.label));
}

/** Pure: the table to offer: the one picked if it is still fine, else the best fit. */
export function suggestTable(
  defs: TableDef[],
  states: TableState[],
  party: number,
  picked: string,
): string {
  const fits = tablesFor(defs, states, party);
  if (fits.some((d) => d.id === picked)) return picked;
  return fits[0]?.id ?? "";
}

/** Pure: when the reservation is late (minutes after its time, 0 if not yet). */
export const lateBy = (r: Reservation, nowMinute: number): number =>
  r.status === "booked" ? Math.max(0, nowMinute - r.at) : 0;

export function reservationRow(
  r: Reservation,
  ctx: {
    defs: TableDef[];
    states: TableState[];
    picked: string;
    nowMinute: number;
  },
): StatusRow {
  const late = lateBy(r, ctx.nowMinute);
  const tone: Tone =
    r.status === "seated"
      ? "success"
      : r.status === "cancelled"
        ? "muted"
        : late > 0
          ? "warning"
          : "info";
  const label =
    r.status === "seated"
      ? "Seated"
      : r.status === "cancelled"
        ? "Cancelled"
        : late > 0
          ? `${late} min late`
          : "Waiting";
  const fits = tablesFor(ctx.defs, ctx.states, r.party);
  const chosen = suggestTable(ctx.defs, ctx.states, r.party, ctx.picked);
  const bookable = r.status === "booked";
  return statusRow(r.id, `${r.name}, party of ${r.party}`, label, tone, {
    sub: r.note || "No notes",
    done: r.status === "cancelled",
    facts: [
      { label: "Time", value: minuteText(r.at) },
      {
        label: "Table",
        value:
          r.status === "seated"
            ? (ctx.defs.find((d) => d.id === r.table)?.label ?? "")
            : "-",
      },
    ],
    choose: bookable
      ? {
          label: "Table",
          options:
            fits.length === 0
              ? [{ value: "", label: "No table free", selected: true }]
              : fits.map((d) => ({
                  value: d.id,
                  label: `Table ${d.label} (${d.seats} seats)`,
                  selected: d.id === chosen,
                })),
        }
      : null,
    actions: bookable
      ? [
          listAction("seat", "Seat", {
            icon: "k-icon-check",
            variant: "default",
            disabled: chosen === "",
          }),
          listAction("cancel", "Cancel"),
        ]
      : [],
  });
}

// ---- sales

/** Sales before the page opened, by hour: [label, amount]. */
export const HOURLY: [string, number][] = [
  ["12", 420],
  ["13", 910],
  ["14", 640],
  ["15", 230],
  ["16", 190],
  ["17", 380],
  ["18", 1260],
  ["19", 760],
  ["20", 0],
  ["21", 0],
  ["22", 0],
];
export const BASE_COVERS = 96;
export const BASE_ORDERS = 58;

/** Pure: the bars: the hours so far, with the live sales added to the current hour. */
export function hourBars(live: number, nowHour: number): Column[] {
  return columns(
    HOURLY.map(([label, amount]) => {
      const value =
        Number(label) === nowHour ? amount + Math.round(live) : amount;
      return {
        id: label,
        label: `${label}h`,
        value,
        show: value > 0,
        tone:
          Number(label) === nowHour ? ("info" as Tone) : ("default" as Tone),
      };
    }),
  );
}

/** Seeded counts of what was sold today, by menu id. */
export const SOLD: Record<string, number> = {
  risotto: 21,
  carbonara: 26,
  pizza: 34,
  steak: 14,
  lamb: 11,
  bass: 9,
  bruschetta: 24,
  soup: 12,
  caesar: 17,
  burrata: 13,
  tiramisu: 19,
  panna: 8,
  lemonade: 22,
  wine: 41,
  beer: 29,
  espresso: 33,
};

/** Pure: the best sellers as meters. */
export function topDishes(
  menu: Entry[],
  sold: Record<string, number>,
  count: number,
): Item[] {
  const ranked = menu
    .map((e) => ({ e, n: sold[e.id] ?? 0 }))
    .filter((x) => x.n > 0)
    .sort((a, b) => b.n - a.n || a.e.name.localeCompare(b.e.name))
    .slice(0, count);
  const top = ranked[0]?.n ?? 1;
  return ranked.map(({ e, n }) =>
    item(e.id, e.name, n, top, {
      text: `${n} sold`,
      tone: "default",
      sub: money(n * e.price),
    }),
  );
}

export interface CategorySales {
  group: string;
  count: number;
  revenue: number;
  pct: number;
}

/** Pure: sales by menu group, with the share of the total. */
export function byGroup(
  menu: Entry[],
  sold: Record<string, number>,
): CategorySales[] {
  const groups = [...new Set(menu.map((e) => e.group))];
  const raw = groups.map((group) => {
    const here = menu.filter((e) => e.group === group);
    return {
      group,
      count: here.reduce((n, e) => n + (sold[e.id] ?? 0), 0),
      revenue: here.reduce((n, e) => n + (sold[e.id] ?? 0) * e.price, 0),
    };
  });
  const total = raw.reduce((n, g) => n + g.revenue, 0);
  return raw.map((g) => ({ ...g, pct: share(g.revenue, total) }));
}

/** Pure: add the dishes of a ticket to the sold counts. */
export function addSold(
  menu: Entry[],
  sold: Record<string, number>,
  lines: Line[],
): Record<string, number> {
  const out = { ...sold };
  for (const l of lines) {
    const found = menu.find((e) => e.name === l.name);
    if (found) out[found.id] = (out[found.id] ?? 0) + l.qty;
  }
  return out;
}

/** Pure: how long a table has been taken, as text. */
export function seatedFor(state: TableState, clock: number): string {
  if (state.status === "free") return "-";
  const m = minutesSince(clock, state.since);
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`;
}
