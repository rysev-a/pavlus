import { expect, test } from "vitest";
import {
  addDays,
  addMonths,
  applyDraft,
  bookClass,
  bookingOf,
  canTrain,
  cancelBooking,
  CLASSES,
  clientsOf,
  dateText,
  dayNumber,
  daysBetween,
  deskTime,
  findMembers,
  hasRoom,
  hoursOf,
  isoOf,
  m,
  MEMBERS,
  memberPasses,
  PAYMENTS,
  payPasses,
  payStatus,
  PLANS,
  promoted,
  relative,
  renew,
  spotsLeft,
  statusOf,
  sumOf,
  takenOf,
  toggleFreeze,
  validateMember,
} from "../templates/gym-membership-admin/gym.ts";
import {
  memberGrid,
  memberSortValue,
  planEntries,
  PLAN_ENTRIES,
} from "../templates/gym-membership-admin/gym-views.ts";
import {
  derive,
  dueThisWeek,
  insideList,
  memberSheet,
  peopleInside,
  saveMember,
} from "../templates/gym-membership-admin/gym-membership-admin.ts";
import {
  CLASSES as C,
  SEED_INSIDE,
  TRAINERS,
} from "../templates/gym-membership-admin/gym.ts";

const base = () => ({
  members: MEMBERS,
  prices: PLAN_ENTRIES,
  payments: PAYMENTS,
  classes: CLASSES,
  trainers: TRAINERS,
  inside: SEED_INSIDE,
  deskCount: 0,
  memberFilter: "all",
  memberQuery: "",
  sort: null,
  deskTab: "find",
  deskQuery: "",
  dayFilter: "0",
  actor: "m3",
  payFilter: "all",
  groups: [],
});

test("gym dates: ISO days are worked out without a clock", () => {
  expect(dayNumber("1970-01-01")).toBe(0);
  expect(isoOf(dayNumber("2026-11-03"))).toBe("2026-11-03");
  expect(dayNumber("2026-02-30")).toBeNaN();
  expect(dayNumber("nope")).toBeNaN();
  expect(daysBetween("2026-11-03", "2026-11-05")).toBe(2);
  expect(daysBetween("2026-11-03", "2026-10-28")).toBe(-6);
  expect(addDays("2026-12-30", 3)).toBe("2027-01-02");
});

test("gym dates: months keep the day, and stop at the end of a short month", () => {
  expect(addMonths("2026-11-03", 1)).toBe("2026-12-03");
  expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
  expect(addMonths("2026-11-30", 3)).toBe("2027-02-28");
  expect(addMonths("2026-11-03", 12)).toBe("2027-11-03");
  expect(addMonths("2024-01-31", 1)).toBe("2024-02-29");
});

test("gym dates: text for a day and a distance", () => {
  expect(dateText("2026-12-04")).toBe("4 Dec 2026");
  expect(dateText("oops")).toBe("oops");
  expect(relative("2026-11-03")).toBe("today");
  expect(relative("2026-11-04")).toBe("tomorrow");
  expect(relative("2026-11-02")).toBe("yesterday");
  expect(relative("2026-11-10")).toBe("in 7 days");
  expect(relative("2026-10-28")).toBe("6 days ago");
});

test("gym members: expired, expiring, active and frozen", () => {
  expect(statusOf(m("a", "A", "monthly", "2026-11-02", 0, 2026))).toBe(
    "expired",
  );
  expect(statusOf(m("a", "A", "monthly", "2026-11-03", 0, 2026))).toBe(
    "expiring",
  );
  expect(statusOf(m("a", "A", "monthly", "2026-11-17", 0, 2026))).toBe(
    "expiring",
  );
  expect(statusOf(m("a", "A", "monthly", "2026-11-18", 0, 2026))).toBe(
    "active",
  );
  expect(statusOf(m("a", "A", "monthly", "2020-01-01", 0, 2026, true))).toBe(
    "frozen",
  );
  expect(canTrain(MEMBERS[3])).toBe(false);
  expect(canTrain(MEMBERS[1])).toBe(true);
  expect(
    MEMBERS.filter((x) => memberPasses(x, "expired")).map((x) => x.id),
  ).toEqual(["m4", "m10", "m17"]);
});

test("gym members: renewing starts from the later of the expiry and today", () => {
  const monthly = PLANS[0];
  const expired = m("a", "A", "monthly", "2026-10-15", 0, 2026);
  expect(renew(expired, monthly).expires).toBe("2026-12-03");
  const soon = m("b", "B", "monthly", "2026-11-05", 0, 2026);
  expect(renew(soon, monthly).expires).toBe("2026-12-05");
  const frozen = m("c", "C", "quarterly", "2026-11-10", 0, 2026, true);
  expect(renew(frozen, PLANS[1]).frozen).toBe(false);
  expect(renew(frozen, PLANS[1]).expires).toBe("2027-02-10");
  expect(toggleFreeze(expired).frozen).toBe(true);
  expect(expired.expires).toBe("2026-10-15");
});

test("gym members: a search finds a name or a plan", () => {
  expect(findMembers(MEMBERS, PLANS, "").length).toBe(MEMBERS.length);
  expect(findMembers(MEMBERS, PLANS, "grace").map((x) => x.id)).toEqual(["m7"]);
  expect(findMembers(MEMBERS, PLANS, "student").map((x) => x.id)).toEqual([
    "m6",
    "m11",
    "m19",
  ]);
  expect(findMembers(MEMBERS, PLANS, "zzz")).toEqual([]);
});

test("gym desk: the floor has a limit, day passes count", () => {
  expect(hasRoom(26)).toBe(true);
  expect(hasRoom(27)).toBe(false);
  expect(deskTime(0)).toBe("18:40");
  expect(deskTime(10)).toBe("19:00");
  expect(peopleInside(SEED_INSIDE)).toBe(11 + 3);
  expect(insideList(MEMBERS, SEED_INSIDE).map((x) => x.id)[0]).toBe("m1");
  expect(insideList(MEMBERS, { nobody: "18:00" })).toEqual([]);
});

const yoga = C.find((c) => c.id === "c1")!;
const hiit = C.find((c) => c.id === "c2")!;

test("gym classes: booking fills the class, then the waitlist", () => {
  expect(takenOf(yoga)).toBe(11);
  expect(spotsLeft(yoga)).toBe(3);
  expect(bookingOf(yoga, "m5")).toBe("booked");
  expect(bookingOf(yoga, "m1")).toBe("open");
  expect(bookingOf(hiit, "m8")).toBe("waitlist");
  expect(bookingOf(hiit, "m1")).toBe("full");
  const booked = bookClass(yoga, "m1");
  expect(booked.booked).toContain("m1");
  expect(spotsLeft(booked)).toBe(2);
  expect(bookClass(booked, "m1")).toBe(booked);
  const waiting = bookClass(hiit, "m1");
  expect(waiting.waitlist).toEqual(["m8", "m15", "m1"]);
  expect(waiting.booked).toEqual(hiit.booked);
  expect(yoga.booked).toEqual(["m5", "m9"]);
});

test("gym classes: a cancellation moves the first of the waitlist up", () => {
  const after = cancelBooking(hiit, "m3");
  expect(after.booked).toContain("m8");
  expect(after.booked).not.toContain("m3");
  expect(after.waitlist).toEqual(["m15"]);
  expect(takenOf(after)).toBe(takenOf(hiit));
  expect(promoted(hiit, "m3")).toBe("m8");
  expect(promoted(hiit, "m8")).toBeNull();
  expect(cancelBooking(hiit, "m8").waitlist).toEqual(["m15"]);
  expect(cancelBooking(yoga, "m5").booked).toEqual(["m9"]);
  expect(cancelBooking(yoga, "m5").waitlist).toEqual([]);
  expect(cancelBooking(yoga, "nobody")).toBe(yoga);
});

test("gym trainers: teaching hours and people booked", () => {
  expect(hoursOf(CLASSES, "Priya Nair")).toBe(2.3);
  expect(hoursOf(CLASSES, "Nobody")).toBe(0);
  expect(clientsOf(CLASSES, "Marta Kowal")).toBe(11 + 4 + 8);
});

test("gym payments: paid, due or overdue by the day", () => {
  const byId = (id: string) => PAYMENTS.find((p) => p.id === id)!;
  expect(payStatus(byId("p1"))).toBe("overdue");
  expect(payStatus(byId("p4"))).toBe("due");
  expect(payStatus(byId("p9"))).toBe("paid");
  expect(payStatus({ ...byId("p1"), due: "2026-11-03" })).toBe("due");
  expect(PAYMENTS.filter((p) => payPasses(p, "overdue")).length).toBe(3);
  expect(sumOf(PAYMENTS, (p) => payStatus(p) === "overdue")).toBe(227);
  expect(dueThisWeek(PAYMENTS)).toBe(49 + 129);
});

test("gym member form: a name and a real date", () => {
  expect(
    validateMember({ name: " ", plan: "monthly", expires: "2026-12-01" }).name,
  ).toBeTruthy();
  expect(
    validateMember({ name: "A", plan: "monthly", expires: "2026-13-01" })
      .expires,
  ).toBeTruthy();
  expect(
    validateMember({ name: "A", plan: "monthly", expires: "2026-12-01" }),
  ).toEqual({});
  const changed = applyDraft(MEMBERS[0], {
    name: " New Name ",
    plan: "student",
    expires: "2027-01-01",
  });
  expect(changed).toMatchObject({
    name: "New Name",
    plan: "student",
    expires: "2027-01-01",
    visits: 212,
  });
  const added = saveMember(
    MEMBERS,
    { name: "Zed", plan: "monthly", expires: "2026-12-03" },
    "",
  );
  expect(added).toHaveLength(MEMBERS.length + 1);
  expect(added[added.length - 1]).toMatchObject({ id: "m23", visits: 0 });
  const edited = saveMember(
    MEMBERS,
    { name: "Zed", plan: "monthly", expires: "2026-12-03" },
    "m2",
  );
  expect(edited[1].name).toBe("Zed");
  expect(edited).toHaveLength(MEMBERS.length);
  expect(
    memberSheet(
      "m2",
      { name: "Bruno", plan: "monthly", expires: "2026-11-05" },
      MEMBERS,
    ).details,
  ).toHaveLength(3);
  expect(
    memberSheet(
      "",
      { name: "", plan: "monthly", expires: "2026-12-03" },
      MEMBERS,
    ).details,
  ).toEqual([]);
  expect(
    memberSheet("", { name: "", plan: "monthly", expires: "x" }, MEMBERS, {
      name: "e",
    }).fields[0].error,
  ).toBe("e");
});

test("gym members grid: sorting by a column", () => {
  expect(memberSortValue(MEMBERS[0], "visits")).toBe(212);
  expect(memberSortValue(MEMBERS[0], "plan")).toBe("Annual");
  expect(memberSortValue(MEMBERS[3], "status")).toBe(0);
  const grid = memberGrid(MEMBERS, { key: "visits", dir: "desc" });
  expect(grid.memberRows[0].id).toBe("m1");
  expect(grid.memberCols.find((c) => c.key === "visits")?.dir).toBe("desc");
  expect(memberGrid(MEMBERS, null).memberRows[0].id).toBe("m1");
});

test("gym plans: the count of members on each plan", () => {
  const entries = planEntries(PLAN_ENTRIES, MEMBERS);
  expect(entries.map((e) => e.sub)).toEqual([
    "8 members",
    "5 members",
    "6 members",
    "3 members",
    "0 members",
  ]);
  expect(
    planEntries(PLAN_ENTRIES, [MEMBERS[0]]).find((e) => e.id === "annual")?.sub,
  ).toBe("1 member");
});

test("gym: the views agree with the data", () => {
  const v = derive(base());
  expect(v.stats[0].value).toBe("17");
  expect(v.stats[1].value).toBe("14");
  expect(v.stats[3].value).toBe("$227");
  expect(v.meter.value).toBe(14);
  expect(v.deskRows).toHaveLength(8);
  expect(v.deskRows.find((r) => r.id === "m1")?.actions[0].id).toBe("out");
  expect(v.deskRows.find((r) => r.id === "m4")?.actions[0].disabled).toBe(true);
  expect(v.classRows).toHaveLength(3);
  expect(v.dayFilters.map((f) => f.count)).toEqual([3, 4, 3, 3]);
  expect(v.trainerRows).toHaveLength(5);
  expect(v.payRows[0].id).toBe("p3");
  expect(v.soon.map((r) => r.id)).toEqual(["m17", "m10", "m4", "m2"]);
  expect(v.groups).toEqual([]);
});

test("gym: filters, search and the desk tabs change what is listed", () => {
  const exp = derive({ ...base(), memberFilter: "expired" });
  expect(exp.memberRows.map((r) => r.id).sort()).toEqual(["m10", "m17", "m4"]);
  const q = derive({ ...base(), memberQuery: "okoye" });
  expect(q.memberRows).toHaveLength(1);
  expect(q.memberFooter).toBe("1 of 22 members");
  const inside = derive({ ...base(), deskTab: "inside" });
  expect(inside.deskRows).toHaveLength(11);
  const full = derive({
    ...base(),
    inside: Object.fromEntries(
      MEMBERS.slice(0, 27).map((x, i) => [x.id + i, "18:00"]),
    ),
  });
  expect(full.meter.status).not.toBe("Quiet");
  const late = derive({ ...base(), actor: "m4" });
  expect(late.classRows[0].actions[0].disabled).toBe(true);
  const paid = derive({ ...base(), payFilter: "paid" });
  expect(paid.payRows).toHaveLength(4);
});
