import type { Tone } from "../../blocks/admin-shell/shell.ts";
import { type AgendaDay, agendaOf } from "../../blocks/day-agenda/agenda.ts";
import { type BuddyRow, buddyRows } from "../../blocks/buddy-picker/buddies.ts";
import {
  type GroupView,
  overdueCount,
  progress,
  type Task,
  checklistOf,
} from "../../blocks/checklist/list.ts";
import {
  action,
  type Column,
  columnsOf,
  meter,
  pill,
  type Row,
  rowOf,
  strong,
  text,
} from "../../blocks/data-grid/grid.ts";
import { type Filter, filtersOf } from "../../blocks/list-filter/filters.ts";
import {
  type ComposerView,
  composerView,
  type Errors,
  type MessageTemplate,
  type Values,
} from "../../blocks/message-composer/compose.ts";
import { type Card, card } from "../../blocks/stat-cards/cards.ts";
import { daysBetween, shortDate } from "../../blocks/week-calendar/dates.ts";
import {
  buddiesFor,
  buddyName,
  DOC_ACTION,
  DOC_TONE,
  type Doc,
  docCounts,
  docLabel,
  EQ_ACTION,
  EQ_TONE,
  type Equipment,
  FILTERS,
  firstName,
  firstWeek,
  GROUPS,
  type Hire,
  hireById,
  PLAN_GROUPS,
  pendingCost,
  statusOf,
  tasksOf,
  TODAY,
  usd,
} from "./hr.ts";

export const MESSAGES: MessageTemplate[] = [
  {
    id: "welcome",
    label: "Welcome",
    subject: "Welcome to Northwind, {first_name}!",
    body: "Hi {first_name},\n\nWe are glad you are joining us on {start_date}. {manager} will meet you at the {office} office at 9:30, and {buddy} is your buddy for the first weeks.\n\nYour laptop and accounts will be ready on day one. See you soon!",
  },
  {
    id: "week",
    label: "First week",
    subject: "Your first week, {first_name}",
    body: "Hi {first_name},\n\nYour first week starts on {start_date}. Monday is for accounts and equipment, then you meet the team. {buddy} will show you around the {office} office.",
  },
  {
    id: "docs",
    label: "Missing documents",
    subject: "A few documents are still missing",
    body: "Hi {first_name},\n\nBefore {start_date} we still need your signed contract and bank details. {manager} can help if anything is unclear.",
  },
];

export interface MsgState {
  active: string;
  subject: string;
  body: string;
  errors: Errors;
  sent: string;
}

export const freshMessage = (id = "welcome"): MsgState => {
  const t = MESSAGES.find((m) => m.id === id) ?? MESSAGES[0];
  return {
    active: t.id,
    subject: t.subject,
    body: t.body,
    errors: { subject: "", body: "" },
    sent: "",
  };
};

export const valuesOf = (h: Hire): Values => ({
  first_name: firstName(h),
  start_date: shortDate(h.start),
  manager: h.manager,
  buddy: buddyName(h.buddy),
  office: h.office,
});

/** What the template needs from the data to show every view. */
export interface HrCore {
  hires: Hire[];
  tasks: Task[];
  goals: Task[];
  docs: Doc[];
  equipment: Equipment[];
  selected: string;
  filter: string;
  query: string;
  docFilter: string;
  eqFilter: string;
  msg: MsgState;
}

const HIRE_COLS = [
  { key: "name", label: "New hire" },
  { key: "team", label: "Team" },
  { key: "start", label: "Starts" },
  { key: "buddy", label: "Buddy" },
  { key: "progress", label: "Checklist" },
  { key: "status", label: "Status" },
];

const DOC_COLS = [
  { key: "name", label: "New hire" },
  { key: "doc", label: "Document" },
  { key: "status", label: "Status" },
  { key: "updated", label: "Updated" },
];

const EQ_COLS = [
  { key: "name", label: "New hire" },
  { key: "item", label: "Item" },
  { key: "status", label: "Status" },
  { key: "cost", label: "Cost", align: "right" as const },
];

const DOC_FILTERS: [string, string][] = [
  ["all", "All"],
  ["requested", "Requested"],
  ["received", "Received"],
  ["approved", "Approved"],
];

const EQ_FILTERS: [string, string][] = [
  ["all", "All"],
  ["requested", "Requested"],
  ["approved", "Approved"],
  ["ordered", "Ordered"],
  ["delivered", "Delivered"],
];

export interface SelectOption {
  value: string;
  label: string;
  selected: boolean;
}

export interface Hero {
  greeting: string;
  line: string;
  pct: number;
  doneText: string;
  manager: string;
  buddy: string;
  office: string;
}

export interface HrViews {
  listStats: Card[];
  listFilters: Filter[];
  listCols: Column[];
  listRows: Row[];
  listFooter: string;
  options: SelectOption[];
  pickerLine: string;
  pickerTone: Tone;
  checklist: GroupView[];
  checklistLine: string;
  plan: GroupView[];
  planLine: string;
  docStats: Card[];
  docFilters: Filter[];
  docCols: Column[];
  docRows: Row[];
  eqStats: Card[];
  eqFilters: Filter[];
  eqCols: Column[];
  eqRows: Row[];
  buddies: BuddyRow[];
  buddyLine: string;
  composer: ComposerView;
  hero: Hero;
  mine: GroupView[];
  agenda: AgendaDay[];
}

const whenText = (h: Hire): string => {
  const n = daysBetween(TODAY, h.start);
  if (n > 1) return `Starts ${shortDate(h.start)}, in ${n} days`;
  if (n === 1) return `Starts tomorrow, ${shortDate(h.start)}`;
  if (n === 0) return `Starts today, ${shortDate(h.start)}`;
  return `Started ${shortDate(h.start)}, day ${1 - n}`;
};

/** Pure: every view of the app, worked out from the data. */
export function derive(s: HrCore): HrViews {
  const hire = hireById(s.hires, s.selected);
  const mineAll = tasksOf(s.tasks, hire.id);
  const statusFor = (h: Hire) => statusOf(h, s.tasks, TODAY);

  // ---- the list of newcomers
  const q = s.query.trim().toLowerCase();
  const shown = s.hires.filter(
    (h) =>
      (s.filter === "all" || statusFor(h).id === s.filter) &&
      (q === "" || `${h.name} ${h.role} ${h.team}`.toLowerCase().includes(q)),
  );
  const allP = progress(s.tasks);
  const startingSoon = s.hires.filter((h) => h.start > TODAY).length;
  const late = overdueCount(s.tasks, TODAY);
  const docs = docCounts(s.docs);
  const eqOpen = s.equipment.filter((e) => e.status !== "delivered").length;
  const perHire = s.hires.map((h) => progress(tasksOf(s.tasks, h.id)).pct);
  const avg = Math.round(perHire.reduce((a, b) => a + b, 0) / perHire.length);

  // ---- documents
  const docRowsAll = s.docs.filter(
    (d) => s.docFilter === "all" || d.status === s.docFilter,
  );
  // ---- equipment
  const eqRowsAll = s.equipment.filter(
    (e) => s.eqFilter === "all" || e.status === s.eqFilter,
  );

  // ---- the buddy list for the selected hire
  const pool = buddiesFor(s.hires, hire.id);
  const buddies = buddyRows(pool, hire.buddy);

  // ---- the message
  const msg = s.msg;
  const composer = composerView(
    MESSAGES,
    msg.active,
    msg.subject,
    msg.body,
    valuesOf(hire),
    `${hire.name} <${hire.email}>`,
    msg.errors,
    msg.sent,
  );

  // ---- what the newcomer sees
  const theirs = mineAll.filter((t) => t.owner === "New hire");
  const theirP = progress(theirs);
  const groups = checklistOf(theirs, GROUPS, TODAY).filter((g) => g.total > 0);
  const overall = progress(mineAll);

  const hireName = (id: string): string =>
    s.hires.find((h) => h.id === id)?.name ?? "";

  return {
    listStats: [
      card("hires", "New hires", String(s.hires.length), {
        hint: `${startingSoon} not started yet`,
        icon: "k-ai-users",
      }),
      card("avg", "Average progress", `${avg}%`, {
        hint: `${allP.done} of ${allP.total} tasks done`,
        icon: "k-ai-clipboard",
        tone: "success",
      }),
      card("late", "Overdue tasks", String(late), {
        hint: late === 0 ? "Nothing is late" : "Open the checklists to fix",
        icon: "k-ai-alert",
        tone: late === 0 ? "success" : "destructive",
      }),
      card(
        "docs",
        "Documents waiting",
        String(docs.requested + docs.received),
        {
          hint: `${docs.requested} requested, ${docs.received} to approve`,
          icon: "k-ai-file",
          tone: "warning",
        },
      ),
    ],
    listFilters: filtersOf(
      FILTERS,
      s.filter,
      s.hires,
      (h, id) => statusFor(h).id === id,
    ),
    listCols: columnsOf(HIRE_COLS, null),
    listRows: shown.map((h) => {
      const p = progress(tasksOf(s.tasks, h.id));
      const st = statusFor(h);
      return rowOf(
        HIRE_COLS,
        h.id,
        {
          name: strong(h.name, h.role),
          team: text(h.team),
          start: text(shortDate(h.start)),
          buddy: text(buddyName(h.buddy)),
          progress: meter(
            p.pct,
            p.pct === 100
              ? "success"
              : st.id === "behind"
                ? "destructive"
                : "default",
            `${p.done}/${p.total}`,
          ),
          status: pill(st.label, st.tone),
        },
        [action("open", "Checklist")],
        h.id === s.selected,
      );
    }),
    listFooter: `${shown.length} of ${s.hires.length} new hires`,
    options: s.hires.map((h) => ({
      value: h.id,
      label: `${h.name}, ${h.role}`,
      selected: h.id === s.selected,
    })),
    pickerLine: `${whenText(hire)}. Manager: ${hire.manager}.`,
    pickerTone: statusFor(hire).tone,
    checklist: checklistOf(mineAll, GROUPS, TODAY),
    checklistLine: `${overall.done} of ${overall.total} done, ${overdueCount(mineAll, TODAY)} overdue`,
    plan: checklistOf(tasksOf(s.goals, hire.id), PLAN_GROUPS, TODAY),
    planLine: (() => {
      const p = progress(tasksOf(s.goals, hire.id));
      return `${p.done} of ${p.total} goals reached`;
    })(),
    docStats: [
      card("dreq", "Requested", String(docs.requested), {
        hint: "Waiting for the new hire",
        icon: "k-ai-file",
        tone: "warning",
      }),
      card("drec", "Received", String(docs.received), {
        hint: "Waiting for HR to approve",
        icon: "k-ai-clipboard",
        tone: "info",
      }),
      card("dapp", "Approved", `${docs.pct}%`, {
        hint: `${docs.approved} of ${s.docs.length} documents`,
        icon: "k-icon-check",
        tone: "success",
      }),
    ],
    docFilters: filtersOf(
      DOC_FILTERS,
      s.docFilter,
      s.docs,
      (d, id) => d.status === id,
    ),
    docCols: columnsOf(DOC_COLS, null),
    docRows: docRowsAll.map((d) =>
      rowOf(
        DOC_COLS,
        d.id,
        {
          name: strong(hireName(d.hire)),
          doc: text(docLabel(d.type)),
          status: pill(d.status, DOC_TONE[d.status]),
          updated: text(shortDate(d.updated)),
        },
        DOC_ACTION[d.status]
          ? [action("advance", DOC_ACTION[d.status], { variant: "outline" })]
          : [],
      ),
    ),
    eqStats: [
      card("eopen", "Open requests", String(eqOpen), {
        hint: `${s.equipment.length} requests in total`,
        icon: "k-ai-box",
      }),
      card("ecost", "Still to pay", usd(pendingCost(s.equipment)), {
        hint: "Requested, approved and ordered",
        icon: "k-ai-dollar",
        tone: "warning",
      }),
      card("edel", "Delivered", String(s.equipment.length - eqOpen), {
        hint: "Ready on day one",
        icon: "k-ai-truck",
        tone: "success",
      }),
    ],
    eqFilters: filtersOf(
      EQ_FILTERS,
      s.eqFilter,
      s.equipment,
      (e, id) => e.status === id,
    ),
    eqCols: columnsOf(EQ_COLS, null),
    eqRows: eqRowsAll.map((e) =>
      rowOf(
        EQ_COLS,
        e.id,
        {
          name: strong(hireName(e.hire), e.note),
          item: text(e.item),
          status: pill(e.status, EQ_TONE[e.status]),
          cost: text(usd(e.cost)),
        },
        EQ_ACTION[e.status] ? [action("advance", EQ_ACTION[e.status])] : [],
      ),
    ),
    buddies,
    buddyLine: hire.buddy
      ? `${firstName(hire)} is paired with ${buddyName(hire.buddy)}.`
      : `${firstName(hire)} has no buddy yet. Choose one.`,
    composer,
    hero: {
      greeting: `Welcome, ${firstName(hire)}!`,
      line: whenText(hire),
      pct: theirP.pct,
      doneText: `${theirP.done} of ${theirP.total} of your tasks done`,
      manager: hire.manager,
      buddy: buddyName(hire.buddy),
      office: hire.office,
    },
    mine: groups,
    agenda: agendaOf(firstWeek(hire), TODAY, 10 * 60),
  };
}
