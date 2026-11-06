import { money, pad2, type Tone } from "../../blocks/admin-shell/shell.ts";
import {
  type AreaInput,
  type Area,
  areaChart,
  short,
} from "../../blocks/area-chart/area.ts";
import { type Column, columns } from "../../blocks/bar-chart/chart.ts";
import {
  action,
  type Column as GridColumn,
  type ColumnDef,
  columnsOf,
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
  columnAverages,
  columnsFrom,
  type HeatColumn,
  heatRow,
  type HeatRow,
  retention,
} from "../../blocks/heat-table/heat.ts";
import { applyFilter, filtersOf } from "../../blocks/list-filter/filters.ts";
import { item, type Item } from "../../blocks/progress-list/items.ts";
import {
  type Detail,
  detail,
  type Field,
  field,
  positive,
  selectField,
} from "../../blocks/record-sheet/sheet.ts";
import { type Card, card, change } from "../../blocks/stat-cards/cards.ts";

export type Plan = "free" | "starter" | "growth" | "scale";
export type Status = "active" | "trialing" | "past_due" | "canceled";

export interface Customer {
  id: string;
  name: string;
  contact: string;
  email: string;
  plan: Plan;
  status: Status;
  seats: number;
  since: string;
  lastSeen: string;
  renews: string;
}

/** Dollars per seat per month. */
export const PRICE: Record<Plan, number> = {
  free: 0,
  starter: 9,
  growth: 19,
  scale: 34,
};
export const PLAN_LABEL: Record<Plan, string> = {
  free: "Free",
  starter: "Starter",
  growth: "Growth",
  scale: "Scale",
};
const PLAN_TONE: Record<Plan, Tone> = {
  free: "muted",
  starter: "info",
  growth: "default",
  scale: "success",
};
export const STATUS_LABEL: Record<Status, string> = {
  active: "Active",
  trialing: "Trialing",
  past_due: "Past due",
  canceled: "Canceled",
};
export const STATUS_TONE: Record<Status, Tone> = {
  active: "success",
  trialing: "info",
  past_due: "warning",
  canceled: "muted",
};

const c = (
  id: string,
  name: string,
  contact: string,
  plan: Plan,
  status: Status,
  seats: number,
  since: string,
  lastSeen: string,
  renews: string,
): Customer => ({
  id,
  name,
  contact,
  email: `${contact.toLowerCase().replace(/[^a-z]+/g, ".")}@${name
    .toLowerCase()
    .replace(/[^a-z]+/g, "")}.com`,
  plan,
  status,
  seats,
  since,
  lastSeen,
  renews,
});

export const CUSTOMERS: Customer[] = [
  c(
    "c1",
    "Northwind Ltd",
    "Hannah Weber",
    "scale",
    "active",
    120,
    "Mar 2025",
    "12 min ago",
    "1 Dec",
  ),
  c(
    "c2",
    "Brightside Studio",
    "Diego Alvarez",
    "growth",
    "active",
    45,
    "Jun 2025",
    "2 h ago",
    "14 Dec",
  ),
  c(
    "c3",
    "Orbit Labs",
    "Priya Nair",
    "growth",
    "active",
    60,
    "Jan 2025",
    "Yesterday",
    "9 Dec",
  ),
  c(
    "c4",
    "Kiln & Co",
    "Joao Silva",
    "starter",
    "active",
    12,
    "Aug 2025",
    "3 days ago",
    "21 Nov",
  ),
  c(
    "c5",
    "Harbor Freight Tech",
    "Olivia Brandt",
    "scale",
    "active",
    210,
    "Nov 2024",
    "5 min ago",
    "1 Dec",
  ),
  c(
    "c6",
    "Lumen Health",
    "Samuel Adeyemi",
    "scale",
    "active",
    85,
    "Feb 2025",
    "1 h ago",
    "18 Dec",
  ),
  c(
    "c7",
    "Paperplane",
    "Mira Kovac",
    "starter",
    "active",
    8,
    "Sep 2025",
    "Today",
    "27 Nov",
  ),
  c(
    "c8",
    "Greenfield Foods",
    "Tom Lindgren",
    "growth",
    "active",
    150,
    "Dec 2024",
    "40 min ago",
    "5 Dec",
  ),
  c(
    "c9",
    "Tidewater Bank",
    "Elena Rossi",
    "scale",
    "active",
    340,
    "Oct 2024",
    "2 min ago",
    "1 Dec",
  ),
  c(
    "c10",
    "Fable Games",
    "Kenji Mori",
    "growth",
    "active",
    38,
    "May 2025",
    "Yesterday",
    "11 Dec",
  ),
  c(
    "c11",
    "Quill Media",
    "Nora Haddad",
    "starter",
    "past_due",
    15,
    "Apr 2025",
    "6 days ago",
    "Overdue 6 days",
  ),
  c(
    "c12",
    "Atlas Logistics",
    "Pavel Novak",
    "scale",
    "active",
    190,
    "Jan 2025",
    "20 min ago",
    "1 Dec",
  ),
  c(
    "c13",
    "Birch & Pine",
    "Lucy Marsh",
    "free",
    "active",
    4,
    "Oct 2025",
    "4 days ago",
    "Free plan",
  ),
  c(
    "c14",
    "Solstice Energy",
    "Ivan Petrov",
    "growth",
    "trialing",
    72,
    "Oct 2025",
    "Today",
    "Trial ends 9 Nov",
  ),
  c(
    "c15",
    "Copperline",
    "Rita Gomez",
    "starter",
    "canceled",
    22,
    "Jul 2025",
    "3 weeks ago",
    "Ended 14 Oct",
  ),
  c(
    "c16",
    "Meridian Dental",
    "Sarah Cohen",
    "growth",
    "active",
    29,
    "Jun 2025",
    "Yesterday",
    "8 Dec",
  ),
  c(
    "c17",
    "Zephyr Travel",
    "Luca Bianchi",
    "starter",
    "past_due",
    18,
    "Mar 2025",
    "9 days ago",
    "Overdue 3 days",
  ),
  c(
    "c18",
    "Ironbridge Legal",
    "James Okoro",
    "scale",
    "active",
    64,
    "Aug 2025",
    "3 h ago",
    "20 Dec",
  ),
];

// ---- money

export const baseMrr = (x: Customer): number => PRICE[x.plan] * x.seats;

/** Pure: what a customer pays per month right now (trials and canceled pay nothing). */
export const mrrOf = (x: Customer): number =>
  x.status === "active" || x.status === "past_due" ? baseMrr(x) : 0;

export const totalMrr = (list: Customer[]): number =>
  list.reduce((n, x) => n + mrrOf(x), 0);

/** Pure: monthly revenue lost to canceled paid plans. */
export const churnedMrr = (list: Customer[]): number =>
  list
    .filter((x) => x.status === "canceled")
    .reduce((n, x) => n + baseMrr(x), 0);

/** Pure: churned MRR as a percentage of MRR at the start of the month, one decimal. */
export function churnRate(list: Customer[]): number {
  const lost = churnedMrr(list);
  const start = totalMrr(list) + lost;
  return start === 0 ? 0 : Math.round((lost / start) * 1000) / 10;
}

export const payingCount = (list: Customer[]): number =>
  list.filter((x) => mrrOf(x) > 0).length;

export const MONTHS = [
  "Dec",
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
];
/** MRR at the end of each month before this one. */
export const HISTORY = [
  24800, 26100, 27900, 29600, 31000, 32800, 34500, 36200, 37100, 38600, 39800,
];

/** Pure: twelve months of MRR; the last is the live figure. */
export function mrrSeries(list: Customer[]): number[] {
  return [...HISTORY, totalMrr(list)];
}

export function areaOf(list: Customer[], months: number): Area {
  const series = mrrSeries(list);
  const input: AreaInput[] = series.map((value, i) => ({
    id: MONTHS[i],
    label: MONTHS[i],
    value,
  }));
  return areaChart(input.slice(-months), { format: (v) => short(v, "$") });
}

// ---- the dashboard

export function kpiCards(list: Customer[]): Card[] {
  const series = mrrSeries(list);
  const mrr = series[series.length - 1];
  const prev = series[series.length - 2];
  const { delta, trend } = change(mrr, prev);
  const lost = churnedMrr(list);
  return [
    card("mrr", "MRR", money(mrr, "$", 0), {
      delta,
      trend,
      hint: "vs last month",
      icon: "k-ai-dollar",
      series: series.slice(-8),
    }),
    card("arr", "ARR", money(mrr * 12, "$", 0), {
      delta,
      trend,
      hint: "annualised",
      icon: "k-ai-chart",
      tone: "info",
    }),
    card("churn", "Churn", `${churnRate(list)}%`, {
      hint: lost ? `${money(lost, "$", 0)} MRR lost` : "Nobody left",
      icon: "k-ai-alert",
      tone: "warning",
    }),
    card("paying", "Paying", String(payingCount(list)), {
      hint: `${list.filter((x) => x.status === "trialing").length} on trial`,
      icon: "k-ai-users",
      tone: "success",
    }),
  ];
}

export function planMix(list: Customer[]): Item[] {
  const total = Math.max(1, totalMrr(list));
  return (["scale", "growth", "starter"] as Plan[]).map((plan) => {
    const sum = list
      .filter((x) => x.plan === plan)
      .reduce((n, x) => n + mrrOf(x), 0);
    return item(plan, PLAN_LABEL[plan], sum, total, {
      tone: PLAN_TONE[plan],
      text: money(sum, "$", 0),
      sub: `${Math.round((sum / total) * 100)}% of MRR`,
    });
  });
}

export function statusItems(list: Customer[]): Item[] {
  const total = Math.max(1, list.length);
  return (["active", "trialing", "past_due", "canceled"] as Status[]).map(
    (status) => {
      const some = list.filter((x) => x.status === status);
      return item(status, STATUS_LABEL[status], some.length, total, {
        tone: STATUS_TONE[status],
        text: String(some.length),
        sub: `${money(
          some.reduce((n, x) => n + baseMrr(x), 0),
          "$",
          0,
        )} per month`,
      });
    },
  );
}

/** Pure: where this month's MRR change came from, in thousands of dollars. */
export function movement(list: Customer[]): Column[] {
  const lost = churnedMrr(list) / 1000;
  const k = (n: number) => Math.round(n * 10) / 10;
  return columns(
    [
      { id: "new", label: "New", value: 3.1, tone: "success", show: true },
      { id: "exp", label: "Expansion", value: 1.4, tone: "info", show: true },
      {
        id: "con",
        label: "Contraction",
        value: 0.4,
        tone: "warning",
        show: true,
      },
      {
        id: "chu",
        label: "Churned",
        value: k(lost),
        tone: "destructive",
        show: true,
      },
    ],
    undefined,
    "k",
  );
}

// ---- cohorts

export const COHORTS: [string, number, number[]][] = [
  ["Apr", 118, [118, 91, 80, 73, 68, 64, 61, 58]],
  ["May", 126, [126, 98, 86, 78, 72, 69, 66]],
  ["Jun", 134, [134, 105, 92, 84, 78, 74]],
  ["Jul", 151, [151, 120, 106, 98, 92]],
  ["Aug", 148, [148, 121, 109, 101]],
  ["Sep", 166, [166, 139, 125]],
  ["Oct", 172, [172, 148]],
  ["Nov", 181, [181]],
];
export const COHORT_COLS: HeatColumn[] = columnsFrom(
  COHORTS[0][2].map((_, i) => `M${i}`),
);

const retained = COHORTS.map(([, size, active]) => retention(size, active));
export const COHORT_ROWS: HeatRow[] = COHORTS.map(([name, size], i) =>
  heatRow(name, name, `${size} signups`, retained[i], COHORT_COLS, {
    min: 40,
    max: 100,
    format: (v) => `${v}%`,
  }),
);

export function retentionCards(): Card[] {
  const avg = columnAverages(retained);
  const best = COHORTS.reduce((a, b) =>
    (b[2][1] ?? 0) / b[1] > (a[2][1] ?? 0) / a[1] ? b : a,
  );
  return [
    card("m1", "Month 1", `${avg[1]}%`, {
      hint: "average retention",
      icon: "k-ai-pulse",
    }),
    card("m3", "Month 3", `${avg[3]}%`, {
      hint: "average retention",
      icon: "k-ai-pulse",
      tone: "info",
    }),
    card("m6", "Month 6", `${avg[6]}%`, {
      hint: "average retention",
      icon: "k-ai-pulse",
      tone: "warning",
    }),
    card("best", "Best cohort", best[0], {
      hint: "at month 1",
      icon: "k-ai-sparkles",
      tone: "success",
    }),
  ];
}

/** Pure: what a click on a cohort cell says. */
export function cohortDetail(rowId: string, cellId: string): string {
  const cohort = COHORTS.find(([name]) => name === rowId);
  const month = Number(cellId.split(":c")[1]);
  if (!cohort || Number.isNaN(month)) return "";
  const [name, size, active] = cohort;
  return `${name} cohort, month ${month}: ${active[month]} of ${size} customers are still subscribed.`;
}

// ---- customers

export const PLAN_FILTERS: [string, string][] = [
  ["all", "All"],
  ["scale", "Scale"],
  ["growth", "Growth"],
  ["starter", "Starter"],
  ["free", "Free"],
];
export const STATUS_FILTERS: [string, string][] = [
  ["all", "All"],
  ["active", "Active"],
  ["trialing", "Trialing"],
  ["past_due", "Past due"],
  ["canceled", "Canceled"],
];

export const CUSTOMER_DEFS: ColumnDef[] = [
  { key: "name", label: "Customer", sortable: true },
  { key: "plan", label: "Plan", sortable: true },
  { key: "status", label: "Status" },
  { key: "seats", label: "Seats", align: "right", sortable: true },
  { key: "mrr", label: "MRR", align: "right", sortable: true },
  { key: "seen", label: "Last seen" },
];

export const SUB_DEFS: ColumnDef[] = [
  { key: "name", label: "Customer" },
  { key: "plan", label: "Plan" },
  { key: "status", label: "Status" },
  { key: "renews", label: "Renews" },
  { key: "mrr", label: "MRR", align: "right" },
];

export function sortValue(x: Customer, key: string): string | number {
  if (key === "plan") return PRICE[x.plan];
  if (key === "seats") return x.seats;
  if (key === "mrr") return mrrOf(x);
  return x.name;
}

export const customerText = (x: Customer): string =>
  `${x.name} ${x.contact} ${x.email}`;

export function customerRows(
  list: Customer[],
  plan: string,
  query: string,
  sort: Sort | null,
  selected: string,
): Row[] {
  const shown = sortBy(
    applyFilter(list, plan, query, (x, id) => x.plan === id, customerText),
    sort,
    sortValue,
  );
  return shown.map((x) =>
    rowOf(
      CUSTOMER_DEFS,
      x.id,
      {
        name: strong(x.name, x.contact),
        plan: pill(PLAN_LABEL[x.plan], PLAN_TONE[x.plan]),
        status: pill(STATUS_LABEL[x.status], STATUS_TONE[x.status]),
        seats: number(x.seats),
        mrr: number(money(mrrOf(x), "$", 0)),
        seen: text(x.lastSeen),
      },
      [action("open", "Open")],
      x.id === selected,
    ),
  );
}

export function subscriptionAction(x: Customer) {
  if (x.status === "past_due")
    return action("retry", "Retry payment", { variant: "default" });
  if (x.status === "trialing")
    return action("convert", "Convert", { variant: "default" });
  if (x.status === "canceled") return action("reactivate", "Reactivate");
  return action("cancel", "Cancel", { variant: "outline" });
}

export function subscriptionRows(list: Customer[], status: string): Row[] {
  return list
    .filter((x) => status === "all" || x.status === status)
    .map((x) =>
      rowOf(
        SUB_DEFS,
        x.id,
        {
          name: strong(x.name, x.email),
          plan: pill(PLAN_LABEL[x.plan], PLAN_TONE[x.plan]),
          status: pill(STATUS_LABEL[x.status], STATUS_TONE[x.status]),
          renews: mono(x.renews),
          mrr: number(money(mrrOf(x), "$", 0)),
        },
        [subscriptionAction(x)],
      ),
    );
}

export const columnsFor = (
  defs: ColumnDef[],
  sort: Sort | null,
): GridColumn[] => columnsOf(defs, sort);

// ---- state changes

/** Pure: what the renewal column says for a status. */
export function renewsFor(x: Customer, status: Status): string {
  if (status === "active") return x.plan === "free" ? "Free plan" : "1 Dec";
  if (status === "trialing") return "Trial ends 9 Nov";
  if (status === "past_due") return "Overdue 1 day";
  return "Ended 3 Nov";
}

export function setStatus(
  list: Customer[],
  id: string,
  status: Status,
): Customer[] {
  return list.map((x) =>
    x.id === id ? { ...x, status, renews: renewsFor(x, status) } : x,
  );
}

export interface CustomerDraft {
  name: string;
  email: string;
  plan: string;
  seats: string;
}

export const draftOf = (x: Customer): CustomerDraft => ({
  name: x.name,
  email: x.email,
  plan: x.plan,
  seats: String(x.seats),
});

export const emptyDraft = (): CustomerDraft => ({
  name: "",
  email: "",
  plan: "starter",
  seats: "5",
});

export function validateCustomer(d: CustomerDraft): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!d.name.trim()) errors.name = "Give the company a name.";
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(d.email.trim()))
    errors.email = "Use a valid email address.";
  const seats = positive(d.seats);
  if (seats === null || !Number.isInteger(seats))
    errors.seats = "Seats must be a whole number above zero.";
  return errors;
}

export function nextCustomerId(list: Customer[]): string {
  return `c${Math.max(0, ...list.map((x) => Number(x.id.slice(1)))) + 1}`;
}

/** Pure: save a draft over a customer, or add a new one (`id` empty). */
export function saveCustomer(
  list: Customer[],
  d: CustomerDraft,
  id: string,
): Customer[] {
  const plan = d.plan as Plan;
  const seats = Number(d.seats);
  if (id) {
    return list.map((x) =>
      x.id === id
        ? {
            ...x,
            name: d.name.trim(),
            email: d.email.trim(),
            plan,
            seats,
            renews:
              x.status === "active"
                ? renewsFor({ ...x, plan }, "active")
                : x.renews,
          }
        : x,
    );
  }
  return [
    ...list,
    {
      id: nextCustomerId(list),
      name: d.name.trim(),
      contact: d.name.trim(),
      email: d.email.trim(),
      plan,
      status: "trialing",
      seats,
      since: "Nov 2026",
      lastSeen: "Just now",
      renews: "Trial ends 17 Nov",
    },
  ];
}

export function customerFields(
  d: CustomerDraft,
  errors: Record<string, string> = {},
): Field[] {
  const fields = [
    field("name", "Company", d.name, { placeholder: "Acme Inc." }),
    field("email", "Billing email", d.email, {
      kind: "email",
      placeholder: "billing@acme.com",
    }),
    selectField(
      "plan",
      "Plan",
      d.plan,
      (Object.keys(PLAN_LABEL) as Plan[]).map((p) => [
        p,
        `${PLAN_LABEL[p]}, $${PRICE[p]} per seat`,
      ]),
    ),
    field("seats", "Seats", d.seats, { kind: "number" }),
  ];
  return fields.map((f) => ({ ...f, error: errors[f.id] ?? "" }));
}

export function customerDetails(x: Customer | undefined): Detail[] {
  if (!x) return [];
  return [
    detail("Status", STATUS_LABEL[x.status], STATUS_TONE[x.status]),
    detail("MRR", money(mrrOf(x), "$", 0)),
    detail("Customer since", x.since),
    detail("Last seen", x.lastSeen),
  ];
}

/** Pure: `11:05` from minutes after midnight. */
export const clockLabel = (min: number): string =>
  `${pad2(Math.floor(min / 60))}:${pad2(min % 60)}`;

export const filterCounts = (list: Customer[], active: string) =>
  filtersOf(PLAN_FILTERS, active, list, (x, id) => x.plan === id);
export const statusCounts = (list: Customer[], active: string) =>
  filtersOf(STATUS_FILTERS, active, list, (x, id) => x.status === id);
