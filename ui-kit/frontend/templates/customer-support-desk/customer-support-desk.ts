import { type Effect, type Message } from "@service-laboratory/pavlus";
import { timeEffector as time } from "@service-laboratory/pavlus/plugins";
import { AdminApp, type AppState } from "../../blocks/admin-shell/app.ts";
import {
  type NavGroup,
  notice,
  patch,
  type ShellAction,
  type ShellUser,
  type Tone,
  withBadge,
} from "../../blocks/admin-shell/shell.ts";
import { type FeedItem, feedItems } from "../../blocks/activity-feed/feed.ts";
import {
  type Column as BarColumn,
  columns,
} from "../../blocks/bar-chart/chart.ts";
import {
  type ContactView,
  contactViews,
} from "../../blocks/contact-card/contacts.ts";
import {
  type Column,
  columnsOf,
  type Row,
  type Sort,
  toggleSort,
} from "../../blocks/data-grid/grid.ts";
import { type Filter, filtersOf } from "../../blocks/list-filter/filters.ts";
import { TODAY } from "../../blocks/month-grid/dates.ts";
import { type Item, item } from "../../blocks/progress-list/items.ts";
import {
  insertCanned,
  replyError,
  type StatusOption,
  statusOptions,
} from "../../blocks/reply-box/reply.ts";
import { type Card, card } from "../../blocks/stat-cards/cards.ts";
import {
  listAction,
  type StatusRow,
  statusRow,
} from "../../blocks/status-list/rows.ts";
import {
  type Suggestion,
  suggest,
} from "../../blocks/suggestion-list/suggest.ts";
import { type Bubble, bubbles } from "../../blocks/ticket-thread/thread.ts";
import {
  AGENTS,
  applyReply,
  ARTICLES,
  CANNED,
  clockLabel,
  COLUMNS,
  customerOf,
  deskStats,
  historyOf,
  PRIORITY_TONE,
  type Priority,
  queryOf,
  setAssignee,
  setPriority,
  setStatus,
  slaOf,
  type Status,
  STATUS_TONE,
  type Ticket,
  TICKETS,
  ticketRows,
  ticketsShown,
  workload,
  withArticle,
} from "./desk.ts";
import view from "./customer-support-desk.pavlus";

export interface DeskData {
  tickets: Ticket[];
  /** Seconds since the page opened: the SLA clocks run from it. */
  now: number;
  status: string;
  priority: string;
  assignee: string;
  query: string;
  sort: Sort | null;
  /** The open ticket, or empty for the list. */
  openId: string;
  kbQuery: string;
  helpQuery: string;
  draft: string;
  internal: boolean;
  replyStatus: string;
}

export interface TicketView {
  id: string;
  subject: string;
  meta: string;
  status: string;
  statusTone: Tone;
  priorityTone: Tone;
  sla: string;
  slaTone: Tone;
  slaRunning: boolean;
  messages: Bubble[];
  customer: ContactView[];
  history: FeedItem[];
  priorities: StatusOption[];
  agents: StatusOption[];
  statuses: StatusOption[];
  suggestions: Suggestion[];
  canSolve: boolean;
}

export interface DeskViews {
  statusFilters: Filter[];
  cols: Column[];
  rows: Row[];
  footer: string;
  priorityFilter: StatusOption[];
  agentFilter: StatusOption[];
  tk: TicketView;
  stats: Card[];
  byPriority: BarColumn[];
  load: Item[];
  risk: StatusRow[];
  help: Suggestion[];
}

export interface DeskState extends AppState, DeskData, DeskViews {
  user: ShellUser;
  actions: ShellAction[];
  none: never[];
  canned: { id: string; label: string }[];
  replyError: string;
}

const GROUPS: NavGroup[] = [
  {
    title: "Support",
    items: [
      { id: "inbox", label: "Inbox", icon: "k-ai-clipboard" },
      { id: "overview", label: "Overview", icon: "k-ai-pulse" },
      { id: "help", label: "Help center", icon: "k-ai-file" },
    ],
  },
];

const STATUS_TABS: [string, string][] = [
  ["all", "All"],
  ["open", "Open"],
  ["pending", "Pending"],
  ["solved", "Solved"],
];

const PRIORITIES: [string, string][] = [
  ["urgent", "Urgent"],
  ["high", "High"],
  ["normal", "Normal"],
  ["low", "Low"],
];

const PRIORITY_FILTER: [string, string][] = [
  ["all", "Any priority"],
  ...PRIORITIES,
];
const AGENT_FILTER: [string, string][] = [
  ["all", "Any agent"],
  ["none", "Unassigned"],
  ...AGENTS.map((a): [string, string] => [a.initials, a.name]),
];
const ASSIGN: [string, string][] = [
  ["", "Unassigned"],
  ...AGENTS.map((a): [string, string] => [a.initials, a.name]),
];
const STATUSES: [string, string][] = [
  ["open", "Open"],
  ["pending", "Pending"],
  ["solved", "Solved"],
];

function ticketView(s: DeskData): TicketView {
  const t = s.tickets.find((x) => x.id === s.openId);
  if (!t) {
    return {
      id: "",
      subject: "",
      meta: "",
      status: "",
      statusTone: "default",
      priorityTone: "default",
      sla: "",
      slaTone: "default",
      slaRunning: false,
      messages: [],
      customer: [],
      history: [],
      priorities: [],
      agents: [],
      statuses: statusOptions(STATUSES, s.replyStatus),
      suggestions: [],
      canSolve: false,
    };
  }
  const sla = slaOf(t, s.now);
  const customer = customerOf(t.customer);
  return {
    id: t.id,
    subject: t.subject,
    meta: `${t.id} · ${t.channel} · opened ${t.opened}`,
    status: t.status,
    statusTone: STATUS_TONE[t.status],
    priorityTone: PRIORITY_TONE[t.priority],
    sla: sla.text,
    slaTone: sla.tone,
    slaRunning: sla.running,
    messages: bubbles(t.messages),
    customer: contactViews([customer], "", TODAY),
    history: feedItems(historyOf(s.tickets, t.customer, t.id)),
    priorities: statusOptions(PRIORITIES, t.priority),
    agents: statusOptions(ASSIGN, t.assignee),
    statuses: statusOptions(STATUSES, s.replyStatus),
    suggestions: suggest(ARTICLES, s.kbQuery, 3),
    canSolve: t.status !== "solved",
  };
}

/** Pure: every view worked out from the data and the clock. */
export function derive(
  s: DeskData & { groups: NavGroup[] },
): DeskViews & { groups: NavGroup[] } {
  const shown = ticketsShown(s.tickets, s);
  const stats = deskStats(s.tickets, s.now);
  const byCount = (p: Priority) =>
    s.tickets.filter((t) => t.priority === p && t.status !== "solved").length;
  return {
    statusFilters: filtersOf(
      STATUS_TABS,
      s.status,
      s.tickets,
      (t, id) => t.status === (id as Status),
    ),
    cols: columnsOf(COLUMNS, s.sort),
    rows: ticketRows(shown, s.now, s.sort, s.openId),
    footer: `${shown.length} of ${s.tickets.length} tickets`,
    priorityFilter: statusOptions(PRIORITY_FILTER, s.priority),
    agentFilter: statusOptions(AGENT_FILTER, s.assignee),
    tk: ticketView(s),
    stats: [
      card("open", "Open tickets", String(stats.open + stats.pending), {
        hint: `${stats.pending} waiting on customers`,
        icon: "k-ai-clipboard",
        tone: "info",
      }),
      card("risk", "SLA at risk", String(stats.atRisk), {
        hint: "first reply due in 30 min",
        icon: "k-ai-alert",
        tone: stats.atRisk ? "warning" : "success",
      }),
      card("late", "SLA breached", String(stats.late), {
        hint: "no reply yet",
        icon: "k-ai-flag",
        tone: stats.late ? "destructive" : "success",
      }),
      card("none", "Unassigned", String(stats.unassigned), {
        hint: `${stats.solved} solved`,
        icon: "k-ai-users",
        tone: "default",
      }),
    ],
    byPriority: columns(
      PRIORITIES.map(([id, label]) => ({
        id,
        label,
        value: byCount(id as Priority),
        tone: PRIORITY_TONE[id as Priority],
        show: true,
      })),
    ),
    load: workload(s.tickets).map(({ agent, count }) =>
      item(agent.initials, agent.name, count, 4, { text: `${count} live` }),
    ),
    risk: s.tickets
      .filter((t) => {
        const sla = slaOf(t, s.now);
        return sla.running && sla.left <= 1800;
      })
      .sort((a, b) => slaOf(a, s.now).left - slaOf(b, s.now).left)
      .map((t) => {
        const sla = slaOf(t, s.now);
        return statusRow(t.id, t.subject, sla.text, sla.tone, {
          sub: `${t.id} · ${customerOf(t.customer).name}`,
          actions: [listAction("open", "Open")],
        });
      }),
    help: suggest(ARTICLES, s.helpQuery, 8),
    groups: withBadge(
      s.groups,
      "inbox",
      String(stats.open + stats.pending) === "0"
        ? ""
        : String(stats.open + stats.pending),
    ),
  };
}

const data: DeskData & { groups: NavGroup[] } = {
  tickets: TICKETS,
  now: 0,
  status: "all",
  priority: "all",
  assignee: "all",
  query: "",
  sort: null,
  openId: "",
  kbQuery: "",
  helpQuery: "export",
  draft: "",
  internal: false,
  replyStatus: "pending",
  groups: GROUPS,
};

export const initial: DeskState = {
  screen: "inbox",
  title: "Inbox",
  navOpen: false,
  notice: "",
  user: { name: "Jonas Weber", role: "Support agent", initials: "JW" },
  actions: [],
  none: [],
  canned: CANNED.map((c) => ({ id: c.id, label: c.label })),
  replyError: "",
  ...data,
  ...derive(data),
};

const CLOCK = "sla";

export class DeskPage extends AdminApp<DeskState> {
  view = view;

  /** The SLA clocks tick once a second while the page is open. */
  _entering(): Effect[] {
    return [time.setInterval(CLOCK, 1000, "tick")];
  }

  _leaving(): Effect[] {
    return [time.cancel(CLOCK)];
  }

  tick(_msg: Message, state: DeskState): Effect[] {
    return this._commit(state, { now: state.now + 1 });
  }

  _commit(state: DeskState, changes: Partial<DeskData>): Effect[] {
    return patch({ ...changes, ...derive({ ...state, ...changes }) });
  }

  "nav.go"(msg: Message, state: DeskState): Effect[] {
    return [
      ...super["nav.go"](msg, state),
      ...this._commit(state, { openId: "" }),
    ];
  }

  // ---- the list
  "status.pick"(msg: Message, state: DeskState): Effect[] {
    return this._commit(state, { status: msg.payload as string });
  }

  "status.search"(msg: Message, state: DeskState): Effect[] {
    return this._commit(state, { query: msg.event?.value ?? "" });
  }

  filterPriority(msg: Message, state: DeskState): Effect[] {
    return this._commit(state, { priority: msg.event?.value ?? "all" });
  }

  filterAgent(msg: Message, state: DeskState): Effect[] {
    return this._commit(state, { assignee: msg.event?.value ?? "all" });
  }

  "tickets.sort"(msg: Message, state: DeskState): Effect[] {
    return this._commit(state, {
      sort: toggleSort(state.sort, msg.payload as string),
    });
  }

  "tickets.pick"(msg: Message, state: DeskState): Effect[] {
    return this._open(state, msg.payload as string);
  }

  "risk.pick"(msg: Message, state: DeskState): Effect[] {
    return this._open(state, msg.payload as string);
  }

  "risk.act"(msg: Message, state: DeskState): Effect[] {
    const [id] = msg.payload as [string, string];
    return this._open(state, id);
  }

  _open(state: DeskState, id: string): Effect[] {
    const t = state.tickets.find((x) => x.id === id);
    if (!t) return [];
    return [
      ...patch({
        screen: "inbox",
        title: "Inbox",
        draft: "",
        internal: false,
        replyError: "",
      }),
      ...this._commit(state, {
        openId: id,
        kbQuery: queryOf(t),
        replyStatus: "pending",
        draft: "",
        internal: false,
      }),
    ];
  }

  closeTicket(_msg: Message, state: DeskState): Effect[] {
    return this._commit(state, { openId: "" });
  }

  // ---- one ticket
  solveTicket(_msg: Message, state: DeskState): Effect[] {
    return [
      ...this._commit(state, {
        tickets: setStatus(state.tickets, state.openId, "solved"),
      }),
      ...notice(`${state.openId} marked as solved`),
    ];
  }

  assignTo(msg: Message, state: DeskState): Effect[] {
    const who = msg.event?.value ?? "";
    return this._commit(state, {
      tickets: setAssignee(state.tickets, state.openId, who),
    });
  }

  priorityTo(msg: Message, state: DeskState): Effect[] {
    return this._commit(state, {
      tickets: setPriority(
        state.tickets,
        state.openId,
        (msg.event?.value ?? "normal") as Priority,
      ),
    });
  }

  "reply.type"(msg: Message, state: DeskState): Effect[] {
    return [
      ...this._commit(state, { draft: msg.event?.value ?? "" }),
      ...patch({ replyError: "" }),
    ];
  }

  "reply.insert"(msg: Message, state: DeskState): Effect[] {
    const name = customerOf(
      state.tickets.find((t) => t.id === state.openId)?.customer ?? "",
    ).name.split(" ")[0];
    return [
      ...this._commit(state, {
        draft: insertCanned(state.draft, CANNED, msg.payload as string, name),
      }),
      ...patch({ replyError: "" }),
    ];
  }

  "reply.setstatus"(msg: Message, state: DeskState): Effect[] {
    return this._commit(state, { replyStatus: msg.event?.value ?? "pending" });
  }

  "reply.note"(msg: Message, state: DeskState): Effect[] {
    return this._commit(state, { internal: msg.event?.checked ?? false });
  }

  "reply.send"(_msg: Message, state: DeskState): Effect[] {
    const error = replyError(state.draft);
    if (error) return patch({ replyError: error });
    const tickets = applyReply(
      state.tickets,
      state.openId,
      {
        text: state.draft,
        internal: state.internal,
        status: state.replyStatus as Status,
      },
      clockLabel(state.now),
    );
    return [
      ...this._commit(state, { tickets, draft: "", internal: false }),
      ...patch({ replyError: "" }),
      ...notice(
        state.internal
          ? "Note added"
          : `Reply sent, ticket ${state.replyStatus}`,
      ),
    ];
  }

  "kb.search"(msg: Message, state: DeskState): Effect[] {
    return this._commit(state, { kbQuery: msg.event?.value ?? "" });
  }

  "kb.use"(msg: Message, state: DeskState): Effect[] {
    const article = ARTICLES.find((a) => a.id === msg.payload);
    if (!article) return [];
    return this._commit(state, { draft: withArticle(state.draft, article) });
  }

  "cust.pick"(): Effect[] {
    return [];
  }

  // ---- the help center
  "help.search"(msg: Message, state: DeskState): Effect[] {
    return this._commit(state, { helpQuery: msg.event?.value ?? "" });
  }

  "help.use"(msg: Message): Effect[] {
    const article = ARTICLES.find((a) => a.id === msg.payload);
    return notice(
      article ? `Open a ticket to send "${article.title}" to a customer` : "",
    );
  }
}

export const page = new DeskPage();
