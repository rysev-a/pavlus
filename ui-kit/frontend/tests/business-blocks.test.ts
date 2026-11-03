import { expect, test } from "vitest";
import {
  adjust,
  hasRoom,
  meterOf,
  statusOf,
} from "../blocks/capacity-meter/meter.ts";
import {
  firstFree,
  legendOf,
  minutesSince,
  nextStatus,
  seatsUsed,
  type TableDef,
  type TableState,
  tablesOf,
  withTable,
} from "../blocks/floor-plan/floor.ts";
import {
  advance,
  advanceTicket,
  averageWait,
  boardOf,
  lateCount,
  nextStage,
  TARGET,
  type Ticket,
  timerText,
  urgency,
} from "../blocks/order-board/orders.ts";
import {
  codeOf,
  fillOf,
  fillOfAll,
  type Location,
  matches,
  zonesOf,
} from "../blocks/location-grid/locations.ts";
import {
  conflicts,
  firstFreeDock,
  hoursFrom,
  longestFit,
  overlaps,
  rowsOf,
  usedPct,
} from "../blocks/dock-schedule/docks.ts";
import {
  entry,
  onCount,
  parsePrice,
  rowsOf as catalogRows,
  toggle,
  typePrice,
} from "../blocks/catalog-editor/catalog.ts";
import {
  nextLine,
  type PickLine,
  progressOf,
  tickAll,
  togglePick,
  walkOrder,
} from "../blocks/pick-list/picks.ts";

// ---- capacity meter

test("capacity meter: percent, places left, tone and words", () => {
  const m = meterOf("Floor", 27, 40);
  expect(m.pct).toBe(68);
  expect(m.left).toBe(13);
  expect(m.text).toBe("27 / 40 people");
  expect(m.status).toBe("Busy");
  expect(m.tone).toBe("success");
  expect(meterOf("Floor", 33, 40).tone).toBe("warning");
  expect(meterOf("Floor", 38, 40).tone).toBe("destructive");
  expect(meterOf("Floor", 39, 40).note).toBe("1 person left");
  expect(meterOf("Docks", 5, 6, "docks").note).toBe("1 dock left");
});

test("capacity meter: full, over and empty", () => {
  expect(meterOf("x", 40, 40).status).toBe("Full");
  expect(meterOf("x", 40, 40).note).toBe("No place left");
  const over = meterOf("x", 44, 40);
  expect(over.pct).toBe(100);
  expect(over.status).toBe("Over capacity");
  expect(over.tone).toBe("destructive");
  expect(meterOf("x", 0, 40).status).toBe("Quiet");
  expect(statusOf(0, 0)).toBe("Closed");
  expect(meterOf("x", 3, 0).pct).toBe(0);
});

test("capacity meter: nobody gets in when full; the count stays in range", () => {
  expect(hasRoom(39, 40)).toBe(true);
  expect(hasRoom(40, 40)).toBe(false);
  expect(adjust(40, 1, 40)).toBe(40);
  expect(adjust(41, 1, 40, true)).toBe(42);
  expect(adjust(0, -1, 40)).toBe(0);
});

// ---- floor plan

const defs: TableDef[] = [
  { id: "a", label: "1", seats: 2, col: 1, row: 1, w: 1, h: 1, shape: "round" },
  {
    id: "b",
    label: "2",
    seats: 4,
    col: 2,
    row: 1,
    w: 1,
    h: 1,
    shape: "square",
  },
  { id: "c", label: "3", seats: 6, col: 3, row: 1, w: 2, h: 1, shape: "wide" },
];
const states: TableState[] = [
  { id: "a", status: "free", guests: 0, since: 0 },
  { id: "b", status: "seated", guests: 3, since: -600 },
  { id: "c", status: "paying", guests: 5, since: -4000 },
];

test("floor plan: a table steps through its statuses and comes back free", () => {
  expect(nextStatus("free")).toBe("seated");
  expect(nextStatus("seated")).toBe("ordered");
  expect(nextStatus("ordered")).toBe("paying");
  expect(nextStatus("paying")).toBe("free");
});

test("floor plan: minutes, labels and the selected table", () => {
  expect(minutesSince(600, 0)).toBe(10);
  expect(minutesSince(0, 600)).toBe(0);
  const views = tablesOf(defs, states, "b", 0);
  expect(views[0].sub).toBe("2 seats");
  expect(views[0].time).toBe("");
  expect(views[1].sub).toBe("3 guests");
  expect(views[1].time).toBe("10 min");
  expect(views[1].selected).toBe(true);
  expect(views[2].tone).toBe("success");
  expect(tablesOf(defs, [], "", 0)[0].status).toBe("free");
});

test("floor plan: legend counts, seats taken and the best free table", () => {
  expect(legendOf(states).map((l) => l.count)).toEqual([1, 1, 0, 1]);
  expect(seatsUsed(defs, states)).toEqual({ used: 8, total: 12 });
  expect(firstFree(defs, states, 2)?.id).toBe("a");
  expect(firstFree(defs, states, 3)).toBeNull();
  const next = withTable(states, "a", { status: "seated", guests: 2 });
  expect(firstFree(defs, next, 1)).toBeNull();
  expect(states[0].status).toBe("free");
});

// ---- order board

const ticket = (
  id: string,
  stage: Ticket["stage"],
  placedAt: number,
): Ticket => ({
  id,
  title: "Table 1",
  who: "Ana",
  lines: [{ qty: 2, name: "Soup", note: "" }],
  stage,
  placedAt,
  doneAt: null,
});

test("order board: timers read mm:ss and urgency follows the target", () => {
  expect(timerText(425)).toBe("07:05");
  expect(timerText(-5)).toBe("00:00");
  expect(timerText(3601)).toBe("60:01");
  expect(urgency(0)).toBe("success");
  expect(urgency(TARGET * 0.7)).toBe("warning");
  expect(urgency(TARGET)).toBe("destructive");
});

test("order board: stages advance and serving stops the timer", () => {
  expect(nextStage("new")).toBe("cooking");
  expect(nextStage("served")).toBe("served");
  const t = ticket("o1", "ready", -300);
  const served = advanceTicket(t, 100);
  expect(served.stage).toBe("served");
  expect(served.doneAt).toBe(100);
  const board = boardOf([served], 5000);
  expect(board[3].tickets[0].timer).toBe("06:40");
  expect(board[3].tickets[0].next).toBe("");
  expect(advanceTicket(served, 999)).toBe(served);
  const list = advance([t, ticket("o2", "new", 0)], "o2", 10);
  expect(list[1].stage).toBe("cooking");
  expect(list[0].stage).toBe("ready");
});

test("order board: average wait and late tickets ignore the served ones", () => {
  const list = [
    ticket("a", "new", -600),
    ticket("b", "cooking", -1200),
    { ...ticket("c", "served", -5000), doneAt: -100 },
  ];
  expect(averageWait(list, 0)).toBe(900);
  expect(lateCount(list, 0)).toBe(1);
  expect(averageWait([], 0)).toBe(0);
  expect(boardOf(list, 0).map((c) => c.count)).toEqual([1, 1, 0, 1]);
});

test("order board: the oldest ticket of a column comes first", () => {
  const list = [ticket("new-1", "new", -10), ticket("old-1", "new", -500)];
  expect(boardOf(list, 0)[0].tickets.map((t) => t.id)).toEqual([
    "old-1",
    "new-1",
  ]);
});

// ---- location grid

const places: Location[] = [
  {
    code: "A-01-01",
    zone: "A",
    aisle: 1,
    bay: 1,
    sku: "rice",
    qty: 30,
    cap: 60,
  },
  { code: "A-01-02", zone: "A", aisle: 1, bay: 2, sku: "", qty: 0, cap: 60 },
  {
    code: "A-02-01",
    zone: "A",
    aisle: 2,
    bay: 1,
    sku: "oil",
    qty: 60,
    cap: 60,
  },
  {
    code: "B-01-01",
    zone: "B",
    aisle: 1,
    bay: 1,
    sku: "milk",
    qty: 10,
    cap: 40,
  },
];

test("location grid: codes and fill", () => {
  expect(codeOf("A", 2, 5)).toBe("A-02-05");
  expect(fillOf(places[0])).toBe(50);
  expect(fillOf({ ...places[0], cap: 0 })).toBe(0);
  expect(fillOfAll(places.filter((l) => l.zone === "A"))).toBe(50);
  expect(fillOfAll([])).toBe(0);
});

test("location grid: a search matches a code, a product id or its name", () => {
  const names = { rice: "Basmati rice", oil: "Olive oil" };
  expect(matches(places[0], names, "")).toBe(true);
  expect(matches(places[0], names, "basmati")).toBe(true);
  expect(matches(places[0], names, "A-01-01")).toBe(true);
  expect(matches(places[2], names, "basmati")).toBe(false);
});

test("location grid: zones, aisles, marks, dimming and the zone filter", () => {
  const opts = {
    selected: "A-02-01",
    query: "rice",
    names: { rice: "Basmati rice", oil: "Olive oil", milk: "Oat milk" },
    alerts: ["oil"],
    only: "all",
  };
  const zones = zonesOf(
    [
      { id: "A", name: "Zone A", sub: "" },
      { id: "B", name: "Zone B", sub: "" },
    ],
    places,
    opts,
  );
  expect(zones.map((z) => z.id)).toEqual(["A", "B"]);
  expect(zones[0].aisles.map((a) => a.label)).toEqual(["Aisle 01", "Aisle 02"]);
  const cells = zones[0].aisles.flatMap((a) => a.cells);
  expect(cells.find((c) => c.id === "A-02-01")?.mark).toBe(true);
  expect(cells.find((c) => c.id === "A-02-01")?.selected).toBe(true);
  expect(cells.find((c) => c.id === "A-02-01")?.dim).toBe(true);
  expect(cells.find((c) => c.id === "A-01-01")?.dim).toBe(false);
  expect(cells.find((c) => c.id === "A-01-02")?.empty).toBe(true);
  const onlyB = zonesOf(
    [
      { id: "A", name: "A", sub: "" },
      { id: "B", name: "B", sub: "" },
    ],
    places,
    {
      ...opts,
      only: "B",
    },
  );
  expect(onlyB.map((z) => z.id)).toEqual(["B"]);
});

// ---- dock schedule

const appts = [
  {
    id: "x",
    dock: "d1",
    start: 2,
    span: 2,
    carrier: "N",
    ref: "",
    kind: "inbound" as const,
    status: "scheduled" as const,
  },
];

test("dock schedule: overlapping hours", () => {
  expect(overlaps({ start: 2, span: 2 }, { start: 3, span: 1 })).toBe(true);
  expect(overlaps({ start: 2, span: 2 }, { start: 4, span: 1 })).toBe(false);
  expect(overlaps({ start: 2, span: 2 }, { start: 0, span: 2 })).toBe(false);
});

test("dock schedule: conflicts, the edge of the grid, and moving a truck", () => {
  expect(conflicts(appts, "d1", 3, 1, 12)).toBe(true);
  expect(conflicts(appts, "d2", 3, 1, 12)).toBe(false);
  expect(conflicts(appts, "d1", 4, 2, 12)).toBe(false);
  expect(conflicts(appts, "d1", 11, 2, 12)).toBe(true);
  expect(conflicts(appts, "d1", -1, 1, 12)).toBe(true);
  expect(conflicts(appts, "d1", 2, 3, 12, "x")).toBe(false);
  expect(conflicts(appts, "d1", 5, 0, 12)).toBe(true);
});

test("dock schedule: the longest stay that fits and the first free door", () => {
  expect(longestFit(appts, "d1", 0, 12, 3)).toBe(2);
  expect(longestFit(appts, "d1", 2, 12, 3)).toBe(0);
  expect(longestFit(appts, "d1", 4, 12, 3)).toBe(3);
  expect(longestFit(appts, "d1", 11, 12, 3)).toBe(1);
  const docks = [
    { id: "d1", name: "1", kind: "" },
    { id: "d2", name: "2", kind: "" },
  ];
  expect(firstFreeDock(appts, docks, 2, 1, 12)?.id).toBe("d2");
  expect(
    firstFreeDock(
      [...appts, { ...appts[0], id: "y", dock: "d2" }],
      docks,
      2,
      1,
      12,
    ),
  ).toBeNull();
});

test("dock schedule: rows have free hours around the trucks and a true share used", () => {
  const rows = rowsOf([{ id: "d1", name: "1", kind: "" }], appts, 6);
  expect(rows[0].segs.map((s) => `${s.kind}${s.span}`)).toEqual([
    "free1",
    "free1",
    "appt2",
    "free1",
    "free1",
  ]);
  expect(rows[0].segs[2].tone).toBe("info");
  expect(usedPct(appts, 1, 6)).toBe(33);
  expect(usedPct([], 0, 0)).toBe(0);
  expect(hoursFrom(6, 3, 7).map((h) => [h.label, h.now])).toEqual([
    ["06:00", false],
    ["07:00", true],
    ["08:00", false],
  ]);
});

// ---- catalog editor

test("catalog editor: prices are numbers above zero with two decimals at most", () => {
  expect(parsePrice("12.5")).toBe(12.5);
  expect(parsePrice(" 12,50 ")).toBe(12.5);
  expect(parsePrice("7")).toBe(7);
  expect(parsePrice("abc")).toBeNull();
  expect(parsePrice("0")).toBeNull();
  expect(parsePrice("-3")).toBeNull();
  expect(parsePrice("1.234")).toBeNull();
  expect(parsePrice("")).toBeNull();
});

test("catalog editor: a bad price is kept as a draft and the price stays", () => {
  const list = [
    entry("a", "x", "Soup", "Starters", 7.5),
    entry("b", "y", "Tea", "Drinks", 3),
  ];
  const typed = typePrice(list, "a", "8.25");
  expect(typed[0].price).toBe(8.25);
  const bad = typePrice(typed, "a", "8.2x");
  expect(bad[0].price).toBe(8.25);
  expect(bad[0].draft).toBe("8.2x");
  expect(catalogRows(bad)[0].error).not.toBe("");
  expect(catalogRows(typed)[0].error).toBe("");
  expect(catalogRows(typed)[0].shown).toBe("$8.25");
  expect(list[0].price).toBe(7.5);
});

test("catalog editor: switching a line off", () => {
  const list = [
    entry("a", "x", "Soup", "Starters", 7.5),
    entry("b", "y", "Tea", "Drinks", 3),
  ];
  const off = toggle(list, "b");
  expect(off[1].on).toBe(false);
  expect(onCount(off)).toBe(1);
  expect(catalogRows(off)[1].state).toBe("Sold out");
  expect(catalogRows(off, "On sale", "Closed")[1].state).toBe("Closed");
});

// ---- pick list

const lines: PickLine[] = [
  { id: "1", loc: "B-01-04", sku: "m", name: "Milk", qty: 24, picked: false },
  { id: "2", loc: "A-03-02", sku: "r", name: "Rice", qty: 6, picked: false },
  { id: "3", loc: "A-01-07", sku: "o", name: "Oil", qty: 10, picked: true },
];

test("pick list: progress counts lines and units", () => {
  const p = progressOf(lines);
  expect(p.done).toBe(1);
  expect(p.pct).toBe(33);
  expect(p.units).toBe(40);
  expect(p.unitsDone).toBe(10);
  expect(p.text).toBe("1 of 3 lines, 10 of 40 units");
  expect(p.complete).toBe(false);
  expect(progressOf([]).pct).toBe(0);
  expect(progressOf([]).complete).toBe(false);
  expect(progressOf(tickAll(lines)).complete).toBe(true);
});

test("pick list: ticking, ticking all and walking order", () => {
  expect(togglePick(lines, "1")[0].picked).toBe(true);
  expect(togglePick(togglePick(lines, "1"), "1")[0].picked).toBe(false);
  expect(tickAll(tickAll(lines)).every((l) => !l.picked)).toBe(true);
  expect(walkOrder(lines).map((l) => l.loc)).toEqual([
    "A-01-07",
    "A-03-02",
    "B-01-04",
  ]);
  expect(walkOrder(lines)[0].qtyText).toBe("x 10");
  expect(nextLine(lines)?.id).toBe("2");
  expect(nextLine(tickAll(lines))).toBeNull();
  expect(lines[0].picked).toBe(false);
});
