import { expect, test } from "vitest";
import { entry } from "../blocks/catalog-editor/catalog.ts";
import type { TableState } from "../blocks/floor-plan/floor.ts";
import {
  addSold,
  byGroup,
  defaultGuests,
  hourBars,
  lateBy,
  linesTotal,
  MENU,
  menuPasses,
  minuteOf,
  minuteText,
  newTicket,
  ORDER_TEMPLATES,
  reservationRow,
  RESERVATIONS,
  seatedFor,
  suggestTable,
  TABLE_STATES,
  TABLES,
  tableActions,
  tablesFor,
  ticketLines,
  topDishes,
  wallMinute,
  wallText,
} from "../templates/restaurant-admin/restaurant.ts";
import {
  derive,
  openChecks,
  reservationOf,
  reservationSheet,
  takenToday,
  validateReservation,
} from "../templates/restaurant-admin/restaurant-admin.ts";
import {
  SEED_CHECKS,
  SEED_TICKETS,
  SOLD,
} from "../templates/restaurant-admin/restaurant.ts";

const core = (over = {}) => ({
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
  groups: [],
  ...over,
});

test("restaurant: the service clock starts at 19:05 and runs on seconds", () => {
  expect(wallText(0)).toBe("19:05");
  expect(wallText(59)).toBe("19:05");
  expect(wallText(60)).toBe("19:06");
  expect(wallText(3600)).toBe("20:05");
  expect(wallMinute(120)).toBe(19 * 60 + 7);
  expect(minuteOf("20:30")).toBe(1230);
  expect(minuteText(1230)).toBe("20:30");
  expect(minuteText(minuteOf("07:05"))).toBe("07:05");
});

test("restaurant: the buttons of a table depend on its status", () => {
  expect(tableActions("free").map((a) => a.label)).toEqual(["Seat guests"]);
  expect(tableActions("seated").map((a) => a.id)).toEqual(["next", "clear"]);
  expect(tableActions("ordered")[0].label).toBe("Bring the bill");
  expect(tableActions("paying").map((a) => a.id)).toEqual(["next"]);
  expect(defaultGuests(TABLES[0])).toBe(2);
  expect(defaultGuests(TABLES.find((t) => t.seats === 8)!)).toBe(7);
});

test("restaurant: a ticket leaves out what is sold out and is never empty", () => {
  const off = MENU.map((e) => (e.id === "steak" ? { ...e, on: false } : e));
  const lines = ticketLines(off, [
    ["steak", 1, ""],
    ["pizza", 2, "extra basil"],
  ]);
  expect(lines).toEqual([
    { qty: 2, name: "Margherita pizza", note: "extra basil" },
  ]);
  const none = MENU.map((e, i) => ({ ...e, on: i < 3 }));
  const fallback = ticketLines(none, [["steak", 1, ""]]);
  expect(fallback).toHaveLength(2);
  expect(fallback[0].name).toBe("Bruschetta");
});

test("restaurant: what a ticket costs comes from the menu prices", () => {
  const menu = [
    entry("a", "x", "Soup", "Starters", 7.5),
    entry("b", "y", "Tea", "Drinks", 3.25),
  ];
  expect(
    linesTotal(menu, [
      { qty: 2, name: "Soup", note: "" },
      { qty: 3, name: "Tea", note: "" },
      { qty: 1, name: "Unknown", note: "" },
    ]),
  ).toBe(24.75);
  const t = newTicket(MENU, 3, TABLES[0], "Ana", 125);
  expect(t.id).toBe("o53");
  expect(t.title).toBe("Table 1");
  expect(t.placedAt).toBe(125);
  expect(t.stage).toBe("new");
  expect(
    newTicket(MENU, ORDER_TEMPLATES.length, TABLES[0], "Ana", 0).lines,
  ).toEqual(newTicket(MENU, 0, TABLES[0], "Ana", 0).lines);
});

test("restaurant: tables for a party are free, big enough, smallest first", () => {
  const fits = tablesFor(TABLES, TABLE_STATES, 3);
  expect(fits.every((t) => t.seats >= 3)).toBe(true);
  expect(fits.map((t) => t.seats)).toEqual(
    [...fits.map((t) => t.seats)].sort((a, b) => a - b),
  );
  expect(fits.map((t) => t.id)).not.toContain("t9");
  expect(tablesFor(TABLES, TABLE_STATES, 20)).toEqual([]);
});

test("restaurant: the table offered is the one picked while it is still fine", () => {
  const best = suggestTable(TABLES, TABLE_STATES, 4, "");
  expect(best).toBe("t8");
  expect(suggestTable(TABLES, TABLE_STATES, 4, "t12")).toBe("t12");
  expect(suggestTable(TABLES, TABLE_STATES, 4, "t9")).toBe("t8");
  expect(suggestTable(TABLES, TABLE_STATES, 20, "")).toBe("");
});

test("restaurant: a reservation is late only after its time", () => {
  const r = RESERVATIONS.find((x) => x.id === "r2")!;
  expect(lateBy(r, minuteOf("19:20"))).toBe(0);
  expect(lateBy(r, minuteOf("19:45"))).toBe(15);
  expect(lateBy({ ...r, status: "seated" }, minuteOf("23:00"))).toBe(0);
  const row = reservationRow(r, {
    defs: TABLES,
    states: TABLE_STATES,
    picked: "",
    nowMinute: minuteOf("19:45"),
  });
  expect(row.status).toBe("15 min late");
  expect(row.tone).toBe("warning");
  expect(row.choose?.options.some((o) => o.selected)).toBe(true);
  expect(row.actions.map((a) => a.id)).toEqual(["seat", "cancel"]);
  const full: TableState[] = TABLE_STATES.map((s) => ({
    ...s,
    status: "seated",
  }));
  const none = reservationRow(r, {
    defs: TABLES,
    states: full,
    picked: "",
    nowMinute: 0,
  });
  expect(none.actions[0].disabled).toBe(true);
  const seated = reservationRow(RESERVATIONS[0], {
    defs: TABLES,
    states: TABLE_STATES,
    picked: "",
    nowMinute: 0,
  });
  expect(seated.choose).toBeNull();
  expect(seated.actions).toEqual([]);
});

test("restaurant: sales by hour grow in the current hour only", () => {
  const base = hourBars(0, 19);
  const live = hourBars(500, 19);
  const at = (bars: typeof base, id: string) => bars.find((b) => b.id === id)!;
  expect(at(base, "19").value).toBe("760");
  expect(at(live, "19").value).toBe("1260");
  expect(at(live, "18").value).toBe(at(base, "18").value);
  expect(at(base, "20").value).toBe("");
});

test("restaurant: best sellers, groups and the sold counts", () => {
  const top = topDishes(MENU, SOLD, 3);
  expect(top.map((t) => t.id)).toEqual(["wine", "pizza", "espresso"]);
  expect(top[0].pct).toBe(100);
  const groups = byGroup(MENU, SOLD);
  expect(groups.map((g) => g.group)).toEqual([
    "Starters",
    "Mains",
    "Desserts",
    "Drinks",
  ]);
  expect(groups.reduce((n, g) => n + g.pct, 0)).toBeGreaterThanOrEqual(99);
  const sold = addSold(MENU, SOLD, [{ qty: 3, name: "Espresso", note: "" }]);
  expect(sold.espresso).toBe(SOLD.espresso + 3);
  expect(SOLD.espresso).toBe(33);
  expect(menuPasses(MENU[7], "off")).toBe(true);
  expect(menuPasses(MENU[0], "starters")).toBe(true);
});

test("restaurant: how long a table has been taken", () => {
  expect(seatedFor({ id: "a", status: "free", guests: 0, since: 0 }, 100)).toBe(
    "-",
  );
  expect(
    seatedFor({ id: "a", status: "seated", guests: 2, since: -1200 }, 0),
  ).toBe("20 min");
  expect(
    seatedFor({ id: "a", status: "paying", guests: 2, since: -4500 }, 0),
  ).toBe("1 h 15 min");
});

test("restaurant: the new reservation form checks the name and the party", () => {
  expect(
    validateReservation({ name: "", party: "2", at: "20:00", note: "" }).name,
  ).toBeTruthy();
  expect(
    validateReservation({ name: "Kim", party: "0", at: "20:00", note: "" })
      .party,
  ).toBeTruthy();
  expect(
    validateReservation({ name: "Kim", party: "13", at: "20:00", note: "" })
      .party,
  ).toBeTruthy();
  expect(
    validateReservation({ name: "Kim", party: "2.5", at: "20:00", note: "" })
      .party,
  ).toBeTruthy();
  expect(
    validateReservation({ name: "Kim", party: "12", at: "20:00", note: "" }),
  ).toEqual({});
  const r = reservationOf(
    { name: " Kim ", party: "4", at: "20:15", note: " cake " },
    "r10",
  );
  expect(r).toMatchObject({
    name: "Kim",
    party: 4,
    at: 1215,
    note: "cake",
    status: "booked",
  });
  expect(
    reservationSheet(
      { name: "", party: "2", at: "20:00", note: "" },
      { name: "x" },
    ).fields[0].error,
  ).toBe("x");
  expect(
    reservationSheet({ name: "", party: "2", at: "20:00", note: "" }, {}, false)
      .open,
  ).toBe(false);
});

test("restaurant: everything worked out from the core agrees with itself", () => {
  const v = derive(core());
  expect(v.tables).toHaveLength(TABLES.length);
  expect(v.legend.reduce((n, l) => n + l.count, 0)).toBe(TABLES.length);
  expect(v.seatMeter.value).toBe(v.seatMeter.max - v.seatMeter.left);
  expect(v.tableRows[0].name).toBe("Table 4");
  expect(v.board.map((c) => c.count)).toEqual([1, 2, 1, 1]);
  expect(takenToday(0)).toBe(4790);
  expect(openChecks(SEED_CHECKS)).toBe(563);
  expect(v.floorStats[3].value).toBe("$563");
  expect(v.groups).toEqual([]);
  expect(v.subtitle).toContain("19:05");
});

test("restaurant: sales, covers and the menu follow what happens", () => {
  const a = derive(core());
  const b = derive(core({ live: 200, liveCovers: 4, clock: 3600 }));
  expect(b.salesStats[0].value).toBe("$4,990");
  expect(a.salesStats[0].value).toBe("$4,790");
  expect(b.salesStats[1].value).toBe("100");
  expect(b.subtitle).toContain("20:05");
  const off = derive(
    core({
      menu: MENU.map((e) => (e.id === "pizza" ? { ...e, on: false } : e)),
      menuFilter: "off",
    }),
  );
  expect(off.menuRows.map((r) => r.id).sort()).toEqual(["bass", "pizza"]);
  expect(off.menuFilters.find((f) => f.id === "off")?.count).toBe(2);
  const q = derive(core({ menuQuery: "risotto" }));
  expect(q.menuRows).toHaveLength(1);
});

test("restaurant: reservations are listed by time and counted by status", () => {
  const v = derive(core());
  expect(v.resRows[0].name).toContain("Kim");
  expect(v.resFilters.find((f) => f.id === "booked")?.count).toBe(7);
  const seated = derive(core({ resFilter: "seated" }));
  expect(seated.resRows).toHaveLength(1);
});
