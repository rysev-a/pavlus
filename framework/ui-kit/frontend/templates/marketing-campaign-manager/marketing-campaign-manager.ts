import type { Effect, Message } from "@pavlus/frontend";
import { AdminApp, type AppState } from "../../blocks/admin-shell/app.ts";
import {
  type NavGroup,
  notice,
  patch,
  type ShellAction,
  type ShellUser,
} from "../../blocks/admin-shell/shell.ts";
import { type AgendaDay, agendaDays } from "../../blocks/agenda-list/agenda.ts";
import {
  type Column as BarColumn,
  columns,
} from "../../blocks/bar-chart/chart.ts";
import {
  type Column,
  columnsOf,
  type Row,
} from "../../blocks/data-grid/grid.ts";
import {
  type EmailDraft,
  type EmailView,
  emailErrors,
  emailView,
} from "../../blocks/email-preview/mail.ts";
import { type Filter, filtersOf } from "../../blocks/list-filter/filters.ts";
import { addDays, shiftMonth } from "../../blocks/month-grid/dates.ts";
import { type MonthView, monthCells } from "../../blocks/month-grid/grid.ts";
import {
  addRule,
  type Rule,
  type RuleView,
  removeRule,
  ruleViews,
  segment,
  setField,
  setOp,
  setValue,
  summary,
} from "../../blocks/segment-builder/segments.ts";
import { type Card, card } from "../../blocks/stat-cards/cards.ts";
import {
  type TemplateOption,
  templateOptions,
} from "../../blocks/template-picker/templates.ts";
import {
  AUDIENCE,
  CAMPAIGNS,
  type Campaign,
  COLUMNS,
  calendarEvents,
  campaignRows,
  campaignsShown,
  DRAFT,
  dayEntries,
  FIELDS,
  LAYOUTS,
  type Metric,
  metricBars,
  rate,
  SAVED,
  type SavedSegment,
  STARTERS,
  saveSegment,
  scheduleCampaign,
  TODAY,
  toggleCampaign,
  totals,
  usd,
  validateSchedule,
  validateSegmentName,
} from "./campaigns.ts";
import view from "./marketing-campaign-manager.pavlus";

export interface MktData {
  campaigns: Campaign[];
  channel: string;
  rules: Rule[];
  all: boolean;
  saved: SavedSegment[];
  segName: string;
  segError: string;
  /** The audience of the composer: `all` or a saved segment id. */
  target: string;
  draft: EmailDraft;
  sendDate: string;
  sendTime: string;
  errors: Record<string, string>;
  calY: number;
  calM: number;
  calDay: string;
}

export interface MktViews {
  stats: Card[];
  channelFilters: Filter[];
  cols: Column[];
  rows: Row[];
  openBars: BarColumn[];
  clickBars: BarColumn[];
  convBars: BarColumn[];
  cpaBars: BarColumn[];
  ruleList: RuleView[];
  count: number;
  total: number;
  pct: number;
  text: string;
  savedList: { id: string; name: string; count: string; selected: boolean }[];
  targets: { value: string; label: string; selected: boolean }[];
  audienceText: string;
  preview: EmailView;
  layouts: TemplateOption[];
  month: MonthView;
  dayList: AgendaDay[];
  dayTitle: string;
}

export interface MktState extends AppState, MktData, MktViews {
  user: ShellUser;
  actions: ShellAction[];
  none: never[];
}

const GROUPS: NavGroup[] = [
  {
    title: "Campaigns",
    items: [
      { id: "campaigns", label: "Campaigns", icon: "k-ai-sparkles" },
      { id: "performance", label: "Performance", icon: "k-ai-chart" },
      { id: "calendar", label: "Calendar", icon: "k-icon-calendar" },
    ],
  },
  {
    title: "Create",
    items: [
      { id: "audience", label: "Audience", icon: "k-ai-users" },
      { id: "composer", label: "Email composer", icon: "k-ai-edit" },
    ],
  },
];

const CHANNEL_TABS: [string, string][] = [
  ["all", "All"],
  ["email", "Email"],
  ["social", "Social"],
  ["search", "Search"],
  ["display", "Display"],
  ["sms", "SMS"],
];

const bars = (list: Campaign[], metric: Metric, unit: string): BarColumn[] => {
  const inputs = metricBars(list, metric);
  return columns(
    inputs,
    Math.max(1, ...inputs.map((b) => b.value)) * 1.1,
    unit,
  );
};

export function derive(
  s: MktData & { groups: NavGroup[] },
): MktViews & { groups: NavGroup[] } {
  const shown = campaignsShown(s.campaigns, s.channel);
  const t = totals(s.campaigns);
  const sum = summary(AUDIENCE, s.rules, FIELDS, s.all);
  const target = s.saved.find((x) => x.id === s.target);
  const events = calendarEvents(s.campaigns);
  const selected = s.calDay;
  return {
    stats: [
      card("budget", "Budget", usd(t.budget), {
        hint: `${usd(t.spend)} spent`,
        icon: "k-ai-dollar",
        tone: "info",
      }),
      card("spent", "Spent", `${rate(t.spend, t.budget)}%`, {
        hint: "of the total budget",
        icon: "k-ai-chart",
        tone: "default",
      }),
      card("conv", "Conversions", String(t.conversions), {
        hint: `${usd(t.conversions ? t.spend / t.conversions : 0)} each`,
        icon: "k-ai-flag",
        tone: "success",
      }),
      card("ctr", "Click rate", `${rate(t.clicks, t.sent)}%`, {
        hint: "clicks per send",
        icon: "k-ai-pulse",
        tone: "warning",
      }),
    ],
    channelFilters: filtersOf(
      CHANNEL_TABS,
      s.channel,
      s.campaigns,
      (x, id) => x.channel === id,
    ),
    cols: columnsOf(COLUMNS, null),
    rows: campaignRows(shown),
    openBars: bars(shown, "open", "%"),
    clickBars: bars(shown, "click", "%"),
    convBars: bars(shown, "conversion", "%"),
    cpaBars: bars(shown, "cpa", "").map((b) => ({
      ...b,
      value: b.value ? `$${b.value}` : "",
    })),
    ruleList: ruleViews(s.rules, FIELDS),
    count: sum.count,
    total: sum.total,
    pct: sum.pct,
    text: sum.text,
    savedList: s.saved.map((x) => ({
      id: x.id,
      name: x.name,
      count: `${x.count} people`,
      selected: x.id === s.target,
    })),
    targets: [
      {
        value: "all",
        label: `All subscribers (${AUDIENCE.length})`,
        selected: s.target === "all",
      },
      ...s.saved.map((x) => ({
        value: x.id,
        label: `${x.name} (${x.count})`,
        selected: x.id === s.target,
      })),
    ],
    audienceText: target
      ? `${target.count} people in "${target.name}"`
      : `${AUDIENCE.length} subscribers`,
    preview: emailView(s.draft, "Anna"),
    layouts: templateOptions(LAYOUTS, s.draft.layout),
    month: monthCells(s.calY, s.calM, events, TODAY, selected),
    dayList: agendaDays(
      dayEntries(s.campaigns, selected),
      TODAY,
      addDays(TODAY, 1),
    ),
    dayTitle: selected ? `On ${selected}` : "Pick a day",
    groups: s.groups,
  };
}

const data: MktData & { groups: NavGroup[] } = {
  campaigns: CAMPAIGNS,
  channel: "all",
  rules: [{ id: "r1", field: "plan", op: "is", value: "Free" }],
  all: true,
  saved: SAVED,
  segName: "",
  segError: "",
  target: "all",
  draft: DRAFT,
  sendDate: "2026-11-10",
  sendTime: "09:00",
  errors: { subject: "", body: "", cta: "", date: "", time: "" },
  calY: 2026,
  calM: 11,
  calDay: "2026-11-12",
  groups: GROUPS,
};

export const initial: MktState = {
  screen: "campaigns",
  title: "Campaigns",
  navOpen: false,
  notice: "",
  user: { name: "Rosa Delgado", role: "Marketing lead", initials: "RD" },
  actions: [
    { id: "new", label: "New email", icon: "k-icon-plus", variant: "default" },
  ],
  none: [],
  ...data,
  ...derive(data),
};

export class MarketingPage extends AdminApp<MktState> {
  view = view;

  _commit(state: MktState, changes: Partial<MktData>): Effect[] {
    return patch({ ...changes, ...derive({ ...state, ...changes }) });
  }

  _go(screen: string, title: string): Effect[] {
    return patch({ screen, title, navOpen: false });
  }

  // ---- campaigns and performance
  "channel.pick"(msg: Message, state: MktState): Effect[] {
    return this._commit(state, { channel: msg.payload as string });
  }

  "pchannel.pick"(msg: Message, state: MktState): Effect[] {
    return this._commit(state, { channel: msg.payload as string });
  }

  "campaigns.act"(msg: Message, state: MktState): Effect[] {
    const [id] = msg.payload as [string, string];
    const campaigns = toggleCampaign(state.campaigns, id);
    const after = campaigns.find((x) => x.id === id);
    return [
      ...this._commit(state, { campaigns }),
      ...notice(`${after?.name} is ${after?.status}`),
    ];
  }

  // ---- audience
  "seg.add"(_msg: Message, s: MktState): Effect[] {
    return this._commit(s, { rules: addRule(s.rules, FIELDS) });
  }

  "seg.remove"(msg: Message, s: MktState): Effect[] {
    return this._commit(s, {
      rules: removeRule(s.rules, msg.payload as string),
    });
  }

  "seg.setfield"(msg: Message, s: MktState): Effect[] {
    return this._commit(s, {
      rules: setField(
        s.rules,
        FIELDS,
        msg.payload as string,
        msg.event?.value ?? "",
      ),
    });
  }

  "seg.setop"(msg: Message, s: MktState): Effect[] {
    return this._commit(s, {
      rules: setOp(s.rules, msg.payload as string, msg.event?.value ?? ""),
    });
  }

  "seg.setvalue"(msg: Message, s: MktState): Effect[] {
    return this._commit(s, {
      rules: setValue(s.rules, msg.payload as string, msg.event?.value ?? ""),
    });
  }

  "seg.setmode"(msg: Message, s: MktState): Effect[] {
    return this._commit(s, { all: msg.event?.value !== "any" });
  }

  typeSegName(msg: Message): Effect[] {
    return patch({ segName: msg.event?.value ?? "", segError: "" });
  }

  saveSeg(_msg: Message, s: MktState): Effect[] {
    const error = validateSegmentName(s.segName, s.saved);
    if (error) return patch({ segError: error });
    const count = segment(AUDIENCE, s.rules, FIELDS, s.all).length;
    const saved = saveSegment(s.saved, s.segName, count);
    return [
      ...this._commit(s, { saved, target: saved[saved.length - 1].id }),
      ...patch({ segName: "", segError: "" }),
      ...notice(`Segment saved with ${count} people`),
    ];
  }

  useSeg(msg: Message, s: MktState): Effect[] {
    return [
      ...this._commit(s, { target: msg.payload as string }),
      ...this._go("composer", "Email composer"),
    ];
  }

  // ---- composer
  "top.action"(): Effect[] {
    return this._go("composer", "Email composer");
  }

  edit(msg: Message, s: MktState): Effect[] {
    const key = msg.payload as string;
    return this._commit(s, {
      draft: { ...s.draft, [key]: msg.event?.value ?? "" },
      errors: { ...s.errors, [key]: "" },
    });
  }

  "layouts.pick"(msg: Message, s: MktState): Effect[] {
    const layout = msg.payload as EmailDraft["layout"];
    return this._commit(s, {
      draft: { ...s.draft, layout, ...STARTERS[layout] },
    });
  }

  sendTarget(msg: Message, s: MktState): Effect[] {
    return this._commit(s, { target: msg.event?.value ?? "all" });
  }

  sendField(msg: Message, s: MktState): Effect[] {
    const key = msg.payload as "sendDate" | "sendTime";
    return this._commit(s, {
      [key]: msg.event?.value ?? "",
      errors: { ...s.errors, [key === "sendDate" ? "date" : "time"]: "" },
    } as Partial<MktData>);
  }

  schedule(_msg: Message, s: MktState): Effect[] {
    const errors = {
      subject: "",
      body: "",
      cta: "",
      date: "",
      time: "",
      ...emailErrors(s.draft),
      ...validateSchedule({ date: s.sendDate, time: s.sendTime }),
    };
    if (Object.values(errors).some(Boolean)) return this._commit(s, { errors });
    const target = s.saved.find((x) => x.id === s.target);
    const campaigns = scheduleCampaign(
      s.campaigns,
      s.draft,
      s.sendDate,
      target ? target.name : "All subscribers",
    );
    return [
      ...this._commit(s, {
        campaigns,
        errors,
        calY: Number(s.sendDate.slice(0, 4)),
        calM: Number(s.sendDate.slice(5, 7)),
        calDay: s.sendDate,
      }),
      ...this._go("calendar", "Calendar"),
      ...notice(`Scheduled for ${s.sendDate} at ${s.sendTime}`),
    ];
  }

  // ---- calendar
  "cal.prev"(_msg: Message, s: MktState): Effect[] {
    const to = shiftMonth(s.calY, s.calM, -1);
    return this._commit(s, { calY: to.y, calM: to.m });
  }

  "cal.next"(_msg: Message, s: MktState): Effect[] {
    const to = shiftMonth(s.calY, s.calM, 1);
    return this._commit(s, { calY: to.y, calM: to.m });
  }

  "cal.pick"(msg: Message, s: MktState): Effect[] {
    return this._commit(s, { calDay: msg.payload as string });
  }

  "cal.open"(msg: Message, s: MktState): Effect[] {
    const x = s.campaigns.find((c) => c.id === msg.payload);
    return x ? this._commit(s, { calDay: x.start }) : [];
  }

  "day.pick"(): Effect[] {
    return [];
  }
}

export const page = new MarketingPage();
