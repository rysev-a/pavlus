import { expect, test } from "vitest";
import { agendaOf, nextToday } from "../blocks/day-agenda/agenda.ts";
import { buddyRows, choose, isFree } from "../blocks/buddy-picker/buddies.ts";
import {
  candidateView,
  nextStage,
  type Person,
} from "../blocks/candidate-card/candidate.ts";
import {
  addCategory,
  canRemove,
  freshTone,
  idFor,
  nextTone,
  removeCategory,
  validateName,
} from "../blocks/category-manager/cats.ts";
import {
  checklistOf,
  isOverdue,
  overdueCount,
  progress,
  task,
  toggleTask,
} from "../blocks/checklist/list.ts";
import { funnel, rate, reached } from "../blocks/funnel-chart/funnel.ts";
import {
  fill,
  insertField,
  unknownFields,
  validateMessage,
} from "../blocks/message-composer/compose.ts";
import {
  average,
  scoreView,
  setRating,
  verdictOf,
} from "../blocks/scorecard/score.ts";
import { summaryView, totals } from "../blocks/time-summary/summary.ts";
import {
  clockText,
  newTracker,
  startTracker,
  stopTracker,
  tickTracker,
} from "../blocks/time-tracker/tracker.ts";
import {
  addDays,
  clockOf,
  durationText,
  minutesOf,
  weekOf,
  weekdayOf,
  weekTitle,
} from "../blocks/week-calendar/dates.ts";
import {
  expand,
  layoutDay,
  occursOn,
  weekView,
} from "../blocks/week-calendar/week.ts";
import {
  advance,
  CANDIDATES,
  OFFERS,
  overlaps,
  reject,
  timeToHire,
  JOBS,
  validateInterview,
  validateOffer,
} from "../templates/recruiting-pipeline/rec.ts";
import {
  advanceDoc,
  DOCS,
  HIRES,
  statusOf,
  TASKS,
  tasksFor,
  validateEquipment,
  EQUIPMENT,
} from "../templates/hr-onboarding-admin/hr.ts";
import {
  BLOCKS,
  CATEGORIES,
  GOALS,
  goalProgress,
  minutesPerCat,
  saveBlock,
  validateBlock,
  validateTask,
  TASKS as QUICK,
} from "../templates/personal-time-planner/plan.ts";

const item = (id: string, day: string, start: number, dur: number) => ({
  id,
  title: id,
  tone: "c1",
  day,
  start,
  dur,
  sub: "",
});

test("dates: weeks start on Monday and times round-trip", () => {
  expect(weekdayOf("2026-11-03")).toBe(1);
  expect(weekOf("2026-11-03")[0]).toBe("2026-11-02");
  expect(weekOf("2026-11-08")[6]).toBe("2026-11-08");
  expect(addDays("2026-10-31", 2)).toBe("2026-11-02");
  expect(weekTitle("2026-11-03")).toBe("Nov 2 - 8");
  expect(weekTitle("2026-10-28")).toBe("Oct 26 - Nov 1");
  expect(clockOf(570)).toBe("09:30");
  expect(minutesOf("09:30")).toBe(570);
  expect(minutesOf("25:00")).toBeNaN();
  expect(durationText(90)).toBe("1h 30m");
  expect(durationText(120)).toBe("2h");
  expect(durationText(45)).toBe("45m");
});

test("week calendar: overlapping blocks share the column, others do not", () => {
  const placed = layoutDay(
    [
      item("a", "d", 600, 120),
      item("b", "d", 630, 60),
      item("c", "d", 660, 30),
      item("d", "d", 900, 60),
    ],
    6,
    22,
  );
  const get = (id: string) => placed.find((p) => p.id === id)!;
  expect(get("a").width).toBeCloseTo(33.33, 1);
  expect(get("b").left).toBeCloseTo(33.33, 1);
  expect(get("c").left).toBeCloseTo(66.67, 1);
  // c fits beside a (it ends before b ends? no: it shares) and d is alone
  expect(get("d")).toMatchObject({ left: 0, width: 100 });
  // 10:00 on a 06:00-22:00 grid is a quarter of the way down
  expect(get("a").top).toBe(25);
  expect(get("a").height).toBe(12.5);
});

test("week calendar: blocks are clipped to the grid and dropped outside it", () => {
  const placed = layoutDay(
    [item("early", "d", 300, 120), item("night", "d", 23 * 60, 60)],
    6,
    22,
  );
  expect(placed).toHaveLength(1);
  expect(placed[0]).toMatchObject({ id: "early", top: 0 });
  expect(placed[0].height).toBeCloseTo(
    ((6 * 60 - 360 + 60) / 960) * 100 + 0,
    0,
  );
});

test("week calendar: repeats and the week view", () => {
  expect(occursOn("2026-11-02", "weekdays", "2026-11-06")).toBe(true);
  expect(occursOn("2026-11-02", "weekdays", "2026-11-07")).toBe(false);
  expect(occursOn("2026-11-02", "weekly", "2026-11-09")).toBe(true);
  expect(occursOn("2026-11-02", "weekly", "2026-11-10")).toBe(false);
  expect(occursOn("2026-11-02", "daily", "2026-11-01")).toBe(false);
  expect(occursOn("2026-11-02", "none", "2026-11-03")).toBe(false);
  const days = weekOf("2026-11-03");
  const items = expand(
    [{ ...item("w", "2026-11-02", 540, 60), repeat: "weekdays" as const }],
    days,
  );
  expect(items).toHaveLength(5);
  const view = weekView(items, "2026-11-03", "2026-11-03", 14 * 60, 6, 24);
  expect(view.days).toHaveLength(7);
  expect(view.days[1].today).toBe(true);
  expect(view.days[1].nowTop).toBeCloseTo((8 / 18) * 100, 1);
  expect(view.days[0].nowTop).toBe(-1);
  expect(view.days[0].cells).toHaveLength(18);
});

test("checklist: progress, overdue and groups", () => {
  const tasks = [
    task("a", "g", "A", "HR", "2026-11-01", true),
    task("b", "g", "B", "HR", "2026-11-02"),
    task("c", "g", "C", "HR", "2026-11-03"),
    task("d", "h", "D", "HR", ""),
  ];
  expect(progress(tasks)).toEqual({ done: 1, total: 4, pct: 25 });
  expect(progress([])).toEqual({ done: 0, total: 0, pct: 0 });
  expect(isOverdue(tasks[1], "2026-11-03")).toBe(true);
  expect(isOverdue(tasks[0], "2026-11-03")).toBe(false);
  expect(isOverdue(tasks[2], "2026-11-03")).toBe(false);
  expect(isOverdue(tasks[3], "2026-11-03")).toBe(false);
  expect(overdueCount(tasks, "2026-11-03")).toBe(1);
  const groups = checklistOf(
    tasks,
    [
      { id: "g", title: "G", hint: "" },
      { id: "h", title: "H", hint: "" },
    ],
    "2026-11-03",
  );
  expect(groups[0]).toMatchObject({ done: 1, total: 3, tone: "destructive" });
  expect(groups[0].items[2].state).toBe("today");
  expect(toggleTask(tasks, "b")[1].done).toBe(true);
  expect(tasks[1].done).toBe(false);
});

test("scorecard: averages only rated skills and clears on a second click", () => {
  const skills = [
    { id: "a", label: "A", hint: "" },
    { id: "b", label: "B", hint: "" },
    { id: "c", label: "C", hint: "" },
  ];
  expect(average(skills, {})).toBeNull();
  expect(average(skills, { a: 4, b: 5 })).toBe(4.5);
  expect(average(skills, { a: 3, b: 4, c: 4 })).toBe(3.7);
  expect(setRating({ a: 4 }, "a", 4).a).toBe(0);
  expect(setRating({ a: 4 }, "a", 5).a).toBe(5);
  expect(setRating({}, "a", 9).a).toBe(5);
  expect(verdictOf(4.5).label).toBe("Strong yes");
  expect(verdictOf(2).tone).toBe("destructive");
  const v = scoreView(skills, { a: 4, b: 5 });
  expect(v).toMatchObject({ average: "4.5", rated: "2 of 3 rated", pct: 90 });
  expect(scoreView(skills, {}).average).toBe("-");
});

test("funnel: rates, reached counts and overall conversion", () => {
  expect(rate(1, 3)).toBe(33);
  expect(rate(1, 0)).toBe(0);
  const f = funnel([
    { id: "a", label: "A", count: 200 },
    { id: "b", label: "B", count: 50 },
    { id: "c", label: "C", count: 10 },
  ]);
  expect(f.stages.map((s) => s.kept)).toEqual(["", "25%", "20%"]);
  expect(f.stages[2].lost).toBe(40);
  expect(f.stages[0].width).toBe(100);
  expect(f.overall).toBe("5%");
  expect(reached(["a", "b", "c"], ["a", "c", "b", "c"])).toEqual([4, 3, 2]);
});

test("agenda: now, next and past states", () => {
  const mk = (id: string, start: number, dur: number, day = "2026-11-03") => ({
    id,
    title: id,
    sub: "",
    tone: "c1",
    day,
    start,
    dur,
  });
  const items = [
    mk("late", 17 * 60, 60),
    mk("on", 14 * 60, 120),
    mk("old", 9 * 60, 30),
    mk("tm", 8 * 60, 30, "2026-11-04"),
  ];
  expect(nextToday(items, "2026-11-03", 14 * 60 + 20)).toBe("late");
  const days = agendaOf(items, "2026-11-03", 14 * 60 + 20);
  expect(days.map((d) => d.label)).toEqual(["Today, Nov 3", "Tomorrow"]);
  expect(days[0].items.map((i) => [i.id, i.state])).toEqual([
    ["old", "past"],
    ["on", "now"],
    ["late", "next"],
  ]);
  expect(days[1].items[0].state).toBe("later");
});

test("time summary: totals per category and targets", () => {
  const cats = [
    { id: "a", name: "A", tone: "c1" },
    { id: "b", name: "B", tone: "c2" },
    { id: "z", name: "Z", tone: "c3" },
  ];
  const spans = [
    { cat: "a", day: "d1", dur: 60 },
    { cat: "a", day: "d2", dur: 30 },
    { cat: "b", day: "d1", dur: 30 },
    { cat: "x", day: "d1", dur: 500 },
  ];
  expect(totals(spans, cats, ["d1"])).toEqual({ a: 60, b: 30, z: 0 });
  const v = summaryView("t", { a: 120, b: 60, z: 0 }, cats, { a: 90 });
  expect(v.total).toBe("3h");
  expect(v.rows.map((r) => r.id)).toEqual(["a", "b"]);
  expect(v.rows[0]).toMatchObject({ over: true, bar: 100, mark: 75 });
  expect(v.stack[0].width).toBeCloseTo(66.7, 1);
});

test("tracker: start, tick, stop makes an entry of whole minutes", () => {
  let t = newTracker(14 * 60, "work");
  expect(stopTracker(t, "e1", "x").entry).toBeNull();
  t = startTracker(t);
  for (let i = 0; i < 5; i++) t = tickTracker(t);
  expect(t.elapsed).toBe(5);
  const r = stopTracker({ ...t, note: " Proposal " }, "e1", "Work");
  // five seconds still count as one minute
  expect(r.entry).toEqual({
    id: "e1",
    title: "Proposal",
    cat: "work",
    start: 840,
    dur: 1,
  });
  expect(r.tracker).toMatchObject({ running: false, elapsed: 0, nowMin: 841 });
  const fast = startTracker({ ...newTracker(0, "w"), fast: true });
  expect(tickTracker(tickTracker(fast)).elapsed).toBe(120);
  expect(tickTracker(newTracker(0, "w")).elapsed).toBe(0);
  expect(clockText(3725)).toBe("1:02:05");
});

test("categories: validation, ids, tones and removal", () => {
  const cats = [
    { id: "work", name: "Work", tone: "c1" },
    { id: "study", name: "Study", tone: "c2" },
  ];
  expect(validateName("", cats)).toBeTruthy();
  expect(validateName(" work ", cats)).toBeTruthy();
  expect(validateName("work", cats, "work")).toBe("");
  expect(validateName("x".repeat(30), cats)).toBeTruthy();
  expect(idFor("Deep work!", cats)).toBe("deep-work");
  expect(idFor("Work", cats)).toBe("work-2");
  expect(nextTone("c1")).toBe("c2");
  expect(nextTone("de")).toBe("c1");
  expect(freshTone(cats)).toBe("c3");
  expect(addCategory(cats, " Music ", "c3")[2]).toEqual({
    id: "music",
    name: "Music",
    tone: "c3",
  });
  expect(canRemove(cats, "work", { work: 30 })).toBe(false);
  expect(removeCategory(cats, "study", { study: 0 })).toHaveLength(1);
  expect(canRemove([cats[0]], "work", {})).toBe(false);
});

test("buddies: a buddy has room for two and a click on the chosen clears it", () => {
  const pool = [
    { id: "a", name: "Ann Lee", role: "r", team: "t", mentees: 1 },
    { id: "b", name: "Bob Ray", role: "r", team: "t", mentees: 2 },
    {
      id: "c",
      name: "Cy Dee",
      role: "r",
      team: "t",
      mentees: 0,
      away: "until Nov 9",
    },
  ];
  expect(isFree(pool[0])).toBe(true);
  expect(isFree(pool[1])).toBe(false);
  expect(isFree(pool[2])).toBe(false);
  expect(choose("a", "a")).toBe("");
  expect(choose("a", "b")).toBe("b");
  const rows = buddyRows(pool, "a");
  expect(rows[0]).toMatchObject({
    chosen: true,
    label: "Chosen",
    load: "2 newcomers",
  });
  expect(rows[1]).toMatchObject({ full: true, label: "Full" });
  expect(rows[2]).toMatchObject({ full: true, label: "Away" });
});

test("message composer: fields are filled, unknown ones are reported", () => {
  const values = { first_name: "Noa", office: "Lisbon" };
  expect(fill("Hi {first_name} in {office} {x}", values)).toBe(
    "Hi Noa in Lisbon {x}",
  );
  expect(unknownFields("{x} {first_name} {x}", values)).toEqual(["{x}"]);
  expect(insertField("", "buddy")).toBe("{buddy}");
  expect(insertField("Hi", "buddy")).toBe("Hi {buddy}");
  expect(insertField("Hi ", "buddy")).toBe("Hi {buddy}");
  expect(validateMessage("", "short", values)).toEqual({
    subject: "Write a subject.",
    body: "The message is too short (at least 20 letters).",
  });
  expect(
    validateMessage("S", "A long enough message with {nope}", values).body,
  ).toContain("{nope}");
  expect(
    validateMessage("S", "A long enough message for {first_name}", values),
  ).toEqual({ subject: "", body: "" });
});

test("candidate card: stages move on and the labels follow", () => {
  const order = ["applied", "screening", "interview", "offer", "hired"];
  expect(nextStage(order, "applied")).toBe("screening");
  expect(nextStage(order, "hired")).toBe("hired");
  expect(nextStage(order, "rejected")).toBe("rejected");
  const stages = order.map((id) => ({
    id,
    title: id,
    tone: "default" as const,
  }));
  const p: Person = {
    id: "p",
    name: "Mira Okonkwo",
    role: "r",
    email: "e",
    location: "l",
    source: "s",
    expected: 90,
    skills: [],
    note: "",
    stage: "interview",
  };
  const v = candidateView(p, stages, order);
  expect(v).toMatchObject({
    initials: "MO",
    advance: "Move to offer",
    canReject: true,
    closed: false,
  });
  expect(candidateView({ ...p, stage: "hired" }, stages, order)).toMatchObject({
    advance: "",
    canReject: false,
    closed: true,
  });
});

test("recruiting: hiring needs an offer, rejection remembers the stage", () => {
  const offerStage = CANDIDATES.find((c) => c.stage === "offer")!;
  const blocked = advance({ ...offerStage, id: "none" }, OFFERS, "2026-11-03");
  expect(blocked.problem).toBeTruthy();
  expect(blocked.candidate.stage).toBe("offer");
  const hired = advance(offerStage, OFFERS, "2026-11-03");
  expect(hired.candidate).toMatchObject({
    stage: "hired",
    hiredOn: "2026-11-03",
  });
  const out = reject(CANDIDATES.find((c) => c.stage === "interview")!);
  expect(out).toMatchObject({ stage: "rejected", rejectedFrom: "interview" });
  expect(reject(out)).toBe(out);
  const tth = timeToHire(CANDIDATES, JOBS);
  expect(tth.every((r) => r.days > 0)).toBe(true);
});

test("recruiting: offer and interview forms are validated", () => {
  const job = JOBS[0];
  const ok = { salary: "105", bonus: "5", start: "2026-12-01" };
  expect(validateOffer(ok, job, "2026-11-03")).toEqual({});
  expect(
    validateOffer({ ...ok, salary: "" }, job, "2026-11-03").salary,
  ).toBeTruthy();
  expect(
    validateOffer({ ...ok, salary: "300" }, job, "2026-11-03").salary,
  ).toContain("Out of range");
  expect(
    validateOffer({ ...ok, bonus: "-1" }, job, "2026-11-03").bonus,
  ).toBeTruthy();
  expect(
    validateOffer({ ...ok, bonus: "60" }, job, "2026-11-03").bonus,
  ).toBeTruthy();
  expect(
    validateOffer({ ...ok, start: "2026-11-10" }, job, "2026-11-03").start,
  ).toBeTruthy();
  expect(
    validateOffer({ ...ok, start: "soon" }, job, "2026-11-03").start,
  ).toBeTruthy();
  expect(
    overlaps(
      { day: "d", start: 60, dur: 30 },
      { day: "d", start: 80, dur: 30 },
    ),
  ).toBe(true);
  expect(
    overlaps(
      { day: "d", start: 60, dur: 30 },
      { day: "d", start: 90, dur: 30 },
    ),
  ).toBe(false);
  expect(
    overlaps(
      { day: "d", start: 60, dur: 30 },
      { day: "e", start: 60, dur: 30 },
    ),
  ).toBe(false);
  const draft = {
    cand: "c1",
    kind: "phone",
    day: "2026-11-04",
    time: "10:00",
    dur: "45",
  };
  expect(validateInterview(draft, [], "2026-11-03")).toEqual({});
  expect(
    validateInterview({ ...draft, day: "2026-11-02" }, [], "2026-11-03").day,
  ).toBeTruthy();
  expect(
    validateInterview({ ...draft, day: "2026-11-07" }, [], "2026-11-03").day,
  ).toContain("weekdays");
  expect(
    validateInterview(
      draft,
      [
        {
          id: "i",
          cand: "c",
          kind: "phone",
          day: "2026-11-04",
          start: 600,
          dur: 60,
          panel: "",
        },
      ],
      "2026-11-03",
    ).time,
  ).toContain("booked");
});

test("hr onboarding: tasks, statuses, documents and equipment", () => {
  const h = HIRES[0];
  const tasks = tasksFor(h, "2026-11-03", ["contract"]);
  expect(tasks.find((t) => t.id === "h1.contract")?.done).toBe(false);
  expect(tasks.find((t) => t.id === "h1.bank")?.done).toBe(true);
  expect(tasks.find((t) => t.id === "h1.mfa")?.done).toBe(false);
  expect(statusOf(h, TASKS, "2026-11-03").id).toBe("behind");
  expect(statusOf(HIRES[4], TASKS, "2026-11-03")).toMatchObject({
    id: "upcoming",
    label: "In 13 days",
  });
  expect(statusOf(HIRES[3], TASKS, "2026-11-03").id).toBe("done");
  const doc = DOCS.find((d) => d.status === "requested")!;
  const moved = advanceDoc(DOCS, doc.id, "2026-11-03");
  expect(moved.find((d) => d.id === doc.id)).toMatchObject({
    status: "received",
    updated: "2026-11-03",
  });
  const approved = DOCS.find((d) => d.status === "approved")!;
  expect(advanceDoc(DOCS, approved.id, "2026-11-03")).toEqual(DOCS);
  expect(
    validateEquipment({ hire: "h1", item: "laptop", note: "" }, EQUIPMENT).item,
  ).toContain("already");
  expect(
    validateEquipment({ hire: "h1", item: "headset", note: "" }, EQUIPMENT),
  ).toEqual({});
  expect(
    validateEquipment({ hire: "h1", item: "none", note: "" }, EQUIPMENT).item,
  ).toBeTruthy();
});

test("planner: blocks, totals, goals and validation", () => {
  const week = weekOf("2026-11-03");
  const mins = minutesPerCat(BLOCKS, CATEGORIES, ["2026-11-03"]);
  // sleep every day is eight hours
  expect(mins.sleep).toBe(480);
  expect(mins.sport).toBe(0);
  const wk = minutesPerCat(BLOCKS, CATEGORIES, week);
  expect(wk.sleep).toBe(480 * 7);
  const gym = GOALS.find((g) => g.cat === "sport")!;
  expect(goalProgress(gym, BLOCKS, week)).toEqual({ value: 3, pct: 100 });
  const draft = {
    title: " Yoga ",
    cat: "sport",
    day: "2026-11-04",
    start: "07:30",
    dur: "45",
    repeat: "weekly",
    note: "",
  };
  expect(validateBlock(draft, CATEGORIES)).toEqual({});
  expect(validateBlock({ ...draft, title: "" }, CATEGORIES).title).toBeTruthy();
  expect(validateBlock({ ...draft, cat: "nope" }, CATEGORIES).cat).toBeTruthy();
  expect(
    validateBlock({ ...draft, start: "7pm" }, CATEGORIES).start,
  ).toBeTruthy();
  expect(
    validateBlock({ ...draft, start: "23:30", dur: "600" }, CATEGORIES).dur,
  ).toBeTruthy();
  const saved = saveBlock(BLOCKS, draft, "");
  expect(saved).toHaveLength(BLOCKS.length + 1);
  expect(saved[saved.length - 1]).toMatchObject({
    title: "Yoga",
    start: 450,
    dur: 45,
    repeat: "weekly",
  });
  const edited = saveBlock(BLOCKS, { ...draft, title: "Stretch" }, "b2");
  expect(edited.find((x) => x.id === "b2")?.title).toBe("Stretch");
  expect(edited).toHaveLength(BLOCKS.length);
  expect(
    validateTask({ title: "", priority: "low", cat: "work" }, QUICK).title,
  ).toBeTruthy();
  expect(
    validateTask(
      { title: "renew the library card", priority: "low", cat: "work" },
      QUICK,
    ).title,
  ).toContain("already");
  expect(
    validateTask(
      { title: "Water the plants", priority: "low", cat: "work" },
      QUICK,
    ),
  ).toEqual({});
});
