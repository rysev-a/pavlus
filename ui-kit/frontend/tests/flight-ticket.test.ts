import { expect, test } from "vitest";
import {
  QR_SIZE,
  TODAY,
  barsOf,
  cellsOf,
  clock,
  dateLabel,
  distanceKm,
  durationLabel,
  flightsFor,
  cityOf,
  initial,
  money,
  nameError,
  referenceOf,
  resizeNames,
  stepsOf,
  ticketFor,
  validateNames,
  validateSearch,
  type SearchForm,
} from "../blocks/flight-ticket/flight-ticket.ts";

const form: SearchForm = {
  from: "JFK",
  to: "LHR",
  depart: "2026-12-10",
  ret: "2026-12-17",
  passengers: 2,
  cabin: "economy",
};

test("small formatters", () => {
  expect(clock(6 * 60 + 5)).toBe("06:05");
  expect(clock(25 * 60)).toBe("01:00");
  expect(durationLabel(455)).toBe("7h 35m");
  expect(money(1234567)).toBe("$1,234,567");
  expect(money(980)).toBe("$980");
  expect(dateLabel("2026-12-10")).toBe("Thu, 10 Dec 2026");
  expect(dateLabel("")).toBe("");
});

test("distances are plausible", () => {
  const km = distanceKm(cityOf("JFK"), cityOf("LHR"));
  expect(km).toBeGreaterThan(5400);
  expect(km).toBeLessThan(5700);
  expect(distanceKm(cityOf("JFK"), cityOf("JFK"))).toBe(0);
});

test("the flights are a pure function of the search", () => {
  const a = flightsFor("JFK", "LHR", "2026-12-10", 2, "economy");
  expect(a).toEqual(flightsFor("JFK", "LHR", "2026-12-10", 2, "economy"));
  expect(a).toHaveLength(4);
  expect(a[0].stops).toBe(0);
  expect(new Set(a.map((f) => f.id)).size).toBe(4);
  expect(
    flightsFor("JFK", "SYD", "2026-12-10", 1, "economy")[0].duration,
  ).toBeGreaterThan(a[0].duration);
  for (const f of a) {
    expect(f.depart).toMatch(/^\d\d:\d\d$/);
    expect(f.arrive).toMatch(/^\d\d:\d\d$/);
    expect(f.total).toBe(f.unit * 2);
  }
});

test("price follows passengers and cabin", () => {
  const one = flightsFor("JFK", "LHR", "2026-12-10", 1, "economy");
  const four = flightsFor("JFK", "LHR", "2026-12-10", 4, "economy");
  const biz = flightsFor("JFK", "LHR", "2026-12-10", 1, "business");
  expect(four[1].total).toBe(one[1].unit * 4);
  expect(biz[1].unit).toBeGreaterThan(one[1].unit * 2);
  expect(biz[1].unit).toBeLessThan(one[1].unit * 3);
  expect(biz[1].depart).toBe(one[1].depart);
});

test("the search is validated", () => {
  expect(validateSearch(form)).toEqual({});
  expect(validateSearch({ ...form, to: "JFK" }).to).toBeDefined();
  expect(validateSearch({ ...form, ret: "2026-12-09" }).ret).toBeDefined();
  expect(validateSearch({ ...form, ret: "2026-12-10" })).toEqual({});
  expect(validateSearch({ ...form, depart: "" }).depart).toBeDefined();
  expect(
    validateSearch({ ...form, depart: "2026-01-01", ret: "2026-02-01" }).depart,
  ).toMatch(/past/);
  expect(validateSearch({ ...form, depart: TODAY, ret: TODAY })).toEqual({});
  expect(validateSearch({ ...form, passengers: 7 }).passengers).toBeDefined();
});

test("passenger names", () => {
  expect(nameError("Ann Lee")).toBe("");
  expect(nameError(" Ann ")).not.toBe("");
  expect(validateNames(["Ann Lee", "", "Bo"])).toEqual({
    "1": expect.any(String),
    "2": expect.any(String),
  });
  expect(resizeNames(["Ann Lee"], 3)).toEqual(["Ann Lee", "", ""]);
  expect(resizeNames(["Ann Lee", "Bo Li", "Cy Ng"], 2)).toEqual([
    "Ann Lee",
    "Bo Li",
  ]);
});

test("the ticket is deterministic and complete", () => {
  const flight = flightsFor("JFK", "LHR", "2026-12-10", 2, "economy")[1];
  const names = ["Ann Lee", "Bo Li"];
  const t = ticketFor(form, flight, names);
  expect(t).toEqual(ticketFor(form, flight, names));
  expect(t.reference).toMatch(/^[0-9A-Z]{6}$/);
  expect(t.reference).toBe(referenceOf(form, flight, names));
  expect(t.reference).not.toBe(referenceOf(form, flight, ["Ann Lee", "Cy Ng"]));
  expect(t.seats.map((s) => s.name)).toEqual(["ANN LEE", "BO LI"]);
  expect(t.seats[0].seat).toMatch(/^\d+[A-F]$/);
  expect(t.fromCity.code).toBe("JFK");
  expect(t.departDate).toBe("Thu, 10 Dec 2026");
  expect(t.returnDate).toBe("Thu, 17 Dec 2026");
  expect(t.boarding).toMatch(/^\d\d:\d\d$/);
  expect(t.bars).toHaveLength(44);
  expect(t.cells).toHaveLength(QR_SIZE * QR_SIZE);
});

test("barcode and QR block come from the reference", () => {
  expect(barsOf("ABC123")).toEqual(barsOf("ABC123"));
  expect(barsOf("ABC123")).not.toEqual(barsOf("ABC124"));
  expect(barsOf("ABC123").every((b) => b.w >= 1 && b.w <= 4)).toBe(true);
  const cells = cellsOf("ABC123");
  expect(cells[0].on).toBe(false); // the corner is left to the finder
  expect(cells.some((c) => c.on)).toBe(true);
});

test("the stepper marks done, current and todo", () => {
  expect(stepsOf("details").map((s) => s.state)).toEqual([
    "done",
    "done",
    "current",
    "todo",
  ]);
  expect(initial.steps[0].state).toBe("current");
});
