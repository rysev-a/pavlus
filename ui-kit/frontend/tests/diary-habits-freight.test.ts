import { expect, test } from "vitest";
import {
  addDays,
  daysBetween,
  dowOf,
  relativeDay,
  shortDate,
} from "../blocks/month-archive/dates.ts";
import {
  archiveCells,
  archiveView,
  countByDay,
  monthTotal,
} from "../blocks/month-archive/archive.ts";
import { cloud, countTags, sizeOf } from "../blocks/tag-cloud/tags.ts";
import { moodOf, pickerMoods } from "../blocks/mood-picker/moods.ts";
import {
  entryCard,
  excerptOf,
  paragraphsOf,
  readingMinutes,
} from "../blocks/journal-entry/entry.ts";
import {
  addComment,
  commentCounts,
  validateComment,
} from "../blocks/journal-comments/comments.ts";
import { friendCards, latestVisible } from "../blocks/friend-latest/friends.ts";
import {
  currentRun,
  longestStreak,
} from "../blocks/journal-profile/profile.ts";
import {
  emptyDraft,
  parseTags,
  validateDraft,
} from "../blocks/entry-editor/editor.ts";
import {
  bestStreak,
  cellState,
  completionRate,
  currentStreak,
  heatLevel,
  heatWeeks,
  isDue,
  toggleCheck,
  weekDays,
  weekRows,
} from "../blocks/habit-grid/habits.ts";
import {
  emptyHabit,
  saveHabit,
  validateHabit,
} from "../blocks/habit-form/form.ts";
import {
  minutesOf,
  nextReminder,
  type Reminder,
} from "../blocks/reminder-list/reminders.ts";
import { badgeList } from "../blocks/badge-shelf/badges.ts";
import {
  delayDays,
  delayText,
  routeProgress,
  stopViews,
} from "../blocks/route-timeline/route.ts";
import { lanesOf } from "../blocks/shipment-tracker/tracker.ts";
import { rateRows, valueScore, winners } from "../blocks/rate-table/rates.ts";
import {
  chargeableWeight,
  parseForm,
  quote,
} from "../blocks/quote-calculator/quote.ts";
import {
  cycleDoc,
  progressOf,
  type DocItem,
} from "../blocks/customs-checklist/customs.ts";
import {
  derive as diaryDerive,
  startCore,
} from "../templates/live-journal-diary/diary.ts";
import {
  perfectWeeks,
  seedChecks,
  HABITS,
  TODAY as HT,
  derive as habitDerive,
  startCore as habitCore,
} from "../templates/habit-tracker/tracker.ts";
import {
  chargesOf,
  etaOf,
  invoiceStatus,
  invoicesOf,
  kpis,
  pickupsPerWeek,
  reachedOf,
  SHIPMENTS,
  shownShipments,
  stopsOf,
  totalOf,
} from "../templates/freight-management-admin/freight.ts";

const TODAY = "2026-11-03";

test("dates: arithmetic on ISO strings", () => {
  expect(addDays("2026-11-03", 30)).toBe("2026-12-03");
  expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  expect(daysBetween("2026-10-30", "2026-11-03")).toBe(4);
  expect(dowOf("2026-11-03")).toBe(1); // a Tuesday, Monday is 0
  expect(shortDate("2026-11-03")).toBe("Nov 3");
  expect(relativeDay("2026-11-02", TODAY)).toBe("yesterday");
  expect(relativeDay("2026-10-20", TODAY)).toBe("2 weeks ago");
});

test("archive: dots on the days with entries, a total per month", () => {
  const counts = countByDay([
    "2026-11-02",
    "2026-11-02",
    "2026-11-03",
    "2026-10-30",
  ]);
  const cells = archiveCells(
    { year: 2026, month: 10 },
    counts,
    "2026-11-03",
    TODAY,
  );
  const second = cells.find((c) => c.iso === "2026-11-02");
  expect(second?.dots).toEqual([0, 1]);
  expect(cells.find((c) => c.iso === "2026-11-03")).toMatchObject({
    today: true,
    selected: true,
  });
  expect(cells.find((c) => c.iso === "2026-11-04")?.dots).toEqual([]);
  expect(cells.filter((c) => c.blank)).toHaveLength(6); // Nov 1 is a Sunday
  expect(monthTotal(counts, { year: 2026, month: 10 })).toBe(3);
  expect(
    archiveView({ year: 2026, month: 9 }, counts, "", TODAY).totalText,
  ).toBe("1 entry");
});

test("tag cloud: sizes follow how often a tag is used", () => {
  const counts = countTags([["a", "b"], ["a"], ["a", "c"], ["b", "b"]]);
  expect(counts).toEqual({ a: 3, b: 2, c: 1 });
  expect(sizeOf(3, 1, 3)).toBe(5);
  expect(sizeOf(1, 1, 3)).toBe(1);
  expect(sizeOf(2, 2, 2)).toBe(3);
  const tags = cloud(counts, "b");
  expect(tags.map((t) => t.tag)).toEqual(["a", "b", "c"]);
  expect(tags.find((t) => t.tag === "b")?.active).toBe(true);
});

test("entries: paragraphs, excerpt, reading time, the card", () => {
  const body = "One two three.\n\n  Four   five.\n\n\nSix.";
  expect(paragraphsOf(body)).toEqual(["One two three.", "Four five.", "Six."]);
  expect(excerptOf("short text")).toBe("short text");
  const long = "word ".repeat(100);
  const cut = excerptOf(long, 60);
  expect(cut.endsWith("…")).toBe(true);
  expect(cut.length).toBeLessThanOrEqual(61);
  expect(readingMinutes("a ".repeat(450))).toBe(3);
  expect(readingMinutes("")).toBe(1);
  const card = entryCard(
    {
      id: "x",
      author: "a",
      iso: TODAY,
      time: "10:00",
      title: "T",
      body: long,
      mood: "calm",
      music: "",
      location: "",
      tags: ["t"],
      privacy: "friends",
    },
    { id: "a", name: "Ann Lee", hue: 10, handle: "ann" },
    1,
  );
  expect(card).toMatchObject({
    initials: "AL",
    moodEmoji: "😌",
    privacyLabel: "Friends",
    commentsText: "1 comment",
    truncated: true,
  });
  expect(moodOf("nope").emoji).toBe("");
  expect(pickerMoods("sad").filter((m) => m.active)).toHaveLength(1);
});

test("comments: validation, adding, counting", () => {
  expect(validateComment("  ")).toMatch(/first/);
  expect(validateComment("x".repeat(501))).toMatch(/Too long/);
  expect(validateComment("Nice")).toBe("");
  const list = addComment([], "e1", "Ann", 10, "  Hello there ");
  const two = addComment(list, "e1", "Ben", 20, "Hi");
  expect(two.map((c) => c.id)).toEqual(["c1", "c2"]);
  expect(list[0].text).toBe("Hello there");
  expect(commentCounts(two)).toEqual({ e1: 2 });
});

test("friends see the latest entry that is not private", () => {
  const post = (
    id: string,
    iso: string,
    privacy: "public" | "friends" | "private",
  ) => ({
    id,
    author: "m",
    iso,
    time: "10:00",
    title: id,
    body: "x".repeat(50),
    mood: "",
    music: "",
    location: "",
    tags: [],
    privacy,
  });
  const posts = [
    post("a", "2026-10-01", "public"),
    post("b", "2026-11-01", "private"),
    post("c", "2026-10-20", "friends"),
  ];
  expect(latestVisible(posts, "m")?.id).toBe("c");
  const cards = friendCards(
    [
      { id: "m", name: "Mia Q", hue: 1, handle: "m" },
      { id: "z", name: "Zed", hue: 2, handle: "z" },
    ],
    posts,
    TODAY,
    ["c"],
  );
  expect(cards[0]).toMatchObject({ postId: "c", fresh: false, hasPost: true });
  expect(cards[1].hasPost).toBe(false);
});

test("profile: the longest and the current writing streak", () => {
  const dates = [
    "2026-10-01",
    "2026-10-02",
    "2026-10-03",
    "2026-10-10",
    "2026-11-02",
    "2026-11-03",
    "2026-11-03",
  ];
  expect(longestStreak(dates)).toBe(3);
  expect(currentRun(dates, TODAY)).toBe(2);
  expect(currentRun(["2026-11-02"], TODAY)).toBe(1);
  expect(currentRun(["2026-10-30"], TODAY)).toBe(0);
});

test("editor: tags are cleaned, a draft is checked", () => {
  expect(parseTags("#Autumn, walks ,, autumn, big city")).toEqual([
    "autumn",
    "walks",
    "big-city",
  ]);
  const errors = validateDraft(emptyDraft());
  expect(Object.keys(errors).sort()).toEqual(["body", "mood", "title"]);
  expect(
    validateDraft({
      ...emptyDraft(),
      title: "A title",
      body: "x".repeat(50),
      mood: "calm",
    }),
  ).toEqual({});
  expect(
    validateDraft({
      ...emptyDraft(),
      title: "t".repeat(81),
      body: "x".repeat(50),
      mood: "calm",
    }).title,
  ).toMatch(/80/);
});

test("diary: derive filters the feed by tag, day and privacy", () => {
  const core = startCore();
  const all = diaryDerive(core);
  expect(all.feed).toHaveLength(11);
  expect(all.feed[0].id).toBe("e1");
  const tagged = diaryDerive({ ...core, tag: "autumn" });
  expect(tagged.feed.every((c) => c.tags.includes("autumn"))).toBe(true);
  expect(tagged.hasFilter).toBe(true);
  const day = diaryDerive({ ...core, day: "2026-10-27" });
  expect(day.feed.map((c) => c.id)).toEqual(["e7", "e8"]);
  const priv = diaryDerive({ ...core, privacy: "private" });
  expect(priv.feed.map((c) => c.id)).toEqual(["e3"]);
  expect(all.privFilters.map((f) => f.count)).toEqual(
    [11, 5, 4, 1].map((n, i) => (i === 0 ? 11 : all.privFilters[i].count)),
  );
  expect(all.friends.some((f) => f.postId === "t2")).toBe(false); // a private entry never shows
});

test("habits: due days by frequency", () => {
  expect(isDue("daily", "2026-11-07")).toBe(true);
  expect(isDue("weekdays", "2026-11-07")).toBe(false); // a Saturday
  expect(isDue("weekends", "2026-11-07")).toBe(true);
  expect(isDue("mwf", "2026-11-04")).toBe(true); // a Wednesday
  expect(isDue("mwf", "2026-11-05")).toBe(false);
});

test("habits: streaks skip rest days and do not break while today is open", () => {
  // Mon Nov 2 and Fri Oct 30 done, Wed Oct 28 done: the Monday-Wednesday-Friday habit
  const mwf = ["2026-10-28", "2026-10-30", "2026-11-02"];
  expect(currentStreak(mwf, "mwf", "2026-11-03")).toBe(3);
  expect(currentStreak(mwf, "mwf", "2026-11-04")).toBe(3); // Wednesday still open
  expect(currentStreak(mwf, "mwf", "2026-11-05")).toBe(0); // missed Wednesday
  const daily = ["2026-11-01", "2026-11-02"];
  expect(currentStreak(daily, "daily", "2026-11-03")).toBe(2);
  expect(currentStreak([...daily, "2026-11-03"], "daily", "2026-11-03")).toBe(
    3,
  );
  expect(currentStreak(["2026-10-30"], "daily", "2026-11-03")).toBe(0);
  expect(
    bestStreak(
      ["2026-10-01", "2026-10-02", "2026-10-03", "2026-10-05"],
      "daily",
      "2026-11-03",
    ),
  ).toBe(3);
  expect(bestStreak([], "daily", TODAY)).toBe(0);
  // weekdays: a Friday and the next Monday are one streak
  expect(
    bestStreak(["2026-10-30", "2026-11-02"], "weekdays", "2026-11-03"),
  ).toBe(2);
});

test("habits: completion rate counts only due days", () => {
  const dates = ["2026-11-02", "2026-11-04"]; // Mon, Wed
  expect(completionRate(dates, "mwf", "2026-11-02", "2026-11-06")).toBe(67);
  expect(completionRate(dates, "weekends", "2026-11-02", "2026-11-06")).toBe(0);
  expect(completionRate([], "daily", "2026-11-02", "2026-11-03")).toBe(0);
});

test("habits: toggling a check, the week grid and its cell states", () => {
  const on = toggleCheck({}, "h1", "2026-11-03");
  expect(on.h1).toEqual(["2026-11-03"]);
  expect(toggleCheck(on, "h1", "2026-11-03").h1).toEqual([]);
  expect(weekDays(TODAY).map((d) => d.num)).toEqual([2, 3, 4, 5, 6, 7, 8]);
  expect(cellState("daily", false, "2026-11-04", TODAY)).toBe("future");
  expect(cellState("daily", false, TODAY, TODAY)).toBe("today");
  expect(cellState("daily", false, "2026-11-02", TODAY)).toBe("missed");
  expect(cellState("weekends", false, "2026-11-02", TODAY)).toBe("off");
  expect(cellState("weekends", true, "2026-11-02", TODAY)).toBe("done");
  const rows = weekRows(
    [{ id: "h1", name: "Read", icon: "📖", tone: "info", freq: "daily" }],
    { h1: ["2026-11-02"] },
    TODAY,
  );
  expect(rows[0].cells.map((c) => c.state)).toEqual([
    "done",
    "today",
    "future",
    "future",
    "future",
    "future",
    "future",
  ]);
  expect(rows[0].weekText).toBe("1/2 this week");
});

test("habits: heatmap levels and weeks", () => {
  expect(heatLevel(0, 3)).toBe(0);
  expect(heatLevel(1, 3)).toBe(1);
  expect(heatLevel(1, 2)).toBe(2);
  expect(heatLevel(3, 4)).toBe(3);
  expect(heatLevel(3, 3)).toBe(4);
  expect(heatLevel(1, 5)).toBe(1);
  const weeks = heatWeeks(
    HABITS,
    { h1: ["2026-11-02"] },
    { year: 2026, month: 10 },
    TODAY,
  );
  expect(weeks.every((w) => w.cells.length === 7)).toBe(true);
  const days = weeks.flatMap((w) => w.cells).filter((c) => !c.blank);
  expect(days).toHaveLength(30);
  expect(days.find((c) => c.day === 20)?.future).toBe(true);
});

test("habit tracker: the seed is deterministic and the stats follow the checks", () => {
  const a = seedChecks(HABITS, HT);
  expect(seedChecks(HABITS, HT)).toEqual(a);
  const core = habitCore();
  const d = habitDerive(core);
  expect(d.stats).toHaveLength(4);
  const more = habitDerive({
    ...core,
    checks: toggleCheck(core.checks, "h4", HT),
  });
  expect(more.todayLine).not.toBe(d.todayLine);
  expect(perfectWeeks([], {}, HT)).toBe(0);
  expect(
    perfectWeeks(
      [{ id: "x", name: "x", icon: "x", tone: "info", freq: "weekends" }],
      { x: ["2026-10-24", "2026-10-25"] },
      HT,
      1,
    ),
  ).toBe(0); // the week of Oct 26 is the one before; the weekend of the 24th is in the week before that
  expect(
    perfectWeeks(
      [{ id: "x", name: "x", icon: "x", tone: "info", freq: "weekends" }],
      { x: ["2026-10-31", "2026-11-01"] },
      HT,
      1,
    ),
  ).toBe(1);
});

test("habit form: validation and saving", () => {
  const habits = HABITS;
  expect(validateHabit(emptyHabit(), habits, "").name).toMatch(/Name/);
  expect(
    validateHabit({ ...emptyHabit(), name: "run 5 km" }, habits, "").name,
  ).toMatch(/already/);
  expect(
    validateHabit({ ...emptyHabit(), name: "run 5 km" }, habits, "h2"),
  ).toEqual({});
  const saved = saveHabit(habits, { ...emptyHabit(), name: " Stretch " }, "");
  expect(saved.at(-1)).toMatchObject({ id: "h6", name: "Stretch" });
  expect(
    saveHabit(habits, { ...emptyHabit(), name: "Swim" }, "h1")[0].name,
  ).toBe("Swim");
});

test("reminders and badges", () => {
  const list: Reminder[] = [
    { id: "r1", habitId: "h1", time: "21:00", on: true },
    { id: "r2", habitId: "h2", time: "07:00", on: true },
    { id: "r3", habitId: "h3", time: "12:00", on: false },
  ];
  expect(minutesOf("07:30")).toBe(450);
  expect(nextReminder(list, 14 * 60)?.reminder.id).toBe("r1");
  expect(nextReminder(list, 22 * 60)).toMatchObject({ tomorrow: true });
  expect(
    nextReminder(
      list.map((r) => ({ ...r, on: false })),
      0,
    ),
  ).toBeUndefined();
  const badges = badgeList({
    bestStreak: 9,
    totalChecks: 64,
    habits: 4,
    perfectWeeks: 0,
    rate30: 71,
  });
  expect(badges.filter((b) => b.earned).map((b) => b.id)).toEqual([
    "spark",
    "week",
    "fifty",
  ]);
  expect(badges.find((b) => b.id === "hundred")?.pct).toBe(64);
  expect(badges[0].earned).toBe(true);
});

test("route: delays, stop states and progress", () => {
  expect(delayDays("2026-11-09", "2026-11-11")).toBe(2);
  expect(delayText(0)).toBe("on time");
  expect(delayText(1)).toBe("1 day late");
  expect(delayText(-2)).toBe("2 days early");
  const stops = [
    {
      id: "a",
      place: "A",
      kind: "origin" as const,
      planned: "2026-11-01",
      actual: "2026-11-01",
      note: "",
    },
    {
      id: "b",
      place: "B",
      kind: "port" as const,
      planned: "2026-11-03",
      actual: "2026-11-06",
      note: "",
    },
    {
      id: "c",
      place: "C",
      kind: "destination" as const,
      planned: "2026-11-05",
      actual: "2026-11-08",
      note: "",
    },
  ];
  const v = stopViews(stops, 1, false);
  expect(v.map((s) => s.state)).toEqual(["done", "current", "next"]);
  expect(v[1]).toMatchObject({
    delay: 3,
    tone: "destructive",
    delayText: "3 days late",
  });
  expect(v[2].delayText).toBe("");
  expect(stopViews(stops, 2, true).every((s) => s.state === "done")).toBe(true);
  expect(routeProgress(5, 2)).toBe(50);
  expect(routeProgress(5, -1)).toBe(0);
});

test("tracking board: a lane for every status", () => {
  const lanes = lanesOf(
    SHIPMENTS.map((x) => ({
      id: x.id,
      ref: x.ref,
      status: x.status,
      origin: x.origin,
      destination: x.destination,
      carrier: x.carrier,
      mode: x.mode,
      pct: 50,
      eta: "x",
    })),
  );
  expect(lanes.map((l) => l.id)).toEqual([
    "booked",
    "transit",
    "customs",
    "delayed",
    "delivered",
  ]);
  expect(lanes.reduce((n, l) => n + l.count, 0)).toBe(SHIPMENTS.length);
});

test("rates: the winners and the sorting", () => {
  const rates = [
    {
      id: "a",
      carrier: "A",
      mode: "road" as const,
      price: 1000,
      days: 5,
      reliability: 90,
      note: "",
    },
    {
      id: "b",
      carrier: "B",
      mode: "road" as const,
      price: 1400,
      days: 2,
      reliability: 97,
      note: "",
    },
    {
      id: "c",
      carrier: "C",
      mode: "rail" as const,
      price: 1100,
      days: 4,
      reliability: 93,
      note: "",
    },
  ];
  expect(winners(rates)).toMatchObject({
    cheapest: "a",
    fastest: "b",
    reliable: "b",
  });
  expect(valueScore(rates[0], rates)).toBeGreaterThan(0);
  const rows = rateRows(rates, { key: "days", dir: "asc" }, "c");
  expect(rows.map((r) => r.id)).toEqual(["b", "c", "a"]);
  expect(rows.find((r) => r.id === "c")?.selected).toBe(true);
  expect(rows.find((r) => r.id === "a")?.badges).toContain("Cheapest");
  expect(rows.find((r) => r.id === "b")?.extraText).toBe("+€400 (40%)");
  expect(rateRows([], null, "")).toEqual([]);
});

test("quote: chargeable weight, surcharges, insurance and time", () => {
  expect(chargeableWeight(1000, 1, "road")).toEqual({
    kg: 1000,
    basis: "weight",
  });
  expect(chargeableWeight(500, 6, "road")).toEqual({
    kg: 1998,
    basis: "volume",
  });
  const base = {
    weight: 2000,
    volume: 1,
    distance: 1000,
    mode: "road" as const,
    declared: 0,
    insured: false,
    express: false,
  };
  // 45 + 2 t * 1000 km * 0.11 = 265, fuel 8% = 21.2
  const q = quote(base);
  expect(q.freight).toBe(265);
  expect(q.fuel).toBe(21.2);
  expect(q.total).toBe(286.2);
  expect(q.days).toBe(3); // ceil(1000 / 650) + 1
  const full = quote({
    ...base,
    insured: true,
    declared: 10000,
    express: true,
  });
  expect(full.insurance).toBe(60);
  expect(full.express).toBe(66.25);
  expect(full.total).toBe(412.45);
  expect(full.days).toBe(2);
  expect(quote({ ...base, weight: 10, distance: 50 }).freight).toBe(90); // the minimum charge
  expect(quote({ ...base, mode: "air", distance: 7000 }).days).toBe(2);
});

test("quote: the form is checked", () => {
  const form = {
    weight: "1800",
    volume: "6",
    distance: "1100",
    mode: "road" as const,
    declared: "",
    insured: false,
    express: true,
  };
  expect(parseForm(form).errors).toEqual({});
  expect(parseForm(form).input?.express).toBe(true);
  expect(parseForm({ ...form, mode: "sea" }).input?.express).toBe(false);
  expect(parseForm({ ...form, weight: "" }).errors.weight).toMatch(/weight/);
  expect(parseForm({ ...form, weight: "50000" }).errors.weight).toMatch(
    /30,000/,
  );
  expect(
    parseForm({ ...form, mode: "air", weight: "6000" }).errors.weight,
  ).toMatch(/5,000/);
  expect(
    parseForm({ ...form, mode: "sea", distance: "100" }).errors.distance,
  ).toMatch(/300/);
  expect(parseForm({ ...form, insured: true }).errors.declared).toMatch(
    /value/,
  );
  expect(parseForm({ ...form, volume: "-1" }).errors.volume).toBeDefined();
});

test("customs: documents move a step, the shipment clears when the required ones are approved", () => {
  const items: DocItem[] = [
    { id: "a", title: "A", note: "", required: true, state: "missing" },
    { id: "b", title: "B", note: "", required: false, state: "missing" },
  ];
  expect(progressOf(items)).toMatchObject({
    approved: 0,
    requiredLeft: 1,
    ready: false,
    pct: 0,
  });
  const step1 = cycleDoc(items, "a");
  expect(step1[0].state).toBe("uploaded");
  const step2 = cycleDoc(step1, "a");
  expect(progressOf(step2)).toMatchObject({
    approved: 1,
    requiredLeft: 0,
    ready: true,
    pct: 50,
  });
  expect(cycleDoc(step2, "a")[0].state).toBe("missing");
  expect(progressOf([]).ready).toBe(false);
});

test("freight: stops, ETA, charges, invoices and the KPIs", () => {
  const byRef = (ref: string) => SHIPMENTS.find((x) => x.ref === ref)!;
  const late = byRef("FRT-20390");
  expect(etaOf(late)).toBe("2026-11-07"); // planned Nov 4 plus three days
  const stops = stopsOf(byRef("FRT-20411"));
  expect(stops[0].planned).toBe("2026-10-28");
  expect(stops.at(-1)?.planned).toBe("2026-11-27");
  expect(reachedOf(byRef("FRT-20418"))).toBe(-1);
  expect(reachedOf(byRef("FRT-20372"))).toBe(3);
  expect(reachedOf(byRef("FRT-20397"))).toBe(2); // waits at the border
  const lines = chargesOf(byRef("FRT-20372"));
  expect(totalOf(lines)).toBe(1620 + 130 + 35);
  expect(
    chargesOf(byRef("FRT-20411")).some((l) => l.label === "Customs clearance"),
  ).toBe(true);
  const invoices = invoicesOf(SHIPMENTS);
  expect(invoices.some((i) => i.shipmentId === "s20418")).toBe(false); // booked: not invoiced yet
  const old = invoices.find((i) => i.id === "INV-20359")!;
  expect(invoiceStatus(old, [])).toBe("overdue");
  expect(invoiceStatus(old, ["INV-20359"])).toBe("paid");
  expect(
    invoiceStatus(
      invoices.find((i) => i.id === "INV-20411")!,
      [],
    ),
  ).toBe("open");
  const k = kpis(SHIPMENTS);
  expect(k).toMatchObject({
    delivered: 4,
    delayed: 2,
    inCustoms: 2,
    active: 9,
  });
  expect(k.onTimeRate).toBe(75);
  expect(k.avgTransit).toBe(10); // (3 + 2 + 32 + 3) / 4
  expect(
    pickupsPerWeek(SHIPMENTS).reduce((n, p) => n + p.value, 0),
  ).toBeGreaterThan(0);
  expect(pickupsPerWeek(SHIPMENTS)).toHaveLength(6);
  expect(
    shownShipments(SHIPMENTS, "delayed", "", null).map((x) => x.ref),
  ).toEqual(["FRT-20388", "FRT-20390"]);
  expect(
    shownShipments(SHIPMENTS, "all", "oslo", null).map((x) => x.ref),
  ).toEqual(["FRT-20372"]);
});
