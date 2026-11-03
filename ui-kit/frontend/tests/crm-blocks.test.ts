import { expect, test } from "vitest";
import {
  feedItems,
  logActivity,
  nextActivityId,
} from "../blocks/activity-feed/feed.ts";
import { agendaDays, type AgendaEntry } from "../blocks/agenda-list/agenda.ts";
import {
  agoText,
  type Contact,
  contactViews,
  searchContacts,
} from "../blocks/contact-card/contacts.ts";
import {
  compact,
  dealBoard,
  type DealLite,
  isOpen,
  moveStage,
  nextStage,
  type StageDef,
  weightedOf,
} from "../blocks/deal-card/deals.ts";
import { rankRows } from "../blocks/leaderboard/board.ts";
import {
  addDays,
  dayLabel,
  dayName,
  daysBetween,
  parseIso,
  shiftMonth,
  weekdayOf,
} from "../blocks/month-grid/dates.ts";
import { monthCells } from "../blocks/month-grid/grid.ts";
import {
  emailErrors,
  emailView,
  fill,
  paragraphsOf,
  wordCount,
} from "../blocks/email-preview/mail.ts";
import {
  propertyViews,
  type Property,
} from "../blocks/property-card/properties.ts";
import {
  insertCanned,
  replyError,
  statusOptions,
} from "../blocks/reply-box/reply.ts";
import {
  addRule,
  type FieldDef,
  passes,
  type Person,
  removeRule,
  ruleViews,
  segment,
  setField,
  summary,
} from "../blocks/segment-builder/segments.ts";
import { scoreOf, suggest } from "../blocks/suggestion-list/suggest.ts";
import { templateOptions } from "../blocks/template-picker/templates.ts";
import { appendMessage, bubbles } from "../blocks/ticket-thread/thread.ts";

const STAGES: StageDef[] = [
  { id: "a", title: "A", prob: 10, tone: "muted" },
  { id: "b", title: "B", prob: 50, tone: "info" },
  { id: "won", title: "Won", prob: 100, tone: "success" },
  { id: "lost", title: "Lost", prob: 0, tone: "destructive" },
];
const deal = (
  id: string,
  amount: number,
  stage: string,
  close = "2026-12-01",
): DealLite => ({
  id,
  title: id,
  company: "Co",
  amount,
  stage,
  owner: "MC",
  close,
});

test("dates: days are worked out without a clock", () => {
  expect(parseIso("2026-02-30")).toBeNull();
  expect(parseIso("2026-11-03")).toEqual({ y: 2026, m: 11, d: 3 });
  expect(addDays("2026-11-28", 5)).toBe("2026-12-03");
  expect(daysBetween("2026-11-03", "2026-11-20")).toBe(17);
  expect(daysBetween("2026-11-20", "2026-11-03")).toBe(-17);
  expect(weekdayOf("2026-11-03")).toBe(1); // Tuesday
  expect(dayLabel("2026-11-03")).toBe("Nov 3");
  expect(dayName("2026-11-03")).toBe("Tue, Nov 3");
  expect(shiftMonth(2026, 12, 1)).toEqual({ y: 2027, m: 1 });
  expect(shiftMonth(2026, 1, -1)).toEqual({ y: 2025, m: 12 });
});

test("month grid: whole weeks from Monday, today marked, extra events counted", () => {
  const view = monthCells(
    2026,
    11,
    [
      { id: "1", date: "2026-11-05", label: "a", tone: "info" },
      { id: "2", date: "2026-11-05", label: "b", tone: "info" },
      { id: "3", date: "2026-11-05", label: "c", tone: "info" },
    ],
    "2026-11-03",
  );
  expect(view.title).toBe("November 2026");
  // 1 November 2026 is a Sunday: 6 days of October, 30 of November, 6 of December
  expect(view.cells).toHaveLength(42);
  expect(view.cells[0].id).toBe("2026-10-26");
  expect(view.cells[0].muted).toBe(true);
  expect(view.cells.filter((c) => c.today).map((c) => c.id)).toEqual([
    "2026-11-03",
  ]);
  const fifth = view.cells.find((c) => c.id === "2026-11-05");
  expect(fifth?.events).toHaveLength(2);
  expect(fifth?.more).toBe(1);
  // February 2027 starts on a Monday and has 28 days: exactly four weeks
  expect(monthCells(2027, 2, [], "2026-11-03").cells).toHaveLength(28);
});

test("activity feed: newest first, ids never repeat", () => {
  const list = logActivity([], "call", "Called", "", "Me", "Today");
  const more = logActivity(list, "note", "Noted", "x", "Me", "Today");
  expect(more.map((a) => a.id)).toEqual(["a2", "a1"]);
  expect(nextActivityId(more)).toBe("a3");
  expect(feedItems(more)[1].icon).toBe("k-rs-icon-phone");
});

test("deals: weighted forecast and moving between stages", () => {
  const deals = [
    deal("x", 1000, "a"),
    deal("y", 2000, "b"),
    deal("z", 500, "won"),
  ];
  expect(weightedOf(deals, STAGES)).toBe(100 + 1000 + 500);
  expect(isOpen(STAGES, "b")).toBe(true);
  expect(isOpen(STAGES, "won")).toBe(false);
  expect(nextStage(STAGES, "a", "left")).toBe("a");
  expect(moveStage(deals, STAGES, "x", "right")[0].stage).toBe("b");
  expect(compact(48200)).toBe("$48k");
  expect(compact(1250000)).toBe("$1.3M");
});

test("deal board: totals per stage and late deals", () => {
  const deals = [
    deal("x", 1000, "a", "2026-10-01"),
    deal("y", 3000, "b"),
    deal("z", 500, "won", "2026-10-01"),
  ];
  const board = dealBoard(STAGES, deals, "2026-11-03", dayLabel);
  expect(board[0].total).toBe("$1,000");
  expect(board[0].deals[0].late).toBe(true);
  expect(board[1].weighted).toBe("$1,500 weighted");
  expect(board[2].deals[0].late).toBe(false);
  expect(board[0].deals[0].canLeft).toBe(false);
  expect(board[3].deals).toHaveLength(0);
});

const people: Contact[] = [
  {
    id: "1",
    name: "Ann Lee",
    role: "CTO",
    company: "Acme",
    email: "a@x",
    phone: "1",
    status: "lead",
    tags: ["tech"],
    last: "2026-11-02",
  },
  {
    id: "2",
    name: "Bo Kim",
    role: "Buyer",
    company: "Zed",
    email: "b@x",
    phone: "2",
    status: "customer",
    tags: [],
    last: "2026-09-01",
  },
];

test("contacts: words for time and search by status and text", () => {
  expect(agoText(0)).toBe("today");
  expect(agoText(1)).toBe("yesterday");
  expect(agoText(9)).toBe("9 days ago");
  expect(agoText(21)).toBe("3 weeks ago");
  expect(agoText(120)).toBe("4 months ago");
  expect(searchContacts(people, "acme", "all")).toHaveLength(1);
  expect(searchContacts(people, "", "customer")[0].name).toBe("Bo Kim");
  expect(searchContacts(people, "tech", "customer")).toHaveLength(0);
  const v = contactViews(people, "2", "2026-11-03");
  expect(v[0].initials).toBe("AL");
  expect(v[0].last).toBe("Last talked yesterday");
  expect(v[1].selected).toBe(true);
});

test("leaderboard: best first, bars relative to the leader, goal text", () => {
  const rows = rankRows(
    [
      { id: "a", name: "Ann Lee", value: 50, target: 100, sub: "" },
      { id: "b", name: "Bo Kim", value: 200, target: 150, sub: "" },
    ],
    (n) => `$${n}`,
  );
  expect(rows.map((r) => r.id)).toEqual(["b", "a"]);
  expect(rows[0].pct).toBe(100);
  expect(rows[1].pct).toBe(25);
  expect(rows[0].goal).toBe("133% of goal");
  expect(rows[0].tone).toBe("success");
  expect(rows[1].tone).toBe("warning");
});

test("ticket thread and reply box", () => {
  const list = appendMessage([], "agent", "Jo Wu", "  Hello there  ", "Today");
  expect(list[0].text).toBe("Hello there");
  expect(appendMessage(list, "note", "Jo Wu", "n", "Today")[1].id).toBe("m2");
  expect(bubbles(appendMessage([], "note", "Jo Wu", "n", "t"))[0].label).toBe(
    "Internal note",
  );
  const canned = [{ id: "g", label: "G", text: "Hi {name}." }];
  expect(insertCanned("", canned, "g", "Ann")).toBe("Hi Ann.");
  expect(insertCanned("Text  ", canned, "g", "Ann")).toBe("Text\n\nHi Ann.");
  expect(insertCanned("x", canned, "nope", "Ann")).toBe("x");
  expect(replyError("  ")).not.toBe("");
  expect(replyError("ok")).not.toBe("");
  expect(replyError("A real answer")).toBe("");
  expect(
    statusOptions(
      [
        ["a", "A"],
        ["b", "B"],
      ],
      "b",
    ).map((o) => o.selected),
  ).toEqual([false, true]);
});

test("suggestions: titles count double, empty search gives nothing", () => {
  const a = {
    id: "1",
    title: "Export CSV",
    snippet: "download the file",
    tag: "Reports",
    keywords: "excel",
  };
  const b = {
    id: "2",
    title: "Password",
    snippet: "export of keys",
    tag: "Account",
    keywords: "",
  };
  expect(scoreOf(a, "export")).toBe(2);
  expect(scoreOf(b, "export")).toBe(1);
  expect(suggest([b, a], "export").map((s) => s.id)).toEqual(["1", "2"]);
  expect(suggest([a, b], "  ")).toEqual([]);
  expect(suggest([a, b], "zzz")).toEqual([]);
  expect(suggest([a], "export csv")[0].hits).toBe("4 matches");
});

test("property cards: price text, match score, stable art", () => {
  const p: Property = {
    id: "p1",
    title: "House",
    address: "1 Road",
    city: "Town",
    price: 735000,
    beds: 4,
    baths: 2,
    area: 150,
    kind: "house",
    status: "active",
    agent: "A",
    listed: "2026-10-01",
  };
  const v = propertyViews([p], "p1", { p1: 92 });
  expect(v[0].price).toBe("$735,000");
  expect(v[0].facts).toBe("4 bed · 2 bath · 150 m²");
  expect(v[0].match).toBe("92% match");
  expect(v[0].selected).toBe(true);
  expect(propertyViews([p])[0].match).toBe("");
  expect(propertyViews([p])[0].art).toBe(v[0].art);
});

test("agenda: entries grouped by day in order", () => {
  const e = (id: string, date: string, time: string): AgendaEntry => ({
    id,
    date,
    time,
    title: id,
    sub: "",
    status: "booked",
    tone: "info",
    action: "",
    done: false,
  });
  const days = agendaDays(
    [
      e("c", "2026-11-04", "09:00"),
      e("b", "2026-11-03", "15:00"),
      e("a", "2026-11-03", "08:00"),
    ],
    "2026-11-03",
    "2026-11-04",
  );
  expect(days.map((d) => d.id)).toEqual(["2026-11-03", "2026-11-04"]);
  expect(days[0].entries.map((x) => x.id)).toEqual(["a", "b"]);
  expect(days[0].note).toBe("Today");
  expect(days[1].note).toBe("Tomorrow");
});

const FIELDS: FieldDef[] = [
  { id: "plan", label: "Plan", kind: "choice", choices: ["Free", "Pro"] },
  { id: "orders", label: "Orders", kind: "number" },
  { id: "city", label: "City", kind: "text" },
];
const AUD: Person[] = [
  { id: "1", plan: "Free", orders: 0, city: "Berlin" },
  { id: "2", plan: "Pro", orders: 12, city: "Bristol" },
  { id: "3", plan: "Pro", orders: 3, city: "Berlin" },
];

test("segment builder: rules, match all or any, live summary", () => {
  let rules = addRule([], FIELDS);
  expect(rules[0]).toMatchObject({ field: "plan", op: "is", value: "Free" });
  expect(segment(AUD, rules, FIELDS, true)).toHaveLength(1);
  rules = setField(rules, FIELDS, "r1", "orders");
  expect(rules[0]).toMatchObject({ op: "over", value: "0" });
  expect(segment(AUD, rules, FIELDS, true).map((p) => p.id)).toEqual([
    "2",
    "3",
  ]);
  rules = [...rules, { id: "r2", field: "city", op: "contains", value: "ber" }];
  expect(segment(AUD, rules, FIELDS, true).map((p) => p.id)).toEqual(["3"]);
  expect(segment(AUD, rules, FIELDS, false)).toHaveLength(3);
  expect(summary(AUD, rules, FIELDS, true)).toMatchObject({
    count: 1,
    total: 3,
    pct: 33,
  });
  expect(removeRule(rules, "r1")).toHaveLength(1);
  expect(segment(AUD, [], FIELDS, true)).toHaveLength(3);
  expect(
    passes(
      AUD[0],
      { id: "x", field: "plan", op: "isnt", value: "Free" },
      FIELDS,
    ),
  ).toBe(false);
  expect(
    passes(AUD[0], { id: "x", field: "city", op: "is", value: "" }, FIELDS),
  ).toBe(true);
  const view = ruleViews(rules, FIELDS)[0];
  expect(view.kind).toBe("number");
  expect(view.ops.find((o) => o.selected)?.value).toBe("over");
});

test("email: names filled in, paragraphs, validation, layout options", () => {
  expect(fill("Hi {{name}}, {{name}}!", "Ann")).toBe("Hi Ann, Ann!");
  expect(paragraphsOf("a\n\n\nb \n c")).toEqual(["a", "b \n c"]);
  expect(wordCount("  one two  three ")).toBe(3);
  const draft = {
    from: "x",
    subject: "S {{name}}",
    preheader: "",
    headline: "H",
    body: "one two three four five six",
    cta: "Go",
    layout: "promo" as const,
  };
  expect(emailErrors(draft)).toEqual({});
  expect(
    emailErrors({ ...draft, subject: " ", body: "short", cta: "" }),
  ).toEqual({
    subject: "Write a subject.",
    body: "The body is too short.",
    cta: "The button needs a label.",
  });
  expect(emailView(draft, "Ann").subject).toBe("S Ann");
  expect(emailView(draft, "Ann").emoji).toBe("🎁");
  const opts = templateOptions(
    [
      { id: "a", name: "A", description: "" },
      { id: "b", name: "B", description: "" },
    ],
    "b",
  );
  expect(opts.map((o) => o.selected)).toEqual([false, true]);
});
