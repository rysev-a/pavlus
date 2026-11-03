import type { Tone } from "../../blocks/admin-shell/shell.ts";
import { initials } from "../../blocks/admin-shell/shell.ts";
import type { AgendaIn } from "../../blocks/day-agenda/agenda.ts";
import type { Buddy } from "../../blocks/buddy-picker/buddies.ts";
import {
  type GroupDef,
  isOverdue,
  progress,
  type Task,
} from "../../blocks/checklist/list.ts";
import {
  addDays,
  daysBetween,
  shortDate,
  TODAY,
} from "../../blocks/week-calendar/dates.ts";

export { TODAY };

// ---------------------------------------------------------------- people

export interface Hire {
  id: string;
  name: string;
  role: string;
  team: string;
  /** First day, `2026-11-09`. */
  start: string;
  manager: string;
  /** The id of the buddy, or empty. */
  buddy: string;
  office: string;
  email: string;
}

export const HIRES: Hire[] = [
  {
    id: "h1",
    name: "Noa Levi",
    role: "Product designer",
    team: "Design",
    start: "2026-11-09",
    manager: "Elena Rossi",
    buddy: "b2",
    office: "Lisbon",
    email: "noa.levi@northwind.example",
  },
  {
    id: "h2",
    name: "Samir Haddad",
    role: "Backend engineer",
    team: "Platform",
    start: "2026-11-02",
    manager: "Marcus Webb",
    buddy: "b1",
    office: "Berlin",
    email: "samir.haddad@northwind.example",
  },
  {
    id: "h3",
    name: "Katarzyna Nowak",
    role: "Customer success manager",
    team: "Customer care",
    start: "2026-10-26",
    manager: "Ines Duarte",
    buddy: "b3",
    office: "Warsaw",
    email: "katarzyna.nowak@northwind.example",
  },
  {
    id: "h4",
    name: "Jamal Carter",
    role: "Data analyst",
    team: "Analytics",
    start: "2026-10-19",
    manager: "Marcus Webb",
    buddy: "b6",
    office: "Remote",
    email: "jamal.carter@northwind.example",
  },
  {
    id: "h5",
    name: "Yuki Tanaka",
    role: "Frontend engineer",
    team: "Platform",
    start: "2026-11-16",
    manager: "Marcus Webb",
    buddy: "",
    office: "Berlin",
    email: "yuki.tanaka@northwind.example",
  },
  {
    id: "h6",
    name: "Ana Beltran",
    role: "Technical recruiter",
    team: "People",
    start: "2026-11-23",
    manager: "Ines Duarte",
    buddy: "",
    office: "Lisbon",
    email: "ana.beltran@northwind.example",
  },
  {
    id: "h7",
    name: "Oliver Grant",
    role: "Sales executive",
    team: "Sales",
    start: TODAY,
    manager: "Rhea Kapoor",
    buddy: "b5",
    office: "London",
    email: "oliver.grant@northwind.example",
  },
];

/** Colleagues who can be a buddy; `mentees` is worked out from the hires. */
export const BUDDY_POOL: Omit<Buddy, "mentees">[] = [
  { id: "b1", name: "Priya Raman", role: "Senior engineer", team: "Platform" },
  { id: "b2", name: "Tomas Berg", role: "Product designer", team: "Design" },
  {
    id: "b3",
    name: "Lena Fischer",
    role: "Support lead",
    team: "Customer care",
  },
  {
    id: "b4",
    name: "Diego Alvarez",
    role: "Staff engineer",
    team: "Platform",
    away: "until Nov 9",
  },
  { id: "b5", name: "Hana Kimura", role: "Account executive", team: "Sales" },
  { id: "b6", name: "Rafael Ortiz", role: "Analytics lead", team: "Analytics" },
  { id: "b7", name: "Sofia Marin", role: "People partner", team: "People" },
];

export const hireById = (hires: Hire[], id: string): Hire =>
  hires.find((h) => h.id === id) ?? hires[0];

export const firstName = (h: Hire): string => h.name.split(" ")[0];

/** Pure: the pool with the number of newcomers each looks after (not counting `except`). */
export function buddiesFor(hires: Hire[], except: string): Buddy[] {
  return BUDDY_POOL.map((b) => ({
    ...b,
    mentees: hires.filter((h) => h.buddy === b.id && h.id !== except).length,
  }));
}

export const buddyName = (id: string): string =>
  BUDDY_POOL.find((b) => b.id === id)?.name ?? "Not assigned yet";

// ------------------------------------------------------------- checklist

export const GROUPS: GroupDef[] = [
  { id: "paper", title: "Paperwork", hint: "Contracts, tax and bank" },
  { id: "it", title: "IT setup", hint: "Hardware, accounts, access" },
  { id: "training", title: "Training", hint: "Courses and walkthroughs" },
  { id: "team", title: "Meet the team", hint: "People to know" },
];

interface Tpl {
  key: string;
  group: string;
  title: string;
  owner: string;
  /** Days from the first day (negative: before it). */
  offset: number;
  tag?: string;
  tagTone?: Tone;
}

export const TEMPLATE: Tpl[] = [
  {
    key: "contract",
    group: "paper",
    title: "Sign the employment contract",
    owner: "New hire",
    offset: -10,
    tag: "Sign",
    tagTone: "info",
  },
  {
    key: "bank",
    group: "paper",
    title: "Send bank details",
    owner: "New hire",
    offset: -7,
    tag: "Form",
    tagTone: "info",
  },
  {
    key: "tax",
    group: "paper",
    title: "Register for payroll and tax",
    owner: "HR",
    offset: -5,
  },
  {
    key: "idcheck",
    group: "paper",
    title: "Verify ID documents",
    owner: "HR",
    offset: 0,
  },
  {
    key: "handbook",
    group: "paper",
    title: "Acknowledge the handbook",
    owner: "New hire",
    offset: 2,
  },
  {
    key: "laptop",
    group: "it",
    title: "Order and configure the laptop",
    owner: "IT",
    offset: -5,
  },
  {
    key: "accounts",
    group: "it",
    title: "Create email and chat accounts",
    owner: "IT",
    offset: -1,
  },
  {
    key: "mfa",
    group: "it",
    title: "Set up two-factor sign-in",
    owner: "New hire",
    offset: 0,
  },
  {
    key: "repos",
    group: "it",
    title: "Grant access to tools and repositories",
    owner: "IT",
    offset: 1,
  },
  {
    key: "vpn",
    group: "it",
    title: "Install the VPN and password manager",
    owner: "New hire",
    offset: 1,
  },
  {
    key: "security",
    group: "training",
    title: "Security awareness course",
    owner: "New hire",
    offset: 3,
    tag: "Required",
    tagTone: "warning",
  },
  {
    key: "conduct",
    group: "training",
    title: "Code of conduct course",
    owner: "New hire",
    offset: 4,
    tag: "Required",
    tagTone: "warning",
  },
  {
    key: "product",
    group: "training",
    title: "Product overview session",
    owner: "Manager",
    offset: 5,
  },
  {
    key: "tools",
    group: "training",
    title: "Tools workshop with your buddy",
    owner: "Buddy",
    offset: 7,
  },
  {
    key: "lunch",
    group: "team",
    title: "Welcome lunch",
    owner: "Manager",
    offset: 0,
  },
  {
    key: "oneone",
    group: "team",
    title: "First one-to-one with your manager",
    owner: "Manager",
    offset: 1,
  },
  {
    key: "coffee",
    group: "team",
    title: "Coffee with your buddy",
    owner: "Buddy",
    offset: 2,
  },
  {
    key: "intros",
    group: "team",
    title: "Meet the neighbouring teams",
    owner: "Manager",
    offset: 4,
  },
  {
    key: "skip",
    group: "team",
    title: "Skip-level chat",
    owner: "Manager",
    offset: 14,
  },
];

/** Tasks that are still open although their day has passed, per hire. */
const SLIPPED: Record<string, string[]> = {
  h1: ["contract"],
  h2: ["tax", "vpn"],
  h7: ["bank", "accounts"],
};

/** Pure: the onboarding tasks of a hire. Past ones are done unless they slipped. */
export function tasksFor(h: Hire, today: string, slipped: string[]): Task[] {
  return TEMPLATE.map((t): Task => {
    const due = addDays(h.start, t.offset);
    return {
      id: `${h.id}.${t.key}`,
      group: t.group,
      title: t.title,
      owner: t.owner,
      due,
      done: due < today && !slipped.includes(t.key),
      tag: t.tag ?? "",
      tagTone: t.tagTone ?? "default",
    };
  });
}

export const TASKS: Task[] = HIRES.flatMap((h) =>
  tasksFor(h, TODAY, SLIPPED[h.id] ?? []),
);

export const tasksOf = (tasks: Task[], hire: string): Task[] =>
  tasks.filter((t) => t.id.startsWith(`${hire}.`));

// ---------------------------------------------------------- 30-60-90 plan

export const PLAN_GROUPS: GroupDef[] = [
  { id: "d30", title: "First 30 days", hint: "Learn" },
  { id: "d60", title: "Days 31 to 60", hint: "Contribute" },
  { id: "d90", title: "Days 61 to 90", hint: "Own" },
];

const PLAN_TPL: {
  key: string;
  group: string;
  title: string;
  owner: string;
  offset: number;
}[] = [
  {
    key: "a",
    group: "d30",
    title: "Learn the product and the customers",
    owner: "New hire",
    offset: 30,
  },
  {
    key: "b",
    group: "d30",
    title: "Meet every key stakeholder",
    owner: "New hire",
    offset: 30,
  },
  {
    key: "c",
    group: "d30",
    title: "Ship a first small piece of work",
    owner: "New hire",
    offset: 30,
  },
  {
    key: "d",
    group: "d60",
    title: "Take over a recurring responsibility",
    owner: "New hire",
    offset: 60,
  },
  {
    key: "e",
    group: "d60",
    title: "Agree goals for the next quarter",
    owner: "Manager",
    offset: 60,
  },
  {
    key: "f",
    group: "d60",
    title: "Present what you learned to the team",
    owner: "New hire",
    offset: 60,
  },
  {
    key: "g",
    group: "d90",
    title: "Lead one project from start to end",
    owner: "New hire",
    offset: 90,
  },
  {
    key: "h",
    group: "d90",
    title: "Write a development plan",
    owner: "New hire",
    offset: 90,
  },
  {
    key: "i",
    group: "d90",
    title: "90-day review",
    owner: "Manager",
    offset: 90,
  },
];

const PLAN_DONE = ["h4.a", "h4.b", "h3.a"];

export const PLAN: Task[] = HIRES.flatMap((h) =>
  PLAN_TPL.map((t): Task => ({
    id: `${h.id}.${t.key}`,
    group: t.group,
    title: t.title,
    owner: t.owner,
    due: addDays(h.start, t.offset),
    done: PLAN_DONE.includes(`${h.id}.${t.key}`),
    tag: "",
    tagTone: "default",
  })),
);

// ------------------------------------------------------------- hire status

export interface HireStatus {
  id: "upcoming" | "active" | "behind" | "done";
  label: string;
  tone: Tone;
}

/** Pure: where a newcomer stands. */
export function statusOf(h: Hire, tasks: Task[], today: string): HireStatus {
  const mine = tasksOf(tasks, h.id);
  const p = progress(mine);
  const late = mine.filter((t) => isOverdue(t, today)).length;
  if (p.pct === 100) return { id: "done", label: "Complete", tone: "success" };
  if (late > 0)
    return { id: "behind", label: `${late} overdue`, tone: "destructive" };
  if (h.start > today) {
    const n = daysBetween(today, h.start);
    return {
      id: "upcoming",
      label: n === 1 ? "Tomorrow" : `In ${n} days`,
      tone: "info",
    };
  }
  return {
    id: "active",
    label: daysBetween(h.start, today) < 7 ? "First week" : "On track",
    tone: daysBetween(h.start, today) < 7 ? "warning" : "default",
  };
}

export const FILTERS: [string, string][] = [
  ["all", "All"],
  ["upcoming", "Not started"],
  ["active", "In progress"],
  ["behind", "Behind"],
  ["done", "Complete"],
];

// --------------------------------------------------------------- documents

export type DocStatus = "requested" | "received" | "approved";

export interface Doc {
  id: string;
  hire: string;
  type: string;
  status: DocStatus;
  /** When the status last changed. */
  updated: string;
}

export const DOC_TYPES: [string, string][] = [
  ["contract", "Signed contract"],
  ["id", "ID document"],
  ["bank", "Bank details"],
  ["tax", "Tax form"],
  ["emergency", "Emergency contact"],
  ["photo", "Badge photo"],
  ["handbook", "Handbook acknowledgement"],
];

/** One letter per document type: Q requested, R received, A approved. */
const DOC_CODES: Record<string, string> = {
  h1: "ARQQQQQ",
  h2: "AAAARAA",
  h3: "AAAAAAA",
  h4: "AAAAAAA",
  h5: "RQQQQQQ",
  h6: "QQQQQQQ",
  h7: "AAQRQAQ",
};

const CODE: Record<string, DocStatus> = {
  Q: "requested",
  R: "received",
  A: "approved",
};

export const DOCS: Doc[] = HIRES.flatMap((h) =>
  DOC_TYPES.map(([type], i): Doc => ({
    id: `${h.id}.${type}`,
    hire: h.id,
    type,
    status: CODE[DOC_CODES[h.id][i]],
    updated: addDays(TODAY, -((i * 3 + h.id.charCodeAt(1)) % 9)),
  })),
);

export const DOC_NEXT: Record<DocStatus, DocStatus | null> = {
  requested: "received",
  received: "approved",
  approved: null,
};

export const DOC_ACTION: Record<DocStatus, string> = {
  requested: "Mark received",
  received: "Approve",
  approved: "",
};

export const DOC_TONE: Record<DocStatus, Tone> = {
  requested: "warning",
  received: "info",
  approved: "success",
};

/** Pure: the document moved to its next status (an approved one stays). */
export function advanceDoc(docs: Doc[], id: string, today: string): Doc[] {
  return docs.map((d) => {
    const next = DOC_NEXT[d.status];
    return d.id === id && next ? { ...d, status: next, updated: today } : d;
  });
}

export const docLabel = (type: string): string =>
  DOC_TYPES.find(([t]) => t === type)?.[1] ?? type;

/** Pure: how many documents of each status, and the share approved. */
export function docCounts(docs: Doc[]): {
  requested: number;
  received: number;
  approved: number;
  pct: number;
} {
  const count = (s: DocStatus): number =>
    docs.filter((d) => d.status === s).length;
  return {
    requested: count("requested"),
    received: count("received"),
    approved: count("approved"),
    pct:
      docs.length === 0
        ? 0
        : Math.round((count("approved") / docs.length) * 100),
  };
}

// --------------------------------------------------------------- equipment

export type EqStatus = "requested" | "approved" | "ordered" | "delivered";

export interface Equipment {
  id: string;
  hire: string;
  item: string;
  cost: number;
  status: EqStatus;
  note: string;
}

export const CATALOG: [string, string, number][] = [
  ["laptop", 'MacBook Pro 14"', 2399],
  ["monitor", '27" 4K monitor', 429],
  ["headset", "Noise-cancelling headset", 249],
  ["keyboard", "Keyboard and mouse", 139],
  ["desk", "Standing desk", 560],
  ["phone", "Work phone", 699],
];

export const EQ_ORDER: EqStatus[] = [
  "requested",
  "approved",
  "ordered",
  "delivered",
];

export const EQ_TONE: Record<EqStatus, Tone> = {
  requested: "warning",
  approved: "info",
  ordered: "default",
  delivered: "success",
};

export const EQ_ACTION: Record<EqStatus, string> = {
  requested: "Approve",
  approved: "Order",
  ordered: "Mark delivered",
  delivered: "",
};

export const EQUIPMENT: Equipment[] = [
  {
    id: "q1",
    hire: "h1",
    item: 'MacBook Pro 14"',
    cost: 2399,
    status: "ordered",
    note: "Delivery to the Lisbon office",
  },
  {
    id: "q2",
    hire: "h1",
    item: '27" 4K monitor',
    cost: 429,
    status: "approved",
    note: "",
  },
  {
    id: "q3",
    hire: "h2",
    item: 'MacBook Pro 14"',
    cost: 2399,
    status: "delivered",
    note: "",
  },
  {
    id: "q4",
    hire: "h2",
    item: "Noise-cancelling headset",
    cost: 249,
    status: "delivered",
    note: "",
  },
  {
    id: "q5",
    hire: "h5",
    item: 'MacBook Pro 14"',
    cost: 2399,
    status: "requested",
    note: "Needs the larger SSD",
  },
  {
    id: "q6",
    hire: "h6",
    item: "Keyboard and mouse",
    cost: 139,
    status: "requested",
    note: "",
  },
  {
    id: "q7",
    hire: "h7",
    item: "Work phone",
    cost: 699,
    status: "ordered",
    note: "Sales team plan",
  },
  {
    id: "q8",
    hire: "h3",
    item: "Standing desk",
    cost: 560,
    status: "approved",
    note: "",
  },
];

/** Pure: the request moved to its next status (delivered stays). */
export function advanceEquipment(list: Equipment[], id: string): Equipment[] {
  return list.map((e) => {
    const i = EQ_ORDER.indexOf(e.status);
    return e.id === id && i < EQ_ORDER.length - 1
      ? { ...e, status: EQ_ORDER[i + 1] }
      : e;
  });
}

export function nextEquipmentId(list: Equipment[]): string {
  const max = list.reduce((m, e) => Math.max(m, Number(e.id.slice(1)) || 0), 0);
  return `q${max + 1}`;
}

export interface EquipmentDraft {
  hire: string;
  item: string;
  note: string;
}

/** Pure: what is wrong with a new equipment request, by field. */
export function validateEquipment(
  d: EquipmentDraft,
  list: Equipment[],
): Record<string, string> {
  const errors: Record<string, string> = {};
  const entry = CATALOG.find(([id]) => id === d.item);
  if (!entry) {
    errors.item = "Choose an item.";
  } else if (list.some((e) => e.hire === d.hire && e.item === entry[1])) {
    errors.item = "This person has already requested this item.";
  }
  if (d.note.length > 120) errors.note = "Keep the note under 120 letters.";
  return errors;
}

/** Pure: the list with a new request added (`requested`). */
export function addEquipment(
  list: Equipment[],
  d: EquipmentDraft,
): Equipment[] {
  const entry = CATALOG.find(([id]) => id === d.item);
  if (!entry) return list;
  return [
    ...list,
    {
      id: nextEquipmentId(list),
      hire: d.hire,
      item: entry[1],
      cost: entry[2],
      status: "requested",
      note: d.note.trim(),
    },
  ];
}

export const usd = (n: number): string =>
  `$${String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;

/** Pure: the money of the requests that are not delivered yet. */
export const pendingCost = (list: Equipment[]): number =>
  list.filter((e) => e.status !== "delivered").reduce((n, e) => n + e.cost, 0);

// ------------------------------------------------------- the new hire view

/** Pure: the first week of a hire as agenda items. */
export function firstWeek(h: Hire): AgendaIn[] {
  const at = (
    key: string,
    day: number,
    hour: number,
    min: number,
    dur: number,
    title: string,
    sub: string,
    tone: string,
  ): AgendaIn => ({
    id: `${h.id}.w${key}`,
    title,
    sub,
    tone,
    day: addDays(h.start, day),
    start: hour * 60 + min,
    dur,
    done: false,
  });
  return [
    at("1", 0, 9, 30, 30, "Welcome and coffee", `With ${h.manager}`, "c1"),
    at("2", 0, 10, 15, 75, "Laptop and accounts", "IT desk", "c2"),
    at("3", 0, 12, 30, 60, "Welcome lunch", `${h.team} team`, "c4"),
    at("4", 0, 14, 0, 60, "Company tour and handbook", "People team", "c5"),
    at("5", 1, 10, 0, 45, "First one-to-one", h.manager, "c1"),
    at("6", 1, 14, 0, 90, "Set up your tools", buddyName(h.buddy), "c2"),
    at("7", 2, 11, 0, 60, "Coffee with your buddy", buddyName(h.buddy), "c4"),
    at("8", 3, 15, 0, 60, "Security awareness course", "Online", "de"),
    at("9", 4, 16, 0, 30, "End-of-week check-in", h.manager, "pr"),
  ];
}

export const longStart = (h: Hire): string => shortDate(h.start);

export { initials };
