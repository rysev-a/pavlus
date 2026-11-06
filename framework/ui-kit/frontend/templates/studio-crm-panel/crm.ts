import { money, share, type Tone } from "../../blocks/admin-shell/shell.ts";
import {
  action,
  type ColumnDef,
  columnsOf,
  meter,
  mono,
  number,
  pill,
  type Row,
  rowOf,
  type Sort,
  sortBy,
  strong,
  text,
} from "../../blocks/data-grid/grid.ts";
import {
  boardOf,
  type ColumnDef as BoardColumn,
  type ColumnView,
  moveTask,
  type Task,
} from "../../blocks/kanban-board/board.ts";
import {
  dateLabel,
  pctOf,
  type Span,
  type TimelineRow,
  timelineRows,
  type Week,
  weeksFrom,
} from "../../blocks/gantt-timeline/timeline.ts";
import { type Card, card } from "../../blocks/stat-cards/cards.ts";
import {
  listAction,
  type StatusRow,
  statusRow,
} from "../../blocks/status-list/rows.ts";

/** The timeline starts on Monday 26 October 2026 and runs twelve weeks; today is the 3rd of November. */
export const START = { y: 2026, m: 10, d: 26 };
export const DAYS = 84;
export const TODAY = 8;

/** Whole dollars. */
export const usd = (n: number): string => money(n, "$", 0);

export const dateOf = (i: number): string =>
  dateLabel(START.y, START.m, START.d, i);

// ---- clients ----------------------------------------------------------------

export type ClientStatus = "active" | "lead" | "paused";

export interface Client {
  id: string;
  name: string;
  contact: string;
  industry: string;
  status: ClientStatus;
}

export const CLIENTS: Client[] = [
  {
    id: "c1",
    name: "Northwind Traders",
    contact: "Hana Berg",
    industry: "Retail",
    status: "active",
  },
  {
    id: "c2",
    name: "Acme Inc",
    contact: "Bill Acme",
    industry: "Manufacturing",
    status: "active",
  },
  {
    id: "c3",
    name: "Globex",
    contact: "Sam Orr",
    industry: "Technology",
    status: "active",
  },
  {
    id: "c4",
    name: "Initech",
    contact: "Peter Gibbons",
    industry: "Software",
    status: "lead",
  },
  {
    id: "c5",
    name: "Umbrella Care",
    contact: "Dr. Wells",
    industry: "Health",
    status: "active",
  },
  {
    id: "c6",
    name: "Soylent Foods",
    contact: "Mia Stone",
    industry: "Food",
    status: "paused",
  },
  {
    id: "c7",
    name: "Hooli Labs",
    contact: "Gavin Belson",
    industry: "Technology",
    status: "lead",
  },
  {
    id: "c8",
    name: "Stark Energy",
    contact: "Pepper Potts",
    industry: "Energy",
    status: "active",
  },
];

export const CLIENT_TONE: Record<ClientStatus, Tone> = {
  active: "success",
  lead: "info",
  paused: "muted",
};

export const CLIENT_FILTERS: [string, string][] = [
  ["all", "All"],
  ["active", "Active"],
  ["lead", "Leads"],
  ["paused", "Paused"],
];

export const CLIENT_COLUMNS: ColumnDef[] = [
  { key: "name", label: "Client", sortable: true },
  { key: "industry", label: "Industry" },
  { key: "status", label: "Status", sortable: true },
  { key: "projects", label: "Projects", align: "right" },
  { key: "billed", label: "Paid so far", sortable: true, align: "right" },
];

/** Pure: the next status of a client when the button is pressed. */
export function nextClientStatus(s: ClientStatus): ClientStatus {
  return s === "active" ? "paused" : "active";
}

export function toggleClient(list: Client[], id: string): Client[] {
  return list.map((c) =>
    c.id === id ? { ...c, status: nextClientStatus(c.status) } : c,
  );
}

export function paidBy(invoices: Invoice[], clientId: string): number {
  return invoices
    .filter((i) => i.client === clientId && i.status === "paid")
    .reduce((n, i) => n + i.amount, 0);
}

export const clientName = (id: string): string =>
  CLIENTS.find((c) => c.id === id)?.name ?? "";

export function clientRows(
  clients: Client[],
  projects: Project[],
  invoices: Invoice[],
  filter: string,
  query: string,
  sort: Sort | null,
): Row[] {
  const q = query.trim().toLowerCase();
  const shown = clients
    .filter((c) => filter === "all" || c.status === filter)
    .filter(
      (c) =>
        !q ||
        c.name.toLowerCase().includes(q) ||
        c.contact.toLowerCase().includes(q) ||
        c.industry.toLowerCase().includes(q),
    );
  const value = (c: Client, key: string): string | number =>
    key === "billed"
      ? paidBy(invoices, c.id)
      : key === "status"
        ? c.status
        : c.name;
  return sortBy(shown, sort, value).map((c) =>
    rowOf(
      CLIENT_COLUMNS,
      c.id,
      {
        name: strong(c.name, c.contact),
        industry: text(c.industry),
        status: pill(c.status, CLIENT_TONE[c.status]),
        projects: number(projects.filter((p) => p.client === c.id).length),
        billed: number(usd(paidBy(invoices, c.id))),
      },
      [
        c.status === "lead"
          ? action("toggle", "Win", { variant: "default" })
          : action("toggle", c.status === "active" ? "Pause" : "Resume"),
      ],
    ),
  );
}

export function clientCards(
  clients: Client[],
  projects: Project[],
  invoices: Invoice[],
): Card[] {
  const open = invoices.filter((i) => i.status !== "paid");
  return [
    card(
      "active",
      "Active clients",
      String(clients.filter((c) => c.status === "active").length),
      {
        hint: `${clients.filter((c) => c.status === "lead").length} leads`,
        icon: "k-ai-users",
        tone: "success",
      },
    ),
    card(
      "projects",
      "Open projects",
      String(projects.filter((p) => p.status !== "done").length),
      {
        hint: `${projects.length} in total`,
        icon: "k-ai-briefcase",
        tone: "info",
      },
    ),
    card("out", "Outstanding", usd(open.reduce((n, i) => n + i.amount, 0)), {
      hint: `${open.length} invoices`,
      icon: "k-ai-receipt",
      tone: "warning",
    }),
    card(
      "paid",
      "Paid so far",
      usd(
        invoices
          .filter((i) => i.status === "paid")
          .reduce((n, i) => n + i.amount, 0),
      ),
      {
        hint: "all time",
        icon: "k-ai-dollar",
        tone: "default",
      },
    ),
  ];
}

// ---- projects ---------------------------------------------------------------

export type ProjectStatus = "planning" | "active" | "review" | "done" | "hold";

export interface Milestone {
  id: string;
  at: number;
  label: string;
  done: boolean;
}

export interface Project {
  id: string;
  name: string;
  client: string;
  status: ProjectStatus;
  progress: number;
  start: number;
  end: number;
  budget: number;
  milestones: Milestone[];
}

const ms = (
  id: string,
  at: number,
  label: string,
  done = false,
): Milestone => ({
  id,
  at,
  label,
  done,
});

export const PROJECTS: Project[] = [
  {
    id: "p1",
    name: "Website redesign",
    client: "c1",
    status: "active",
    progress: 70,
    start: 0,
    end: 33,
    budget: 18000,
    milestones: [
      ms("m1", 10, "Wireframes approved", true),
      ms("m2", 24, "Design sign-off"),
      ms("m3", 33, "Launch"),
    ],
  },
  {
    id: "p2",
    name: "Brand identity",
    client: "c2",
    status: "active",
    progress: 35,
    start: 8,
    end: 41,
    budget: 9500,
    milestones: [ms("m4", 16, "Logo directions"), ms("m5", 41, "Brand book")],
  },
  {
    id: "p3",
    name: "Mobile app",
    client: "c3",
    status: "planning",
    progress: 8,
    start: 21,
    end: 55,
    budget: 42000,
    milestones: [ms("m6", 28, "Prototype"), ms("m7", 55, "Beta")],
  },
  {
    id: "p4",
    name: "Care portal",
    client: "c5",
    status: "review",
    progress: 92,
    start: 0,
    end: 12,
    budget: 26000,
    milestones: [
      ms("m8", 6, "Content freeze", true),
      ms("m9", 12, "Client review"),
    ],
  },
  {
    id: "p5",
    name: "Product launch site",
    client: "c8",
    status: "active",
    progress: 55,
    start: 5,
    end: 27,
    budget: 14500,
    milestones: [ms("m10", 20, "Copy ready")],
  },
  {
    id: "p6",
    name: "Packaging refresh",
    client: "c6",
    status: "hold",
    progress: 20,
    start: 2,
    end: 30,
    budget: 7200,
    milestones: [ms("m11", 14, "Dielines")],
  },
  {
    id: "p7",
    name: "Intranet",
    client: "c4",
    status: "planning",
    progress: 0,
    start: 30,
    end: 70,
    budget: 21000,
    milestones: [ms("m12", 44, "Scope agreed")],
  },
];

export const PROJECT_LABEL: Record<ProjectStatus, string> = {
  planning: "Planning",
  active: "Active",
  review: "In review",
  done: "Done",
  hold: "On hold",
};

export const PROJECT_TONE: Record<ProjectStatus, Tone> = {
  planning: "default",
  active: "info",
  review: "warning",
  done: "success",
  hold: "muted",
};

/** Pure: the next status of a project and the least progress that goes with it. */
export function nextProject(p: Project): Project {
  switch (p.status) {
    case "planning":
      return { ...p, status: "active", progress: Math.max(p.progress, 10) };
    case "active":
      return { ...p, status: "review", progress: Math.max(p.progress, 90) };
    case "review":
      return { ...p, status: "done", progress: 100 };
    case "hold":
      return { ...p, status: "active" };
    default:
      return p;
  }
}

export function advanceProject(list: Project[], id: string): Project[] {
  return list.map((p) => (p.id === id ? nextProject(p) : p));
}

export const advanceLabel = (s: ProjectStatus): string =>
  s === "planning"
    ? "Start"
    : s === "active"
      ? "To review"
      : s === "review"
        ? "Finish"
        : s === "hold"
          ? "Resume"
          : "";

export const PROJECT_COLUMNS: ColumnDef[] = [
  { key: "name", label: "Project", sortable: true },
  { key: "status", label: "Status", sortable: true },
  { key: "progress", label: "Progress", sortable: true },
  { key: "due", label: "Due", sortable: true },
  { key: "budget", label: "Budget", sortable: true, align: "right" },
];

export function projectRows(list: Project[], sort: Sort | null): Row[] {
  const value = (p: Project, key: string): string | number =>
    key === "progress"
      ? p.progress
      : key === "due"
        ? p.end
        : key === "budget"
          ? p.budget
          : key === "status"
            ? p.status
            : p.name;
  return sortBy(list, sort, value).map((p) =>
    rowOf(
      PROJECT_COLUMNS,
      p.id,
      {
        name: strong(p.name, clientName(p.client)),
        status: pill(PROJECT_LABEL[p.status], PROJECT_TONE[p.status]),
        progress: meter(
          p.progress,
          p.status === "done"
            ? "success"
            : p.status === "hold"
              ? "muted"
              : "info",
          `${p.progress}%`,
        ),
        due: mono(dateOf(p.end)),
        budget: number(usd(p.budget)),
      },
      p.status === "done"
        ? []
        : [action("advance", advanceLabel(p.status), { variant: "default" })],
    ),
  );
}

export function projectCards(list: Project[]): Card[] {
  const open = list.filter((p) => p.status !== "done");
  const avg = open.length
    ? Math.round(open.reduce((n, p) => n + p.progress, 0) / open.length)
    : 0;
  return [
    card("open", "Open projects", String(open.length), {
      icon: "k-ai-briefcase",
      tone: "info",
      hint: `${list.length - open.length} finished`,
    }),
    card("avg", "Average progress", `${avg}%`, {
      icon: "k-ai-pulse",
      tone: "success",
      series: open.map((p) => p.progress),
    }),
    card(
      "rev",
      "In review",
      String(list.filter((p) => p.status === "review").length),
      { icon: "k-ai-clipboard", tone: "warning" },
    ),
    card(
      "budget",
      "Budget in play",
      usd(open.reduce((n, p) => n + p.budget, 0)),
      { icon: "k-ai-dollar", tone: "default" },
    ),
  ];
}

// ---- tasks ------------------------------------------------------------------

export const BOARD: BoardColumn[] = [
  { id: "todo", title: "To do" },
  { id: "doing", title: "In progress" },
  { id: "review", title: "Review" },
  { id: "done", title: "Done" },
];

export const PEOPLE = ["AL", "JP", "ES", "MK"];

/** A task of the board, and the day it is due (the board shows the date as text). */
export type CrmTask = Task & { dueDay: number };

const t = (
  id: string,
  title: string,
  column: string,
  project: string,
  who: string,
  due: number,
  tag: string,
  tone: Tone,
): CrmTask => ({
  id,
  title,
  column,
  project,
  who,
  due: dateOf(due),
  dueDay: due,
  tag,
  tone,
});

export const TASKS: CrmTask[] = [
  t(
    "t1",
    "Homepage hero concepts",
    "doing",
    "p1",
    "AL",
    10,
    "Design",
    "warning",
  ),
  t("t2", "Write the product pages", "todo", "p1", "MK", 14, "Copy", "info"),
  t(
    "t3",
    "Navigation usability test",
    "review",
    "p1",
    "JP",
    9,
    "Research",
    "default",
  ),
  t("t4", "Logo directions deck", "doing", "p2", "JP", 12, "Design", "warning"),
  t("t5", "Colour palette", "done", "p2", "JP", 6, "Design", "warning"),
  t("t6", "App user flows", "todo", "p3", "ES", 20, "UX", "info"),
  t("t7", "Pick the stack", "doing", "p3", "ES", 11, "Dev", "success"),
  t("t8", "Accessibility audit", "review", "p4", "AL", 9, "QA", "destructive"),
  t("t9", "Hand-over notes", "todo", "p4", "AL", 12, "Docs", "default"),
  t("t10", "Launch page build", "doing", "p5", "MK", 15, "Dev", "success"),
  t("t11", "Press kit", "todo", "p5", "MK", 18, "Copy", "info"),
  t("t12", "Kick-off call notes", "done", "p5", "AL", 2, "Docs", "default"),
  t("t13", "Photo shoot brief", "done", "p6", "JP", 5, "Docs", "default"),
];

export const projectName = (id: string, list: Project[]): string =>
  list.find((p) => p.id === id)?.name ?? "";

/** Pure: the board of the tasks, with the project's name as the line under each. */
export function board(tasks: Task[], projects: Project[]): ColumnView[] {
  return boardOf(
    BOARD,
    tasks.map((x) => ({
      ...x,
      project: projectName(x.project, projects) || x.project,
    })),
  );
}

export { moveTask };

// ---- timeline ---------------------------------------------------------------

export function spans(list: Project[]): Span[] {
  return list.map((p) => ({
    id: p.id,
    name: p.name,
    sub: clientName(p.client),
    start: p.start,
    end: p.end,
    progress: p.progress,
    tone:
      PROJECT_TONE[p.status] === "default" ? "info" : PROJECT_TONE[p.status],
    milestones: p.milestones,
  }));
}

export interface Timeline {
  weeks: Week[];
  rows: TimelineRow[];
  today: number;
}

export function timeline(list: Project[]): Timeline {
  return {
    weeks: weeksFrom(START.y, START.m, START.d, DAYS, 2),
    rows: timelineRows(spans(list), DAYS),
    today: pctOf(TODAY + 0.5, DAYS),
  };
}

/** Pure: every milestone with its project, soonest first. */
export function allMilestones(
  list: Project[],
): (Milestone & { project: string })[] {
  return list
    .flatMap((p) => p.milestones.map((m) => ({ ...m, project: p.name })))
    .sort((a, b) => a.at - b.at);
}

export function toggleMilestone(list: Project[], id: string): Project[] {
  return list.map((p) => ({
    ...p,
    milestones: p.milestones.map((m) =>
      m.id === id ? { ...m, done: !m.done } : m,
    ),
  }));
}

export function milestoneRows(list: Project[]): StatusRow[] {
  return allMilestones(list).map((m) => {
    const late = !m.done && m.at < TODAY;
    return statusRow(
      m.id,
      m.label,
      m.done ? "Done" : late ? "Late" : "Upcoming",
      m.done ? "success" : late ? "destructive" : "info",
      {
        sub: m.project,
        done: m.done,
        facts: [{ label: "Date", value: dateOf(m.at) }],
        actions: [
          listAction("toggle", m.done ? "Reopen" : "Mark done", {
            variant: m.done ? "ghost" : "default",
          }),
        ],
      },
    );
  });
}

// ---- invoices ---------------------------------------------------------------

export type InvoiceStatus = "draft" | "sent" | "paid";
export type InvoiceView = InvoiceStatus | "overdue";

export interface Invoice {
  id: string;
  number: string;
  client: string;
  project: string;
  amount: number;
  issued: number;
  due: number;
  status: InvoiceStatus;
}

const inv = (
  id: string,
  number: string,
  client: string,
  project: string,
  amount: number,
  issued: number,
  due: number,
  status: InvoiceStatus,
): Invoice => ({ id, number, client, project, amount, issued, due, status });

export const INVOICES: Invoice[] = [
  inv("i1", "INV-1031", "c1", "p1", 6000, -20, 2, "paid"),
  inv("i2", "INV-1034", "c2", "p2", 3200, -10, 4, "sent"),
  inv("i3", "INV-1036", "c5", "p4", 13000, 0, 14, "sent"),
  inv("i4", "INV-1037", "c8", "p5", 7250, 3, 17, "sent"),
  inv("i5", "INV-1038", "c3", "p3", 8400, 6, 20, "draft"),
  inv("i6", "INV-1039", "c1", "p1", 6000, 7, 21, "draft"),
  inv("i7", "INV-1029", "c6", "p6", 2400, -30, -16, "sent"),
  inv("i8", "INV-1030", "c5", "p4", 13000, -25, -11, "paid"),
  inv("i9", "INV-1033", "c2", "p2", 3200, -40, -26, "paid"),
  inv("i10", "INV-1035", "c8", "p5", 7250, -14, 0, "paid"),
];

/** Pure: a sent invoice past its due date is overdue. */
export function viewOf(i: Invoice, today = TODAY): InvoiceView {
  return i.status === "sent" && i.due < today ? "overdue" : i.status;
}

export const INVOICE_TONE: Record<InvoiceView, Tone> = {
  draft: "muted",
  sent: "info",
  paid: "success",
  overdue: "destructive",
};

export const INVOICE_FILTERS: [string, string][] = [
  ["all", "All"],
  ["draft", "Draft"],
  ["sent", "Sent"],
  ["overdue", "Overdue"],
  ["paid", "Paid"],
];

export const invoicePasses = (i: Invoice, id: string): boolean =>
  viewOf(i) === id;

/** Pure: totals by what the invoices are worth, for the cards and the footer. */
export function totals(
  list: Invoice[],
): Record<InvoiceView | "open" | "all", number> {
  const sum = (f: (i: Invoice) => boolean) =>
    list.filter(f).reduce((n, i) => n + i.amount, 0);
  return {
    draft: sum((i) => viewOf(i) === "draft"),
    sent: sum((i) => viewOf(i) === "sent"),
    overdue: sum((i) => viewOf(i) === "overdue"),
    paid: sum((i) => viewOf(i) === "paid"),
    open: sum((i) => viewOf(i) !== "paid"),
    all: sum(() => true),
  };
}

/** Pure: send a draft, or mark a sent (or overdue) invoice as paid. */
export function advanceInvoice(list: Invoice[], id: string): Invoice[] {
  return list.map((i) =>
    i.id !== id
      ? i
      : i.status === "draft"
        ? { ...i, status: "sent" }
        : i.status === "sent"
          ? { ...i, status: "paid" }
          : i,
  );
}

export const invoiceAction = (i: Invoice): string =>
  i.status === "draft" ? "Send" : i.status === "sent" ? "Mark paid" : "";

export const INVOICE_COLUMNS: ColumnDef[] = [
  { key: "number", label: "Invoice", sortable: true },
  { key: "client", label: "Client", sortable: true },
  { key: "amount", label: "Amount", sortable: true, align: "right" },
  { key: "due", label: "Due", sortable: true },
  { key: "status", label: "Status" },
];

export function invoiceRows(
  list: Invoice[],
  filter: string,
  sort: Sort | null,
): Row[] {
  const shown = list.filter(
    (i) => filter === "all" || invoicePasses(i, filter),
  );
  const value = (i: Invoice, key: string): string | number =>
    key === "amount"
      ? i.amount
      : key === "due"
        ? i.due
        : key === "client"
          ? clientName(i.client)
          : i.number;
  return sortBy(shown, sort, value).map((i) => {
    const v = viewOf(i);
    const label = invoiceAction(i);
    return rowOf(
      INVOICE_COLUMNS,
      i.id,
      {
        number: strong(i.number, projectName(i.project, PROJECTS)),
        client: text(clientName(i.client)),
        amount: number(usd(i.amount)),
        due: mono(dateOf(i.due)),
        status: pill(v, INVOICE_TONE[v]),
      },
      label
        ? [
            action("advance", label, {
              variant: i.status === "draft" ? "outline" : "default",
            }),
          ]
        : [],
    );
  });
}

export function invoiceCards(list: Invoice[]): Card[] {
  const sum = totals(list);
  const late = list.filter((i) => viewOf(i) === "overdue").length;
  return [
    card("open", "Outstanding", usd(sum.open), {
      icon: "k-ai-receipt",
      tone: "info",
      hint: `${list.filter((i) => i.status !== "paid").length} invoices`,
    }),
    card("late", "Overdue", usd(sum.overdue), {
      icon: "k-ai-alert",
      tone: late ? "destructive" : "success",
      hint: late ? `${late} to chase` : "nothing late",
    }),
    card("paid", "Paid", usd(sum.paid), {
      icon: "k-ai-dollar",
      tone: "success",
      hint: `${share(sum.paid, sum.all)}% of billed`,
    }),
    card("draft", "Drafts", usd(sum.draft), {
      icon: "k-ai-edit",
      tone: "default",
      hint: "not sent yet",
    }),
  ];
}

export function invoiceFooter(list: Invoice[], filter: string): string {
  const shown = list.filter(
    (i) => filter === "all" || invoicePasses(i, filter),
  );
  return `${shown.length} invoice${shown.length === 1 ? "" : "s"} · ${usd(shown.reduce((n, i) => n + i.amount, 0))}`;
}
