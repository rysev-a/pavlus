import { expect, test } from "vitest";
import type { Location } from "../blocks/location-grid/locations.ts";
import {
  alertsOf,
  allocate,
  APPTS,
  kindOf,
  LOCATIONS,
  MINIMUMS,
  movePasses,
  nextStatus,
  newOutbound,
  ORDERS,
  orderPasses,
  pickListFor,
  putaway,
  reorderOf,
  reorderQty,
  SEED_PICKS,
  seedLocations,
  shortOf,
  SKUS,
  stamp,
  takeOut,
  totals,
  units,
  validateAppt,
  isOpen,
} from "../templates/warehouse-logistics/warehouse.ts";
import {
  alertRow,
  locationRow,
  orderAction,
  orderGrid,
} from "../templates/warehouse-logistics/warehouse-views.ts";
import {
  derive,
  dockSheet,
  pickShown,
} from "../templates/warehouse-logistics/warehouse-logistics.ts";
import { MOVEMENTS } from "../templates/warehouse-logistics/warehouse.ts";

const loc = (code: string, sku: string, qty: number, cap = 60): Location => ({
  code,
  zone: code[0],
  aisle: 1,
  bay: 1,
  sku,
  qty,
  cap,
});

test("warehouse: the building is filled the same way every time", () => {
  expect(seedLocations()).toEqual(LOCATIONS);
  expect(LOCATIONS).toHaveLength(32 + 16 + 12 + 24);
  expect(new Set(LOCATIONS.map((l) => l.code)).size).toBe(LOCATIONS.length);
  expect(LOCATIONS.every((l) => l.qty <= l.cap)).toBe(true);
  expect(LOCATIONS.every((l) => (l.sku === "") === (l.qty === 0))).toBe(true);
  const zones = new Map(SKUS.map((s) => [s.id, s.zone]));
  expect(
    LOCATIONS.filter((l) => l.sku).every((l) => zones.get(l.sku) === l.zone),
  ).toBe(true);
});

test("warehouse: stock is summed over the places, and some products run low", () => {
  const t = totals([
    loc("A-1", "x", 10),
    loc("A-2", "x", 5),
    loc("A-3", "y", 0),
    loc("A-4", "", 0),
  ]);
  expect(t).toEqual({ x: 15 });
  expect(Object.keys(totals(LOCATIONS))).toHaveLength(SKUS.length - 1);
  const alerts = alertsOf(LOCATIONS, MINIMUMS, ORDERS);
  expect(alerts.map((a) => a.sku).sort()).toEqual([
    "BAT-AA-24",
    "COF-BEAN-1K",
    "EGG-FR-12",
  ]);
  expect(alerts.every((a) => a.total < a.min)).toBe(true);
  expect(alerts.find((a) => a.sku === "BAT-AA-24")?.onOrder).toBe(120);
  expect(alerts.find((a) => a.sku === "COF-BEAN-1K")?.onOrder).toBe(0);
  expect(alerts[0]).toMatchObject({
    sku: "EGG-FR-12",
    total: 0,
    level: "out",
    onOrder: 80,
  });
});

test("warehouse: an allocation takes from the places in order of their codes", () => {
  const list = [
    loc("A-02", "x", 10),
    loc("A-01", "x", 5),
    loc("A-03", "y", 40),
  ];
  expect(allocate(list, "x", 7)).toEqual([
    { loc: "A-01", qty: 5 },
    { loc: "A-02", qty: 2 },
  ]);
  expect(allocate(list, "x", 15)).toHaveLength(2);
  expect(allocate(list, "x", 16)).toBeNull();
  expect(allocate(list, "z", 1)).toBeNull();
  expect(allocate(list, "x", 0)).toEqual([]);
});

test("warehouse: put-away fills the places that hold the product, then empty ones of its zone", () => {
  const sku = SKUS.find((s) => s.zone === "A")!;
  const list = [
    loc("A-01", sku.id, 50, 60),
    loc("A-02", "", 0, 60),
    loc("B-01", "", 0, 40),
    loc("A-03", sku.id, 60, 60),
  ];
  const r = putaway(list, sku.id, 30);
  expect(r.puts).toEqual([
    { loc: "A-01", qty: 10 },
    { loc: "A-02", qty: 20 },
  ]);
  expect(r.left).toBe(0);
  expect(r.locations.find((l) => l.code === "A-02")).toMatchObject({
    sku: sku.id,
    qty: 20,
    cap: sku.cap,
  });
  expect(r.locations.find((l) => l.code === "B-01")?.sku).toBe("");
  expect(list[0].qty).toBe(50);
  const big = putaway(list, sku.id, 100);
  expect(big.left).toBe(100 - 10 - sku.cap);
  expect(totals(big.locations)[sku.id]).toBe(50 + 60 + 10 + sku.cap);
});

test("warehouse: taking stock out never goes below zero and empties a place", () => {
  const list = [loc("A-01", "x", 10), loc("A-02", "x", 4)];
  const out = takeOut(list, [
    { loc: "A-01", qty: 4 },
    { loc: "A-02", qty: 9 },
  ]);
  expect(out[0]).toMatchObject({ qty: 6, sku: "x" });
  expect(out[1]).toMatchObject({ qty: 0, sku: "" });
  expect(takeOut(list, [{ loc: "none", qty: 1 }])).toEqual(list);
  expect(list[0].qty).toBe(10);
});

test("warehouse: a pick list covers each line from the places that hold it", () => {
  const order = ORDERS.find((o) => o.id === "OUT-2214")!;
  const lines = pickListFor(LOCATIONS, order)!;
  expect(lines).not.toBeNull();
  expect(lines.reduce((n, l) => n + l.qty, 0)).toBe(units(order));
  for (const line of order.lines) {
    expect(
      lines.filter((l) => l.sku === line.sku).reduce((n, l) => n + l.qty, 0),
    ).toBe(line.qty);
  }
  expect(lines.every((l) => !l.picked)).toBe(true);
  const huge = { ...order, lines: [{ sku: "RIC-BAS-5K", qty: 99999 }] };
  expect(pickListFor(LOCATIONS, huge)).toBeNull();
  expect(shortOf(LOCATIONS, huge)).toBe("RIC-BAS-5K");
  expect(shortOf(LOCATIONS, order)).toBe("");
  expect(Object.keys(SEED_PICKS)).toEqual(["OUT-2216"]);
  expect(SEED_PICKS["OUT-2216"].filter((l) => l.picked)).toHaveLength(1);
});

test("warehouse: two lines of one product never take the same stock twice", () => {
  const list = [loc("A-01", "x", 10)];
  const order = {
    ...ORDERS[0],
    lines: [
      { sku: "x", qty: 6 },
      { sku: "x", qty: 6 },
    ],
  };
  expect(pickListFor(list, order)).toBeNull();
  const ok = {
    ...order,
    lines: [
      { sku: "x", qty: 6 },
      { sku: "x", qty: 4 },
    ],
  };
  expect(pickListFor(list, ok)?.map((l) => l.qty)).toEqual([6, 4]);
});

test("warehouse: orders go forward one status at a time and stop at the end", () => {
  const status = (t: "inbound" | "outbound", s: string) =>
    nextStatus({ ...ORDERS[0], type: t, status: s as never });
  expect(status("inbound", "expected")).toBe("arrived");
  expect(status("inbound", "arrived")).toBe("received");
  expect(status("inbound", "received")).toBe("received");
  expect(status("outbound", "new")).toBe("picking");
  expect(status("outbound", "picking")).toBe("packed");
  expect(status("outbound", "packed")).toBe("shipped");
  expect(status("outbound", "shipped")).toBe("shipped");
  expect(orderAction(ORDERS[0])).toBeNull();
  expect(orderAction(ORDERS.find((o) => o.status === "arrived")!)?.id).toBe(
    "receive",
  );
  expect(orderAction(ORDERS.find((o) => o.status === "picking")!)?.id).toBe(
    "openpick",
  );
  expect(ORDERS.filter(isOpen)).toHaveLength(6);
  expect(ORDERS.filter((o) => orderPasses(o, "inbound"))).toHaveLength(4);
  expect(ORDERS.filter((o) => orderPasses(o, "open"))).toHaveLength(6);
  expect(orderGrid(ORDERS).orderRows[0].actions).toEqual([]);
});

test("warehouse: new outbound orders rotate and have their own numbers", () => {
  expect(newOutbound(0).id).toBe("OUT-2217");
  expect(newOutbound(1).id).toBe("OUT-2218");
  expect(newOutbound(3).party).toBe(newOutbound(0).party);
  expect(newOutbound(0).status).toBe("new");
  expect(shortOf(LOCATIONS, newOutbound(0))).toBe("");
  expect(shortOf(LOCATIONS, newOutbound(1))).toBe("");
  expect(shortOf(LOCATIONS, newOutbound(2))).toBe("EGG-FR-12");
});

test("warehouse: reordering asks for whole sixes and names the supplier", () => {
  expect(reorderQty(0, 20)).toBe(42);
  expect(reorderQty(30, 40)).toBe(54);
  expect(reorderQty(100, 40)).toBe(6);
  const o = reorderOf("COF-BEAN-1K", 60, 3);
  expect(o).toMatchObject({
    id: "IN-1055",
    type: "inbound",
    status: "expected",
  });
  expect(o.party).toContain("Harbor Roasters");
  expect(o.lines).toEqual([{ sku: "COF-BEAN-1K", qty: 60 }]);
});

test("warehouse: the movement log is clocked by actions and filtered by type", () => {
  expect(stamp(0)).toBe("09:40");
  expect(stamp(4)).toBe("09:52");
  expect(stamp(20)).toBe("10:40");
  expect(MOVEMENTS.filter((x) => movePasses(x, "pick"))).toHaveLength(2);
});

test("warehouse: the dock form needs a carrier and an order says which way it goes", () => {
  expect(
    validateAppt({ carrier: " ", ref: "", span: "1" }).carrier,
  ).toBeTruthy();
  expect(validateAppt({ carrier: "Dalex", ref: "", span: "1" })).toEqual({});
  expect(kindOf("OUT-2214")).toBe("outbound");
  expect(kindOf("IN-1045")).toBe("inbound");
  expect(kindOf("")).toBe("inbound");
  expect(APPTS.every((a) => a.start + a.span <= 12)).toBe(true);
  const sheet = dockSheet(
    APPTS,
    ORDERS,
    { id: "", dock: "d2", start: 5 },
    { carrier: "", ref: "", span: "2" },
  );
  expect(sheet.title).toBe("Door 2 at 11:00");
  expect(sheet.buttons.map((b) => b.id)).toEqual(["save"]);
  const truck = dockSheet(
    APPTS,
    ORDERS,
    { id: "a2", dock: "d1", start: 4 },
    { carrier: "x", ref: "", span: "3" },
  );
  expect(truck.buttons.map((b) => b.id)).toEqual(["remove", "arrive", "save"]);
  const here = dockSheet(
    APPTS,
    ORDERS,
    { id: "a3", dock: "d2", start: 3 },
    { carrier: "x", ref: "", span: "2" },
  );
  expect(here.buttons.map((b) => b.id)).toEqual(["remove", "done", "save"]);
  const gone = dockSheet(
    APPTS,
    ORDERS,
    { id: "a1", dock: "d1", start: 1 },
    { carrier: "x", ref: "", span: "2" },
  );
  expect(gone.buttons.map((b) => b.id)).toEqual(["remove", "save"]);
});

test("warehouse: a pick list is shown if it exists, else the first one", () => {
  expect(pickShown({ a: [], b: [] }, "b")).toBe("b");
  expect(pickShown({ a: [], b: [] }, "zz")).toBe("a");
  expect(pickShown({}, "a")).toBe("");
});

test("warehouse: a place shows what it holds", () => {
  const stock = totals(LOCATIONS);
  const full = LOCATIONS.find((l) => l.qty > 0)!;
  const row = locationRow(full, stock, MINIMUMS)[0];
  expect(row.name).toBe(full.code);
  expect(row.actions.map((a) => a.id)).toEqual(["count", "clear"]);
  const empty = LOCATIONS.find((l) => l.qty === 0)!;
  const e = locationRow(empty, stock, MINIMUMS)[0];
  expect(e.status).toBe("Empty");
  expect(e.actions).toEqual([]);
  expect(locationRow(undefined, stock, MINIMUMS)).toEqual([]);
  const low = alertsOf(LOCATIONS, MINIMUMS, [])[0];
  expect(alertRow(low).actions[0].label).toMatch(/^Order \d+$/);
  expect(alertRow({ ...low, onOrder: 10 }).actions[0].disabled).toBe(true);
});

test("warehouse: the views agree with the data", () => {
  const core = {
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
    groups: [],
  };
  const v = derive(core);
  expect(v.stats[2].value).toBe("3");
  expect(v.stats[3].value).toBe("6");
  expect(v.space.max).toBe(LOCATIONS.length);
  expect(v.zones).toHaveLength(4);
  expect(v.zoneMeters).toHaveLength(4);
  expect(v.pickTitle).toBe("Pick list OUT-2216");
  expect(v.pickProgress.done).toBe(1);
  expect(v.pickReady).toBe(false);
  expect(v.pickNext).not.toBe("");
  expect(v.alertRows).toHaveLength(3);
  expect(v.alertRows[0].status).toBe("Out of stock");
  expect(v.dockRows).toHaveLength(6);
  expect(v.trucks.map((t) => t.name)).toContain("Eurotrans");
  expect(v.trucks.find((t) => t.name === "Eurotrans")?.status).toBe("Late");
  const zone = derive({ ...core, zoneFilter: "C" });
  expect(zone.zones.map((z) => z.id)).toEqual(["C"]);
  const none = derive({ ...core, picks: {}, pickId: "" });
  expect(none.pickFilters).toEqual([]);
  expect(none.pickTitle).toBe("No pick list");
  const done = derive({ ...core, moveFilter: "in" });
  expect(done.moveRows).toHaveLength(3);
  const search = derive({ ...core, moveQuery: "ola" });
  expect(search.moveRows).toHaveLength(3);
  expect(search.moveFooter).toBe("3 of 9 movements");
});
