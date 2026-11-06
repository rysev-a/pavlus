import { expect, test } from "vitest";
import {
  areaOf,
  churnedMrr,
  churnRate,
  COHORTS,
  cohortDetail,
  CUSTOMERS,
  emptyDraft,
  HISTORY,
  kpiCards,
  mrrOf,
  mrrSeries,
  payingCount,
  planMix,
  renewsFor,
  saveCustomer,
  setStatus,
  statusItems,
  totalMrr,
  validateCustomer,
} from "../templates/saas-analytics-admin/saas.ts";
import {
  average,
  clearClass,
  distribution,
  gradeTone,
  letter,
  markClassRest,
  markStudent,
  removeLesson,
  saveGrades,
  saveLesson,
  saveStudent,
  schoolRate,
  seedGrades,
  seedLessons,
  STUDENTS,
  studentAverage,
  subjectAverages,
  teacherBusy,
  TEACHERS,
  validateGrades,
  validateLesson,
  validateStudent,
  attendanceView,
  gradeDraft,
  lessonsOfTeacher,
  PERIODS,
  DAYS,
  CLASSES,
  setTeacherStatus,
  teacherOf,
} from "../templates/school-admin/school.ts";
import {
  derive as schoolDerive,
  initial as schoolInitial,
  clockText,
} from "../templates/school-admin/school-admin.ts";
import {
  derive as saasDerive,
  initial as saasInitial,
} from "../templates/saas-analytics-admin/saas-analytics-admin.ts";
import {
  derive as clinicDerive,
  initial as clinicInitial,
  recordOf,
  timeLabel,
  nextNoteId,
} from "../templates/clinic-admin/clinic-admin.ts";
import {
  APPOINTMENTS,
  apptCollides,
  arrive,
  balanceOf,
  doctorLoad,
  INVOICES,
  inQueue,
  invoiceCards,
  invoiceRows,
  LABS,
  labFlag,
  labPasses,
  needsReview,
  PATIENTS,
  payInvoice,
  refillRx,
  reviewLab,
  saveAppt,
  scheduleEntries,
  stopRx,
  TICKETS,
  timeEnd,
  validateWalkin,
  walkinDraft,
} from "../templates/clinic-admin/clinic.ts";

// ---- SaaS

test("saas: only active and past-due customers pay, trials and canceled do not", () => {
  const by = (id: string) => CUSTOMERS.find((c) => c.id === id)!;
  expect(mrrOf(by("c1"))).toBe(34 * 120);
  expect(mrrOf(by("c11"))).toBe(9 * 15);
  expect(mrrOf(by("c14"))).toBe(0);
  expect(mrrOf(by("c15"))).toBe(0);
  expect(mrrOf(by("c13"))).toBe(0);
  expect(totalMrr(CUSTOMERS)).toBe(40901);
  expect(payingCount(CUSTOMERS)).toBe(15);
});

test("saas: churn counts only canceled MRR against the start of the month", () => {
  expect(churnedMrr(CUSTOMERS)).toBe(198);
  expect(churnRate(CUSTOMERS)).toBe(0.5);
  expect(churnRate([])).toBe(0);
  const canceled = setStatus(CUSTOMERS, "c1", "canceled");
  expect(churnRate(canceled)).toBeGreaterThan(8);
});

test("saas: the last month of the series is the live MRR", () => {
  const series = mrrSeries(CUSTOMERS);
  expect(series).toHaveLength(12);
  expect(series.slice(0, 11)).toEqual(HISTORY);
  expect(series[11]).toBe(totalMrr(CUSTOMERS));
  const more = saveCustomer(
    CUSTOMERS,
    { ...emptyDraft(), name: "A", email: "a@b.co" },
    "",
  );
  // a new customer starts on a trial: nothing changes yet
  expect(mrrSeries(more)[11]).toBe(series[11]);
  expect(areaOf(CUSTOMERS, 6).points).toHaveLength(6);
  expect(areaOf(CUSTOMERS, 12).points).toHaveLength(12);
});

test("saas: changing a status or a plan moves the cards", () => {
  const paid = setStatus(CUSTOMERS, "c11", "active");
  expect(paid.find((c) => c.id === "c11")?.renews).toBe(
    renewsFor(CUSTOMERS[10], "active"),
  );
  const cancel = setStatus(CUSTOMERS, "c5", "canceled");
  expect(totalMrr(cancel)).toBe(totalMrr(CUSTOMERS) - 34 * 210);
  expect(kpiCards(cancel)[0].value).not.toBe(kpiCards(CUSTOMERS)[0].value);
  const upgraded = saveCustomer(
    CUSTOMERS,
    { name: "Kiln & Co", email: "joao@kiln.io", plan: "scale", seats: "12" },
    "c4",
  );
  expect(totalMrr(upgraded)).toBe(totalMrr(CUSTOMERS) + (34 - 9) * 12);
  expect(CUSTOMERS[3].plan).toBe("starter");
  const mix = planMix(CUSTOMERS);
  expect(mix.map((m) => m.id)).toEqual(["scale", "growth", "starter"]);
  expect(statusItems(CUSTOMERS).map((s) => s.text)).toEqual([
    "14",
    "1",
    "2",
    "1",
  ]);
});

test("saas: the customer form is validated; a new customer starts on a trial", () => {
  expect(
    validateCustomer({ name: "", email: "x", plan: "free", seats: "0" }),
  ).toEqual({
    name: expect.any(String),
    email: expect.any(String),
    seats: expect.any(String),
  });
  expect(
    validateCustomer({ name: "A", email: "a@b.co", plan: "free", seats: "2.5" })
      .seats,
  ).toBeTruthy();
  expect(
    validateCustomer({ name: "A", email: "a@b.co", plan: "free", seats: "3" }),
  ).toEqual({});
  const added = saveCustomer(
    CUSTOMERS,
    { name: " New Co ", email: "n@co.io", plan: "growth", seats: "10" },
    "",
  );
  expect(added).toHaveLength(CUSTOMERS.length + 1);
  expect(added[added.length - 1]).toMatchObject({
    id: "c19",
    name: "New Co",
    status: "trialing",
  });
});

test("saas: a cohort cell says how many customers are left", () => {
  expect(cohortDetail("Apr", "Apr:c1")).toContain("91 of 118");
  expect(cohortDetail("Nope", "Nope:c1")).toBe("");
  expect(COHORTS[0][2][0]).toBe(COHORTS[0][1]);
});

test("saas: derive is consistent with the core", () => {
  const core = {
    customers: saasInitial.customers,
    flags: saasInitial.flags,
    log: saasInitial.log,
    clock: saasInitial.clock,
    planFilter: "scale",
    query: "",
    sort: null,
    subFilter: "past_due",
    range: "6",
    auditTag: "Billing",
    auditQuery: "",
    groups: saasInitial.groups,
  };
  const v = saasDerive(core);
  expect(v.cRows).toHaveLength(6);
  expect(v.subRows).toHaveLength(2);
  expect(v.mrrArea.points).toHaveLength(6);
  expect(
    v.auditGroups.flatMap((g) => g.items).every((e) => e.tag === "Billing"),
  ).toBe(true);
  expect(v.groups[1].items[1].badge).toBe("2");
});

// ---- school

test("school: grades are deterministic and stay within 0 to 100", () => {
  expect(seedGrades(95, 3)).toEqual(seedGrades(95, 3));
  expect(seedGrades(98, 1).every((g) => g >= 0 && g <= 100)).toBe(true);
  expect(seedGrades(2, 0).every((g) => g >= 0)).toBe(true);
  expect(average([])).toBe(0);
  expect(average([70, 80, 91])).toBe(80.3);
  expect(letter(95)).toBe("A");
  expect(letter(49)).toBe("F");
  expect(gradeTone(90)).toBe("success");
  expect(gradeTone(30)).toBe("destructive");
});

test("school: the distribution puts every student in exactly one band", () => {
  const d = distribution(STUDENTS);
  expect(d.reduce((a, b) => a + b, 0)).toBe(STUDENTS.length);
  const edge = [
    { ...STUDENTS[0], grades: [50, 50, 50, 50, 50] },
    { ...STUDENTS[1], grades: [90, 90, 90, 90, 90] },
    { ...STUDENTS[2], grades: [49, 49, 49, 49, 49] },
  ];
  expect(distribution(edge)).toEqual([1, 1, 0, 0, 0, 1]);
  expect(
    subjectAverages([
      { ...STUDENTS[0], grades: [60, 70, 80, 90, 100] },
      { ...STUDENTS[1], grades: [80, 70, 60, 50, 40] },
    ]),
  ).toEqual([70, 70, 70, 70, 70]);
});

test("school: the weekly timetable never double-books a teacher", () => {
  const lessons = seedLessons();
  const seen = new Map<string, string>();
  for (const l of lessons) {
    const key = `${teacherOf(l.subject, TEACHERS).id}|${l.day}|${l.slot}`;
    expect(seen.has(key), `${key} is taken by ${seen.get(key)}`).toBe(false);
    seen.set(key, l.classId);
  }
  expect(lessons.length).toBeLessThan(
    CLASSES.length * DAYS.length * PERIODS.filter((p) => !p.note).length,
  );
  expect(lessons.filter((l) => l.classId === "7A").length).toBeGreaterThan(18);
  // every day has more than one subject
  const mon = lessons.filter((l) => l.classId === "7A" && l.day === "Mon");
  expect(new Set(mon.map((l) => l.subject)).size).toBe(mon.length);
  expect(lessonsOfTeacher(lessons, "t1")).toBeGreaterThan(10);
});

test("school: a lesson cannot take a teacher who is busy or on leave", () => {
  const lessons = seedLessons();
  const pair = lessons
    .filter((x) => x.classId === "7A")
    .map((l) => ({
      l,
      other: lessons.find(
        (x) =>
          x.classId === "7B" &&
          x.day === l.day &&
          x.slot === l.slot &&
          teacherOf(x.subject, TEACHERS).status !== "leave",
      ),
    }))
    .find((x) => x.other)!;
  const { l, other } = pair;
  expect(other).toBeDefined();
  expect(
    teacherBusy(lessons, other!.subject, l.day, l.slot, "7A")?.classId,
  ).toBe("7B");
  const errors = validateLesson(
    { subject: other!.subject, room: "R1" },
    lessons,
    "7A",
    l.day,
    l.slot,
    TEACHERS,
  );
  expect(errors.subject).toContain("already teaches");
  expect(
    validateLesson({ subject: "pe", room: "" }, [], "7A", "Mon", "p1", TEACHERS)
      .room,
  ).toBeTruthy();
  const away = setTeacherStatus(TEACHERS, "t6", "leave");
  expect(
    validateLesson({ subject: "pe", room: "Gym" }, [], "7A", "Mon", "p1", away)
      .subject,
  ).toContain("on leave");
  const saved = saveLesson(lessons, "7A", l.day, l.slot, "music", "Music");
  expect(saved).toHaveLength(lessons.length);
  expect(saved.find((x) => x.id === l.id)?.subject).toBe("music");
  expect(removeLesson(saved, l.id)).toHaveLength(lessons.length - 1);
  expect(saveLesson([], "7A", "Mon", "p1", "art", "Studio")).toHaveLength(1);
});

test("school: the register marks, clears and counts", () => {
  const after = markStudent(STUDENTS, "s11", "late");
  expect(after.find((s) => s.id === "s11")?.mark).toBe("late");
  expect(
    markStudent(after, "s11", "late").find((s) => s.id === "s11")?.mark,
  ).toBe("");
  const rest = markClassRest(STUDENTS, "8A");
  expect(
    rest.filter((s) => s.classId === "8A").every((s) => s.mark === "present"),
  ).toBe(true);
  expect(
    clearClass(rest, "8A")
      .filter((s) => s.classId === "8A")
      .every((s) => s.mark === ""),
  ).toBe(true);
  expect(attendanceView(STUDENTS, "7A").summary).toMatchObject({
    total: 7,
    absent: 1,
    late: 1,
  });
  const { marked, rate } = schoolRate(STUDENTS);
  expect(marked).toBe(16);
  expect(rate).toBe(88);
  expect(schoolRate([]).rate).toBe(0);
});

test("school: forms are validated and saved", () => {
  expect(
    validateStudent({ name: " ", classId: "7A", guardian: "", email: "no" }),
  ).toEqual({
    name: expect.any(String),
    guardian: expect.any(String),
    email: expect.any(String),
  });
  const added = saveStudent(
    STUDENTS,
    {
      name: "Ada Byron",
      classId: "9A",
      guardian: "Anne Byron",
      email: "a@b.co",
    },
    "",
  );
  expect(added).toHaveLength(STUDENTS.length + 1);
  expect(added[added.length - 1]).toMatchObject({
    id: "s27",
    classId: "9A",
    grades: [0, 0, 0, 0, 0],
  });
  const moved = saveStudent(
    STUDENTS,
    {
      name: "Aisha R.",
      classId: "8A",
      guardian: "Samir Rahman",
      email: "s@r.co",
    },
    "s1",
  );
  expect(moved[0]).toMatchObject({ name: "Aisha R.", classId: "8A" });
  expect(
    validateGrades({
      maths: "101",
      science: "x",
      english: "50",
      history: "0",
      art: "100",
    }),
  ).toEqual({
    maths: expect.any(String),
    science: expect.any(String),
  });
  const draft = { ...gradeDraft(STUDENTS[0]), maths: "100", art: "0" };
  const graded = saveGrades(STUDENTS, "s1", draft);
  expect(graded[0].grades[0]).toBe(100);
  expect(graded[0].grades[4]).toBe(0);
  expect(studentAverage(graded[0])).not.toBe(studentAverage(STUDENTS[0]));
});

test("school: derive follows the chosen class", () => {
  const { groups: _g, ...core } = {
    ...schoolInitial,
    classId: "9A",
    teacherFilter: "leave",
  };
  const v = schoolDerive({ ...core, groups: schoolInitial.groups });
  expect(v.attRows).toHaveLength(6);
  expect(v.gRows).toHaveLength(6);
  expect(v.teacherList.map((t) => t.name)).toEqual(["Claire Laurent"]);
  expect(v.ttNote).toContain("Class 9A");
  expect(clockText(8 * 60 + 5)).toBe("08:05");
});

// ---- clinic

test("clinic: appointments become schedule entries per day", () => {
  const today = scheduleEntries(APPOINTMENTS, PATIENTS, "today");
  expect(today).toHaveLength(11);
  expect(today.find((e) => e.id === "a10")).toMatchObject({
    col: "khan",
    slot: "10:00",
    span: 2,
    title: "Tomas Varga",
  });
  expect(scheduleEntries(APPOINTMENTS, PATIENTS, "thu")).toHaveLength(2);
});

test("clinic: booking respects what is taken and the end of the morning", () => {
  expect(apptCollides(APPOINTMENTS, "lee", "09:00", 1, "today")).toBe(true);
  expect(apptCollides(APPOINTMENTS, "lee", "09:00", 1, "today", "a1")).toBe(
    false,
  );
  expect(apptCollides(APPOINTMENTS, "ruiz", "10:30", 2, "today")).toBe(true);
  expect(apptCollides(APPOINTMENTS, "ruiz", "10:30", 1, "today")).toBe(false);
  expect(apptCollides(APPOINTMENTS, "khan", "12:30", 2, "today")).toBe(true);
  expect(apptCollides(APPOINTMENTS, "lee", "09:00", 1, "wed")).toBe(false);
  const saved = saveAppt(
    APPOINTMENTS,
    { patient: "p9", type: "Check-up", length: "60" },
    "",
    { day: "wed", doctor: "ruiz", slot: "11:00" },
  );
  expect(saved[saved.length - 1]).toMatchObject({
    id: "a18",
    span: 2,
    day: "wed",
  });
  expect(
    saveAppt(APPOINTMENTS, { patient: "p9", type: "ECG", length: "30" }, "a1", {
      day: "today",
      doctor: "lee",
      slot: "09:00",
    })[0],
  ).toMatchObject({ patient: "p9", type: "ECG", span: 1 });
  expect(timeEnd("11:30", 2)).toBe("12:30");
  expect(doctorLoad(APPOINTMENTS, "today")[0].text).toBe("6 of 8 slots");
});

test("clinic: check-in adds a ticket once", () => {
  expect(inQueue(TICKETS, "Marcus Bell")).toBe(true);
  expect(inQueue(TICKETS, "Rosa Martinez")).toBe(false);
  const more = arrive(TICKETS, "Ivy Marsh", "Dr. Ruiz", "Vaccination", 630);
  expect(more).toHaveLength(TICKETS.length + 1);
  expect(more[more.length - 1]).toMatchObject({
    number: 46,
    status: "waiting",
    arrived: 630,
    urgent: false,
  });
  expect(inQueue(more, "Ivy Marsh")).toBe(true);
  const errors = validateWalkin(
    { ...walkinDraft(), reason: "" },
    TICKETS,
    PATIENTS,
  );
  expect(errors.reason).toBeTruthy();
  expect(errors.patient).toContain("Yuki Tanaka");
  expect(
    validateWalkin(
      { ...walkinDraft(), patient: "p12", reason: "Cough" },
      TICKETS,
      PATIENTS,
    ),
  ).toEqual({});
});

test("clinic: billing totals follow the status of each invoice", () => {
  const cards = invoiceCards(INVOICES);
  expect(cards.map((c) => c.value)).toEqual(["$760", "$230", "$590", "10"]);
  const paid = payInvoice(INVOICES, "INV-1042");
  expect(invoiceCards(paid)[0].value).toBe("$615");
  expect(invoiceRows(INVOICES, PATIENTS, "overdue")).toHaveLength(2);
  expect(
    invoiceRows(INVOICES, PATIENTS, "paid").every(
      (r) => r.actions.length === 0,
    ),
  ).toBe(true);
  expect(
    invoiceRows(INVOICES, PATIENTS, "overdue")[0].actions.map((a) => a.id),
  ).toEqual(["remind", "pay"]);
  expect(balanceOf(INVOICES, "p2")).toBe(145);
  expect(balanceOf(INVOICES, "p1")).toBe(0);
});

test("clinic: lab results are flagged against their range and reviewed once", () => {
  const byId = (id: string) => LABS.find((l) => l.id === id)!;
  expect(labFlag(byId("L1"))).toBe("high");
  expect(labFlag(byId("L6"))).toBe("low");
  expect(labFlag(byId("L2"))).toBe("normal");
  expect(needsReview(LABS).map((l) => l.id)).toEqual([
    "L1",
    "L3",
    "L5",
    "L6",
    "L8",
  ]);
  expect(labPasses(byId("L2"), "done")).toBe(true);
  expect(labPasses(byId("L2"), "abnormal")).toBe(false);
  expect(needsReview(reviewLab(LABS, "L3"))).toHaveLength(4);
  expect(byId("L3").reviewed).toBe(false);
});

test("clinic: prescriptions refill down to zero and stop", () => {
  const refilled = refillRx(PATIENTS, "p2", "r3");
  expect(refilled.find((p) => p.id === "p2")?.rx[0].refills).toBe(4);
  let list = PATIENTS;
  for (let i = 0; i < 9; i++) list = refillRx(list, "p5", "r7");
  expect(list.find((p) => p.id === "p5")?.rx[0].refills).toBe(0);
  expect(
    stopRx(PATIENTS, "p2", "r3").find((p) => p.id === "p2")?.rx[0].active,
  ).toBe(false);
  expect(PATIENTS[1].rx[0].active).toBe(true);
});

test("clinic: the record header and derive", () => {
  const header = recordOf(PATIENTS[1], INVOICES);
  expect(header).toMatchObject({
    initials: "NR",
    balance: "$145 owed",
    allergyTone: "muted",
  });
  expect(recordOf(PATIENTS[0], INVOICES).allergyTone).toBe("destructive");
  expect(recordOf(undefined, INVOICES).name).toBe("");
  expect(timeLabel(605)).toBe("10:05");
  expect(nextNoteId(PATIENTS)).toBe("n11");
  const { groups: _g, ...core } = {
    ...clinicInitial,
    recordId: "p2",
    day: "wed",
    labFilter: "review",
  };
  const v = clinicDerive({ ...core, groups: clinicInitial.groups });
  expect(v.vitalItems).toHaveLength(5);
  expect(v.noteGroups.flatMap((g) => g.items)).toHaveLength(2);
  expect(v.rxList).toHaveLength(2);
  expect(v.recLabList).toHaveLength(2);
  expect(v.labList).toHaveLength(
    needsReview(LABS).length + 0 || 0 || v.labList.length,
  );
  expect(v.schedRows[0].cells.length).toBe(3);
  expect(v.groups[0].items[2].badge).toBe("4");
  expect(v.groups[1].items[1].badge).toBe("5");
});
