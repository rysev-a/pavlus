import { expect, test } from "vitest";
import {
  isoOf,
  longDate,
  monthCells,
  shiftMonth,
  titleOf,
} from "../lib/calendar.ts";
import { areaOf, barsOf } from "../pages/chart/chart.ts";
import { derive } from "../pages/data-table/data-table.ts";
import { filter } from "../pages/command/command.ts";
import { itemsOf } from "../pages/pagination/pagination.ts";
import { stack, type Toast } from "../pages/sonner/sonner.ts";
import { entries, navOf } from "../registry.ts";

test("the grid of a month starts on a Monday and has every day", () => {
  // November 2026 starts on a Sunday: six blanks, then 30 days.
  const cells = monthCells({ year: 2026, month: 10 });
  expect(cells.filter((c) => c.day === 0)).toHaveLength(6);
  expect(cells.filter((c) => c.day > 0)).toHaveLength(30);
  expect(cells[6]).toEqual({ key: "2026-11-01", day: 1, iso: "2026-11-01" });
  // February of a leap year
  expect(
    monthCells({ year: 2028, month: 1 }).filter((c) => c.day),
  ).toHaveLength(29);
  expect(new Set(cells.map((c) => c.key)).size).toBe(cells.length);
});

test("months shift across the year and are written out", () => {
  expect(shiftMonth({ year: 2026, month: 11 }, 1)).toEqual({
    year: 2027,
    month: 0,
  });
  expect(shiftMonth({ year: 2026, month: 0 }, -1)).toEqual({
    year: 2025,
    month: 11,
  });
  expect(shiftMonth({ year: 2026, month: 5 }, 0)).toEqual({
    year: 2026,
    month: 5,
  });
  expect(titleOf({ year: 2026, month: 10 })).toBe("November 2026");
  expect(isoOf(2026, 10, 3)).toBe("2026-11-03");
  expect(longDate("2026-11-03")).toBe("November 3, 2026");
});

test("pagination keeps the ends and the neighbours, with gaps between", () => {
  const shape = (page: number, pages: number) =>
    itemsOf(page, pages).map((i) => (i.gap ? "…" : String(i.n)));
  expect(shape(5, 10)).toEqual(["1", "…", "4", "5", "6", "…", "10"]);
  expect(shape(1, 10)).toEqual(["1", "2", "…", "10"]);
  expect(shape(10, 10)).toEqual(["1", "…", "9", "10"]);
  expect(shape(2, 3)).toEqual(["1", "2", "3"]);
});

test("the data table filters, sorts, pages and selects", () => {
  const base = {
    query: "",
    sortKey: "" as const,
    sortDir: "asc" as const,
    page: 1,
    selected: [],
  };
  const first = derive(base);
  expect(first.total).toBe(12);
  expect(first.pages).toBe(3);
  expect(first.visible).toHaveLength(5);

  const byAmount = derive({ ...base, sortKey: "amount", sortDir: "desc" });
  expect(byAmount.visible[0].name).toBe("Dmitri Volkov");

  const found = derive({ ...base, query: "ANN@" });
  expect(found.visible.map((r) => r.name)).toEqual(["Ann Lee"]);
  expect(found.pages).toBe(1);

  // a page past the end is the last page
  expect(derive({ ...base, page: 99 }).page).toBe(3);

  const picked = derive({ ...base, selected: [1, 2, 3, 4, 5] });
  expect(picked.allSelected).toBe(true);
  expect(picked.selectedCount).toBe(5);
  expect(derive({ ...base, selected: [1] }).allSelected).toBe(false);
});

test("the command palette drops the groups with no match", () => {
  expect(filter("")).toHaveLength(2);
  expect(filter("mail").map((g) => g.heading)).toEqual(["Settings"]);
  expect(filter("zzz")).toEqual([]);
});

test("charts scale to the tallest value", () => {
  const bars = barsOf("revenue");
  expect(Math.max(...bars.map((b) => b.height))).toBe(100);
  expect(bars).toHaveLength(6);
  const area = areaOf(bars);
  expect(area.startsWith("polygon(0% 100%,")).toBe(true);
  expect(area.endsWith("100% 100%)")).toBe(true);
});

test("a stack of toasts keeps three, newest in front", () => {
  const toast = (id: number): Toast => ({
    id,
    kind: "default",
    title: "t",
    description: "d",
    index: 0,
    offset: 0,
  });
  const s = stack([toast(4), toast(3), toast(2), toast(1)]);
  expect(s.map((t) => [t.id, t.index, t.offset])).toEqual([
    [4, 0, 0],
    [3, 1, 72],
    [2, 2, 144],
  ]);
});

test("the sidebar groups every entry once, in order", () => {
  const nav = navOf(entries);
  expect(nav.map((g) => g.title)).toEqual([
    "Actions",
    "Forms",
    "Data display",
    "Feedback",
    "Navigation",
    "Overlays",
    "Layout",
  ]);
  expect(nav.flatMap((g) => g.items)).toHaveLength(entries.length);
  expect(new Set(entries.map((e) => e.slug)).size).toBe(entries.length);
});
