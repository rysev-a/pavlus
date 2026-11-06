import type { Effect, Message } from "@pavlus/frontend";
import { AdminApp, type AppState } from "../../blocks/admin-shell/app.ts";
import {
  type NavGroup,
  notice,
  patch,
  type ShellAction,
  type ShellUser,
  withBadge,
} from "../../blocks/admin-shell/shell.ts";
import { type Meter, meterOf } from "../../blocks/capacity-meter/meter.ts";
import type {
  Column as GridColumn,
  Row as GridRow,
} from "../../blocks/data-grid/grid.ts";
import {
  type Appt,
  conflicts,
  type DockRow,
  rowsOf as dockRowsOf,
  type Hour,
  hoursFrom,
  longestFit,
  usedPct,
} from "../../blocks/dock-schedule/docks.ts";
import {
  applyFilter,
  type Filter,
  filtersOf,
  type ToolbarAction,
} from "../../blocks/list-filter/filters.ts";
import {
  fillOfAll,
  type Location,
  type ZoneView,
  zonesOf,
} from "../../blocks/location-grid/locations.ts";
import {
  nextLine,
  type PickLine,
  type PickLineView,
  type PickProgress,
  progressOf,
  tickAll,
  togglePick,
  walkOrder,
} from "../../blocks/pick-route/picks.ts";
import { type Item, item } from "../../blocks/progress-list/items.ts";
import {
  button,
  type Detail,
  detail,
  type Field,
  field,
  type SheetButton,
  selectField,
} from "../../blocks/record-sheet/sheet.ts";
import { type Card, card } from "../../blocks/stat-cards/cards.ts";
import type { StatusRow } from "../../blocks/status-list/rows.ts";
import {
  APPTS,
  alertsOf,
  DOCK_FIRST,
  DOCK_HOURS,
  DOCKS,
  type DockDraft,
  hourText,
  isOpen,
  kindOf,
  LOCATIONS,
  MINIMUMS,
  MOVE_FILTERS,
  MOVEMENTS,
  type Movement,
  movePasses,
  moveText,
  NOW_HOUR,
  newOutbound,
  nextStatus,
  ORDER_FILTERS,
  ORDERS,
  type Order,
  orderPasses,
  pickListFor,
  putaway,
  reorderOf,
  reorderQty,
  SEED_PICKS,
  shortOf,
  skuName,
  stamp,
  takeOut,
  totals,
  units,
  validateAppt,
  ZONES,
} from "./warehouse.ts";
import view from "./warehouse-logistics.pavlus";
import {
  alertRow,
  locationRow,
  moveGrid,
  orderAction,
  orderGrid,
  truckRow,
} from "./warehouse-views.ts";

export interface Core {
  locations: Location[];
  movements: Movement[];
  orders: Order[];
  /** Pick lists by order id. */
  picks: Record<string, PickLine[]>;
  pickId: string;
  appts: Appt[];
  selected: string;
  zoneFilter: string;
  invQuery: string;
  orderFilter: string;
  moveFilter: string;
  moveQuery: string;
  /** Actions made at the building: also the clock of the movement log. */
  seq: number;
  groups: NavGroup[];
}

export interface Views {
  stats: Card[];
  space: Meter;
  zoneMeters: Item[];
  topAlerts: StatusRow[];
  trucks: StatusRow[];
  zoneFilters: Filter[];
  zones: ZoneView[];
  locRows: StatusRow[];
  orderFilters: Filter[];
  orderCols: GridColumn[];
  orderRows: GridRow[];
  orderFooter: string;
  pickFilters: Filter[];
  pickTitle: string;
  pickSub: string;
  pickProgress: PickProgress;
  pickLines: PickLineView[];
  pickNext: string;
  pickReady: boolean;
  dockHours: Hour[];
  dockRows: DockRow[];
  dockStats: Card[];
  alertRows: StatusRow[];
  moveFilters: Filter[];
  moveCols: GridColumn[];
  moveRows: GridRow[];
  moveFooter: string;
}

export interface SheetState {
  open: boolean;
  /** An appointment being changed; empty for a new one. */
  id: string;
  dock: string;
  start: number;
  draft: DockDraft;
  title: string;
  description: string;
  fields: Field[];
  details: Detail[];
  buttons: SheetButton[];
}

export interface WarehouseState extends AppState, Core, Views {
  user: ShellUser;
  actions: ShellAction[];
  none: ToolbarAction[];
  sheet: SheetState;
}

const GROUPS: NavGroup[] = [
  {
    title: "Warehouse",
    items: [
      { id: "overview", label: "Overview", icon: "k-ai-home" },
      { id: "inventory", label: "Inventory", icon: "k-ai-warehouse" },
      { id: "alerts", label: "Stock alerts", icon: "k-ai-alert" },
    ],
  },
  {
    title: "Flow",
    items: [
      { id: "orders", label: "Orders", icon: "k-ai-receipt" },
      { id: "picks", label: "Pick lists", icon: "k-ai-clipboard" },
      { id: "docks", label: "Dock schedule", icon: "k-ai-truck" },
      { id: "moves", label: "Movement log", icon: "k-ai-refresh" },
    ],
  },
];

/** Pure: the id of the pick list shown: the chosen one if it exists, else the first. */
export function pickShown(
  picks: Record<string, PickLine[]>,
  chosen: string,
): string {
  if (picks[chosen]) return chosen;
  return Object.keys(picks)[0] ?? "";
}

/** Pure: the sheet of the dock grid, for a new booking or a truck. */
export function dockSheet(
  appts: Appt[],
  orders: Order[],
  where: { id: string; dock: string; start: number },
  draft: DockDraft,
  errors: Record<string, string> = {},
  open = true,
): SheetState {
  const dock = DOCKS.find((d) => d.id === where.dock);
  const appt = appts.find((a) => a.id === where.id);
  const choices: [string, string][] = [
    ["", "No order"],
    ...orders
      .filter((o) => isOpen(o) || o.id === draft.ref)
      .map((o): [string, string] => [o.id, `${o.id}, ${o.party}`]),
  ];
  const buttons: SheetButton[] = appt
    ? [
        button("remove", "Remove", "destructive"),
        ...(appt.status === "scheduled"
          ? [button("arrive", "Truck arrived", "secondary")]
          : appt.status === "arrived"
            ? [button("done", "Truck left", "secondary")]
            : []),
        button("save", "Save"),
      ]
    : [button("save", "Book the door")];
  return {
    open,
    id: where.id,
    dock: where.dock,
    start: where.start,
    draft,
    title: appt
      ? `${appt.carrier}, ${dock?.name ?? ""}`
      : `${dock?.name ?? "Door"} at ${hourText(where.start)}`,
    description: appt
      ? "Change the carrier or the length of the stay, or move the truck along."
      : "Who is coming, and how long they stay at the door.",
    fields: [
      field("carrier", "Carrier", draft.carrier, {
        placeholder: "Who is driving?",
        error: errors.carrier ?? "",
      }),
      selectField("ref", "Order", draft.ref, choices),
      selectField(
        "span",
        "Stay",
        draft.span,
        [
          ["1", "1 hour"],
          ["2", "2 hours"],
          ["3", "3 hours"],
        ],
        errors.span ?? "",
      ),
    ],
    details: appt
      ? [
          detail("Door", dock?.name ?? appt.dock),
          detail("Arrives", hourText(appt.start)),
          detail(
            "Status",
            appt.status === "scheduled"
              ? "Scheduled"
              : appt.status === "arrived"
                ? "At the door"
                : "Done",
            appt.status === "done"
              ? "success"
              : appt.status === "arrived"
                ? "warning"
                : "info",
          ),
        ]
      : [],
    buttons,
  };
}

export const openOrders = (list: Order[]): number => list.filter(isOpen).length;

/** Pure: the views, fully worked out for the core. */
export function derive(s: Core): Views & { groups: NavGroup[] } {
  const stock = totals(s.locations);
  const unitsIn = Object.values(stock).reduce((n, v) => n + v, 0);
  const used = s.locations.filter((l) => l.qty > 0).length;
  const alerts = alertsOf(s.locations, MINIMUMS, s.orders);
  const names = Object.fromEntries(
    Object.keys(stock)
      .concat(s.locations.map((l) => l.sku))
      .map((id) => [id, skuName(id)]),
  );
  const occupied = s.locations.filter((l) => l.qty > 0);
  const selected = s.locations.find((l) => l.code === s.selected);
  const orderList = applyFilter(
    s.orders,
    s.orderFilter,
    "",
    orderPasses,
    (o) => o.id,
  );
  const og = orderGrid(orderList);
  const shown = pickShown(s.picks, s.pickId);
  const lines = s.picks[shown] ?? [];
  const progress = progressOf(lines);
  const order = s.orders.find((o) => o.id === shown);
  const moveList = applyFilter(
    s.movements,
    s.moveFilter,
    s.moveQuery,
    movePasses,
    moveText,
  );
  const open = s.orders.filter(isOpen);
  const nowIndex = NOW_HOUR - DOCK_FIRST;
  const mg = moveGrid(moveList);
  return {
    stats: [
      card("units", "Units stocked", String(unitsIn), {
        icon: "k-ai-box",
        tone: "info",
        hint: `${Object.keys(stock).length} products`,
      }),
      card("used", "Places in use", `${used} / ${s.locations.length}`, {
        icon: "k-ai-warehouse",
        hint: `${Math.round((used / s.locations.length) * 100)}% of the building`,
      }),
      card("alerts", "Stock alerts", String(alerts.length), {
        icon: "k-ai-alert",
        tone: alerts.length > 0 ? "warning" : "success",
        hint: `${alerts.filter((a) => a.level === "out").length} out of stock`,
      }),
      card("open", "Open orders", String(open.length), {
        icon: "k-ai-receipt",
        hint: `${open.filter((o) => o.type === "inbound").length} in, ${open.filter((o) => o.type === "outbound").length} out`,
      }),
    ],
    space: meterOf("Places in use", used, s.locations.length, "places"),
    zoneMeters: ZONES.map((z) => {
      const pct = fillOfAll(s.locations.filter((l) => l.zone === z.id));
      return item(z.id, `${z.name}, ${z.sub}`, pct, 100, {
        text: `${pct}% full`,
      });
    }),
    topAlerts: alerts.slice(0, 3).map(alertRow),
    trucks: s.appts
      .filter((a) => a.status !== "done")
      .sort((a, b) => a.start - b.start)
      .slice(0, 4)
      .map((a) => truckRow(a, DOCKS, nowIndex)),
    zoneFilters: filtersOf(
      [
        ["all", "All zones"],
        ...ZONES.map((z): [string, string] => [z.id, z.name]),
      ],
      s.zoneFilter,
      occupied,
      (l, id) => l.zone === id,
    ),
    zones: zonesOf(ZONES, s.locations, {
      selected: s.selected,
      query: s.invQuery,
      names,
      alerts: alerts.map((a) => a.sku),
      only: s.zoneFilter,
    }),
    locRows: locationRow(selected, stock, MINIMUMS),
    orderFilters: filtersOf(
      ORDER_FILTERS,
      s.orderFilter,
      s.orders,
      orderPasses,
    ),
    ...og,
    orderFooter: `${orderList.length} of ${s.orders.length} orders`,
    pickFilters: Object.keys(s.picks).map((id) => ({
      id,
      label: id,
      count: s.picks[id].length,
      active: id === shown,
    })),
    pickTitle: shown ? `Pick list ${shown}` : "No pick list",
    pickSub: order ? order.party : "Start picking an order to get a list.",
    pickProgress: progress,
    pickLines: walkOrder(lines),
    pickNext: nextLine(lines)?.id ?? "",
    pickReady: progress.complete,
    dockHours: hoursFrom(DOCK_FIRST, DOCK_HOURS, NOW_HOUR),
    dockRows: dockRowsOf(DOCKS, s.appts, DOCK_HOURS),
    dockStats: [
      card("trucks", "Trucks today", String(s.appts.length), {
        icon: "k-ai-truck",
        hint: `${s.appts.filter((a) => a.status === "done").length} done`,
      }),
      card(
        "door",
        "Doors in use",
        `${usedPct(s.appts, DOCKS.length, DOCK_HOURS)}%`,
        {
          icon: "k-ai-pulse",
          tone: "info",
          hint: "of the hours on the grid",
        },
      ),
      card(
        "at",
        "At the door",
        String(s.appts.filter((a) => a.status === "arrived").length),
        {
          icon: "k-ai-warehouse",
          tone: "warning",
          hint: "unloading or loading",
        },
      ),
    ],
    alertRows: alerts.map(alertRow),
    moveFilters: filtersOf(MOVE_FILTERS, s.moveFilter, s.movements, movePasses),
    ...mg,
    moveFooter: `${moveList.length} of ${s.movements.length} movements`,
    groups: withBadge(
      withBadge(
        withBadge(s.groups, "orders", open.length ? String(open.length) : ""),
        "picks",
        Object.keys(s.picks).length ? String(Object.keys(s.picks).length) : "",
      ),
      "alerts",
      alerts.length ? String(alerts.length) : "",
    ),
  };
}

const core: Core = {
  locations: LOCATIONS,
  movements: MOVEMENTS,
  orders: ORDERS,
  picks: SEED_PICKS,
  pickId: "OUT-2216",
  appts: APPTS,
  selected: "A-01-02",
  zoneFilter: "all",
  invQuery: "",
  orderFilter: "all",
  moveFilter: "all",
  moveQuery: "",
  seq: 0,
  groups: GROUPS,
};

const closedDraft: DockDraft = { carrier: "", ref: "", span: "1" };

export const initial: WarehouseState = {
  screen: "overview",
  title: "Overview",
  navOpen: false,
  notice: "",
  user: { name: "Piotr Zielinski", role: "Shift lead", initials: "PZ" },
  actions: [
    { id: "new", label: "New order", icon: "k-icon-plus", variant: "default" },
  ],
  none: [],
  ...core,
  ...derive(core),
  sheet: dockSheet(
    APPTS,
    ORDERS,
    { id: "", dock: "d1", start: 0 },
    closedDraft,
    {},
    false,
  ),
};

const CORE_KEYS: (keyof Core)[] = [
  "locations",
  "movements",
  "orders",
  "picks",
  "pickId",
  "appts",
  "selected",
  "zoneFilter",
  "invQuery",
  "orderFilter",
  "moveFilter",
  "moveQuery",
  "seq",
  "groups",
];

const coreOf = (s: WarehouseState): Core =>
  Object.fromEntries(CORE_KEYS.map((k) => [k, s[k]])) as unknown as Core;

const move = (
  seq: number,
  n: number,
  type: Movement["type"],
  sku: string,
  qty: number,
  from: string,
  to: string,
): Movement => ({
  id: `m${10 + seq + n}`,
  time: stamp(seq + n),
  type,
  sku,
  qty,
  from,
  to,
  who: "You",
});

export class WarehouseApp extends AdminApp<WarehouseState> {
  view = view;

  /** Change some of the core; every view follows. */
  _commit(state: WarehouseState, changes: Partial<Core>): Effect[] {
    return patch({ ...changes, ...derive({ ...coreOf(state), ...changes }) });
  }

  /** Go to a view from inside another one (a button, not the sidebar). */
  _goto(screen: string, title: string): Effect[] {
    return patch({ screen, title });
  }

  // ---- inventory
  "grid.pick"(msg: Message, state: WarehouseState): Effect[] {
    return this._commit(state, { selected: msg.payload as string });
  }
  "zonefilter.pick"(msg: Message, state: WarehouseState): Effect[] {
    return this._commit(state, { zoneFilter: msg.payload as string });
  }
  "zonefilter.search"(msg: Message, state: WarehouseState): Effect[] {
    return this._commit(state, { invQuery: msg.event?.value ?? "" });
  }

  "loc.act"(msg: Message, state: WarehouseState): Effect[] {
    const [code, what] = msg.payload as [string, "count" | "clear"];
    const place = state.locations.find((l) => l.code === code);
    if (!place || place.qty === 0) return [];
    if (what === "count") {
      return [
        ...this._commit(state, {
          movements: [
            move(state.seq, 0, "count", place.sku, 0, code, code),
            ...state.movements,
          ],
          seq: state.seq + 1,
        }),
        ...notice(`${code} counted: ${place.qty} units, as the system says`),
      ];
    }
    return [
      ...this._commit(state, {
        locations: takeOut(state.locations, [{ loc: code, qty: place.qty }]),
        movements: [
          move(state.seq, 0, "move", place.sku, place.qty, code, "STAGING"),
          ...state.movements,
        ],
        seq: state.seq + 1,
      }),
      ...notice(`${code} cleared, ${place.qty} units went to staging`),
    ];
  }

  // ---- orders
  "orderfilter.pick"(msg: Message, state: WarehouseState): Effect[] {
    return this._commit(state, { orderFilter: msg.payload as string });
  }

  "orders.act"(msg: Message, state: WarehouseState): Effect[] {
    const [id, what] = msg.payload as [string, string];
    const order = state.orders.find((o) => o.id === id);
    if (!order) return [];
    const setStatus = (orders: Order[]) =>
      orders.map((o) => (o.id === id ? { ...o, status: nextStatus(o) } : o));
    if (what === "arrive") {
      return [
        ...this._commit(state, {
          orders: setStatus(state.orders),
          appts: state.appts.map((a) =>
            a.ref === id && a.status === "scheduled"
              ? { ...a, status: "arrived" }
              : a,
          ),
        }),
        ...notice(`${id} is at the dock`),
      ];
    }
    if (what === "receive") {
      let locations = state.locations;
      let movements = state.movements;
      let n = 0;
      let left = 0;
      for (const line of order.lines) {
        const put = putaway(locations, line.sku, line.qty);
        locations = put.locations;
        left += put.left;
        for (const p of put.puts) {
          movements = [
            move(state.seq, n++, "in", line.sku, p.qty, "DOCK-1", p.loc),
            ...movements,
          ];
        }
      }
      return [
        ...this._commit(state, {
          locations,
          movements,
          orders: setStatus(state.orders),
          seq: state.seq + n,
        }),
        ...notice(
          left > 0
            ? `${id} received, ${left} units did not fit and stay on the dock`
            : `${id} received and put away: ${units(order)} units`,
        ),
      ];
    }
    if (what === "pick") {
      const missing = shortOf(state.locations, order);
      const list = missing ? null : pickListFor(state.locations, order);
      if (!list) return notice(`Not enough ${skuName(missing)} for ${id}`);
      return [
        ...this._commit(state, {
          orders: setStatus(state.orders),
          picks: { ...state.picks, [id]: list },
          pickId: id,
        }),
        ...notice(`Pick list ${id} is ready: ${list.length} lines`),
      ];
    }
    if (what === "openpick") {
      return [
        ...this._commit(state, { pickId: id }),
        ...this._goto("picks", "Pick lists"),
      ];
    }
    if (what === "ship") {
      const movements = [
        ...order.lines
          .map((l, i) =>
            move(state.seq, i, "out", l.sku, l.qty, "PACK-1", "DOCK-3"),
          )
          .reverse(),
        ...state.movements,
      ];
      return [
        ...this._commit(state, {
          orders: setStatus(state.orders),
          movements,
          seq: state.seq + order.lines.length,
        }),
        ...notice(`${id} shipped`),
      ];
    }
    return [];
  }

  // ---- pick lists
  "pickfilter.pick"(msg: Message, state: WarehouseState): Effect[] {
    return this._commit(state, { pickId: msg.payload as string });
  }

  "pick.toggle"(msg: Message, state: WarehouseState): Effect[] {
    const id = pickShown(state.picks, state.pickId);
    if (!id) return [];
    return this._commit(state, {
      picks: {
        ...state.picks,
        [id]: togglePick(state.picks[id], msg.payload as string),
      },
    });
  }

  tickAllLines(_msg: Message, state: WarehouseState): Effect[] {
    const id = pickShown(state.picks, state.pickId);
    if (!id) return [];
    return this._commit(state, {
      picks: { ...state.picks, [id]: tickAll(state.picks[id]) },
    });
  }

  completePick(_msg: Message, state: WarehouseState): Effect[] {
    const id = pickShown(state.picks, state.pickId);
    const lines = state.picks[id];
    if (!id || !lines || !progressOf(lines).complete) {
      return notice("Tick every line before you complete the pick list");
    }
    const picks = { ...state.picks };
    delete picks[id];
    const movements = [
      ...lines
        .map((l, i) =>
          move(state.seq, i, "pick", l.sku, l.qty, l.loc, "PACK-1"),
        )
        .reverse(),
      ...state.movements,
    ];
    return [
      ...this._commit(state, {
        locations: takeOut(
          state.locations,
          lines.map((l) => ({ loc: l.loc, qty: l.qty })),
        ),
        movements,
        picks,
        pickId: Object.keys(picks)[0] ?? "",
        seq: state.seq + lines.length,
        orders: state.orders.map((o) =>
          o.id === id ? { ...o, status: "packed" } : o,
        ),
      }),
      ...notice(`${id} picked and packed: ${lines.length} lines`),
    ];
  }

  // ---- alerts
  "alerts.act"(msg: Message, state: WarehouseState): Effect[] {
    return this._reorder(msg, state);
  }
  "tops.act"(msg: Message, state: WarehouseState): Effect[] {
    return this._reorder(msg, state);
  }

  _reorder(msg: Message, state: WarehouseState): Effect[] {
    const [sku] = msg.payload as [string, string];
    const total = totals(state.locations)[sku] ?? 0;
    const qty = reorderQty(total, MINIMUMS[sku] ?? 0);
    const order = reorderOf(sku, qty, state.orders.length);
    return [
      ...this._commit(state, { orders: [...state.orders, order] }),
      ...notice(`${order.id}: ${qty} x ${skuName(sku)} ordered`),
    ];
  }

  // ---- docks
  "docks.book"(msg: Message, state: WarehouseState): Effect[] {
    const [dock, hour] = msg.payload as [string, number];
    const span = longestFit(state.appts, dock, hour, DOCK_HOURS, 3);
    if (span === 0) return notice("That hour is taken");
    const draft = { carrier: "", ref: "", span: String(Math.min(2, span)) };
    return patch({
      sheet: dockSheet(
        state.appts,
        state.orders,
        { id: "", dock, start: hour },
        draft,
      ),
    });
  }

  "docks.open"(msg: Message, state: WarehouseState): Effect[] {
    const appt = state.appts.find((a) => a.id === msg.payload);
    if (!appt) return [];
    const draft = {
      carrier: appt.carrier,
      ref: appt.ref,
      span: String(appt.span),
    };
    return patch({
      sheet: dockSheet(
        state.appts,
        state.orders,
        { id: appt.id, dock: appt.dock, start: appt.start },
        draft,
      ),
    });
  }

  "sheet.close"(_msg: Message, state: WarehouseState): Effect[] {
    return patch({ sheet: { ...state.sheet, open: false } });
  }

  "sheet.field"(msg: Message, state: WarehouseState): Effect[] {
    const draft = {
      ...state.sheet.draft,
      [msg.payload as string]: msg.event?.value ?? "",
    };
    const { id, dock, start } = state.sheet;
    return patch({
      sheet: dockSheet(state.appts, state.orders, { id, dock, start }, draft),
    });
  }

  "sheet.press"(msg: Message, state: WarehouseState): Effect[] {
    const { id, dock, start, draft } = state.sheet;
    const what = msg.payload as string;
    const closed = patch({ sheet: { ...state.sheet, open: false } });
    const appt = state.appts.find((a) => a.id === id);
    if (what === "remove" && appt) {
      return [
        ...this._commit(state, {
          appts: state.appts.filter((a) => a.id !== id),
        }),
        ...closed,
        ...notice(`${appt.carrier} removed from ${dock.toUpperCase()}`),
      ];
    }
    if ((what === "arrive" || what === "done") && appt) {
      const status = what === "arrive" ? "arrived" : "done";
      return [
        ...this._commit(state, {
          appts: state.appts.map((a) => (a.id === id ? { ...a, status } : a)),
          orders: state.orders.map((o) =>
            what === "arrive" && o.id === appt.ref && o.status === "expected"
              ? { ...o, status: "arrived" }
              : o,
          ),
        }),
        ...closed,
        ...notice(
          what === "arrive"
            ? `${appt.carrier} is at the door`
            : `${appt.carrier} has left`,
        ),
      ];
    }
    const errors = validateAppt(draft);
    const span = Number(draft.span);
    if (conflicts(state.appts, dock, start, span, DOCK_HOURS, id)) {
      errors.span = "The door is not free for that long.";
    }
    if (Object.keys(errors).length > 0) {
      return patch({
        sheet: dockSheet(
          state.appts,
          state.orders,
          { id, dock, start },
          draft,
          errors,
        ),
      });
    }
    const next: Appt = {
      id: id || `a${state.appts.length + 1}-${dock}-${start}`,
      dock,
      start,
      span,
      carrier: draft.carrier.trim(),
      ref: draft.ref,
      kind: kindOf(draft.ref),
      status: appt?.status ?? "scheduled",
    };
    return [
      ...this._commit(state, {
        appts: id
          ? state.appts.map((a) => (a.id === id ? next : a))
          : [...state.appts, next],
      }),
      ...closed,
      ...notice(
        id ? "Truck saved" : `${next.carrier} booked at ${hourText(start)}`,
      ),
    ];
  }

  // ---- the movement log
  "movefilter.pick"(msg: Message, state: WarehouseState): Effect[] {
    return this._commit(state, { moveFilter: msg.payload as string });
  }
  "movefilter.search"(msg: Message, state: WarehouseState): Effect[] {
    return this._commit(state, { moveQuery: msg.event?.value ?? "" });
  }

  // ---- the top bar
  "top.action"(_msg: Message, state: WarehouseState): Effect[] {
    const unique = newOutbound(state.orders.length - ORDERS.length);
    return [
      ...this._commit(state, { orders: [...state.orders, unique] }),
      ...this._goto("orders", "Orders"),
      ...notice(`${unique.id} from ${unique.party} is waiting to be picked`),
    ];
  }
}

export const page = new WarehouseApp();
