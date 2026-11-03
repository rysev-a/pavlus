import { money, type Tone } from "../../blocks/admin-shell/shell.ts";
import { type AgendaEntry } from "../../blocks/agenda-list/agenda.ts";
import { type BarInput } from "../../blocks/bar-chart/chart.ts";
import {
  action,
  type ColumnDef,
  meter,
  pill,
  type Row,
  rowOf,
  strong,
  text,
} from "../../blocks/data-grid/grid.ts";
import type { EmailDraft } from "../../blocks/email-preview/mail.ts";
import { type CalendarEvent } from "../../blocks/month-grid/grid.ts";
import { dayLabel, isIso, TODAY } from "../../blocks/month-grid/dates.ts";
import type {
  FieldDef,
  Person,
} from "../../blocks/segment-builder/segments.ts";
import type { TemplateDef } from "../../blocks/template-picker/templates.ts";

export { TODAY };

export type Channel = "email" | "social" | "search" | "display" | "sms";
export type Status = "draft" | "scheduled" | "running" | "paused" | "done";

export interface Campaign {
  id: string;
  name: string;
  channel: Channel;
  budget: number;
  spend: number;
  status: Status;
  /** ISO day it starts or was sent. */
  start: string;
  /** People reached (sends or impressions). */
  sent: number;
  opens: number;
  clicks: number;
  conversions: number;
  segment: string;
}

const c = (
  id: string,
  name: string,
  channel: Channel,
  budget: number,
  spend: number,
  status: Status,
  start: string,
  sent: number,
  opens: number,
  clicks: number,
  conversions: number,
  segment: string,
): Campaign => ({
  id,
  name,
  channel,
  budget,
  spend,
  status,
  start,
  sent,
  opens,
  clicks,
  conversions,
  segment,
});

export const CAMPAIGNS: Campaign[] = [
  c(
    "c1",
    "Autumn roasts launch",
    "email",
    1800,
    1620,
    "done",
    "2026-10-06",
    8400,
    3780,
    910,
    164,
    "All subscribers",
  ),
  c(
    "c2",
    "Pro plan upgrade nudge",
    "email",
    900,
    880,
    "done",
    "2026-10-14",
    2600,
    1300,
    468,
    97,
    "Free plan, 5+ orders",
  ),
  c(
    "c3",
    "Instagram: brew guides",
    "social",
    2400,
    1510,
    "running",
    "2026-10-01",
    96000,
    0,
    2890,
    211,
    "Lookalike audience",
  ),
  c(
    "c4",
    "Brand search terms",
    "search",
    3200,
    2144,
    "running",
    "2026-10-01",
    41200,
    0,
    3690,
    342,
    "Keywords: coffee beans",
  ),
  c(
    "c5",
    "Retargeting banners",
    "display",
    1500,
    1498,
    "paused",
    "2026-10-10",
    188000,
    0,
    1130,
    58,
    "Cart abandoners",
  ),
  c(
    "c6",
    "Win-back offer",
    "email",
    700,
    0,
    "scheduled",
    "2026-11-12",
    0,
    0,
    0,
    0,
    "Inactive 90 days",
  ),
  c(
    "c7",
    "Delivery reminder SMS",
    "sms",
    400,
    212,
    "running",
    "2026-10-28",
    5300,
    0,
    744,
    120,
    "Subscription members",
  ),
  c(
    "c8",
    "Black Friday teaser",
    "email",
    1200,
    0,
    "scheduled",
    "2026-11-20",
    0,
    0,
    0,
    0,
    "All subscribers",
  ),
  c(
    "c9",
    "Gift guide",
    "social",
    1600,
    0,
    "draft",
    "2026-11-24",
    0,
    0,
    0,
    0,
    "Lookalike audience",
  ),
  c(
    "c10",
    "September newsletter",
    "email",
    600,
    590,
    "done",
    "2026-09-22",
    7900,
    3002,
    640,
    71,
    "All subscribers",
  ),
];

const CHANNEL_TONE: Record<Channel, Tone> = {
  email: "info",
  social: "default",
  search: "success",
  display: "warning",
  sms: "destructive",
};

const STATUS_TONE: Record<Status, Tone> = {
  draft: "muted",
  scheduled: "info",
  running: "success",
  paused: "warning",
  done: "default",
};

export const channelTone = (ch: Channel): Tone => CHANNEL_TONE[ch];

export const usd = (n: number): string => money(Math.round(n), "$", 0);

/** Pure: a share as a percentage with one decimal (0 when there is no whole). */
export function rate(part: number, whole: number): number {
  return whole <= 0 ? 0 : Math.round((part / whole) * 1000) / 10;
}

export interface Rates {
  open: number;
  click: number;
  conversion: number;
  cpa: number;
}

/** Pure: opens per send, clicks per send, conversions per click and cost per conversion. */
export function ratesOf(x: Campaign): Rates {
  return {
    open: rate(x.opens, x.sent),
    click: rate(x.clicks, x.sent),
    conversion: rate(x.conversions, x.clicks),
    cpa:
      x.conversions > 0 ? Math.round((x.spend / x.conversions) * 100) / 100 : 0,
  };
}

export const spendPct = (x: Campaign): number =>
  x.budget <= 0 ? 0 : Math.min(100, Math.round((x.spend / x.budget) * 100));

/** Pure: the tone of a spend meter: green until 80%, amber until 100%. */
export const spendTone = (pct: number): Tone =>
  pct >= 100 ? "destructive" : pct >= 80 ? "warning" : "success";

export function campaignsShown(list: Campaign[], channel: string): Campaign[] {
  return channel === "all" ? list : list.filter((x) => x.channel === channel);
}

export interface Totals {
  budget: number;
  spend: number;
  conversions: number;
  clicks: number;
  sent: number;
}

export function totals(list: Campaign[]): Totals {
  return list.reduce(
    (t, x) => ({
      budget: t.budget + x.budget,
      spend: t.spend + x.spend,
      conversions: t.conversions + x.conversions,
      clicks: t.clicks + x.clicks,
      sent: t.sent + x.sent,
    }),
    { budget: 0, spend: 0, conversions: 0, clicks: 0, sent: 0 },
  );
}

export const COLUMNS: ColumnDef[] = [
  { key: "name", label: "Campaign" },
  { key: "channel", label: "Channel" },
  { key: "spend", label: "Spend of budget" },
  { key: "when", label: "Starts" },
  { key: "status", label: "Status" },
];

export const ACTION_LABEL: Record<Status, string> = {
  running: "Pause",
  paused: "Resume",
  scheduled: "Unschedule",
  draft: "",
  done: "",
};

export function campaignRows(list: Campaign[]): Row[] {
  return list.map((x) => {
    const pct = spendPct(x);
    return rowOf(
      COLUMNS,
      x.id,
      {
        name: strong(x.name, x.segment),
        channel: pill(x.channel, CHANNEL_TONE[x.channel]),
        spend:
          x.budget > 0
            ? meter(pct, spendTone(pct), `${usd(x.spend)} / ${usd(x.budget)}`)
            : text("No budget"),
        when: text(dayLabel(x.start)),
        status: pill(x.status, STATUS_TONE[x.status]),
      },
      ACTION_LABEL[x.status] ? [action("toggle", ACTION_LABEL[x.status])] : [],
    );
  });
}

/** Pure: pause, resume or unschedule a campaign. */
export function toggleCampaign(list: Campaign[], id: string): Campaign[] {
  return list.map((x) =>
    x.id !== id
      ? x
      : {
          ...x,
          status:
            x.status === "running"
              ? "paused"
              : x.status === "paused"
                ? "running"
                : x.status === "scheduled"
                  ? "draft"
                  : x.status,
        },
  );
}

export type Metric = "open" | "click" | "conversion" | "cpa";

/** Pure: the bars of one metric for the campaigns that have results (the open rate only for email). */
export function metricBars(list: Campaign[], metric: Metric): BarInput[] {
  return list
    .filter((x) => x.sent > 0 && (metric !== "open" || x.channel === "email"))
    .map((x) => {
      const r = ratesOf(x);
      return {
        id: x.id,
        label: x.name.split(/[:\s]/)[0],
        value: r[metric],
        tone: CHANNEL_TONE[x.channel],
        show: true,
      };
    });
}

// ---- the calendar -----------------------------------------------------------

/** Pure: the sends and launches as calendar events (drafts have no day yet). */
export function calendarEvents(list: Campaign[]): CalendarEvent[] {
  return list
    .filter((x) => x.status !== "draft")
    .map((x) => ({
      id: x.id,
      date: x.start,
      label: x.name,
      tone: CHANNEL_TONE[x.channel],
    }));
}

/** Pure: what happens on a day, for the agenda list. */
export function dayEntries(list: Campaign[], day: string): AgendaEntry[] {
  return list
    .filter((x) => x.start === day && x.status !== "draft")
    .map((x) => ({
      id: x.id,
      date: x.start,
      time: x.channel === "email" || x.channel === "sms" ? "09:00" : "00:00",
      title: x.name,
      sub: `${x.channel} to ${x.segment}`,
      status: x.status,
      tone: STATUS_TONE[x.status],
      action: "",
      done: x.status === "done",
    }));
}

// ---- the audience -----------------------------------------------------------

export const FIELDS: FieldDef[] = [
  {
    id: "plan",
    label: "Plan",
    kind: "choice",
    choices: ["Free", "Pro", "Team"],
  },
  {
    id: "country",
    label: "Country",
    kind: "choice",
    choices: ["US", "UK", "DE", "FR"],
  },
  { id: "orders", label: "Orders", kind: "number" },
  { id: "inactive", label: "Days inactive", kind: "number" },
  { id: "city", label: "City", kind: "text" },
];

const CITIES = [
  "Austin",
  "Leeds",
  "Berlin",
  "Lyon",
  "Boston",
  "Munich",
  "London",
  "Paris",
  "Denver",
  "Bristol",
];
const PLANS = ["Free", "Pro", "Team"];
const COUNTRIES = ["US", "UK", "DE", "FR"];

/** Pure: a fixed audience of `n` people (no randomness: the same list every time). */
export function makeAudience(n: number): Person[] {
  const out: Person[] = [];
  for (let i = 0; i < n; i++) {
    out.push({
      id: `u${i + 1}`,
      plan: PLANS[i % 7 < 3 ? 0 : i % 7 < 6 ? 1 : 2],
      country: COUNTRIES[(i * 3 + Math.floor(i / 4)) % 4],
      orders: (i * 7) % 23,
      inactive: (i * 13) % 140,
      city: CITIES[(i * 7 + 3) % CITIES.length],
    });
  }
  return out;
}

export const AUDIENCE: Person[] = makeAudience(80);

export interface SavedSegment {
  id: string;
  name: string;
  count: number;
}

export const SAVED: SavedSegment[] = [
  { id: "s1", name: "Inactive 90 days", count: 17 },
  { id: "s2", name: "Free plan, 5+ orders", count: 12 },
];

/** Pure: what is wrong with the name of a new segment. */
export function validateSegmentName(
  name: string,
  saved: SavedSegment[],
): string {
  const clean = name.trim();
  if (!clean) return "Name the segment first.";
  if (saved.some((s) => s.name.toLowerCase() === clean.toLowerCase()))
    return "A segment with that name exists.";
  return "";
}

export function saveSegment(
  saved: SavedSegment[],
  name: string,
  count: number,
): SavedSegment[] {
  const max = saved.reduce(
    (m, s) => Math.max(m, Number(s.id.slice(1)) || 0),
    0,
  );
  return [...saved, { id: `s${max + 1}`, name: name.trim(), count }];
}

// ---- the composer -----------------------------------------------------------

export const LAYOUTS: TemplateDef[] = [
  {
    id: "newsletter",
    name: "Newsletter",
    description: "Banner, a few paragraphs and one button.",
  },
  {
    id: "promo",
    name: "Promo",
    description: "A big centered offer with a single call to action.",
  },
  {
    id: "announcement",
    name: "Announcement",
    description: "Plain text with a bar on the left.",
  },
];

export const DRAFT: EmailDraft = {
  from: "Lumen Coffee <hello@lumen.example>",
  subject: "{{name}}, we saved you a winter roast",
  preheader: "A small thank-you for being with us.",
  headline: "Winter roasts are here",
  body: "Hi {{name}},\n\nThree new coffees just left the roastery: a chocolate-heavy blend, a washed Ethiopian and a dark roast that behaves in a moka pot.\n\nOrder before Friday and your beans ship the same week.",
  cta: "See the roasts",
  layout: "newsletter",
};

/** The stock texts a layout starts from when you switch to it. */
export const STARTERS: Record<string, Partial<EmailDraft>> = {
  newsletter: { headline: "Winter roasts are here", cta: "See the roasts" },
  promo: { headline: "20% off until Sunday", cta: "Shop the sale" },
  announcement: {
    headline: "We are moving, not stopping",
    cta: "Read the story",
  },
};

export interface ScheduleDraft {
  date: string;
  time: string;
}

/** Pure: what is wrong with the day and time of a send. */
export function validateSchedule(s: ScheduleDraft): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!isIso(s.date)) errors.date = "Pick a date.";
  else if (s.date < TODAY) errors.date = "That day has passed.";
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(s.time))
    errors.time = "Use a time like 09:30.";
  return errors;
}

/** Pure: a scheduled email campaign added to the list. */
export function scheduleCampaign(
  list: Campaign[],
  draft: EmailDraft,
  day: string,
  segment: string,
): Campaign[] {
  const max = list.reduce((m, x) => Math.max(m, Number(x.id.slice(1)) || 0), 0);
  return [
    ...list,
    c(
      `c${max + 1}`,
      draft.headline.trim() || draft.subject.trim(),
      "email",
      0,
      0,
      "scheduled",
      day,
      0,
      0,
      0,
      0,
      segment,
    ),
  ];
}
