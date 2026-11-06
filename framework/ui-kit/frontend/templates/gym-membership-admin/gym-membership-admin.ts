import type { Effect, Message } from "@pavlus/frontend";
import { AdminApp, type AppState } from "../../blocks/admin-shell/app.ts";
import {
  money,
  type NavGroup,
  notice,
  patch,
  type ShellAction,
  type ShellUser,
  withBadge,
} from "../../blocks/admin-shell/shell.ts";
import type { Column as BarColumn } from "../../blocks/bar-chart/chart.ts";
import { type Meter, meterOf } from "../../blocks/capacity-meter/meter.ts";
import {
  type Entry,
  type EntryView,
  rowsOf as planRowsOf,
  toggle,
  typePrice,
} from "../../blocks/catalog-editor/catalog.ts";
import {
  type Column as GridColumn,
  type Row as GridRow,
  type Sort,
  toggleSort,
} from "../../blocks/data-grid/grid.ts";
import {
  applyFilter,
  type Filter,
  filtersOf,
  type ToolbarAction,
  toolbarAction,
} from "../../blocks/list-filter/filters.ts";
import {
  button,
  type Detail,
  detail,
  type Field,
  field,
  type SheetButton,
  selectField,
} from "../../blocks/record-sheet/sheet.ts";
import { type Card, card } from "../../blocks/stat-cards/cards.ts";
import type { StatusRow } from "../../blocks/status-list/rows.ts";
import {
  addMonths,
  applyDraft,
  bookClass,
  bookingOf,
  CAPACITY,
  CLASSES,
  COLLECTED_BASE,
  cancelBooking,
  canTrain,
  DAY_FILTERS,
  DAY_PASSES,
  dateText,
  daysBetween,
  deskTime,
  findMembers,
  type GymClass,
  hasRoom,
  MEMBER_FILTERS,
  MEMBERS,
  type Member,
  type MemberDraft,
  m as makeMember,
  memberOf,
  memberPasses,
  PAY_FILTERS,
  PAYMENTS,
  type Payment,
  PLANS,
  payPasses,
  payStatus,
  promoted,
  renew,
  SEED_INSIDE,
  statusOf,
  sumOf,
  TODAY,
  TRAINERS,
  type Trainer,
  toggleFreeze,
  validateMember,
} from "./gym.ts";
import view from "./gym-membership-admin.pavlus";
import {
  classRow,
  deskRow,
  hourBars,
  memberGrid,
  PLAN_ENTRIES,
  payGrid,
  planEntries,
  planOf,
  trainerRow,
} from "./gym-views.ts";

export interface Core {
  members: Member[];
  prices: Entry[];
  payments: Payment[];
  classes: GymClass[];
  trainers: Trainer[];
  /** Who is on the floor, and since when. */
  inside: Record<string, string>;
  /** Check-ins made at the desk since the page opened. */
  deskCount: number;
  memberFilter: string;
  memberQuery: string;
  sort: Sort | null;
  deskTab: string;
  deskQuery: string;
  dayFilter: string;
  /** The member the desk books classes for. */
  actor: string;
  payFilter: string;
  groups: NavGroup[];
}

export interface Views {
  stats: Card[];
  meter: Meter;
  bars: BarColumn[];
  soon: StatusRow[];
  nextClasses: StatusRow[];
  memberFilters: Filter[];
  memberCols: GridColumn[];
  memberRows: GridRow[];
  memberFooter: string;
  deskFilters: Filter[];
  deskRows: StatusRow[];
  dayFilters: Filter[];
  classRows: StatusRow[];
  actorOptions: { value: string; label: string; selected: boolean }[];
  trainerRows: StatusRow[];
  payStats: Card[];
  payFilters: Filter[];
  payCols: GridColumn[];
  payRows: GridRow[];
  planRows: EntryView[];
}

export interface SheetState {
  open: boolean;
  /** The member being edited; empty for a new one. */
  id: string;
  draft: MemberDraft;
  title: string;
  description: string;
  fields: Field[];
  details: Detail[];
  buttons: SheetButton[];
}

export interface GymState extends AppState, Core, Views {
  user: ShellUser;
  actions: ShellAction[];
  none: ToolbarAction[];
  sheet: SheetState;
}

const GROUPS: NavGroup[] = [
  {
    title: "Front desk",
    items: [
      { id: "overview", label: "Overview", icon: "k-ai-home" },
      { id: "checkin", label: "Check-in desk", icon: "k-ai-login" },
      { id: "members", label: "Members", icon: "k-ai-users" },
    ],
  },
  {
    title: "Programme",
    items: [
      { id: "classes", label: "Classes", icon: "k-icon-calendar" },
      { id: "trainers", label: "Trainers", icon: "k-ai-briefcase" },
    ],
  },
  {
    title: "Money",
    items: [
      { id: "payments", label: "Payments", icon: "k-ai-dollar" },
      { id: "plans", label: "Plans", icon: "k-ai-tag" },
    ],
  },
];

const newDraft = (): MemberDraft => ({
  name: "",
  plan: "monthly",
  expires: addMonths(TODAY, 1),
});

/** Pure: the sheet to add a member (no id) or to edit one. */
export function memberSheet(
  id: string,
  draft: MemberDraft,
  members: Member[],
  errors: Record<string, string> = {},
  open = true,
): SheetState {
  const current = memberOf(members, id);
  const status = current ? statusOf(current) : null;
  return {
    open,
    id,
    draft,
    title: id ? draft.name || "Member" : "New member",
    description: id
      ? "Change the plan or the date it runs out."
      : "A new member starts with the plan below.",
    fields: [
      field("name", "Name", draft.name, {
        placeholder: "First and last name",
        error: errors.name ?? "",
      }),
      selectField(
        "plan",
        "Plan",
        draft.plan,
        PLANS.map((p) => [p.id, p.name]),
      ),
      field("expires", "Runs out on", draft.expires, {
        kind: "date",
        error: errors.expires ?? "",
        hint: "The last day the member can train.",
      }),
    ],
    details:
      current && status
        ? [
            detail("Visits", current.visits),
            detail("Member since", current.since),
            detail(
              "Status",
              status === "active"
                ? "Active"
                : status[0].toUpperCase() + status.slice(1),
              status === "active"
                ? "success"
                : status === "expired"
                  ? "destructive"
                  : status === "frozen"
                    ? "info"
                    : "warning",
            ),
          ]
        : [],
    buttons: [button("save", id ? "Save changes" : "Add member")],
  };
}

/** Pure: save a draft: a new member or a changed one. */
export function saveMember(
  members: Member[],
  draft: MemberDraft,
  id: string,
): Member[] {
  if (id) return members.map((x) => (x.id === id ? applyDraft(x, draft) : x));
  const next = makeMember(
    `m${members.length + 1}`,
    draft.name.trim(),
    draft.plan,
    draft.expires,
    0,
    2026,
  );
  return [...members, next];
}

/** Pure: the members on the floor (in the order they came in). */
export function insideList(
  members: Member[],
  inside: Record<string, string>,
): Member[] {
  return Object.keys(inside)
    .map((id) => memberOf(members, id))
    .filter((x): x is Member => Boolean(x));
}

export const peopleInside = (inside: Record<string, string>): number =>
  Object.keys(inside).length + DAY_PASSES;

/** Pure: the money of payments that are not yet late and fall due within a week. */
export const dueThisWeek = (list: Payment[]): number =>
  sumOf(
    list,
    (p) =>
      !p.paid &&
      daysBetween(TODAY, p.due) >= 0 &&
      daysBetween(TODAY, p.due) <= 7,
  );

/** Pure: the views, fully worked out for the core. */
export function derive(s: Core): Views & { groups: NavGroup[] } {
  const inside = insideList(s.members, s.inside);
  const total = peopleInside(s.inside);
  const full = !hasRoom(Object.keys(s.inside).length);
  const overdue = s.payments.filter((p) => payStatus(p) === "overdue");
  const overdueSum = sumOf(s.payments, (p) => payStatus(p) === "overdue");
  const paidNow = sumOf(s.payments, (p) => p.paid);
  const active = s.members.filter((x) => canTrain(x)).length;
  const lapsed = s.members.filter(
    (x) => statusOf(x) === "expired" || statusOf(x) === "expiring",
  );
  const memberShown = applyFilter(
    s.members,
    s.memberFilter,
    s.memberQuery,
    (x, id) => memberPasses(x, id),
    (x) => `${x.name} ${x.plan}`,
  );
  const grid = memberGrid(memberShown, s.sort);
  const actor = memberOf(s.members, s.actor);
  const canBook = actor ? canTrain(actor) : false;
  const dayClasses = s.classes
    .filter((c) => String(c.day) === s.dayFilter)
    .sort((a, b) => a.time.localeCompare(b.time));
  const found =
    s.deskTab === "inside"
      ? inside
      : findMembers(s.members, PLANS, s.deskQuery).slice(0, 8);
  const deskIds = (id: string) => s.inside[id] !== undefined;
  const pays = applyFilter(
    s.payments,
    s.payFilter,
    "",
    (p, id) => payPasses(p, id),
    (p) => p.member,
  );
  const pg = payGrid(pays, s.members);
  const soonList = [...lapsed]
    .sort((a, b) => a.expires.localeCompare(b.expires))
    .slice(0, 4);
  const entries = planEntries(s.prices, s.members);
  return {
    stats: [
      card("active", "Active members", String(active), {
        hint: `of ${s.members.length}`,
        icon: "k-ai-users",
        tone: "success",
      }),
      card("inside", "On the floor", String(total), {
        hint: `of ${CAPACITY} at most`,
        icon: "k-ai-pulse",
        tone: total >= CAPACITY * 0.9 ? "destructive" : "info",
      }),
      card("lapsed", "Plans to renew", String(lapsed.length), {
        hint: "expired or ending soon",
        icon: "k-ai-alert",
        tone: lapsed.length > 0 ? "warning" : "success",
      }),
      card("overdue", "Overdue", money(overdueSum, "$", 0), {
        hint: `${overdue.length} payments`,
        icon: "k-ai-dollar",
        tone: overdue.length > 0 ? "destructive" : "success",
      }),
    ],
    meter: meterOf("On the floor now", total, CAPACITY),
    bars: hourBars(s.deskCount),
    soon: soonList.map((x) => deskRowRenew(x)),
    nextClasses: s.classes
      .filter((c) => c.day === 0)
      .sort((a, b) => a.time.localeCompare(b.time))
      .map((c) => ({
        ...classRow(c, { actor: "", members: s.members, canBook: false }),
        actions: [],
      })),
    memberFilters: filtersOf(
      MEMBER_FILTERS,
      s.memberFilter,
      s.members,
      (x, id) => memberPasses(x, id),
    ),
    ...grid,
    memberFooter: `${memberShown.length} of ${s.members.length} members`,
    deskFilters: [
      {
        id: "find",
        label: "Find a member",
        count: s.members.length,
        active: s.deskTab === "find",
      },
      {
        id: "inside",
        label: "Inside now",
        count: inside.length,
        active: s.deskTab === "inside",
      },
    ],
    deskRows: found.map((x) =>
      deskRow(x, { inside: deskIds(x.id), time: s.inside[x.id] ?? "", full }),
    ),
    dayFilters: filtersOf(
      DAY_FILTERS,
      s.dayFilter,
      s.classes,
      (c, id) => String(c.day) === id,
    ),
    classRows: dayClasses.map((c) =>
      classRow(c, { actor: s.actor, members: s.members, canBook }),
    ),
    actorOptions: s.members.map((x) => ({
      value: x.id,
      label: canTrain(x) ? x.name : `${x.name} (cannot book)`,
      selected: x.id === s.actor,
    })),
    trainerRows: s.trainers.map((t) => trainerRow(t, s.classes)),
    payStats: [
      card("week", "Due this week", money(dueThisWeek(s.payments), "$", 0), {
        icon: "k-icon-calendar",
        tone: "warning",
        hint: "not yet late",
      }),
      card("late", "Overdue", money(overdueSum, "$", 0), {
        icon: "k-ai-alert",
        tone: "destructive",
        hint: `${overdue.length} members`,
      }),
      card(
        "taken",
        "Collected this month",
        money(COLLECTED_BASE + paidNow, "$", 0),
        {
          icon: "k-ai-dollar",
          tone: "success",
          hint: "membership fees",
        },
      ),
    ],
    payFilters: filtersOf(PAY_FILTERS, s.payFilter, s.payments, (p, id) =>
      payPasses(p, id),
    ),
    ...pg,
    planRows: planRowsOf(entries, "On sale", "Closed"),
    groups: withBadge(
      withBadge(s.groups, "checkin", String(Object.keys(s.inside).length)),
      "payments",
      overdue.length ? String(overdue.length) : "",
    ),
  };
}

/** A row of the "plans to renew" list on the overview. */
function deskRowRenew(x: Member): StatusRow {
  const status = statusOf(x);
  return {
    ...deskRow(x, { inside: false, time: "", full: false }),
    sub: `${planOf(x.plan).name}, ${status === "expired" ? "ended" : "ends"} ${dateText(x.expires)}`,
    actions: [
      {
        id: "renew",
        label: "Renew",
        icon: "k-icon-check",
        variant: "default",
        disabled: false,
      },
    ],
  };
}

const core: Core = {
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
  groups: GROUPS,
};

export const initial: GymState = {
  screen: "overview",
  title: "Overview",
  navOpen: false,
  notice: "",
  user: { name: "Dana Whitfield", role: "Club manager", initials: "DW" },
  actions: [
    { id: "new", label: "New member", icon: "k-icon-plus", variant: "default" },
  ],
  none: [],
  ...core,
  ...derive(core),
  sheet: memberSheet("", newDraft(), MEMBERS, {}, false),
};

const CORE_KEYS: (keyof Core)[] = [
  "members",
  "prices",
  "payments",
  "classes",
  "trainers",
  "inside",
  "deskCount",
  "memberFilter",
  "memberQuery",
  "sort",
  "deskTab",
  "deskQuery",
  "dayFilter",
  "actor",
  "payFilter",
  "groups",
];

const coreOf = (s: GymState): Core =>
  Object.fromEntries(CORE_KEYS.map((k) => [k, s[k]])) as unknown as Core;

export class GymAdmin extends AdminApp<GymState> {
  view = view;

  /** Change some of the core; every view follows. */
  _commit(state: GymState, changes: Partial<Core>): Effect[] {
    return patch({ ...changes, ...derive({ ...coreOf(state), ...changes }) });
  }

  _renew(state: GymState, id: string): Effect[] {
    const member = memberOf(state.members, id);
    if (!member) return [];
    const next = renew(member, planOf(member.plan));
    const members = state.members.map((x) => (x.id === id ? next : x));
    return [
      ...this._commit(state, { members }),
      ...notice(`${member.name} renewed until ${dateText(next.expires)}`),
    ];
  }

  // ---- members
  "mfilter.pick"(msg: Message, state: GymState): Effect[] {
    return this._commit(state, { memberFilter: msg.payload as string });
  }
  "mfilter.search"(msg: Message, state: GymState): Effect[] {
    return this._commit(state, { memberQuery: msg.event?.value ?? "" });
  }
  "members.sort"(msg: Message, state: GymState): Effect[] {
    return this._commit(state, {
      sort: toggleSort(state.sort, msg.payload as string),
    });
  }
  "members.act"(msg: Message, state: GymState): Effect[] {
    const [id, what] = msg.payload as [string, "renew" | "freeze"];
    if (what === "renew") return this._renew(state, id);
    const member = memberOf(state.members, id);
    if (!member) return [];
    const next = toggleFreeze(member);
    return [
      ...this._commit(state, {
        members: state.members.map((x) => (x.id === id ? next : x)),
      }),
      ...notice(`${member.name} is ${next.frozen ? "frozen" : "back on"}`),
    ];
  }
  "members.pick"(msg: Message, state: GymState): Effect[] {
    const member = memberOf(state.members, msg.payload as string);
    if (!member) return [];
    const draft = {
      name: member.name,
      plan: member.plan,
      expires: member.expires,
    };
    return patch({ sheet: memberSheet(member.id, draft, state.members) });
  }
  "soon.act"(msg: Message, state: GymState): Effect[] {
    const [id] = msg.payload as [string, string];
    return this._renew(state, id);
  }

  // ---- the desk
  "deskfilter.pick"(msg: Message, state: GymState): Effect[] {
    return this._commit(state, { deskTab: msg.payload as string });
  }
  "deskfilter.search"(msg: Message, state: GymState): Effect[] {
    return this._commit(state, {
      deskQuery: msg.event?.value ?? "",
      deskTab: "find",
    });
  }
  "desk.act"(msg: Message, state: GymState): Effect[] {
    const [id, what] = msg.payload as [string, "in" | "out"];
    const member = memberOf(state.members, id);
    if (!member) return [];
    if (what === "out") {
      const inside = { ...state.inside };
      delete inside[id];
      return [
        ...this._commit(state, { inside }),
        ...notice(`${member.name} checked out`),
      ];
    }
    if (!canTrain(member) || !hasRoom(Object.keys(state.inside).length)) {
      return notice(`${member.name} cannot check in`);
    }
    return [
      ...this._commit(state, {
        inside: { ...state.inside, [id]: deskTime(state.deskCount) },
        deskCount: state.deskCount + 1,
        members: state.members.map((x) =>
          x.id === id ? { ...x, visits: x.visits + 1 } : x,
        ),
      }),
      ...notice(`${member.name} checked in`),
    ];
  }

  // ---- classes
  "dayfilter.pick"(msg: Message, state: GymState): Effect[] {
    return this._commit(state, { dayFilter: msg.payload as string });
  }
  setActor(msg: Message, state: GymState): Effect[] {
    return this._commit(state, { actor: msg.event?.value ?? state.actor });
  }
  "classes.act"(msg: Message, state: GymState): Effect[] {
    const [id, what] = msg.payload as [string, string];
    const cls = state.classes.find((c) => c.id === id);
    const member = memberOf(state.members, state.actor);
    if (!cls || !member) return [];
    const next =
      what === "cancel" || what === "leave"
        ? cancelBooking(cls, member.id)
        : bookClass(cls, member.id);
    const moved = what === "cancel" ? promoted(cls, member.id) : null;
    const text =
      what === "cancel"
        ? `${member.name} cancelled ${cls.name}`
        : what === "leave"
          ? `${member.name} left the waitlist`
          : bookingOf(next, member.id) === "waitlist"
            ? `${member.name} is on the waitlist for ${cls.name}`
            : `${member.name} booked ${cls.name}, ${cls.time}`;
    const moveText = moved
      ? `, ${memberOf(state.members, moved)?.name ?? moved} moves up from the waitlist`
      : "";
    return [
      ...this._commit(state, {
        classes: state.classes.map((c) => (c.id === id ? next : c)),
      }),
      ...notice(text + moveText),
    ];
  }

  // ---- trainers
  "trainers.act"(msg: Message, state: GymState): Effect[] {
    const [id] = msg.payload as [string, string];
    const trainer = state.trainers.find((t) => t.id === id);
    if (!trainer) return [];
    return [
      ...this._commit(state, {
        trainers: state.trainers.map((t) =>
          t.id === id ? { ...t, onShift: !t.onShift } : t,
        ),
      }),
      ...notice(
        `${trainer.name} is ${trainer.onShift ? "off today" : "on shift"}`,
      ),
    ];
  }

  // ---- payments
  "payfilter.pick"(msg: Message, state: GymState): Effect[] {
    return this._commit(state, { payFilter: msg.payload as string });
  }
  "pay.act"(msg: Message, state: GymState): Effect[] {
    const [id, what] = msg.payload as [string, "paid" | "remind"];
    const payment = state.payments.find((p) => p.id === id);
    const member = payment
      ? memberOf(state.members, payment.member)
      : undefined;
    if (!payment || !member) return [];
    if (what === "remind") {
      return [
        ...this._commit(state, {
          payments: state.payments.map((p) =>
            p.id === id ? { ...p, reminders: p.reminders + 1 } : p,
          ),
        }),
        ...notice(`Reminder sent to ${member.name}`),
      ];
    }
    const renewed = renew(member, planOf(member.plan));
    return [
      ...this._commit(state, {
        payments: state.payments.map((p) =>
          p.id === id ? { ...p, paid: true } : p,
        ),
        members: state.members.map((x) => (x.id === member.id ? renewed : x)),
      }),
      ...notice(
        `${money(payment.amount)} from ${member.name}: runs to ${dateText(renewed.expires)}`,
      ),
    ];
  }

  // ---- plans
  "plans.toggle"(msg: Message, state: GymState): Effect[] {
    return this._commit(state, {
      prices: toggle(state.prices, msg.payload as string),
    });
  }
  "plans.price"(msg: Message, state: GymState): Effect[] {
    return this._commit(state, {
      prices: typePrice(
        state.prices,
        msg.payload as string,
        msg.event?.value ?? "",
      ),
    });
  }

  // ---- the top bar and the sheet
  "top.action"(): Effect[] {
    return patch({ sheet: memberSheet("", newDraft(), []) });
  }

  "sheet.close"(_msg: Message, state: GymState): Effect[] {
    return patch({ sheet: { ...state.sheet, open: false } });
  }

  "sheet.field"(msg: Message, state: GymState): Effect[] {
    const draft = {
      ...state.sheet.draft,
      [msg.payload as string]: msg.event?.value ?? "",
    };
    return patch({ sheet: memberSheet(state.sheet.id, draft, state.members) });
  }

  "sheet.press"(_msg: Message, state: GymState): Effect[] {
    const { id, draft } = state.sheet;
    const errors = validateMember(draft);
    if (Object.keys(errors).length > 0) {
      return patch({ sheet: memberSheet(id, draft, state.members, errors) });
    }
    const members = saveMember(state.members, draft, id);
    return [
      ...this._commit(state, { members }),
      ...patch({ sheet: { ...state.sheet, open: false } }),
      ...notice(id ? "Member saved" : `${draft.name.trim()} joined the gym`),
    ];
  }
}

export const page = new GymAdmin();
