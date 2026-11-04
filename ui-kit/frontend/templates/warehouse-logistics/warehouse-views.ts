import { loadTone, share, type Tone } from "../../blocks/admin-shell/shell.ts";
import {
  action,
  type Cell,
  type ColumnDef,
  columnsOf,
  mono,
  number,
  pill,
  type Row,
  rowOf,
  strong,
  text,
} from "../../blocks/data-grid/grid.ts";
import type { Appt, DockDef } from "../../blocks/dock-schedule/docks.ts";
import { hourText } from "./warehouse.ts";
import { fillOf, type Location } from "../../blocks/location-grid/locations.ts";
import {
  listAction,
  loadMeter,
  type StatusRow,
  statusRow,
} from "../../blocks/status-list/rows.ts";
import {
  type Alert,
  isOpen,
  type Movement,
  type Order,
  type OrderStatus,
  reorderQty,
  SKUS,
  skuName,
  STATUS_TEXT,
  totals,
  units,
} from "./warehouse.ts";

// ---- orders

export const ORDER_COLS: ColumnDef[] = [
  { key: "order", label: "Order" },
  { key: "units", label: "Units", align: "right" },
  { key: "due", label: "Due" },
  { key: "status", label: "Status" },
];

const STATUS_TONE: Record<OrderStatus, Tone> = {
  expected: "info",
  arrived: "warning",
  received: "success",
  new: "info",
  picking: "warning",
  packed: "default",
  shipped: "success",
};

/** Pure: the button of an order for its status, or null at the end of its road. */
export function orderAction(o: Order): { id: string; label: string } | null {
  switch (o.status) {
    case "expected":
      return { id: "arrive", label: "Mark arrived" };
    case "arrived":
      return { id: "receive", label: "Receive stock" };
    case "new":
      return { id: "pick", label: "Start picking" };
    case "picking":
      return { id: "openpick", label: "Pick list" };
    case "packed":
      return { id: "ship", label: "Ship" };
    default:
      return null;
  }
}

export function orderGrid(list: Order[]) {
  return {
    orderCols: columnsOf(ORDER_COLS, null),
    orderRows: list.map((o): Row => {
      const act = orderAction(o);
      const cells: Record<string, Cell> = {
        order: strong(
          o.id,
          `${o.type === "inbound" ? "In" : "Out"}: ${o.party}`,
        ),
        units: number(units(o)),
        due: text(o.due),
        status: pill(STATUS_TEXT[o.status], STATUS_TONE[o.status]),
      };
      return rowOf(
        ORDER_COLS,
        o.id,
        cells,
        act ? [action(act.id, act.label, { variant: "default" })] : [],
      );
    }),
  };
}

// ---- movements

export const MOVE_COLS: ColumnDef[] = [
  { key: "time", label: "Time" },
  { key: "type", label: "Type" },
  { key: "sku", label: "Product" },
  { key: "qty", label: "Units", align: "right" },
  { key: "from", label: "From" },
  { key: "to", label: "To" },
  { key: "who", label: "By" },
];

const MOVE_LABEL = {
  in: ["Received", "success"],
  out: ["Shipped", "info"],
  pick: ["Picked", "warning"],
  move: ["Moved", "default"],
  count: ["Counted", "muted"],
} as const;

export function moveGrid(list: Movement[]) {
  return {
    moveCols: columnsOf(MOVE_COLS, null),
    moveRows: list.map((x): Row => {
      const [label, tone] = MOVE_LABEL[x.type];
      return rowOf(MOVE_COLS, x.id, {
        time: mono(x.time),
        type: pill(label, tone),
        sku: strong(skuName(x.sku), x.sku),
        qty: number(x.type === "count" ? "-" : x.qty),
        from: mono(x.from),
        to: mono(x.to),
        who: text(x.who),
      });
    }),
  };
}

// ---- alerts

export function alertRow(a: Alert): StatusRow {
  const sku = SKUS.find((s) => s.id === a.sku);
  const tone: Tone = a.level === "out" ? "destructive" : "warning";
  const qty = reorderQty(a.total, a.min);
  return statusRow(
    a.sku,
    skuName(a.sku),
    a.level === "out" ? "Out of stock" : "Running low",
    tone,
    {
      sub: `${a.sku}, zone ${sku?.zone ?? ""}, ${sku?.supplier ?? ""}`,
      facts: [
        { label: "In places", value: String(a.places) },
        { label: "Reorder level", value: String(a.min) },
        { label: "On order", value: a.onOrder > 0 ? String(a.onOrder) : "-" },
      ],
      meters: [
        {
          label: "In stock",
          text: `${a.total} / ${a.min}`,
          pct: share(a.total, a.min),
          tone,
        },
      ],
      actions:
        a.onOrder > 0
          ? [listAction("order", "On order", { disabled: true })]
          : [
              listAction("order", `Order ${qty}`, {
                variant: "default",
                icon: "k-ai-truck",
              }),
            ],
    },
  );
}

// ---- one place of the building

export function locationRow(
  l: Location | undefined,
  stock: Record<string, number>,
  minimums: Record<string, number>,
): StatusRow[] {
  if (!l) return [];
  if (l.qty === 0) {
    return [
      statusRow(l.code, l.code, "Empty", "muted", {
        sub: `Zone ${l.zone}, aisle ${l.aisle}, bay ${l.bay}`,
        facts: [{ label: "Room for", value: `${l.cap} units` }],
      }),
    ];
  }
  const pct = fillOf(l);
  const total = stock[l.sku] ?? 0;
  const low = total < (minimums[l.sku] ?? 0);
  return [
    statusRow(
      l.code,
      l.code,
      low ? "Low stock" : "In stock",
      low ? "warning" : "success",
      {
        sub: `${skuName(l.sku)} (${l.sku})`,
        facts: [
          { label: "Zone", value: l.zone },
          { label: "Product total", value: String(total) },
          { label: "Reorder level", value: String(minimums[l.sku] ?? 0) },
        ],
        meters: [loadMeter("Place filled", pct, `${l.qty} / ${l.cap}`)],
        actions: [
          listAction("count", "Cycle count", { icon: "k-icon-check" }),
          listAction("clear", "Clear place", { icon: "k-ai-trash" }),
        ],
      },
    ),
  ];
}

// ---- trucks of the day

export function truckRow(
  a: Appt,
  docks: DockDef[],
  nowIndex: number,
): StatusRow {
  const dock = docks.find((d) => d.id === a.dock);
  const status =
    a.status === "arrived"
      ? "At the door"
      : a.status === "done"
        ? "Done"
        : a.start < nowIndex
          ? "Late"
          : "Scheduled";
  const tone: Tone =
    a.status === "arrived"
      ? "warning"
      : a.status === "done"
        ? "success"
        : status === "Late"
          ? "destructive"
          : "info";
  return statusRow(a.id, a.carrier, status, tone, {
    sub: `${dock?.name ?? a.dock}, ${hourText(a.start)} to ${hourText(a.start + a.span)}`,
    facts: [
      { label: a.kind === "inbound" ? "Brings" : "Takes", value: a.ref || "-" },
    ],
    done: a.status === "done",
  });
}

/** Pure: how full each zone is, from the places. */
export function zoneFills(list: Location[], zone: string): number {
  const here = list.filter((l) => l.zone === zone);
  const cap = here.reduce((n, l) => n + l.cap, 0);
  const qty = here.reduce((n, l) => n + l.qty, 0);
  return cap === 0 ? 0 : share(qty, cap);
}

export const zoneTone = (pct: number): Tone => loadTone(pct);

export { totals, isOpen };
