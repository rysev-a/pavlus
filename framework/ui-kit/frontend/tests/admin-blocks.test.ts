import { expect, test } from "vitest";
import {
  clampPct,
  initials,
  loadTone,
  money,
  type NavGroup,
  share,
  titleOf,
  withBadge,
} from "../blocks/admin-shell/shell.ts";
import { bars, card, change } from "../blocks/stat-cards/cards.ts";
import { columns } from "../blocks/bar-chart/chart.ts";
import {
  action,
  columnsOf,
  meter,
  pill,
  rowOf,
  sortBy,
  text,
  toggleSort,
} from "../blocks/data-grid/grid.ts";
import {
  type Booking,
  dayLabel,
  daysFrom,
  freeNights,
  isFree,
  layoutRoom,
  marksOf,
  nextBookingId,
  occupancy,
  overlaps,
} from "../blocks/booking-grid/bookings.ts";
import {
  boardOf,
  moveTask,
  targetColumn,
  type Task,
} from "../blocks/kanban-board/board.ts";
import {
  append,
  clearLines,
  clock,
  deriveLogs,
  filterLines,
  initialLogs,
  KEEP,
  levelAt,
  lineAt,
  mix,
  tick,
  toggleFollow,
  toggleLevel,
  togglePause,
} from "../blocks/log-viewer/logs.ts";
import { choice, loadMeter, statusRow } from "../blocks/status-list/rows.ts";
import { item } from "../blocks/progress-list/items.ts";
import {
  field,
  isValid,
  positive,
  selectField,
  valuesOf,
  withErrors,
  withValue,
} from "../blocks/record-sheet/sheet.ts";
import { applyFilter, filtersOf } from "../blocks/list-filter/filters.ts";
import {
  pctOf,
  place,
  timelineRows,
  weeksFrom,
} from "../blocks/gantt-timeline/timeline.ts";

test("shell helpers: titles, badges, money, shares, initials", () => {
  const groups: NavGroup[] = [
    {
      title: "A",
      items: [
        { id: "x", label: "Ex", icon: "i" },
        { id: "y", label: "Why", icon: "i" },
      ],
    },
  ];
  expect(titleOf(groups, "y")).toBe("Why");
  expect(titleOf(groups, "nope")).toBe("");
  const next = withBadge(groups, "x", "3");
  expect(next[0].items[0].badge).toBe("3");
  expect(groups[0].items[0].badge).toBeUndefined();
  expect(money(1234.5)).toBe("$1,234.50");
  expect(money(-12)).toBe("-$12.00");
  expect(money(0)).toBe("$0.00");
  expect(clampPct(140)).toBe(100);
  expect(clampPct(-3)).toBe(0);
  expect(share(1, 3)).toBe(33);
  expect(share(1, 0)).toBe(0);
  expect(loadTone(40)).toBe("success");
  expect(loadTone(80)).toBe("warning");
  expect(loadTone(95)).toBe("destructive");
  expect(initials("Ann Marie Lee")).toBe("AM");
});

test("stat cards: bars are scaled, changes are written", () => {
  const b = bars([10, 20, 40]);
  expect(b.map((x) => x.h)).toEqual([25, 50, 100]);
  expect(b[2].last).toBe(true);
  expect(bars([0, 0]).every((x) => x.h === 8)).toBe(true);
  expect(change(110, 100)).toEqual({ delta: "+10%", trend: "up" });
  expect(change(90, 100)).toEqual({ delta: "-10%", trend: "down" });
  expect(change(100, 100)).toEqual({ delta: "0%", trend: "flat" });
  expect(change(5, 0)).toEqual({ delta: "", trend: "flat" });
  const c = card("a", "A", "1", { series: [1, 2] });
  expect(c.bars).toHaveLength(2);
  expect(card("b", "B", "2").bars).toEqual([]);
});

test("bar chart: columns are scaled to the maximum", () => {
  const cols = columns([
    { id: "a", label: "A", value: 50 },
    { id: "b", label: "B", value: 100, show: true },
    { id: "c", label: "C", value: 0 },
  ]);
  expect(cols.map((c) => c.h)).toEqual([50, 100, 2]);
  expect(cols[1].value).toBe("100");
  expect(cols[0].value).toBe("");
  expect(columns([{ id: "a", label: "A", value: 5 }], 10, "%")[0].tip).toBe(
    "A: 5%",
  );
});

test("data grid: sorting toggles, rows follow the columns", () => {
  expect(toggleSort(null, "a")).toEqual({ key: "a", dir: "asc" });
  expect(toggleSort({ key: "a", dir: "asc" }, "a")).toEqual({
    key: "a",
    dir: "desc",
  });
  expect(toggleSort({ key: "a", dir: "desc" }, "b")).toEqual({
    key: "b",
    dir: "asc",
  });
  const list = [
    { n: "b", v: 2 },
    { n: "a", v: 10 },
  ];
  const val = (x: { n: string; v: number }, k: string) =>
    k === "v" ? x.v : x.n;
  expect(sortBy(list, { key: "v", dir: "asc" }, val)[0].n).toBe("b");
  expect(sortBy(list, { key: "v", dir: "desc" }, val)[0].n).toBe("a");
  expect(sortBy(list, { key: "n", dir: "asc" }, val)[0].n).toBe("a");
  expect(sortBy(list, null, val)).toBe(list);
  const defs = [
    { key: "n", label: "N", sortable: true },
    { key: "v", label: "V", align: "right" as const },
  ];
  const cols = columnsOf(defs, { key: "n", dir: "desc" });
  expect(cols[0]).toMatchObject({ sorted: true, dir: "desc", sortable: true });
  expect(cols[1]).toMatchObject({ sorted: false, dir: "", align: "right" });
  const row = rowOf(defs, "r1", { v: meter(40, "success", "40%") }, [
    action("go", "Go"),
  ]);
  expect(row.cells).toHaveLength(2);
  expect(row.cells[0]).toMatchObject({ kind: "text", text: "" });
  expect(row.cells[1]).toMatchObject({ kind: "meter", align: "right" });
  expect(pill("ok", "success").tone).toBe("success");
  expect(text(5).text).toBe("5");
});

const room = (id: string, bs: Booking[]) => layoutRoom(id, bs, 7);
const bk = (
  id: string,
  from: number,
  nights: number,
  roomId = "1",
): Booking => ({
  id,
  room: roomId,
  guest: id,
  from,
  nights,
  status: "expected",
  note: "",
});

test("booking grid: days, overlaps and the layout of a room", () => {
  const days = daysFrom(2026, 11, 1, 10, 2);
  expect(days[0]).toMatchObject({ dow: "Sun", num: 1, weekend: true });
  expect(days[2].today).toBe(true);
  expect(days[9]).toMatchObject({ num: 10, dow: "Tue" });
  expect(daysFrom(2026, 11, 29, 4, 0).map((d) => d.num)).toEqual([
    29, 30, 1, 2,
  ]);
  expect(dayLabel(days, 2)).toBe("Tue 3 Nov");
  expect(marksOf(days)[2]).toBe("today");
  expect(marksOf(days)[0]).toBe("weekend");

  // the day of leaving is free
  expect(overlaps(bk("a", 0, 2), bk("b", 2, 2))).toBe(false);
  expect(overlaps(bk("a", 0, 3), bk("b", 2, 2))).toBe(true);

  const segs = room("1", [bk("b", 4, 2), bk("a", 1, 2)]);
  // free 0, booking a (1-2), free 3, booking b (4-5), free 6
  expect(segs.map((s) => [s.kind, s.day, s.span])).toEqual([
    ["free", 0, 1],
    ["booking", 1, 2],
    ["free", 3, 1],
    ["booking", 4, 2],
    ["free", 6, 1],
  ]);
  // every day of the grid is covered once
  expect(segs.reduce((n, s) => n + s.span, 0)).toBe(7);

  // clipped at both ends
  const clipped = room("1", [bk("x", -2, 4), bk("y", 5, 5)]);
  expect(clipped[0]).toMatchObject({
    kind: "booking",
    day: 0,
    span: 2,
    cutLeft: true,
  });
  expect(clipped[clipped.length - 1]).toMatchObject({
    kind: "booking",
    day: 5,
    span: 2,
    cutRight: true,
  });
  // a booking of another room or outside the grid is not drawn
  expect(
    room("1", [bk("o", 0, 3, "2"), bk("z", 9, 2)]).every(
      (s) => s.kind === "free",
    ),
  ).toBe(true);
});

test("booking grid: free nights, conflicts, ids and occupancy", () => {
  const list = [bk("b1", 2, 2), bk("b5", 6, 1), bk("c", 0, 7, "2")];
  expect(isFree(list, "1", 0, 2)).toBe(true);
  expect(isFree(list, "1", 1, 2)).toBe(false);
  expect(isFree(list, "1", 1, 2, "b1")).toBe(true);
  expect(freeNights(list, "1", 0, 5, 7)).toBe(2);
  expect(freeNights(list, "1", 2, 5, 7)).toBe(0);
  expect(freeNights(list, "1", 4, 5, 7)).toBe(2);
  expect(freeNights(list, "1", 5, 1, 7)).toBe(1);
  expect(nextBookingId(list)).toBe("b6");
  expect(nextBookingId([])).toBe("b1");
  expect(occupancy(list, 2, 2)).toBe(100);
  expect(occupancy(list, 2, 4)).toBe(50);
  expect(occupancy(list, 0, 4)).toBe(0);
});

test("kanban: a card moves one column and stops at the ends", () => {
  const cols = [
    { id: "a", title: "A" },
    { id: "b", title: "B" },
    { id: "c", title: "C" },
  ];
  expect(targetColumn(cols, "a", "right")).toBe("b");
  expect(targetColumn(cols, "a", "left")).toBe("a");
  expect(targetColumn(cols, "c", "right")).toBe("c");
  expect(targetColumn(cols, "zzz", "right")).toBe("zzz");
  const tasks: Task[] = [
    {
      id: "1",
      title: "T",
      column: "a",
      project: "P",
      who: "AL",
      due: "",
      tag: "x",
      tone: "info",
    },
    {
      id: "2",
      title: "U",
      column: "c",
      project: "P",
      who: "AL",
      due: "",
      tag: "x",
      tone: "info",
    },
  ];
  const moved = moveTask(tasks, cols, "1", "right");
  expect(moved[0].column).toBe("b");
  expect(tasks[0].column).toBe("a");
  const board = boardOf(cols, moved);
  expect(board.map((c) => c.count)).toEqual([0, 1, 1]);
  expect(board[1].cards[0]).toMatchObject({ canLeft: true, canRight: true });
  expect(board[0]).toMatchObject({ cards: [] });
  expect(board[2].cards[0]).toMatchObject({ canLeft: true, canRight: false });
});

test("logs: the generator is deterministic and the state machine is pure", () => {
  expect(mix(1)).toBe(mix(1));
  expect(mix(1)).not.toBe(mix(2));
  expect(lineAt(5)).toEqual(lineAt(5));
  expect(lineAt(5).id).toBe(5);
  expect(clock(14 * 3600 + 3 * 60 + 7)).toBe("14:03:07");
  expect(clock(86400 + 5)).toBe("00:00:05");
  const levels = Array.from({ length: 300 }, (_, i) => levelAt(i));
  expect(new Set(levels)).toEqual(new Set(["debug", "info", "warn", "error"]));
  expect(levels.filter((l) => l === "info").length).toBeGreaterThan(
    levels.filter((l) => l === "error").length,
  );

  const start = initialLogs(20);
  expect(start.lines).toHaveLength(20);
  const t1 = tick(start);
  expect(t1.lines.length).toBeGreaterThan(20);
  expect(t1.seq).toBe(t1.lines.length);
  expect(t1.lines[t1.lines.length - 1].id).toBe(t1.seq - 1);
  expect(tick(start)).toEqual(t1);
  // paused: nothing happens
  const p = togglePause(start);
  expect(p.paused).toBe(true);
  expect(tick(p)).toBe(p);

  // the list is capped
  const many = append(initialLogs(KEEP).lines, [
    lineAt(KEEP),
    lineAt(KEEP + 1),
  ]);
  expect(many).toHaveLength(KEEP);
  expect(many[many.length - 1].id).toBe(KEEP + 1);
});

test("logs: filters by level and text, follow freezes the pane", () => {
  const s = initialLogs(80);
  const errors = filterLines(s.lines, ["error"], "");
  expect(errors.every((l) => l.level === "error")).toBe(true);
  expect(errors.length).toBeGreaterThan(0);
  const one = s.lines.find((l) => l.source === "redis");
  expect(one).toBeTruthy();
  const redis = filterLines(
    s.lines,
    ["debug", "info", "warn", "error"],
    "REDIS",
  );
  expect(redis.length).toBeGreaterThan(0);
  expect(redis.every((l) => l.source === "redis")).toBe(true);

  // the last level cannot be switched off; the order of the levels is kept
  let lv = s;
  for (const l of ["debug", "info", "warn"] as const) lv = toggleLevel(lv, l);
  expect(lv.levels).toEqual(["error"]);
  expect(toggleLevel(lv, "error")).toBe(lv);
  expect(toggleLevel(lv, "info").levels).toEqual(["info", "error"]);

  // following: the newest line first; unfollowing freezes the view
  const view = deriveLogs(s);
  expect(view.rows[0].id).toBe(s.lines[s.lines.length - 1].id);
  expect(view.total).toBe(80);
  expect(view.chips.map((c) => c.count).reduce((a, b) => a + b, 0)).toBe(80);
  const frozen = toggleFollow(s);
  expect(frozen.following).toBe(false);
  const later = tick(tick(frozen));
  const v2 = deriveLogs(later);
  expect(v2.rows[0].id).toBe(frozen.frozenId);
  expect(v2.hidden).toBe(later.lines.length - 80);
  expect(v2.hidden).toBeGreaterThan(0);
  const back = toggleFollow(later);
  expect(deriveLogs(back).hidden).toBe(0);
  expect(deriveLogs(clearLines(s)).rows).toEqual([]);
});

test("status list and progress list rows", () => {
  expect(loadMeter("CPU", 95)).toMatchObject({
    tone: "destructive",
    text: "95%",
  });
  expect(loadMeter("Disk", 10, "10 GB").text).toBe("10 GB");
  const c = choice("Assign", ["Tom", "Ann"], "Ann");
  expect(c.options.map((o) => o.selected)).toEqual([false, false, true]);
  expect(choice("A", ["x"], "").options[0].selected).toBe(true);
  const row = statusRow("a", "A", "Ok", "success");
  expect(row).toMatchObject({
    meters: [],
    actions: [],
    choose: null,
    done: false,
  });
  expect(item("a", "A", 50, 200)).toMatchObject({
    pct: 25,
    text: "50 / 200",
    tone: "success",
  });
  expect(item("a", "A", 190, 200).tone).toBe("destructive");
  expect(item("a", "A", 5, 0).pct).toBe(0);
  expect(item("a", "A", 99, 100, { invert: true }).tone).toBe("success");
  expect(item("a", "A", 5, 100, { invert: true }).tone).toBe("destructive");
});

test("record sheet: values, errors and numbers", () => {
  const fields = [
    field("name", "Name", "Shirt"),
    field("price", "Price", 48, { kind: "number" }),
    selectField("status", "Status", "draft", [
      ["active", "Active"],
      ["draft", "Draft"],
    ]),
  ];
  expect(valuesOf(fields)).toEqual({
    name: "Shirt",
    price: "48",
    status: "draft",
  });
  const edited = withValue(fields, "status", "active");
  expect(edited[2].options.map((o) => o.selected)).toEqual([true, false]);
  expect(fields[2].options[1].selected).toBe(true);
  const bad = withErrors(edited, { price: "No" });
  expect(bad.map((f) => f.error)).toEqual(["", "No", ""]);
  expect(withValue(bad, "price", "5")[1].error).toBe("");
  expect(isValid({})).toBe(true);
  expect(isValid({ a: "x" })).toBe(false);
  expect(positive("12.5")).toBe(12.5);
  expect(positive("0")).toBeNull();
  expect(positive("0", true)).toBe(0);
  expect(positive("")).toBeNull();
  expect(positive("abc")).toBeNull();
  expect(positive("-1")).toBeNull();
});

test("filter bar: counts and the text query", () => {
  const items = [
    { n: "Ann", s: "new" },
    { n: "Bob", s: "packed" },
    { n: "Cy", s: "new" },
  ];
  const passes = (i: { s: string }, id: string) => i.s === id;
  const defs: [string, string][] = [
    ["all", "All"],
    ["new", "New"],
    ["packed", "Packed"],
  ];
  const f = filtersOf(defs, "new", items, passes);
  expect(f.map((x) => x.count)).toEqual([3, 2, 1]);
  expect(f.map((x) => x.active)).toEqual([false, true, false]);
  expect(applyFilter(items, "all", "", passes, (i) => i.n)).toHaveLength(3);
  expect(applyFilter(items, "new", "", passes, (i) => i.n)).toHaveLength(2);
  expect(applyFilter(items, "new", " an ", passes, (i) => i.n)).toEqual([
    items[0],
  ]);
  expect(applyFilter(items, "packed", "ann", passes, (i) => i.n)).toEqual([]);
});

test("gantt timeline: bars are placed on the scale", () => {
  expect(pctOf(14, 56)).toBe(25);
  expect(pctOf(-5, 56)).toBe(0);
  expect(pctOf(99, 56)).toBe(100);
  expect(place(0, 13, 56)).toEqual({ left: 0, width: 25 });
  expect(place(28, 55, 56)).toEqual({ left: 50, width: 50 });
  // a bar past the end shrinks to the minimum, not below
  expect(place(70, 80, 56).width).toBeGreaterThanOrEqual(1.2);
  const rows = timelineRows(
    [
      {
        id: "a",
        name: "A",
        sub: "",
        start: 0,
        end: 27,
        progress: 40,
        tone: "info",
        milestones: [{ at: 13, label: "M", done: true }],
      },
    ],
    56,
  );
  expect(rows[0]).toMatchObject({ left: 0, width: 50, pct: 40 });
  expect(rows[0].marks[0].left).toBeCloseTo(24.11, 1);
  const weeks = weeksFrom(2026, 10, 26, 56);
  expect(weeks).toHaveLength(8);
  expect(weeks[0].label).toBe("Oct 26");
  expect(weeks[1].label).toBe("Nov 2");
  expect(weeks.reduce((n, w) => n + w.width, 0)).toBeCloseTo(100);
});
