import { money, share, type Tone } from "../../blocks/admin-shell/shell.ts";
import {
  type Column as BarColumn,
  columns,
} from "../../blocks/bar-chart/chart.ts";
import { type Entry, entry } from "../../blocks/catalog-editor/catalog.ts";
import {
  action,
  type Cell,
  type ColumnDef,
  columnsOf,
  meter,
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
  listAction,
  loadMeter,
  type StatusRow,
  statusRow,
} from "../../blocks/status-list/rows.ts";
import {
  bookingOf,
  type GymClass,
  canTrain,
  CHECKINS,
  clientsOf,
  dateText,
  hoursOf,
  type Member,
  memberOf,
  type Payment,
  type Plan,
  PLANS,
  payStatus,
  relative,
  spotsLeft,
  STATUS_LABEL,
  STATUS_TONE,
  statusOf,
  takenOf,
  type Trainer,
  TODAY,
  daysBetween,
} from "./gym.ts";

const planName = (id: string): string =>
  PLANS.find((p) => p.id === id)?.name ?? id;

// ---- members

export const MEMBER_COLS: ColumnDef[] = [
  { key: "name", label: "Member", sortable: true },
  { key: "plan", label: "Plan", sortable: true },
  { key: "status", label: "Status", sortable: true },
  { key: "expires", label: "Expires", sortable: true },
  { key: "visits", label: "Visits", align: "right", sortable: true },
];

const STATUS_ORDER = ["expired", "expiring", "active", "frozen"];

/** Pure: the value a member column sorts on. */
export function memberSortValue(m: Member, key: string): string | number {
  switch (key) {
    case "plan":
      return planName(m.plan);
    case "status":
      return STATUS_ORDER.indexOf(statusOf(m));
    case "expires":
      return m.expires;
    case "visits":
      return m.visits;
    default:
      return m.name;
  }
}

export function memberGrid(list: Member[], sort: Sort | null) {
  const sorted = sortBy(list, sort, memberSortValue);
  return {
    memberCols: columnsOf(MEMBER_COLS, sort),
    memberRows: sorted.map((x): Row => {
      const status = statusOf(x);
      const lapsed = status === "expired" || status === "expiring";
      return rowOf(
        MEMBER_COLS,
        x.id,
        {
          name: strong(x.name, `Member since ${x.since}`),
          plan: text(planName(x.plan)),
          status: pill(STATUS_LABEL[status], STATUS_TONE[status]),
          expires: strong(dateText(x.expires), relative(x.expires)),
          visits: number(x.visits),
        },
        [
          action("renew", "Renew", {
            variant: lapsed ? "default" : "outline",
            disabled: x.frozen,
          }),
          action("freeze", x.frozen ? "Unfreeze" : "Freeze", {
            variant: "outline",
          }),
        ],
      );
    }),
  };
}

// ---- the desk

/** Pure: a row of the check-in desk for a member. */
export function deskRow(
  x: Member,
  ctx: {
    inside: boolean;
    time: string;
    full: boolean;
  },
): StatusRow {
  const status = statusOf(x);
  const ok = canTrain(x);
  const tone: Tone = ctx.inside ? "success" : STATUS_TONE[status];
  const label = ctx.inside ? `Inside since ${ctx.time}` : STATUS_LABEL[status];
  return statusRow(x.id, x.name, label, tone, {
    sub: ok
      ? `${planName(x.plan)}, runs to ${dateText(x.expires)}`
      : status === "frozen"
        ? `${planName(x.plan)} is frozen`
        : `${planName(x.plan)} ended ${relative(x.expires)}`,
    facts: [{ label: "Visits", value: String(x.visits) }],
    actions: ctx.inside
      ? [listAction("out", "Check out", { icon: "k-ai-logout" })]
      : [
          listAction("in", ctx.full && ok ? "Floor is full" : "Check in", {
            icon: "k-ai-login",
            variant: "default",
            disabled: !ok || ctx.full,
          }),
        ],
  });
}

// ---- classes

export function classRow(
  c: GymClass,
  ctx: { actor: string; members: Member[]; canBook: boolean },
): StatusRow {
  const state = bookingOf(c, ctx.actor);
  const left = spotsLeft(c);
  const taken = takenOf(c);
  const pct = share(taken, c.cap);
  const waiting = c.waitlist
    .map((id) => memberOf(ctx.members, id)?.name ?? id)
    .join(", ");
  const status =
    state === "booked"
      ? "Booked"
      : state === "waitlist"
        ? `Waitlist #${c.waitlist.indexOf(ctx.actor) + 1}`
        : left === 0
          ? "Full"
          : `${left} left`;
  const tone: Tone =
    state === "booked"
      ? "info"
      : state === "waitlist"
        ? "warning"
        : left === 0
          ? "destructive"
          : pct >= 75
            ? "warning"
            : "success";
  const act =
    state === "booked"
      ? listAction("cancel", "Cancel booking")
      : state === "waitlist"
        ? listAction("leave", "Leave waitlist")
        : state === "full"
          ? listAction("wait", "Join waitlist", { disabled: !ctx.canBook })
          : listAction("book", "Book", {
              icon: "k-icon-check",
              variant: "default",
              disabled: !ctx.canBook,
            });
  return statusRow(c.id, c.name, status, tone, {
    sub: waiting ? `Waitlist: ${waiting}` : `${c.room}, ${c.minutes} min`,
    facts: [
      { label: "Time", value: c.time },
      { label: "Trainer", value: c.trainer },
      { label: "Room", value: c.room },
    ],
    meters: [loadMeter("Booked", pct, `${taken} / ${c.cap}`)],
    actions: [act],
  });
}

// ---- trainers

export function trainerRow(t: Trainer, classes: GymClass[]): StatusRow {
  const hours = hoursOf(classes, t.name);
  const pct = share(hours, t.maxHours);
  const mine = classes.filter((c) => c.trainer === t.name);
  return statusRow(
    t.id,
    t.name,
    t.onShift ? "On shift" : "Off today",
    t.onShift ? "success" : "muted",
    {
      sub: t.focus,
      done: !t.onShift,
      facts: [
        { label: "Classes this week", value: String(mine.length) },
        { label: "People booked", value: String(clientsOf(classes, t.name)) },
      ],
      meters: [loadMeter("Teaching hours", pct, `${hours} / ${t.maxHours} h`)],
      actions: [
        listAction("shift", t.onShift ? "Set off today" : "Set on shift", {
          variant: t.onShift ? "outline" : "default",
        }),
      ],
    },
  );
}

// ---- payments

export const PAY_COLS: ColumnDef[] = [
  { key: "who", label: "Member" },
  { key: "amount", label: "Amount", align: "right" },
  { key: "due", label: "Due" },
  { key: "status", label: "Status" },
  { key: "reminders", label: "Sent", align: "right" },
];

export function payGrid(list: Payment[], members: Member[]) {
  const sorted = [...list].sort(
    (a, b) => Number(a.paid) - Number(b.paid) || a.due.localeCompare(b.due),
  );
  return {
    payCols: columnsOf(PAY_COLS, null),
    payRows: sorted.map((p): Row => {
      const who = memberOf(members, p.member);
      const status = payStatus(p);
      const late = -daysBetween(TODAY, p.due);
      const cells: Record<string, Cell> = {
        who: strong(who?.name ?? p.member, planName(who?.plan ?? "")),
        amount: number(money(p.amount)),
        due: strong(dateText(p.due), relative(p.due)),
        status: pill(
          status === "paid"
            ? "Paid"
            : status === "overdue"
              ? `${late} days late`
              : "Due",
          status === "paid"
            ? "success"
            : status === "overdue"
              ? "destructive"
              : "warning",
        ),
        reminders: number(p.reminders),
      };
      return rowOf(
        PAY_COLS,
        p.id,
        cells,
        p.paid
          ? []
          : [
              action("paid", "Mark paid", {
                variant: "default",
                icon: "k-icon-check",
              }),
              action("remind", "Remind"),
            ],
      );
    }),
  };
}

// ---- plans

/** Pure: the plans as lines of the catalog editor, with how many members each has. */
export function planEntries(prices: Entry[], members: Member[]): Entry[] {
  return prices.map((e) => {
    const n = members.filter((x) => x.plan === e.id).length;
    return { ...e, sub: `${n} ${n === 1 ? "member" : "members"}` };
  });
}

export const PLAN_ENTRIES: Entry[] = [
  entry("monthly", "📅", "Monthly", "Membership", 49, "", true),
  entry("quarterly", "🗓️", "Quarterly", "Membership", 129),
  entry("annual", "🏆", "Annual", "Membership", 449),
  entry("student", "🎓", "Student", "Membership", 29),
  entry("daypass", "🎟️", "Day pass", "Pass", 12, "", false),
];

/** Pure: the plan for an id (`months` comes from PLANS). */
export const planOf = (id: string): Plan =>
  PLANS.find((p) => p.id === id) ?? PLANS[0];

// ---- overview

/** Pure: check-ins by hour: the hours so far plus the live ones in the current hour. */
export function hourBars(live: number): BarColumn[] {
  return columns(
    CHECKINS.map(([label, n]) => ({
      id: label,
      label: `${label}h`,
      value: label === "18" ? n + live : n,
      show: (label === "18" ? n + live : n) > 0,
      tone: label === "18" ? ("info" as Tone) : ("default" as Tone),
    })),
  );
}
