import { expect, test } from "vitest";
import {
  advance,
  averageWait,
  lanesOf,
  nextNumber,
  order,
  step,
  type Ticket,
  waited,
  waitLabel,
} from "../blocks/queue-board/queue.ts";
import {
  areaChart,
  lastChange,
  niceMax,
  short,
} from "../blocks/area-chart/area.ts";
import {
  clearMarks,
  markRest,
  type Pupil,
  rowsOf,
  setMark,
  summarize,
} from "../blocks/attendance-sheet/attendance.ts";
import {
  entry as logEntry,
  groupByDay,
  matching,
  prepend,
  tagsOf,
} from "../blocks/audit-log/log.ts";
import {
  enabled,
  type Flag,
  flagRows,
  optionsOf,
  setRollout,
  stateOf,
  toggleFlag,
} from "../blocks/flag-list/flags.ts";
import {
  columnAverages,
  columnsFrom,
  heatLevel,
  heatRow,
  heatSteps,
  retention,
} from "../blocks/heat-table/heat.ts";
import {
  buildGrid,
  col,
  collides,
  coverOf,
  entry,
  fill,
  slot,
  timeSlots,
  clock,
} from "../blocks/timetable-grid/timetable.ts";
import {
  bloodPressure,
  bmi,
  classify,
  DEFS,
  flagged,
  readings,
  toneOf,
  vital,
} from "../blocks/vitals-card/vitals.ts";

test("heat: levels run from 1 to 6, 0 is empty", () => {
  expect(heatLevel(null, 0, 100)).toBe(0);
  expect(heatLevel(0, 0, 100)).toBe(1);
  expect(heatLevel(100, 0, 100)).toBe(6);
  expect(heatLevel(50, 0, 100)).toBe(4);
  expect(heatLevel(-20, 0, 100)).toBe(1);
  expect(heatLevel(500, 0, 100)).toBe(6);
  expect(heatLevel(5, 10, 10)).toBe(6);
  expect(heatSteps()).toEqual([1, 2, 3, 4, 5, 6]);
});

test("heat: rows, retention and averages", () => {
  expect(retention(200, [200, 150, 90])).toEqual([100, 75, 45]);
  expect(retention(0, [1, 2])).toEqual([0, 0]);
  const cols = columnsFrom(["M0", "M1"]);
  const row = heatRow("a", "May", "10", [100, null], cols, {
    min: 0,
    max: 100,
    format: (v) => `${v}%`,
  });
  expect(row.cells.map((c) => c.level)).toEqual([6, 0]);
  expect(row.cells[0]).toMatchObject({ text: "100%", id: "a:c0" });
  expect(row.cells[1].tip).toBe("");
  expect(columnAverages([[100, 80], [100], [100, 60, 50]])).toEqual([
    100, 70, 50,
  ]);
  expect(columnAverages([[null], []])).toEqual([null]);
});

const cols = [col("a", "A"), col("b", "B", "", true)];
const slots = [
  slot("s1", "9:00"),
  slot("s2", "9:30"),
  slot("br", "", "", "Break"),
  slot("s3", "10:30"),
];

test("timetable: placement, spans, breaks", () => {
  const entries = [
    entry("e1", "a", "s1", "Maths", { span: 2 }),
    entry("e2", "b", "s2", "Art"),
  ];
  expect(coverOf(entries, slots, "a", 1)).toMatchObject({
    first: false,
    last: true,
  });
  expect(coverOf(entries, slots, "a", 2)).toBeNull();
  const rows = buildGrid(cols, slots, entries);
  expect(rows[0].cells.map((c) => c.kind)).toEqual(["entry", "empty"]);
  expect(rows[1].cells.map((c) => c.kind)).toEqual(["cont", "entry"]);
  expect(rows[2].isBreak).toBe(true);
  expect(rows[2].cells).toEqual([]);
  expect(rows[3].cells.every((c) => c.kind === "empty")).toBe(true);
  expect(rows[0].cells[1].today).toBe(true);
});

test("timetable: collisions and fill", () => {
  const entries = [entry("e1", "a", "s1", "Maths", { span: 2 })];
  expect(collides(entries, slots, "a", "s2", 1)).toBe(true);
  expect(collides(entries, slots, "a", "s2", 1, "e1")).toBe(false);
  expect(collides(entries, slots, "b", "s1", 2)).toBe(false);
  // runs over the break, or off the end
  expect(collides(entries, slots, "b", "s2", 2)).toBe(true);
  expect(collides(entries, slots, "b", "s3", 2)).toBe(true);
  expect(collides(entries, slots, "b", "nope", 1)).toBe(true);
  expect(fill(entries, cols, slots)).toEqual({ used: 2, total: 6, pct: 33 });
  expect(fill([], [], slots).pct).toBe(0);
  expect(timeSlots(540, 600, 30).map((s) => s.id)).toEqual(["09:00", "09:30"]);
  expect(clock(605)).toBe("10:05");
});

const pupils: Pupil[] = [
  { id: "1", name: "Ann Lee", mark: "present", note: "" },
  { id: "2", name: "Bo Chen", mark: "late", note: "" },
  { id: "3", name: "Cy Dunn", mark: "absent", note: "" },
  { id: "4", name: "Di Eve", mark: "", note: "" },
];

test("attendance: summary, rate and widths", () => {
  const s = summarize(pupils);
  expect(s).toMatchObject({
    total: 4,
    present: 1,
    late: 1,
    absent: 1,
    unmarked: 1,
  });
  expect(s.rate).toBe(67);
  expect(s.segs.map((x) => x.pct)).toEqual([25, 25, 25, 25]);
  expect(summarize([]).rate).toBe(0);
  expect(summarize([]).segs[0].pct).toBe(0);
  expect(rowsOf(pupils)[0].initials).toBe("AL");
  expect(rowsOf(pupils)[1].marks.find((m) => m.active)?.id).toBe("late");
});

test("attendance: marking toggles, the rest, clearing", () => {
  expect(setMark(pupils, "4", "late")[3].mark).toBe("late");
  expect(setMark(pupils, "1", "present")[0].mark).toBe("");
  expect(setMark(pupils, "1", "absent")[0].mark).toBe("absent");
  expect(pupils[3].mark).toBe("");
  const rest = markRest(pupils, "present");
  expect(rest.map((p) => p.mark)).toEqual([
    "present",
    "late",
    "absent",
    "present",
  ]);
  expect(clearMarks(pupils).every((p) => p.mark === "")).toBe(true);
});

const ticket = (n: number, over: Partial<Ticket> = {}): Ticket => ({
  id: `t${n}`,
  number: n,
  name: `P${n}`,
  reason: "",
  doctor: "Dr. Lee",
  arrived: 600 + n,
  status: "waiting",
  urgent: false,
  ...over,
});

test("queue: steps stop at the ends", () => {
  expect(step("waiting", "next")).toBe("called");
  expect(step("in", "next")).toBe("done");
  expect(step("done", "next")).toBe("done");
  expect(step("waiting", "back")).toBe("waiting");
  expect(step("called", "back")).toBe("waiting");
  const list = [ticket(1)];
  expect(advance(list, "t1")[0].status).toBe("called");
  expect(list[0].status).toBe("waiting");
});

test("queue: order, waits and lanes", () => {
  const list = [
    ticket(3),
    ticket(1, { arrived: 590 }),
    ticket(2, { urgent: true, arrived: 605 }),
    ticket(4, { status: "in" }),
    ticket(5, { status: "done" }),
  ];
  expect(order(list).map((t) => t.number)).toEqual([2, 1, 3, 4, 5]);
  expect(waited(600, 590)).toBe(0);
  expect(waitLabel(7)).toBe("7 min");
  expect(waitLabel(65)).toBe("1 h 05");
  const lanes = lanesOf(list, 620);
  expect(lanes.map((l) => l.count)).toEqual([3, 1, 1]);
  expect(lanes[0].items[0]).toMatchObject({
    ticket: "A002",
    urgent: true,
    wait: "15 min",
  });
  expect(lanes[1].items[0].actions.map((a) => a.label)).toEqual(["Finish"]);
  expect(lanes[2].items[0].actions).toEqual([]);
  expect(averageWait(list, 620)).toBe(21);
  expect(averageWait([], 620)).toBe(0);
  expect(nextNumber(list)).toBe(6);
  expect(nextNumber([])).toBe(1);
});

test("vitals: ranges, tones and the gauge", () => {
  expect(classify(70, 60, 100)).toBe("normal");
  expect(classify(59, 60, 100)).toBe("low");
  expect(classify(101, 60, 100)).toBe("high");
  expect(toneOf(80, 60, 100)).toBe("success");
  expect(toneOf(105, 60, 100)).toBe("warning");
  expect(toneOf(130, 60, 100)).toBe("destructive");
  const hr = vital(DEFS.hr, 90);
  expect(hr).toMatchObject({ state: "normal", flag: "Normal", value: "90" });
  expect(hr.pos).toBe(50);
  expect(vital(DEFS.hr, 300).pos).toBe(100);
  expect(vital(DEFS.temp, 38.4).state).toBe("high");
});

test("vitals: blood pressure takes the worse number; bmi; flags", () => {
  const bp = bloodPressure(150, 85);
  expect(bp.value).toBe("150/85");
  expect(bp.tone).toBe("destructive");
  expect(bloodPressure(118, 76).state).toBe("normal");
  expect(bmi(82, 178)).toBe(25.9);
  expect(bmi(70, 0)).toBe(0);
  const ok = readings({
    sys: 118,
    dia: 76,
    hr: 68,
    temp: 36.6,
    spo2: 98,
    rr: 15,
  });
  expect(flagged(ok)).toBe(0);
  const bad = readings({
    sys: 158,
    dia: 96,
    hr: 112,
    temp: 38.4,
    spo2: 93,
    rr: 22,
  });
  expect(flagged(bad)).toBe(5);
});

test("area chart: scale, points and polygons", () => {
  expect(niceMax(0)).toBe(1);
  expect(niceMax(66)).toBe(100);
  expect(niceMax(112900)).toBe(200000);
  expect(niceMax(18)).toBe(20);
  expect(niceMax(2.3)).toBe(2.5);
  expect(short(950)).toBe("950");
  expect(short(12400, "$")).toBe("$12.4k");
  expect(short(2_500_000)).toBe("2.5M");
  const a = areaChart([
    { id: "a", label: "A", value: 0 },
    { id: "b", label: "B", value: 50 },
    { id: "c", label: "C", value: 100 },
  ]);
  expect(a.max).toBe(100);
  expect(a.points.map((p) => p.y)).toEqual([0, 50, 100]);
  expect(a.points[0].x).toBe(3);
  expect(a.points[2].x).toBe(97);
  expect(a.points[1].width).toBe(47);
  expect(a.area.startsWith("polygon(3% 100%")).toBe(true);
  expect(a.area.endsWith("97% 100%)")).toBe(true);
  expect(a.ticks.map((t) => t.label)).toEqual(["0", "25", "50", "75", "100"]);
  const one = areaChart([{ id: "x", label: "X", value: 5 }]);
  expect(one.points[0]).toMatchObject({ x: 50, left: 0, width: 100 });
  expect(areaChart([]).points).toEqual([]);
  expect(
    lastChange([
      { id: "a", label: "", value: 80 },
      { id: "b", label: "", value: 100 },
    ]),
  ).toBe(25);
  expect(lastChange([])).toBe(0);
});

const flags: Flag[] = [
  {
    id: "a",
    name: "A",
    key: "a",
    desc: "",
    on: true,
    rollout: 25,
    env: "prod",
    owner: "x",
  },
  {
    id: "b",
    name: "B",
    key: "b",
    desc: "",
    on: false,
    rollout: 100,
    env: "dev",
    owner: "x",
  },
];

test("flags: state text, toggling, rollout", () => {
  expect(stateOf({ on: false, rollout: 50 })).toBe("Off");
  expect(stateOf({ on: true, rollout: 100 })).toBe("Everyone");
  expect(stateOf({ on: true, rollout: 0 })).toBe("Nobody yet");
  expect(stateOf({ on: true, rollout: 37 })).toBe("37% of users");
  expect(optionsOf(25).filter((o) => o.selected)).toHaveLength(1);
  expect(optionsOf(37).map((o) => o.value)).toEqual([
    "0",
    "10",
    "25",
    "37",
    "50",
    "100",
  ]);
  expect(toggleFlag(flags, "b")[1].on).toBe(true);
  expect(flags[1].on).toBe(false);
  expect(setRollout(flags, "a", 140)[0].rollout).toBe(100);
  expect(setRollout(flags, "a", -3)[0].rollout).toBe(0);
  expect(setRollout(flags, "a", Number.NaN)[0].rollout).toBe(0);
  expect(enabled(flags)).toBe(1);
  const rows = flagRows(flags);
  expect(rows[0]).toMatchObject({ env: "Production", rolloutPct: 25 });
  expect(rows[1].rolloutPct).toBe(0);
});

test("audit log: grouping, search and tags", () => {
  const list = [
    logEntry("1", "Ana Costa", "changed", "Plan", "Today", "10:00", {
      tag: "Billing",
    }),
    logEntry("2", "Leo Park", "removed", "a@b.c", "Yesterday", "09:00", {
      tag: "Security",
      text: "Left the company",
    }),
    logEntry("3", "Ana Costa", "refunded", "Invoice", "Today", "08:00", {
      tag: "Billing",
    }),
  ];
  const groups = groupByDay(list);
  expect(groups.map((g) => [g.label, g.items.length])).toEqual([
    ["Today", 2],
    ["Yesterday", 1],
  ]);
  expect(groups[0].items[0].initials).toBe("AC");
  expect(tagsOf(list)).toEqual(["Billing", "Security"]);
  expect(matching(list, "Billing", "")).toHaveLength(2);
  expect(matching(list, "all", "company")).toHaveLength(1);
  expect(matching(list, "Security", "ana")).toHaveLength(0);
  expect(prepend(list, list[1])[0]).toBe(list[1]);
  expect(groupByDay([])).toEqual([]);
});
