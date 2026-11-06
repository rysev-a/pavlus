import type { Tone } from "../../blocks/admin-shell/shell.ts";

// ---- dates: plain ISO days (`2026-11-03`), worked out without a clock

export const TODAY = "2026-11-03";
export const CAPACITY = 30;
/** People on the floor who are not members (day passes), seeded. */
export const DAY_PASSES = 3;

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/** Pure: an ISO day to a day number (days since 1970). `NaN` when it is not a date. */
export function dayNumber(iso: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return NaN;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const t = Date.UTC(y, mo - 1, d);
  const back = new Date(t);
  if (back.getUTCMonth() !== mo - 1 || back.getUTCDate() !== d) return NaN;
  return Math.round(t / 86400000);
}

const pad = (n: number): string => (n < 10 ? `0${n}` : String(n));

/** Pure: a day number back to an ISO day. */
export function isoOf(day: number): string {
  const d = new Date(day * 86400000);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

export const addDays = (iso: string, n: number): string =>
  isoOf(dayNumber(iso) + n);

/** Pure: `n` months later; a 31st lands on the last day of a shorter month. */
export function addMonths(iso: string, n: number): string {
  const day = dayNumber(iso);
  const d = new Date(day * 86400000);
  const total = d.getUTCFullYear() * 12 + d.getUTCMonth() + n;
  const y = Math.floor(total / 12);
  const m = total % 12;
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return `${y}-${pad(m + 1)}-${pad(Math.min(d.getUTCDate(), last))}`;
}

/** Pure: days from `from` to `to` (negative when `to` is earlier). */
export const daysBetween = (from: string, to: string): number =>
  dayNumber(to) - dayNumber(from);

/** Pure: `2026-12-14` as `14 Dec 2026`. */
export function dateText(iso: string): string {
  const d = dayNumber(iso);
  if (Number.isNaN(d)) return iso;
  const [y, m, day] = iso.split("-").map(Number);
  return `${day} ${MONTHS[m - 1]} ${y}`;
}

/** Pure: `in 5 days`, `today`, `3 days ago`. */
export function relative(iso: string, today = TODAY): string {
  const n = daysBetween(today, iso);
  if (n === 0) return "today";
  if (n === 1) return "tomorrow";
  if (n === -1) return "yesterday";
  return n > 0 ? `in ${n} days` : `${-n} days ago`;
}

// ---- members

export type MemberStatus = "active" | "expiring" | "expired" | "frozen";

export interface Member {
  id: string;
  name: string;
  plan: string;
  /** ISO day the plan runs out. */
  expires: string;
  frozen: boolean;
  visits: number;
  /** The year they joined. */
  since: number;
}

export interface Plan {
  id: string;
  name: string;
  months: number;
}

export const STATUS_LABEL: Record<MemberStatus, string> = {
  active: "Active",
  expiring: "Expiring",
  expired: "Expired",
  frozen: "Frozen",
};

export const STATUS_TONE: Record<MemberStatus, Tone> = {
  active: "success",
  expiring: "warning",
  expired: "destructive",
  frozen: "info",
};

/** How many days ahead a plan counts as "expiring". */
export const EXPIRING_DAYS = 14;

/** Pure: the status of a member. */
export function statusOf(m: Member, today = TODAY): MemberStatus {
  if (m.frozen) return "frozen";
  const left = daysBetween(today, m.expires);
  if (left < 0) return "expired";
  return left <= EXPIRING_DAYS ? "expiring" : "active";
}

/** Pure: may this member train today? */
export const canTrain = (m: Member, today = TODAY): boolean => {
  const s = statusOf(m, today);
  return s === "active" || s === "expiring";
};

/** Pure: the member with a plan renewed: from the later of the expiry and today. */
export function renew(m: Member, plan: Plan, today = TODAY): Member {
  const from = daysBetween(today, m.expires) > 0 ? m.expires : today;
  return { ...m, expires: addMonths(from, plan.months), frozen: false };
}

export const toggleFreeze = (m: Member): Member => ({
  ...m,
  frozen: !m.frozen,
});

export const MEMBER_FILTERS: [string, string][] = [
  ["all", "All"],
  ["active", "Active"],
  ["expiring", "Expiring"],
  ["expired", "Expired"],
  ["frozen", "Frozen"],
];

/** Pure: does a member pass a filter tab? */
export const memberPasses = (m: Member, id: string, today = TODAY): boolean =>
  statusOf(m, today) === id;

export const m = (
  id: string,
  name: string,
  plan: string,
  expires: string,
  visits: number,
  since: number,
  frozen = false,
): Member => ({ id, name, plan, expires, frozen, visits, since });

export const PLANS: Plan[] = [
  { id: "monthly", name: "Monthly", months: 1 },
  { id: "quarterly", name: "Quarterly", months: 3 },
  { id: "annual", name: "Annual", months: 12 },
  { id: "student", name: "Student", months: 1 },
];

export const MEMBERS: Member[] = [
  m("m1", "Amara Okoye", "annual", "2027-03-18", 212, 2023),
  m("m2", "Bruno Fischer", "monthly", "2026-11-05", 34, 2026),
  m("m3", "Chloe Martin", "quarterly", "2027-01-09", 71, 2025),
  m("m4", "Daniel Kowalski", "monthly", "2026-10-28", 18, 2026),
  m("m5", "Elena Petrova", "annual", "2027-06-02", 148, 2024),
  m("m6", "Farid Haddad", "student", "2026-11-12", 41, 2026),
  m("m7", "Grace Nakamura", "monthly", "2026-11-27", 29, 2026),
  m("m8", "Hugo Lindqvist", "quarterly", "2026-12-20", 88, 2025),
  m("m9", "Ines Duarte", "annual", "2027-02-14", 190, 2023),
  m("m10", "Jamal Williams", "monthly", "2026-10-15", 12, 2026),
  m("m11", "Katya Ivanova", "student", "2026-11-30", 55, 2026),
  m("m12", "Liam O'Connor", "quarterly", "2026-11-09", 63, 2025),
  m("m13", "Mina Cho", "annual", "2027-05-21", 120, 2024),
  m("m14", "Nikolai Sorokin", "monthly", "2026-12-04", 22, 2026, true),
  m("m15", "Olivia Brandt", "monthly", "2026-11-22", 47, 2025),
  m("m16", "Pablo Reyes", "annual", "2027-04-07", 163, 2024),
  m("m17", "Quinn Abbott", "quarterly", "2026-09-30", 40, 2025),
  m("m18", "Rosa Moretti", "monthly", "2026-12-12", 31, 2026),
  m("m19", "Samir Qureshi", "student", "2026-11-14", 26, 2026),
  m("m20", "Tilda Nyberg", "annual", "2027-01-30", 175, 2023),
  m("m21", "Umar Bello", "monthly", "2026-11-18", 38, 2026),
  m("m22", "Vera Lang", "quarterly", "2027-02-02", 59, 2025, true),
];

/** Ids of the members on the floor at the start, and when they came. */
export const SEED_INSIDE: Record<string, string> = {
  m1: "17:05",
  m3: "17:40",
  m5: "17:52",
  m7: "18:10",
  m9: "18:12",
  m13: "18:20",
  m15: "18:25",
  m16: "18:31",
  m18: "18:33",
  m20: "18:36",
  m21: "18:38",
};

/** Pure: the time label of the `n`th check-in made at the desk (18:40 on). */
export function deskTime(n: number): string {
  const minutes = 18 * 60 + 40 + n * 2;
  return `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
}

/** Check-ins by hour before 18:40: [label, count]. */
export const CHECKINS: [string, number][] = [
  ["6", 14],
  ["7", 22],
  ["8", 17],
  ["9", 9],
  ["10", 6],
  ["11", 7],
  ["12", 19],
  ["13", 15],
  ["14", 6],
  ["15", 8],
  ["16", 13],
  ["17", 27],
  ["18", 24],
  ["19", 0],
  ["20", 0],
  ["21", 0],
];

/** Pure: can another person come in? */
export const hasRoom = (inside: number, passes = DAY_PASSES): boolean =>
  inside + passes < CAPACITY;

/** Pure: members that match a text (name or plan name). */
export function findMembers(
  list: Member[],
  plans: Plan[],
  query: string,
): Member[] {
  const q = query.trim().toLowerCase();
  if (!q) return list;
  return list.filter(
    (x) =>
      x.name.toLowerCase().includes(q) ||
      (plans.find((p) => p.id === x.plan)?.name ?? "")
        .toLowerCase()
        .includes(q),
  );
}

// ---- classes

export interface GymClass {
  id: string;
  /** 0 is today. */
  day: number;
  time: string;
  name: string;
  trainer: string;
  room: string;
  minutes: number;
  cap: number;
  /** Bookings by people not on the list of members. */
  base: number;
  booked: string[];
  waitlist: string[];
}

export type Booking = "open" | "booked" | "waitlist" | "full";

export const DAY_FILTERS: [string, string][] = [
  ["0", "Today"],
  ["1", "Wed 4"],
  ["2", "Thu 5"],
  ["3", "Fri 6"],
];

export const takenOf = (c: GymClass): number => c.base + c.booked.length;
export const spotsLeft = (c: GymClass): number =>
  Math.max(0, c.cap - takenOf(c));

/** Pure: where a member stands in a class. */
export function bookingOf(c: GymClass, memberId: string): Booking {
  if (c.booked.includes(memberId)) return "booked";
  if (c.waitlist.includes(memberId)) return "waitlist";
  return spotsLeft(c) > 0 ? "open" : "full";
}

/** Pure: a member books (when there is room), or is put on the waitlist. */
export function bookClass(c: GymClass, memberId: string): GymClass {
  if (c.booked.includes(memberId) || c.waitlist.includes(memberId)) return c;
  return spotsLeft(c) > 0
    ? { ...c, booked: [...c.booked, memberId] }
    : { ...c, waitlist: [...c.waitlist, memberId] };
}

/** Pure: a booking is cancelled and the first one on the waitlist moves up. */
export function cancelBooking(c: GymClass, memberId: string): GymClass {
  if (c.waitlist.includes(memberId)) {
    return { ...c, waitlist: c.waitlist.filter((x) => x !== memberId) };
  }
  if (!c.booked.includes(memberId)) return c;
  const booked = c.booked.filter((x) => x !== memberId);
  const [next, ...rest] = c.waitlist;
  return next
    ? { ...c, booked: [...booked, next], waitlist: rest }
    : { ...c, booked };
}

/** Pure: the member promoted by a cancellation, or null. */
export function promoted(before: GymClass, memberId: string): string | null {
  return before.booked.includes(memberId) ? (before.waitlist[0] ?? null) : null;
}

const cl = (
  id: string,
  day: number,
  time: string,
  name: string,
  trainer: string,
  room: string,
  minutes: number,
  cap: number,
  base: number,
  booked: string[] = [],
  waitlist: string[] = [],
): GymClass => ({
  id,
  day,
  time,
  name,
  trainer,
  room,
  minutes,
  cap,
  base,
  booked,
  waitlist,
});

export const CLASSES: GymClass[] = [
  cl("c1", 0, "19:00", "Vinyasa yoga", "Marta Kowal", "Studio 1", 60, 14, 9, [
    "m5",
    "m9",
  ]),
  cl(
    "c2",
    0,
    "19:15",
    "HIIT 45",
    "Priya Nair",
    "Studio 2",
    45,
    12,
    9,
    ["m3", "m13", "m20"],
    ["m8", "m15"],
  ),
  cl("c3", 0, "20:00", "Spin classic", "Luca Romano", "Cycle room", 45, 16, 8, [
    "m16",
  ]),
  cl("c4", 1, "07:00", "Morning strength", "Jonas Berg", "Floor", 60, 10, 6, [
    "m1",
  ]),
  cl("c5", 1, "12:30", "Express pilates", "Sofia Lind", "Studio 1", 30, 14, 5),
  cl("c6", 1, "18:30", "HIIT 45", "Priya Nair", "Studio 2", 45, 12, 6, [
    "m7",
    "m21",
  ]),
  cl(
    "c7",
    1,
    "19:30",
    "Spin classic",
    "Luca Romano",
    "Cycle room",
    45,
    16,
    12,
    ["m9", "m16", "m1"],
    ["m18"],
  ),
  cl("c8", 2, "07:00", "Mobility flow", "Marta Kowal", "Studio 1", 45, 14, 4),
  cl("c9", 2, "18:00", "Powerlifting basics", "Jonas Berg", "Floor", 75, 8, 5, [
    "m13",
  ]),
  cl(
    "c10",
    2,
    "19:15",
    "Pilates reformer",
    "Sofia Lind",
    "Studio 2",
    55,
    8,
    6,
    ["m3", "m20"],
    ["m5"],
  ),
  cl("c11", 3, "06:30", "Sunrise spin", "Luca Romano", "Cycle room", 45, 16, 7),
  cl("c12", 3, "17:30", "HIIT 45", "Priya Nair", "Studio 2", 45, 12, 8, [
    "m21",
  ]),
  cl("c13", 3, "18:30", "Vinyasa yoga", "Marta Kowal", "Studio 1", 60, 14, 6, [
    "m9",
    "m5",
  ]),
];

// ---- trainers

export interface Trainer {
  id: string;
  name: string;
  focus: string;
  onShift: boolean;
  /** The most hours a week. */
  maxHours: number;
}

export const TRAINERS: Trainer[] = [
  {
    id: "t1",
    name: "Marta Kowal",
    focus: "Yoga and mobility",
    onShift: true,
    maxHours: 12,
  },
  {
    id: "t2",
    name: "Jonas Berg",
    focus: "Strength and powerlifting",
    onShift: false,
    maxHours: 14,
  },
  {
    id: "t3",
    name: "Priya Nair",
    focus: "HIIT and conditioning",
    onShift: true,
    maxHours: 10,
  },
  {
    id: "t4",
    name: "Luca Romano",
    focus: "Indoor cycling",
    onShift: true,
    maxHours: 8,
  },
  {
    id: "t5",
    name: "Sofia Lind",
    focus: "Pilates",
    onShift: false,
    maxHours: 10,
  },
];

/** Pure: the hours a trainer teaches in the classes listed. */
export function hoursOf(classes: GymClass[], name: string): number {
  return (
    Math.round(
      (classes
        .filter((c) => c.trainer === name)
        .reduce((n, c) => n + c.minutes, 0) /
        60) *
        10,
    ) / 10
  );
}

/** Pure: the number of people booked into a trainer's classes. */
export const clientsOf = (classes: GymClass[], name: string): number =>
  classes.filter((c) => c.trainer === name).reduce((n, c) => n + takenOf(c), 0);

// ---- payments

export interface Payment {
  id: string;
  member: string;
  amount: number;
  due: string;
  paid: boolean;
  reminders: number;
}

export type PayStatus = "paid" | "due" | "overdue";

/** Pure: a payment is paid, due (not yet late) or overdue. */
export function payStatus(p: Payment, today = TODAY): PayStatus {
  if (p.paid) return "paid";
  return daysBetween(today, p.due) < 0 ? "overdue" : "due";
}

export const PAY_FILTERS: [string, string][] = [
  ["all", "All"],
  ["due", "Due"],
  ["overdue", "Overdue"],
  ["paid", "Paid"],
];

export const payPasses = (p: Payment, id: string, today = TODAY): boolean =>
  payStatus(p, today) === id;

/** Pure: the money of the payments that pass a test. */
export const sumOf = (list: Payment[], test: (p: Payment) => boolean): number =>
  Math.round(list.filter(test).reduce((n, p) => n + p.amount, 0) * 100) / 100;

export const pay = (
  id: string,
  member: string,
  amount: number,
  due: string,
  paid = false,
  reminders = 0,
): Payment => ({ id, member, amount, due, paid, reminders });

export const PAYMENTS: Payment[] = [
  pay("p1", "m4", 49, "2026-10-28", false, 1),
  pay("p2", "m10", 49, "2026-10-15", false, 2),
  pay("p3", "m17", 129, "2026-09-30", false, 3),
  pay("p4", "m2", 49, "2026-11-05"),
  pay("p5", "m12", 129, "2026-11-09"),
  pay("p6", "m19", 29, "2026-11-14"),
  pay("p7", "m6", 29, "2026-11-12"),
  pay("p8", "m21", 49, "2026-11-18"),
  pay("p9", "m7", 49, "2026-10-27", true),
  pay("p10", "m11", 29, "2026-10-30", true),
  pay("p11", "m15", 49, "2026-10-22", true),
  pay("p12", "m18", 49, "2026-11-01", true),
];

/** Money taken this month before the page opened. */
export const COLLECTED_BASE = 6180;

/** Pure: the member for an id. */
export const memberOf = (list: Member[], id: string): Member | undefined =>
  list.find((x) => x.id === id);

// ---- the member form

export interface MemberDraft {
  name: string;
  plan: string;
  expires: string;
}

/** Pure: what is wrong with a draft, by field id. */
export function validateMember(d: MemberDraft): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!d.name.trim()) errors.name = "A member needs a name.";
  if (Number.isNaN(dayNumber(d.expires)))
    errors.expires = "Choose a valid date.";
  return errors;
}

/** Pure: the member with a draft applied. */
export const applyDraft = (member: Member, d: MemberDraft): Member => ({
  ...member,
  name: d.name.trim(),
  plan: d.plan,
  expires: d.expires,
});
