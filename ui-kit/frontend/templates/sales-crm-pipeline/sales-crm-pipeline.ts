import type { Effect, Message } from "@service-laboratory/pavlus";
import { AdminApp, type AppState } from "../../blocks/admin-shell/app.ts";
import {
  money,
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
  compact,
  dealBoard,
  type DealColumn,
  isOpen,
  probOf,
  usd,
  weightedOf,
} from "../../blocks/deal-card/deals.ts";
import { type Filter, filtersOf } from "../../blocks/list-filter/filters.ts";
import { type Rank, rankRows } from "../../blocks/leaderboard/board.ts";
import { dayLabel } from "../../blocks/month-grid/dates.ts";
import { type Item, item } from "../../blocks/progress-list/items.ts";
import { type Card, card } from "../../blocks/stat-cards/cards.ts";
import {
  listAction,
  type StatusRow,
  statusRow,
} from "../../blocks/status-list/rows.ts";
import {
  addDeal,
  addNote,
  type Deal,
  DEALS,
  type DealDraft,
  CONTACTS,
  contactsShown,
  dealTone,
  emptyDraft,
  loseDeal,
  moveDeal,
  monthName,
  ownedBy,
  REPS,
  scores,
  setNextStep,
  STAGE_TITLE,
  STAGES,
  TODAY,
  totals,
  validateDeal,
  weightedByMonth,
  weightedByStage,
} from "./sales.ts";
import { closedSheet, dealSheet, type SheetState } from "./sheets.ts";
import view from "./sales-crm-pipeline.pavlus";
import type { Contact } from "../../blocks/contact-card/contacts.ts";

export interface SalesData {
  deals: Deal[];
  contacts: Contact[];
  owner: string;
  contactTab: string;
  contactQuery: string;
  /** The open deal, or empty. */
  selected: string;
  /** The picked contact on the contacts view, or empty. */
  picked: string;
}

export interface DetailView {
  open: boolean;
  title: string;
  subtitle: string;
  stage: string;
  tone: Tone;
  amount: string;
  weighted: string;
  chance: string;
  close: string;
  contact: ContactView[];
  feed: FeedItem[];
  canBack: boolean;
  canForward: boolean;
  canLose: boolean;
  forwardLabel: string;
}

export interface SalesViews {
  stats: Card[];
  ownerFilters: Filter[];
  columns: DealColumn[];
  contactFilters: Filter[];
  contactList: ContactView[];
  contactDeals: StatusRow[];
  contactNote: string;
  leaders: Rank[];
  teamStats: Card[];
  fcStats: Card[];
  fcStage: BarColumn[];
  fcMonth: BarColumn[];
  quota: Item[];
  detail: DetailView;
}

export interface SalesState extends AppState, SalesData, SalesViews {
  user: ShellUser;
  actions: ShellAction[];
  none: never[];
  nextDraft: string;
  noteDraft: string;
  noteError: string;
  sheet: SheetState;
}

const GROUPS: NavGroup[] = [
  {
    title: "Selling",
    items: [
      { id: "pipeline", label: "Pipeline", icon: "k-ai-kanban" },
      { id: "contacts", label: "Contacts", icon: "k-ai-users" },
    ],
  },
  {
    title: "Insight",
    items: [
      { id: "leaders", label: "Leaderboard", icon: "k-ai-flag" },
      { id: "forecast", label: "Forecast", icon: "k-ai-chart" },
    ],
  },
];

const OWNER_TABS: [string, string][] = [
  ["all", "Everyone"],
  ...REPS.map((r): [string, string] => [r.initials, r.name.split(" ")[0]]),
];

const CONTACT_TABS: [string, string][] = [
  ["all", "All"],
  ["customer", "Customers"],
  ["prospect", "Prospects"],
  ["lead", "Leads"],
  ["churned", "Churned"],
];

const wholeMoney = (n: number): string => money(n, "$", 0);

/** Pure: bar columns for money values, worded as `$48k`. */
function moneyColumns(
  rows: { id: string; label: string; value: number; tone: Tone }[],
): BarColumn[] {
  return columns(rows.map((r) => ({ ...r, show: true }))).map((c, i) => ({
    ...c,
    value: compact(rows[i].value),
    tip: `${rows[i].label}: ${usd(rows[i].value)}`,
  }));
}

function detailOf(s: SalesData): DetailView {
  const d = s.deals.find((x) => x.id === s.selected);
  if (!d) {
    return {
      open: false,
      title: "",
      subtitle: "",
      stage: "",
      tone: "default",
      amount: "",
      weighted: "",
      chance: "",
      close: "",
      contact: [],
      feed: [],
      canBack: false,
      canForward: false,
      canLose: false,
      forwardLabel: "",
    };
  }
  const i = STAGES.findIndex((x) => x.id === d.stage);
  const contact = s.contacts.find((c) => c.id === d.contact);
  const prob = probOf(STAGES, d.stage);
  return {
    open: true,
    title: d.title,
    subtitle: `${d.company}, owned by ${REPS.find((r) => r.initials === d.owner)?.name ?? d.owner}`,
    stage: STAGE_TITLE(d.stage),
    tone: dealTone(d.stage),
    amount: usd(d.amount),
    weighted: usd((d.amount * prob) / 100),
    chance: `${prob}%`,
    close: dayLabel(d.close),
    contact: contact ? contactViews([contact], "", TODAY) : [],
    feed: feedItems(d.activity),
    canBack: i > 0 && d.stage !== "lost",
    canForward: i < STAGES.length - 2 && d.stage !== "lost",
    canLose: d.stage !== "lost" && d.stage !== "won",
    forwardLabel:
      STAGES[i + 1] && d.stage !== "lost" && i < STAGES.length - 2
        ? `Move to ${STAGES[i + 1].title}`
        : "",
  };
}

/** Pure: every view worked out from the data. */
export function derive(
  s: SalesData & { groups: NavGroup[] },
): SalesViews & { groups: NavGroup[] } {
  const t = totals(s.deals);
  const mine = ownedBy(s.deals, s.owner);
  const late = s.deals.filter(
    (d) => isOpen(STAGES, d.stage) && d.close < TODAY,
  ).length;
  const shown = contactsShown(s.contacts, s.contactTab, s.contactQuery);
  const picked = s.contacts.find((c) => c.id === s.picked);
  const pickedDeals = s.deals.filter((d) => d.contact === s.picked);
  const board = scores(s.deals);
  const teamWon = board.reduce((sum, b) => sum + b.value, 0);
  const teamQuota = board.reduce((sum, b) => sum + b.target, 0);
  const byStage = weightedByStage(s.deals);
  const byMonth = weightedByMonth(s.deals);
  const expected = byStage.reduce((sum, b) => sum + b.value, 0);
  return {
    stats: [
      card("open", "Open pipeline", wholeMoney(t.open), {
        hint: `${t.openCount} deals`,
        icon: "k-ai-kanban",
        tone: "info",
      }),
      card("weighted", "Weighted forecast", wholeMoney(t.weighted), {
        hint: "by stage chance",
        icon: "k-ai-chart",
        tone: "default",
      }),
      card("won", "Won this quarter", wholeMoney(t.won), {
        hint: `${t.wonCount} deals`,
        icon: "k-ai-dollar",
        tone: "success",
      }),
      card("rate", "Win rate", `${t.rate}%`, {
        hint: "won / decided",
        icon: "k-ai-flag",
        tone: "warning",
      }),
    ],
    ownerFilters: filtersOf(
      OWNER_TABS,
      s.owner,
      s.deals,
      (d, id) => d.owner === id,
    ),
    columns: dealBoard(STAGES, mine, TODAY, dayLabel),
    contactFilters: filtersOf(
      CONTACT_TABS,
      s.contactTab,
      s.contacts,
      (c, id) => c.status === id,
    ),
    contactList: contactViews(shown, s.picked, TODAY),
    contactDeals: pickedDeals.map((d) =>
      statusRow(d.id, d.title, STAGE_TITLE(d.stage), dealTone(d.stage), {
        sub: d.company,
        facts: [
          { label: "Amount", value: usd(d.amount) },
          { label: "Close", value: dayLabel(d.close) },
        ],
        actions: [listAction("open", "Open", { variant: "outline" })],
      }),
    ),
    contactNote: picked
      ? pickedDeals.length > 0
        ? `${picked.name} has ${pickedDeals.length} ${pickedDeals.length === 1 ? "deal" : "deals"}. Click one to open it.`
        : `${picked.name} has no deals yet.`
      : "",
    leaders: rankRows(board, wholeMoney),
    teamStats: [
      card("teamwon", "Team won", wholeMoney(teamWon), {
        hint: `of ${wholeMoney(teamQuota)} quota`,
        icon: "k-ai-dollar",
        tone: "success",
      }),
      card(
        "attain",
        "Quota reached",
        `${teamQuota ? Math.round((teamWon / teamQuota) * 100) : 0}%`,
        {
          hint: "whole team",
          icon: "k-ai-flag",
          tone: "default",
        },
      ),
      card("late", "Overdue deals", String(late), {
        hint: "close date has passed",
        icon: "k-ai-alert",
        tone: late > 0 ? "warning" : "success",
      }),
    ],
    fcStats: [
      card("expected", "Expected from open deals", wholeMoney(expected), {
        hint: "weighted",
        icon: "k-ai-chart",
        tone: "info",
      }),
      card("committed", "Won plus expected", wholeMoney(teamWon + expected), {
        hint: `quota ${wholeMoney(teamQuota)}`,
        icon: "k-ai-dollar",
        tone: "success",
      }),
    ],
    fcStage: moneyColumns(
      byStage.map((b) => ({
        id: b.id,
        label: b.title,
        value: b.value,
        tone: dealTone(b.id),
      })),
    ),
    fcMonth: moneyColumns(
      byMonth.map((b) => ({
        id: b.id,
        label: monthName(b.id),
        value: b.value,
        tone: "info" as Tone,
      })),
    ),
    quota: board.map((b) => {
      const open = weightedOf(
        s.deals.filter((d) => d.owner === b.id && isOpen(STAGES, d.stage)),
        STAGES,
      );
      return item(b.id, b.name, Math.round(b.value + open), b.target, {
        invert: true,
        text: `${wholeMoney(Math.round(b.value + open))} / ${wholeMoney(b.target)}`,
        sub: `${wholeMoney(b.value)} won plus ${wholeMoney(Math.round(open))} expected`,
      });
    }),
    detail: detailOf(s),
    groups: withBadge(s.groups, "pipeline", late ? String(late) : ""),
  };
}

const data: SalesData & { groups: NavGroup[] } = {
  deals: DEALS,
  contacts: CONTACTS,
  owner: "all",
  contactTab: "all",
  contactQuery: "",
  selected: "",
  picked: "",
  groups: GROUPS,
};

export const initial: SalesState = {
  screen: "pipeline",
  title: "Pipeline",
  navOpen: false,
  notice: "",
  user: { name: "Maya Chen", role: "Account executive", initials: "MC" },
  actions: [
    { id: "deal", label: "New deal", icon: "k-icon-plus", variant: "default" },
  ],
  none: [],
  nextDraft: "",
  noteDraft: "",
  noteError: "",
  ...data,
  ...derive(data),
  sheet: closedSheet(emptyDraft()),
};

export class SalesPage extends AdminApp<SalesState> {
  view = view;

  /** Change some of the data; every view follows. */
  _commit(state: SalesState, changes: Partial<SalesData>): Effect[] {
    return patch({ ...changes, ...derive({ ...state, ...changes }) });
  }

  _titleOf(state: SalesState, id: string): string {
    return state.deals.find((d) => d.id === id)?.title ?? "";
  }

  // ---- the board
  "ownerfilter.pick"(msg: Message, state: SalesState): Effect[] {
    return this._commit(state, { owner: msg.payload as string });
  }

  "board.move"(msg: Message, state: SalesState): Effect[] {
    const [id, dir] = msg.payload as [string, "left" | "right"];
    const deals = moveDeal(state.deals, id, dir);
    const after = deals.find((d) => d.id === id);
    return [
      ...this._commit(state, { deals }),
      ...notice(
        `${this._titleOf(state, id)} is now ${STAGE_TITLE(after?.stage ?? "")}`,
      ),
    ];
  }

  "board.open"(msg: Message, state: SalesState): Effect[] {
    return this._open(state, msg.payload as string);
  }

  _open(state: SalesState, id: string): Effect[] {
    const found = state.deals.find((d) => d.id === id);
    return [
      ...this._commit(state, { selected: id }),
      ...patch({ nextDraft: found?.next ?? "", noteDraft: "", noteError: "" }),
    ];
  }

  // ---- the detail sheet
  closeDetail(_msg: Message, state: SalesState): Effect[] {
    return this._commit(state, { selected: "" });
  }

  detailMove(msg: Message, state: SalesState): Effect[] {
    const deals = moveDeal(
      state.deals,
      state.selected,
      msg.payload as "left" | "right",
    );
    return this._commit(state, { deals });
  }

  detailLose(_msg: Message, state: SalesState): Effect[] {
    return [
      ...this._commit(state, { deals: loseDeal(state.deals, state.selected) }),
      ...notice("Marked as lost"),
    ];
  }

  nextInput(msg: Message): Effect[] {
    return patch({ nextDraft: msg.event?.value ?? "" });
  }

  saveNext(_msg: Message, state: SalesState): Effect[] {
    return [
      ...this._commit(state, {
        deals: setNextStep(state.deals, state.selected, state.nextDraft),
      }),
      ...notice("Next step saved"),
    ];
  }

  noteInput(msg: Message): Effect[] {
    return patch({ noteDraft: msg.event?.value ?? "", noteError: "" });
  }

  saveNote(_msg: Message, state: SalesState): Effect[] {
    if (!state.noteDraft.trim())
      return patch({ noteError: "Write a note first." });
    return [
      ...this._commit(state, {
        deals: addNote(state.deals, state.selected, state.noteDraft),
      }),
      ...patch({ noteDraft: "", noteError: "" }),
    ];
  }

  "dcontact.pick"(): Effect[] {
    return [];
  }

  // ---- contacts
  "cfilter.pick"(msg: Message, state: SalesState): Effect[] {
    return this._commit(state, { contactTab: msg.payload as string });
  }

  "cfilter.search"(msg: Message, state: SalesState): Effect[] {
    return this._commit(state, { contactQuery: msg.event?.value ?? "" });
  }

  "contacts.pick"(msg: Message, state: SalesState): Effect[] {
    return this._commit(state, { picked: msg.payload as string });
  }

  "cdeals.pick"(msg: Message, state: SalesState): Effect[] {
    return this._open(state, msg.payload as string);
  }

  "cdeals.act"(msg: Message, state: SalesState): Effect[] {
    const [id] = msg.payload as [string, string];
    return this._open(state, id);
  }

  // ---- leaderboard
  "leaders.pick"(msg: Message, state: SalesState): Effect[] {
    return [
      ...this._commit(state, { owner: msg.payload as string }),
      ...patch({ screen: "pipeline", title: "Pipeline" }),
    ];
  }

  // ---- the new deal sheet
  "top.action"(): Effect[] {
    return patch({ sheet: dealSheet(emptyDraft()) });
  }

  _closeSheet(state: SalesState): Effect[] {
    return patch({ sheet: { ...state.sheet, open: false } });
  }

  "sheet.close"(_msg: Message, state: SalesState): Effect[] {
    return this._closeSheet(state);
  }

  "sheet.field"(msg: Message, state: SalesState): Effect[] {
    const draft: DealDraft = {
      ...state.sheet.draft,
      [msg.payload as string]: msg.event?.value ?? "",
    };
    return patch({ sheet: dealSheet(draft) });
  }

  "sheet.press"(_msg: Message, state: SalesState): Effect[] {
    const draft = state.sheet.draft;
    const errors = validateDeal(draft);
    if (Object.keys(errors).length > 0) {
      return patch({ sheet: dealSheet(draft, errors) });
    }
    return [
      ...this._commit(state, {
        deals: addDeal(state.deals, draft),
        owner: "all",
      }),
      ...patch({ screen: "pipeline", title: "Pipeline" }),
      ...this._closeSheet(state),
      ...notice(`${draft.title.trim()} added to ${STAGE_TITLE(draft.stage)}`),
    ];
  }
}

export const page = new SalesPage();
