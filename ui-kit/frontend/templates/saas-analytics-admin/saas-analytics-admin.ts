import type { Effect, Message } from "@service-laboratory/pavlus";
import { AdminApp, type AppState } from "../../blocks/admin-shell/app.ts";
import {
  type NavGroup,
  notice,
  patch,
  type ShellAction,
  type ShellUser,
  withBadge,
} from "../../blocks/admin-shell/shell.ts";
import type { Area } from "../../blocks/area-chart/area.ts";
import type { Column as BarColumn } from "../../blocks/bar-chart/chart.ts";
import {
  type Column,
  type Row,
  type Sort,
  toggleSort,
} from "../../blocks/data-grid/grid.ts";
import {
  enabled,
  type Flag,
  flagRows,
  type FlagRow,
  setRollout,
  toggleFlag,
} from "../../blocks/flag-list/flags.ts";
import {
  entry,
  groupByDay,
  type LogEntry,
  type LogGroup,
  matching,
  prepend,
} from "../../blocks/audit-log/log.ts";
import { heatSteps } from "../../blocks/heat-table/heat.ts";
import {
  type Filter,
  filtersOf,
  type ToolbarAction,
} from "../../blocks/list-filter/filters.ts";
import type { Item } from "../../blocks/progress-list/items.ts";
import {
  button,
  type Detail,
  type Field,
  type SheetButton,
} from "../../blocks/record-sheet/sheet.ts";
import type { Card } from "../../blocks/stat-cards/cards.ts";
import {
  areaOf,
  CUSTOMER_DEFS,
  type Customer,
  CUSTOMERS,
  customerDetails,
  customerFields,
  type CustomerDraft,
  customerRows,
  clockLabel,
  COHORT_COLS,
  COHORT_ROWS,
  cohortDetail,
  draftOf,
  emptyDraft,
  kpiCards,
  movement,
  PLAN_FILTERS,
  PLAN_LABEL,
  planMix,
  retentionCards,
  saveCustomer,
  setStatus,
  statusCounts,
  statusItems,
  subscriptionRows,
  SUB_DEFS,
  columnsFor,
  validateCustomer,
  mrrOf,
} from "./saas.ts";
import { money } from "../../blocks/admin-shell/shell.ts";
import view from "./saas-analytics-admin.pavlus";

export interface SheetState {
  open: boolean;
  /** The customer being edited; empty for a new one. */
  id: string;
  draft: CustomerDraft;
  title: string;
  description: string;
  fields: Field[];
  details: Detail[];
  buttons: SheetButton[];
}

/** What changes: the data, the filters and the sort orders. */
export interface SaasCore {
  customers: Customer[];
  flags: Flag[];
  log: LogEntry[];
  clock: number;
  planFilter: string;
  query: string;
  sort: Sort | null;
  subFilter: string;
  range: string;
  auditTag: string;
  auditQuery: string;
}

export interface SaasViews {
  kpis: Card[];
  retCards: Card[];
  mrrArea: Area;
  planBars: Item[];
  statusBars: Item[];
  moveCols: BarColumn[];
  planFilters: Filter[];
  cCols: Column[];
  cRows: Row[];
  cFooter: string;
  subFilters: Filter[];
  subCols: Column[];
  subRows: Row[];
  flagList: FlagRow[];
  flagFooter: string;
  auditFilters: Filter[];
  auditGroups: LogGroup[];
  recent: LogGroup[];
}

export interface SaasState extends AppState, SaasCore, SaasViews {
  user: ShellUser;
  actions: ShellAction[];
  none: ToolbarAction[];
  cActions: ToolbarAction[];
  cohortCols: typeof COHORT_COLS;
  cohortRows: typeof COHORT_ROWS;
  steps: number[];
  cohortNote: string;
  selected: string;
  sheet: SheetState;
}

const GROUPS: NavGroup[] = [
  {
    title: "Insights",
    items: [
      { id: "overview", label: "Overview", icon: "k-ai-home" },
      { id: "revenue", label: "Revenue", icon: "k-ai-dollar" },
      { id: "retention", label: "Retention", icon: "k-ai-pulse" },
    ],
  },
  {
    title: "Customers",
    items: [
      { id: "customers", label: "Customers", icon: "k-ai-users" },
      { id: "subscriptions", label: "Subscriptions", icon: "k-ai-receipt" },
    ],
  },
  {
    title: "Product",
    items: [
      { id: "flags", label: "Feature flags", icon: "k-ai-flag" },
      { id: "audit", label: "Audit log", icon: "k-ai-file" },
    ],
  },
];

const FLAGS: Flag[] = [
  {
    id: "f1",
    name: "New billing page",
    key: "billing_v2",
    desc: "Invoices, receipts and the plan picker in one place.",
    on: true,
    rollout: 50,
    env: "prod",
    owner: "Payments",
  },
  {
    id: "f2",
    name: "AI report summaries",
    key: "ai_summaries",
    desc: "A written summary on top of every weekly report.",
    on: true,
    rollout: 10,
    env: "prod",
    owner: "Insights",
  },
  {
    id: "f3",
    name: "SSO with SAML",
    key: "saml_sso",
    desc: "Single sign-on for the Scale plan.",
    on: true,
    rollout: 100,
    env: "prod",
    owner: "Platform",
  },
  {
    id: "f4",
    name: "Usage-based add-ons",
    key: "usage_addons",
    desc: "Pay per extra export instead of a bigger plan.",
    on: false,
    rollout: 25,
    env: "staging",
    owner: "Payments",
  },
  {
    id: "f5",
    name: "Dark sidebar",
    key: "dark_sidebar",
    desc: "A darker navigation for the dashboard.",
    on: false,
    rollout: 100,
    env: "dev",
    owner: "Design",
  },
  {
    id: "f6",
    name: "Realtime dashboards",
    key: "realtime_boards",
    desc: "Charts update as events arrive, not every five minutes.",
    on: true,
    rollout: 5,
    env: "staging",
    owner: "Insights",
  },
];

const LOG: LogEntry[] = [
  entry(
    "l1",
    "Ana Costa",
    "changed the plan of",
    "Northwind Ltd",
    "Today",
    "10:42",
    { text: "Growth to Scale, billed yearly.", tone: "info", tag: "Billing" },
  ),
  entry(
    "l2",
    "Leo Park",
    "rotated the API key of",
    "Brightside Studio",
    "Today",
    "09:15",
    { tone: "warning", tag: "Security" },
  ),
  entry(
    "l3",
    "Mei Tanaka",
    "retried the payment of",
    "Zephyr Travel",
    "Today",
    "08:30",
    {
      text: "Card declined again, the customer was emailed.",
      tone: "warning",
      tag: "Billing",
    },
  ),
  entry(
    "l4",
    "Leo Park",
    "turned on the flag",
    "Realtime dashboards",
    "Yesterday",
    "17:48",
    { text: "Staging only, 5% of users.", tone: "success", tag: "Product" },
  ),
  entry(
    "l5",
    "Mei Tanaka",
    "refunded an invoice for",
    "Orbit Labs",
    "Yesterday",
    "16:20",
    { text: "$240.00, duplicate charge.", tone: "success", tag: "Billing" },
  ),
  entry(
    "l6",
    "Leo Park",
    "removed the member",
    "j.silva@kiln.io",
    "Yesterday",
    "11:03",
    { tone: "destructive", tag: "Security" },
  ),
  entry(
    "l7",
    "Ana Costa",
    "canceled the subscription of",
    "Copperline",
    "Mon 2 Nov",
    "15:12",
    {
      text: "Reason: moved to an in-house tool.",
      tone: "destructive",
      tag: "Billing",
    },
  ),
  entry(
    "l8",
    "Priya Shah",
    "set the rollout of",
    "AI report summaries",
    "Mon 2 Nov",
    "10:05",
    { text: "From 5% to 10% of users.", tone: "info", tag: "Product" },
  ),
];

const AUDIT_TAGS: [string, string][] = [
  ["all", "All"],
  ["Billing", "Billing"],
  ["Security", "Security"],
  ["Product", "Product"],
];

const sheetFor = (
  id: string,
  draft: CustomerDraft,
  customers: Customer[],
  errors: Record<string, string> = {},
): SheetState => {
  const found = customers.find((x) => x.id === id);
  return {
    open: true,
    id,
    draft,
    title: id ? draft.name || "Customer" : "New customer",
    description: id
      ? "Change the plan or the seats. The invoice adjusts at the next renewal."
      : "The customer starts on a 14-day trial.",
    fields: customerFields(draft, errors),
    details: customerDetails(found),
    buttons: id
      ? [
          found?.status === "canceled"
            ? button("reactivate", "Reactivate", "outline")
            : button("cancel", "Cancel subscription", "destructive"),
          button("save", "Save changes"),
        ]
      : [button("save", "Add customer")],
  };
};

/** Pure: everything worked out from the core. */
export function derive(
  s: SaasCore & { groups: NavGroup[] },
): SaasViews & { groups: NavGroup[] } {
  const late = s.customers.filter((x) => x.status === "past_due").length;
  const shown = customerRows(s.customers, s.planFilter, s.query, s.sort, "");
  const flagsOn = enabled(s.flags);
  return {
    kpis: kpiCards(s.customers),
    retCards: retentionCards(),
    mrrArea: areaOf(s.customers, Number(s.range)),
    planBars: planMix(s.customers),
    statusBars: statusItems(s.customers),
    moveCols: movement(s.customers),
    planFilters: filtersOf(
      PLAN_FILTERS,
      s.planFilter,
      s.customers,
      (x, id) => x.plan === id,
    ),
    cCols: columnsFor(CUSTOMER_DEFS, s.sort),
    cRows: shown,
    cFooter: `${shown.length} of ${s.customers.length} customers, ${money(
      s.customers.reduce((n, x) => n + mrrOf(x), 0),
      "$",
      0,
    )} per month`,
    subFilters: statusCounts(s.customers, s.subFilter),
    subCols: columnsFor(SUB_DEFS, null),
    subRows: subscriptionRows(s.customers, s.subFilter),
    flagList: flagRows(s.flags),
    flagFooter: `${flagsOn} of ${s.flags.length} flags are on.`,
    auditFilters: filtersOf(
      AUDIT_TAGS,
      s.auditTag,
      s.log,
      (e, id) => e.tag === id,
    ),
    auditGroups: groupByDay(matching(s.log, s.auditTag, s.auditQuery)),
    recent: groupByDay(s.log.slice(0, 4)),
    groups: withBadge(s.groups, "subscriptions", late ? String(late) : ""),
  };
}

const core: SaasCore & { groups: NavGroup[] } = {
  customers: CUSTOMERS,
  flags: FLAGS,
  log: LOG,
  clock: 11 * 60 + 20,
  planFilter: "all",
  query: "",
  sort: { key: "mrr", dir: "desc" },
  subFilter: "all",
  range: "12",
  auditTag: "all",
  auditQuery: "",
  groups: GROUPS,
};

const closedSheet = (): SheetState => ({
  ...sheetFor("", emptyDraft(), CUSTOMERS),
  open: false,
});

export const initial: SaasState = {
  screen: "overview",
  title: "Overview",
  navOpen: false,
  notice: "",
  user: { name: "Ana Costa", role: "Head of finance", initials: "AC" },
  actions: [
    {
      id: "new",
      label: "Add customer",
      icon: "k-icon-plus",
      variant: "default",
    },
  ],
  none: [],
  cActions: [],
  cohortCols: COHORT_COLS,
  cohortRows: COHORT_ROWS,
  steps: heatSteps(),
  cohortNote: "Click a cell to see the customers behind it.",
  selected: "",
  ...core,
  ...derive(core),
  sheet: closedSheet(),
};

export class SaasAdmin extends AdminApp<SaasState> {
  view = view;

  /** Change some of the core; the views and the badges follow. */
  _commit(state: SaasState, changes: Partial<SaasCore>): Effect[] {
    const next = { ...state, ...changes };
    const { groups, ...rest } = derive(next);
    return patch({ ...changes, ...rest, groups });
  }

  /** Add an entry to the audit log; the clock moves a minute. */
  _log(
    state: SaasState,
    verb: string,
    target: string,
    opts: {
      text?: string;
      tone?: "success" | "info" | "warning" | "destructive";
      tag: string;
    },
  ): Partial<SaasCore> {
    const clock = state.clock + 1;
    const one = entry(
      `l${state.log.length + 1}`,
      state.user.name,
      verb,
      target,
      "Today",
      clockLabel(clock),
      opts,
    );
    return { log: prepend(state.log, one), clock };
  }

  _action(msg: Message, state: SaasState): Effect[] {
    const [id, what] = msg.payload as [string, string];
    const x = state.customers.find((y) => y.id === id);
    if (!x) return [];
    if (what === "open") {
      return patch({
        selected: id,
        sheet: sheetFor(id, draftOf(x), state.customers),
      });
    }
    const status =
      what === "cancel"
        ? "canceled"
        : what === "convert" || what === "retry" || what === "reactivate"
          ? "active"
          : x.status;
    const verb: Record<string, string> = {
      cancel: "canceled the subscription of",
      convert: "converted the trial of",
      retry: "retried the payment of",
      reactivate: "reactivated",
    };
    const said: Record<string, string> = {
      cancel: `${x.name} canceled`,
      convert: `${x.name} is now a paying customer`,
      retry: `Payment from ${x.name} went through`,
      reactivate: `${x.name} is active again`,
    };
    return [
      ...this._commit(state, {
        customers: setStatus(state.customers, id, status),
        ...this._log(state, verb[what], x.name, {
          tone: what === "cancel" ? "destructive" : "success",
          tag: "Billing",
        }),
      }),
      ...notice(said[what]),
    ];
  }

  // ---- overview
  "recent.pick"(): Effect[] {
    return patch({ screen: "audit", title: "Audit log" });
  }

  // ---- revenue
  setRange(msg: Message, state: SaasState): Effect[] {
    return this._commit(state, { range: msg.payload as string });
  }

  // ---- retention
  "cohort.pick"(msg: Message): Effect[] {
    const [row, cell] = msg.payload as [string, string];
    return patch({ cohortNote: cohortDetail(row, cell) });
  }

  // ---- customers
  "cfilter.pick"(msg: Message, state: SaasState): Effect[] {
    return this._commit(state, { planFilter: msg.payload as string });
  }
  "cfilter.search"(msg: Message, state: SaasState): Effect[] {
    return this._commit(state, { query: msg.event?.value ?? "" });
  }
  "cfilter.action"(): Effect[] {
    return this._newCustomer();
  }
  "customers.sort"(msg: Message, state: SaasState): Effect[] {
    return this._commit(state, {
      sort: toggleSort(state.sort, msg.payload as string),
    });
  }
  "customers.pick"(msg: Message, state: SaasState): Effect[] {
    return this._action(
      { ...msg, payload: [msg.payload as string, "open"] },
      state,
    );
  }
  "customers.act"(msg: Message, state: SaasState): Effect[] {
    return this._action(msg, state);
  }

  _newCustomer(): Effect[] {
    return patch({
      screen: "customers",
      title: "Customers",
      selected: "",
      sheet: sheetFor("", emptyDraft(), CUSTOMERS),
    });
  }

  "top.action"(): Effect[] {
    return this._newCustomer();
  }

  // ---- subscriptions
  "sfilter.pick"(msg: Message, state: SaasState): Effect[] {
    return this._commit(state, { subFilter: msg.payload as string });
  }
  "subs.act"(msg: Message, state: SaasState): Effect[] {
    return this._action(msg, state);
  }

  // ---- flags
  "flags.toggle"(msg: Message, state: SaasState): Effect[] {
    const id = msg.payload as string;
    const flag = state.flags.find((f) => f.id === id);
    if (!flag) return [];
    return [
      ...this._commit(state, {
        flags: toggleFlag(state.flags, id),
        ...this._log(
          state,
          flag.on ? "turned off the flag" : "turned on the flag",
          flag.name,
          {
            text: flag.on ? "" : `Rollout ${flag.rollout}% of users.`,
            tone: flag.on ? "warning" : "success",
            tag: "Product",
          },
        ),
      }),
    ];
  }
  "flags.rollout"(msg: Message, state: SaasState): Effect[] {
    const id = msg.payload as string;
    const flag = state.flags.find((f) => f.id === id);
    const value = Number(msg.event?.value);
    if (!flag) return [];
    return this._commit(state, {
      flags: setRollout(state.flags, id, value),
      ...this._log(state, "set the rollout of", flag.name, {
        text: `From ${flag.rollout}% to ${value}% of users.`,
        tone: "info",
        tag: "Product",
      }),
    });
  }

  // ---- audit
  "audit.pick"(): Effect[] {
    return [];
  }
  "afilter.pick"(msg: Message, state: SaasState): Effect[] {
    return this._commit(state, { auditTag: msg.payload as string });
  }
  "afilter.search"(msg: Message, state: SaasState): Effect[] {
    return this._commit(state, { auditQuery: msg.event?.value ?? "" });
  }

  // ---- the customer sheet
  "sheet.close"(_msg: Message, state: SaasState): Effect[] {
    return patch({ sheet: { ...state.sheet, open: false }, selected: "" });
  }

  "sheet.field"(msg: Message, state: SaasState): Effect[] {
    const draft = {
      ...state.sheet.draft,
      [msg.payload as string]: msg.event?.value ?? "",
    };
    return patch({ sheet: sheetFor(state.sheet.id, draft, state.customers) });
  }

  "sheet.press"(msg: Message, state: SaasState): Effect[] {
    const { id, draft } = state.sheet;
    const closed = { sheet: { ...state.sheet, open: false }, selected: "" };
    const press = msg.payload as string;
    if (press === "cancel" || press === "reactivate") {
      return [
        ...this._action({ ...msg, payload: [id, press] }, state),
        ...patch(closed),
      ];
    }
    const errors = validateCustomer(draft);
    if (Object.keys(errors).length > 0) {
      return patch({
        sheet: sheetFor(id, draft, state.customers, errors),
      });
    }
    const before = state.customers.find((x) => x.id === id);
    const planChanged = before && before.plan !== draft.plan;
    return [
      ...this._commit(state, {
        customers: saveCustomer(state.customers, draft, id),
        ...this._log(
          state,
          id
            ? planChanged
              ? "changed the plan of"
              : "updated"
            : "added the customer",
          draft.name.trim(),
          {
            text: planChanged
              ? `${PLAN_LABEL[before.plan]} to ${PLAN_LABEL[draft.plan as keyof typeof PLAN_LABEL]}.`
              : id
                ? `${draft.seats} seats.`
                : "Started a 14-day trial.",
            tone: "info",
            tag: "Billing",
          },
        ),
      }),
      ...patch(closed),
      ...notice(
        id ? "Customer saved" : `${draft.name.trim()} added on a trial`,
      ),
    ];
  }
}

export const page = new SaasAdmin();
