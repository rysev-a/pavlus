import type { Effect, Message } from "@pavlus/frontend";
import { timeEffector as time } from "@pavlus/frontend/plugins";
import { AdminApp, type AppState } from "../../blocks/admin-shell/app.ts";
import {
  money,
  type NavGroup,
  notice,
  patch,
  type ShellAction,
  type ShellUser,
  withBadge,
} from "../../blocks/admin-shell/shell.ts";
import type { Column } from "../../blocks/bar-chart/chart.ts";
import { type Meter, meterOf } from "../../blocks/capacity-meter/meter.ts";
import {
  type Entry,
  type EntryView,
  rowsOf as menuRowsOf,
  onCount,
  toggle,
  typePrice,
} from "../../blocks/catalog-editor/catalog.ts";
import {
  type ColumnDef,
  columnsOf,
  type Column as GridColumn,
  type Row as GridRow,
  meter,
  number,
  pill,
  rowOf,
  strong,
} from "../../blocks/data-grid/grid.ts";
import {
  type Legend,
  legendOf,
  nextStatus,
  seatsUsed,
  type TableState,
  type TableView,
  tablesOf,
  withTable,
} from "../../blocks/floor-plan/floor.ts";
import {
  applyFilter,
  type Filter,
  filtersOf,
  type ToolbarAction,
  toolbarAction,
} from "../../blocks/list-filter/filters.ts";
import {
  advance,
  averageWait,
  boardOf,
  type ColumnView,
  lateCount,
  type Ticket,
  timerText,
} from "../../blocks/order-board/orders.ts";
import type { Item } from "../../blocks/progress-list/items.ts";
import {
  button,
  type Detail,
  type Field,
  field,
  type SheetButton,
  selectField,
} from "../../blocks/record-sheet/sheet.ts";
import { type Card, card, change } from "../../blocks/stat-cards/cards.ts";
import {
  listAction,
  type StatusRow,
  statusRow,
} from "../../blocks/status-list/rows.ts";
import {
  addSold,
  BASE_COVERS,
  BASE_ORDERS,
  byGroup,
  defaultGuests,
  HOURLY,
  hourBars,
  linesTotal,
  MENU,
  MENU_FILTERS,
  menuPasses,
  minuteOf,
  minuteText,
  newTicket,
  RES_FILTERS,
  RESERVATIONS,
  type Reservation,
  reservationRow,
  resPasses,
  SEED_CHECKS,
  SEED_TICKETS,
  SERVERS,
  SOLD,
  seatedFor,
  suggestTable,
  TABLE_STATES,
  TABLES,
  tableActions,
  tablesFor,
  topDishes,
  wallMinute,
  wallText,
} from "./restaurant.ts";
import view from "./restaurant-admin.pavlus";

/** What changes while the restaurant works. */
export interface Core {
  clock: number;
  states: TableState[];
  selected: string;
  tickets: Ticket[];
  /** Open checks by table id. */
  checks: Record<string, number>;
  menu: Entry[];
  menuFilter: string;
  menuQuery: string;
  reservations: Reservation[];
  resFilter: string;
  /** The table picked for a reservation, by reservation id. */
  picks: Record<string, string>;
  sold: Record<string, number>;
  /** Money taken since the page opened, and the covers it served. */
  live: number;
  liveCovers: number;
  seq: number;
  groups: NavGroup[];
}

/** Everything worked out from the core. */
export interface Views {
  tables: TableView[];
  legend: Legend[];
  seatMeter: Meter;
  floorStats: Card[];
  tableRows: StatusRow[];
  board: ColumnView[];
  boardStats: Card[];
  menuRows: EntryView[];
  menuFilters: Filter[];
  menuFooter: string;
  resRows: StatusRow[];
  resFilters: Filter[];
  salesStats: Card[];
  bars: Column[];
  top: Item[];
  catCols: GridColumn[];
  catRows: GridRow[];
  subtitle: string;
}

export interface SheetState {
  open: boolean;
  draft: ReservationDraft;
  title: string;
  description: string;
  fields: Field[];
  details: Detail[];
  buttons: SheetButton[];
}

export interface ReservationDraft {
  name: string;
  party: string;
  at: string;
  note: string;
}

export interface RestaurantState extends AppState, Core, Views {
  user: ShellUser;
  actions: ShellAction[];
  none: ToolbarAction[];
  resActions: ToolbarAction[];
  sheet: SheetState;
}

const GROUPS: NavGroup[] = [
  {
    title: "Service",
    items: [
      { id: "floor", label: "Floor plan", icon: "k-ai-grid" },
      { id: "orders", label: "Kitchen orders", icon: "k-ai-kanban" },
      { id: "reservations", label: "Reservations", icon: "k-ai-clipboard" },
    ],
  },
  {
    title: "Back office",
    items: [
      { id: "menu", label: "Menu", icon: "k-ai-tag" },
      { id: "sales", label: "Daily sales", icon: "k-ai-chart" },
    ],
  },
];

const SLOTS = [
  "19:15",
  "19:30",
  "19:45",
  "20:00",
  "20:15",
  "20:30",
  "20:45",
  "21:00",
  "21:15",
  "21:30",
  "21:45",
  "22:00",
];

const emptyDraft = (): ReservationDraft => ({
  name: "",
  party: "2",
  at: "20:00",
  note: "",
});

/** Pure: the sheet for a new reservation, with the errors found so far. */
export function reservationSheet(
  draft: ReservationDraft,
  errors: Record<string, string> = {},
  open = true,
): SheetState {
  const fields = [
    field("name", "Name", draft.name, {
      placeholder: "Who is it for?",
      error: errors.name ?? "",
    }),
    field("party", "Guests", draft.party, {
      kind: "number",
      hint: "Between 1 and 12.",
      error: errors.party ?? "",
    }),
    selectField(
      "at",
      "Time",
      draft.at,
      SLOTS.map((s) => [s, s]),
    ),
    field("note", "Notes", draft.note, {
      kind: "textarea",
      placeholder: "Allergies, a cake, a window table...",
    }),
  ];
  return {
    open,
    draft,
    title: "New reservation",
    description: "The guests wait on the list until you seat them.",
    fields,
    details: [],
    buttons: [button("save", "Add reservation")],
  };
}

/** Pure: what is wrong with a draft, by field id. */
export function validateReservation(
  d: ReservationDraft,
): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!d.name.trim()) errors.name = "Give a name for the booking.";
  const party = Number(d.party);
  if (!Number.isInteger(party) || party < 1 || party > 12) {
    errors.party = "Between 1 and 12 guests.";
  }
  return errors;
}

/** Pure: the reservation a draft makes. */
export function reservationOf(d: ReservationDraft, id: string): Reservation {
  return {
    id,
    name: d.name.trim(),
    party: Number(d.party),
    at: minuteOf(d.at),
    note: d.note.trim(),
    status: "booked",
    table: "",
  };
}

const CAT_DEFS: ColumnDef[] = [
  { key: "group", label: "Category" },
  { key: "count", label: "Sold", align: "right" },
  { key: "revenue", label: "Revenue", align: "right" },
  { key: "share", label: "Share of sales" },
];

/** Pure: money taken in total today: the hours so far plus the live sales. */
export const takenToday = (live: number): number =>
  HOURLY.reduce((n, [, amount]) => n + amount, 0) + live;

/** Pure: the open checks, all tables together. */
export const openChecks = (checks: Record<string, number>): number =>
  Object.values(checks).reduce((n, v) => n + v, 0);

/** Pure: the views, fully worked out for the clock and the core. */
export function derive(s: Core): Views & { groups: NavGroup[] } {
  const selectedDef = TABLES.find((d) => d.id === s.selected);
  const state = s.states.find((x) => x.id === s.selected);
  const seats = seatsUsed(TABLES, s.states);
  const busy = s.states.filter((x) => x.status !== "free");
  const open = s.tickets.filter((t) => t.stage !== "served");
  const nowHour = Math.floor(wallMinute(s.clock) / 60);
  const taken = takenToday(s.live);
  const covers = BASE_COVERS + s.liveCovers;
  const orders = BASE_ORDERS + s.seq;
  const waiting = s.reservations.filter((r) => r.status === "booked").length;

  const tableRows: StatusRow[] =
    selectedDef && state
      ? [
          statusRow(
            selectedDef.id,
            `Table ${selectedDef.label}`,
            state.status === "free"
              ? "Free"
              : state.status[0].toUpperCase() + state.status.slice(1),
            state.status === "free"
              ? "muted"
              : state.status === "seated"
                ? "info"
                : state.status === "ordered"
                  ? "warning"
                  : "success",
            {
              sub: `${selectedDef.seats} seats, ${SERVERS[selectedDef.id] ?? "no server"}`,
              facts: [
                {
                  label: "Guests",
                  value: state.status === "free" ? "-" : String(state.guests),
                },
                { label: "Taken for", value: seatedFor(state, s.clock) },
                {
                  label: "Open check",
                  value: s.checks[selectedDef.id]
                    ? money(s.checks[selectedDef.id])
                    : "-",
                },
              ],
              actions: tableActions(state.status).map((a) =>
                listAction(a.id, a.label, { variant: a.variant, icon: a.icon }),
              ),
            },
          ),
        ]
      : [];

  const menuShown = applyFilter(
    s.menu,
    s.menuFilter,
    s.menuQuery,
    menuPasses,
    (e) => `${e.name} ${e.group} ${e.sub}`,
  );

  const resShown = applyFilter(
    [...s.reservations].sort((a, b) => a.at - b.at),
    s.resFilter,
    "",
    resPasses,
    (r) => r.name,
  );

  const groupsSales = byGroup(s.menu, s.sold);
  const sold = Object.values(s.sold).reduce((n, v) => n + v, 0);

  return {
    tables: tablesOf(TABLES, s.states, s.selected, s.clock),
    legend: legendOf(s.states),
    seatMeter: meterOf("Seats taken", seats.used, seats.total, "seats"),
    floorStats: [
      card("free", "Free tables", String(s.states.length - busy.length), {
        hint: `of ${s.states.length}`,
        icon: "k-ai-grid",
        tone: "success",
      }),
      card("guests", "Guests in", String(seats.used), {
        hint: "right now",
        icon: "k-ai-users",
        tone: "info",
      }),
      card("tickets", "Open tickets", String(open.length), {
        hint: `${lateCount(s.tickets, s.clock)} late`,
        icon: "k-ai-kanban",
        tone: lateCount(s.tickets, s.clock) > 0 ? "warning" : "default",
      }),
      card("checks", "Open checks", money(openChecks(s.checks), "$", 0), {
        hint: `${busy.length} tables`,
        icon: "k-ai-receipt",
        tone: "default",
      }),
    ],
    tableRows,
    board: boardOf(s.tickets, s.clock),
    boardStats: [
      card("open", "In the kitchen", String(open.length), {
        icon: "k-ai-kanban",
        hint: "tickets not served",
      }),
      card("wait", "Average wait", timerText(averageWait(s.tickets, s.clock)), {
        icon: "k-ai-pulse",
        tone: "info",
        hint: "target 15:00",
      }),
      card("late", "Late tickets", String(lateCount(s.tickets, s.clock)), {
        icon: "k-ai-alert",
        tone: lateCount(s.tickets, s.clock) > 0 ? "destructive" : "success",
        hint: "over 15 minutes",
      }),
    ],
    menuRows: menuRowsOf(menuShown),
    menuFilters: filtersOf(MENU_FILTERS, s.menuFilter, s.menu, menuPasses),
    menuFooter: `${onCount(s.menu)} of ${s.menu.length} dishes are on the menu`,
    resRows: resShown.map((r) =>
      reservationRow(r, {
        defs: TABLES,
        states: s.states,
        picked: s.picks[r.id] ?? "",
        nowMinute: wallMinute(s.clock),
      }),
    ),
    resFilters: filtersOf(RES_FILTERS, s.resFilter, s.reservations, resPasses),
    salesStats: [
      card("revenue", "Sales today", money(taken, "$", 0), {
        icon: "k-ai-dollar",
        tone: "success",
        ...change(taken, 4400),
        hint: "vs last Tuesday",
      }),
      card("covers", "Covers", String(covers), {
        icon: "k-ai-users",
        tone: "info",
        ...change(covers, 104),
        hint: "vs last Tuesday",
      }),
      card("avg", "Average check", money(taken / Math.max(1, covers)), {
        icon: "k-ai-receipt",
        hint: `${orders} orders`,
      }),
      card("dishes", "Dishes sold", String(sold), {
        icon: "k-ai-tag",
        hint: `${s.menu.filter((e) => !e.on).length} sold out`,
      }),
    ],
    bars: hourBars(s.live, nowHour),
    top: topDishes(s.menu, s.sold, 6),
    catCols: columnsOf(CAT_DEFS, null),
    catRows: groupsSales.map((g) =>
      rowOf(CAT_DEFS, g.group, {
        group: strong(g.group),
        count: number(g.count),
        revenue: number(money(g.revenue, "$", 0)),
        share: meter(g.pct, "default", `${g.pct}%`),
      }),
    ),
    subtitle: `Tue 3 Nov, ${wallText(s.clock)}`,
    groups: withBadge(
      withBadge(s.groups, "orders", open.length ? String(open.length) : ""),
      "reservations",
      waiting ? String(waiting) : "",
    ),
  };
}

const core: Core = {
  clock: 0,
  states: TABLE_STATES,
  selected: "t4",
  tickets: SEED_TICKETS,
  checks: SEED_CHECKS,
  menu: MENU,
  menuFilter: "all",
  menuQuery: "",
  reservations: RESERVATIONS,
  resFilter: "all",
  picks: {},
  sold: SOLD,
  live: 0,
  liveCovers: 0,
  seq: 0,
  groups: GROUPS,
};

export const initial: RestaurantState = {
  screen: "floor",
  title: "Floor plan",
  navOpen: false,
  notice: "",
  user: { name: "Marco Bellini", role: "Floor manager", initials: "MB" },
  actions: [
    { id: "walkin", label: "Walk-in", icon: "k-icon-plus", variant: "default" },
  ],
  none: [],
  resActions: [
    toolbarAction("reserve", "New reservation", "k-icon-plus", "default"),
  ],
  ...core,
  ...derive(core),
  sheet: reservationSheet(emptyDraft(), {}, false),
};

const CORE_KEYS: (keyof Core)[] = [
  "clock",
  "states",
  "selected",
  "tickets",
  "checks",
  "menu",
  "menuFilter",
  "menuQuery",
  "reservations",
  "resFilter",
  "picks",
  "sold",
  "live",
  "liveCovers",
  "seq",
  "groups",
];

const coreOf = (s: RestaurantState): Core =>
  Object.fromEntries(CORE_KEYS.map((k) => [k, s[k]])) as unknown as Core;

export class RestaurantAdmin extends AdminApp<RestaurantState> {
  view = view;

  /** The service clock: one tick a second, started when the page opens. */
  override enter(): Effect[] {
    return [time.setInterval("ticker", 1000, "tick")];
  }

  override leave(): Effect[] {
    return [time.cancelAll()];
  }

  /** Change some of the core; every view follows. */
  _commit(state: RestaurantState, changes: Partial<Core>): Effect[] {
    const next = { ...coreOf(state), ...changes };
    return patch({ ...changes, ...derive(next) });
  }

  tick(_msg: Message, state: RestaurantState): Effect[] {
    const clock = state.clock + 1;
    const next = { ...coreOf(state), clock };
    const all = derive(next);
    const minute = clock % 60 === 0;
    return patch({
      clock,
      tables: all.tables,
      board: all.board,
      boardStats: all.boardStats,
      floorStats: all.floorStats,
      tableRows: all.tableRows,
      ...(minute
        ? { subtitle: all.subtitle, resRows: all.resRows, bars: all.bars }
        : {}),
    });
  }

  // ---- the floor
  "plan.pick"(msg: Message, state: RestaurantState): Effect[] {
    return this._commit(state, { selected: msg.payload as string });
  }

  /** The button of the selected table: the next step, or clear it. */
  "sel.act"(msg: Message, state: RestaurantState): Effect[] {
    const [id, what] = msg.payload as [string, "next" | "clear"];
    const def = TABLES.find((d) => d.id === id);
    const table = state.states.find((x) => x.id === id);
    if (!def || !table) return [];
    const label = `Table ${def.label}`;
    if (what === "clear") {
      const checks = { ...state.checks };
      delete checks[id];
      return [
        ...this._commit(state, {
          states: withTable(state.states, id, {
            status: "free",
            guests: 0,
            since: state.clock,
          }),
          checks,
        }),
        ...notice(`${label} cleared`),
      ];
    }
    const status = nextStatus(table.status);
    if (table.status === "free") {
      return [
        ...this._commit(state, {
          states: withTable(state.states, id, {
            status,
            guests: defaultGuests(def),
            since: state.clock,
          }),
        }),
        ...notice(`${label}: ${defaultGuests(def)} guests seated`),
      ];
    }
    if (table.status === "seated") {
      const ticket = newTicket(
        state.menu,
        state.seq,
        def,
        SERVERS[id] ?? "Ana",
        state.clock,
      );
      return [
        ...this._commit(state, {
          states: withTable(state.states, id, { status }),
          tickets: [...state.tickets, ticket],
          checks: {
            ...state.checks,
            [id]:
              (state.checks[id] ?? 0) + linesTotal(state.menu, ticket.lines),
          },
          sold: addSold(state.menu, state.sold, ticket.lines),
          seq: state.seq + 1,
        }),
        ...notice(
          `${label}: ticket ${ticket.id.toUpperCase()} sent to the kitchen`,
        ),
      ];
    }
    if (table.status === "ordered") {
      return [
        ...this._commit(state, {
          states: withTable(state.states, id, { status }),
        }),
        ...notice(`${label}: the bill is on the table`),
      ];
    }
    const paid = state.checks[id] ?? 0;
    const checks = { ...state.checks };
    delete checks[id];
    return [
      ...this._commit(state, {
        states: withTable(state.states, id, {
          status: "free",
          guests: 0,
          since: state.clock,
        }),
        checks,
        live: state.live + paid,
        liveCovers: state.liveCovers + table.guests,
      }),
      ...notice(`${label} paid ${money(paid)}`),
    ];
  }

  // ---- the kitchen
  "board.advance"(msg: Message, state: RestaurantState): Effect[] {
    const id = msg.payload as string;
    const ticket = state.tickets.find((t) => t.id === id);
    const tickets = advance(state.tickets, id, state.clock);
    const after = tickets.find((t) => t.id === id);
    return [
      ...this._commit(state, { tickets }),
      ...(ticket && after ? notice(`${ticket.title}: ${after.stage}`) : []),
    ];
  }

  // ---- the menu
  "menufilter.pick"(msg: Message, state: RestaurantState): Effect[] {
    return this._commit(state, { menuFilter: msg.payload as string });
  }
  "menufilter.search"(msg: Message, state: RestaurantState): Effect[] {
    return this._commit(state, { menuQuery: msg.event?.value ?? "" });
  }
  "menu.toggle"(msg: Message, state: RestaurantState): Effect[] {
    const menu = toggle(state.menu, msg.payload as string);
    const dish = menu.find((e) => e.id === msg.payload);
    return [
      ...this._commit(state, { menu }),
      ...(dish
        ? notice(`${dish.name} is ${dish.on ? "back on" : "off"} the menu`)
        : []),
    ];
  }
  "menu.price"(msg: Message, state: RestaurantState): Effect[] {
    const text = msg.event?.value ?? "";
    const menu = typePrice(state.menu, msg.payload as string, text);
    return this._commit(state, { menu });
  }

  // ---- reservations
  "resfilter.action"(): Effect[] {
    return patch({ sheet: reservationSheet(emptyDraft()) });
  }
  "resfilter.pick"(msg: Message, state: RestaurantState): Effect[] {
    return this._commit(state, { resFilter: msg.payload as string });
  }

  "res.choose"(msg: Message, state: RestaurantState): Effect[] {
    return this._commit(state, {
      picks: {
        ...state.picks,
        [msg.payload as string]: msg.event?.value ?? "",
      },
    });
  }

  "res.act"(msg: Message, state: RestaurantState): Effect[] {
    const [id, what] = msg.payload as [string, "seat" | "cancel"];
    const res = state.reservations.find((r) => r.id === id);
    if (!res) return [];
    if (what === "cancel") {
      return [
        ...this._commit(state, {
          reservations: state.reservations.map((r) =>
            r.id === id ? { ...r, status: "cancelled" } : r,
          ),
        }),
        ...notice(`${res.name}: reservation cancelled`),
      ];
    }
    const tableId = suggestTable(
      TABLES,
      state.states,
      res.party,
      state.picks[id] ?? "",
    );
    const def = TABLES.find((d) => d.id === tableId);
    if (!def) return notice("No table is free for this party");
    return [
      ...this._commit(state, {
        states: withTable(state.states, tableId, {
          status: "seated",
          guests: res.party,
          since: state.clock,
        }),
        reservations: state.reservations.map((r) =>
          r.id === id ? { ...r, status: "seated", table: tableId } : r,
        ),
        selected: tableId,
      }),
      ...notice(`${res.name} seated at table ${def.label}`),
    ];
  }

  // ---- the top bar and the sheet
  "top.action"(_msg: Message, state: RestaurantState): Effect[] {
    const [def] = tablesFor(TABLES, state.states, 2);
    if (!def) return notice("No table is free for a walk-in");
    return [
      ...this._commit(state, {
        states: withTable(state.states, def.id, {
          status: "seated",
          guests: 2,
          since: state.clock,
        }),
        selected: def.id,
      }),
      ...patch({ screen: "floor", title: "Floor plan" }),
      ...notice(`Walk-in seated at table ${def.label}`),
    ];
  }

  "sheet.close"(_msg: Message, state: RestaurantState): Effect[] {
    return patch({ sheet: { ...state.sheet, open: false } });
  }

  "sheet.field"(msg: Message, state: RestaurantState): Effect[] {
    const draft = {
      ...state.sheet.draft,
      [msg.payload as string]: msg.event?.value ?? "",
    };
    return patch({ sheet: reservationSheet(draft) });
  }

  "sheet.press"(_msg: Message, state: RestaurantState): Effect[] {
    const draft = state.sheet.draft;
    const errors = validateReservation(draft);
    if (Object.keys(errors).length > 0) {
      return patch({ sheet: reservationSheet(draft, errors) });
    }
    const res = reservationOf(draft, `r${state.reservations.length + 1}`);
    return [
      ...this._commit(state, { reservations: [...state.reservations, res] }),
      ...patch({ sheet: reservationSheet(emptyDraft(), {}, false) }),
      ...notice(`${res.name}: table for ${res.party} at ${minuteText(res.at)}`),
    ];
  }
}

export const page = new RestaurantAdmin();
