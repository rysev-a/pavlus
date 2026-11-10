import type { Effect } from "@pavlus/client";
import { expect, test } from "vitest";
import {
  addDays,
  cellClass,
  daysIn,
  describe as describeRange,
  emptyRange,
  monthView,
  pick,
  presetsOf,
} from "../lib/range.ts";
import {
  derive,
  RangeCalendar,
  type RangeState,
  stateOf,
  TODAY,
} from "../pages/range-calendar/range.ts";
import { initial } from "../pages/range-calendar/range-calendar.ts";

/** Applies the `store.set` effects of a handler to a copy of its state. */
function apply(state: RangeState, effects: Effect[]): RangeState {
  const next = { ...state } as Record<string, unknown>;
  for (const e of effects) {
    if (e.plugin === "store" && e.type === "set")
      next[e.path as string] = e.value;
  }
  return next as unknown as RangeState;
}

test("the first click starts a range, the second ends it, in either order", () => {
  const a = pick(emptyRange, "2026-11-10");
  expect(a).toEqual({ start: "2026-11-10", end: "" });
  expect(pick(a, "2026-11-17")).toEqual({
    start: "2026-11-10",
    end: "2026-11-17",
  });
  // an end before the start swaps them
  expect(pick(a, "2026-11-03")).toEqual({
    start: "2026-11-03",
    end: "2026-11-10",
  });
  // the same day is a one-day range
  expect(pick(a, "2026-11-10")).toEqual({
    start: "2026-11-10",
    end: "2026-11-10",
  });
  // a click on a complete range starts a new one
  expect(
    pick({ start: "2026-11-10", end: "2026-11-17" }, "2026-11-20"),
  ).toEqual({
    start: "2026-11-20",
    end: "",
  });
});

test("day arithmetic crosses months and years, and counts both ends", () => {
  expect(addDays("2026-11-30", 1)).toBe("2026-12-01");
  expect(addDays("2026-01-01", -1)).toBe("2025-12-31");
  expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
  expect(daysIn({ start: "2026-11-10", end: "2026-11-17" })).toBe(8);
  expect(daysIn({ start: "2026-11-10", end: "2026-11-10" })).toBe(1);
  expect(daysIn({ start: "2026-11-10", end: "" })).toBe(0);
  expect(daysIn({ start: "2026-12-30", end: "2027-01-02" })).toBe(4);
});

test("the quick ranges follow today, and a year boundary", () => {
  const p = Object.fromEntries(
    presetsOf("2026-11-03").map((x) => [x.id, x.range]),
  );
  expect(p.today).toEqual({ start: "2026-11-03", end: "2026-11-03" });
  expect(p["7"]).toEqual({ start: "2026-10-28", end: "2026-11-03" });
  expect(p["30"].start).toBe("2026-10-05");
  expect(p.month).toEqual({ start: "2026-11-01", end: "2026-11-30" });
  expect(p["last-month"]).toEqual({ start: "2026-10-01", end: "2026-10-31" });
  expect(
    presetsOf("2026-01-15").find((x) => x.id === "last-month")?.range,
  ).toEqual({
    start: "2025-12-01",
    end: "2025-12-31",
  });
});

test("the classes of a day: the ends, the days between, the preview, today", () => {
  const range = { start: "2026-11-10", end: "2026-11-17" };
  const cls = (iso: string, r = range, hover = "") =>
    cellClass(iso, r, hover, TODAY).split(" ");
  expect(cls("2026-11-10")).toEqual([
    "ui-calendar-day",
    "ui-calendar-day-selected",
    "ui-calendar-day-range-start",
  ]);
  expect(cls("2026-11-17")).toContain("ui-calendar-day-range-end");
  expect(cls("2026-11-12")).toContain("ui-calendar-day-in-range");
  expect(cls("2026-11-20")).toEqual(["ui-calendar-day"]);
  expect(cls("2026-11-03")).toContain("k-today");
  // a single-day range is just selected
  const one = { start: "2026-11-10", end: "2026-11-10" };
  expect(cls("2026-11-10", one)).toEqual([
    "ui-calendar-day",
    "ui-calendar-day-selected",
  ]);
  // a start only: the hover previews the days to it, forwards and backwards
  const half = { start: "2026-11-10", end: "" };
  expect(cls("2026-11-12", half, "2026-11-14")).toContain(
    "ui-calendar-day-preview",
  );
  expect(cls("2026-11-14", half, "2026-11-14")).toContain(
    "ui-calendar-day-preview-edge",
  );
  expect(cls("2026-11-08", half, "2026-11-06")).toContain(
    "ui-calendar-day-preview",
  );
  expect(cls("2026-11-15", half, "2026-11-14")).toEqual(["ui-calendar-day"]);
  // a complete range has no preview
  expect(cls("2026-11-19", range, "2026-11-21")).toEqual(["ui-calendar-day"]);
  expect(
    monthView({ year: 2026, month: 10 }, range, "", TODAY).cells.filter((c) =>
      c.cls.includes("in-range"),
    ),
  ).toHaveLength(6);
  expect(describeRange(emptyRange)).toBe("Pick a start date");
  expect(describeRange(range)).toBe(
    "November 10, 2026 – November 17, 2026 (8 days)",
  );
});

test("the calendar follows its clicks: range, hover, presets, months, clear", () => {
  const c = new RangeCalendar();
  let s = stateOf({
    month: { year: 2026, month: 10 },
    range: emptyRange,
    hover: "",
  });
  const send = (id: string, payload?: unknown) => {
    s = apply(
      s,
      (
        c as unknown as Record<string, (m: unknown, st: RangeState) => Effect[]>
      )[id]({ id, payload }, s),
    );
  };
  send("pick", "2026-11-12");
  expect(s.range).toEqual({ start: "2026-11-12", end: "" });
  expect(s.summary).toBe("November 12, 2026 – pick an end date");
  send("hover", "2026-11-15");
  expect(s.left.cells.some((x) => x.cls.includes("preview-edge"))).toBe(true);
  send("leave");
  expect(s.hover).toBe("");
  send("pick", "2026-11-18");
  expect(s.days).toBe(7);
  // with a complete range the hover does nothing
  expect(
    (c as unknown as { hover: (m: unknown, st: RangeState) => Effect[] }).hover(
      { id: "hover", payload: "2026-11-25" },
      s,
    ),
  ).toEqual([]);
  // months move by one and the right panel is the next
  send("next");
  expect([s.left.title, s.right.title]).toEqual([
    "December 2026",
    "January 2027",
  ]);
  send("prev");
  send("prev");
  expect([s.left.title, s.right.title]).toEqual([
    "October 2026",
    "November 2026",
  ]);
  // a preset sets the range, shows its month and is marked active
  send("preset", "last-month");
  expect(s.range).toEqual({ start: "2026-10-01", end: "2026-10-31" });
  expect(s.presets.find((p) => p.active)?.id).toBe("last-month");
  send("clear");
  expect(s.range).toEqual(emptyRange);
  expect(s.presets.some((p) => p.active)).toBe(false);
  // the popover closes when a range is complete, not after the first click
  s = { ...s, open: true };
  send("pick", "2026-10-02");
  expect(s.open).toBe(true);
  send("pick", "2026-10-05");
  expect(s.open).toBe(false);
  // the page's initial state is derived the same way
  expect(initial.main.summary).toContain("(8 days)");
  expect(
    derive({ month: initial.main.month, range: initial.main.range, hover: "" })
      .days,
  ).toBe(8);
});
