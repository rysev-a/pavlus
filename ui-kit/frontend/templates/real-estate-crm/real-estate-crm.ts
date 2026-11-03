import type { Effect, Message } from "@service-laboratory/pavlus";
import { AdminApp, type AppState } from "../../blocks/admin-shell/app.ts";
import {
  type NavGroup,
  notice,
  patch,
  type ShellAction,
  type ShellUser,
} from "../../blocks/admin-shell/shell.ts";
import {
  type AgendaDay,
  type AgendaEntry,
} from "../../blocks/agenda-list/agenda.ts";
import { type Column, columnsOf } from "../../blocks/data-grid/grid.ts";
import {
  type ColumnView,
  boardOf,
  moveTask,
} from "../../blocks/kanban-board/board.ts";
import { type Filter, filtersOf } from "../../blocks/list-filter/filters.ts";
import { type Item, item } from "../../blocks/progress-list/items.ts";
import { type Row } from "../../blocks/data-grid/grid.ts";
import {
  button,
  type Field,
  field,
  type SheetButton,
  selectField,
} from "../../blocks/record-sheet/sheet.ts";
import { type Card, card } from "../../blocks/stat-cards/cards.ts";
import {
  type Property,
  type PropertyView,
  price,
  propertyViews,
} from "../../blocks/property-card/properties.ts";
import {
  addViewing,
  advanceListing,
  bestMatches,
  buyersFor,
  cancelViewing,
  commissionRows,
  commissions,
  commissionTotals,
  COMMISSION_COLUMNS,
  emptyViewing,
  type Lead,
  LEAD_COLUMNS,
  LEADS,
  leadRows,
  LISTING_COLUMNS,
  listingRows,
  listingsShown,
  markDone,
  matchScore,
  matchTone,
  moveLead,
  pipelineTasks,
  PROPERTIES,
  STAGES,
  validateViewing,
  VIEWINGS,
  viewingDays,
  type ViewingDraft,
} from "./estate.ts";
import view from "./real-estate-crm.pavlus";

export interface EstateData {
  properties: Property[];
  leads: Lead[];
  viewings: AgendaEntry[];
  listStatus: string;
  listQuery: string;
  layout: "cards" | "table";
  sortKey: string;
  sortDir: "asc" | "desc";
  pickedProp: string;
  matchLead: string;
  pickedLead: string;
}

export interface EstateViews {
  listStats: Card[];
  listFilters: Filter[];
  cards: PropertyView[];
  listCols: Column[];
  listRows: Row[];
  listFooter: string;
  leadOptions: { value: string; label: string; selected: boolean }[];
  buyers: Item[];
  buyersTitle: string;
  leadCols: Column[];
  leadList: Row[];
  matches: Item[];
  matchesTitle: string;
  boardCols: ColumnView[];
  days: AgendaDay[];
  comStats: Card[];
  comCols: Column[];
  comRows: Row[];
}

interface SheetState {
  open: boolean;
  draft: ViewingDraft;
  fields: Field[];
  buttons: SheetButton[];
}

export interface EstateState extends AppState, EstateData, EstateViews {
  user: ShellUser;
  actions: ShellAction[];
  none: never[];
  sheet: SheetState;
}

const GROUPS: NavGroup[] = [
  {
    title: "Sales",
    items: [
      { id: "listings", label: "Listings", icon: "k-ai-home" },
      { id: "leads", label: "Buyers", icon: "k-ai-users" },
      { id: "pipeline", label: "Pipeline", icon: "k-ai-kanban" },
    ],
  },
  {
    title: "Office",
    items: [
      { id: "viewings", label: "Viewings", icon: "k-icon-calendar" },
      { id: "commission", label: "Commission", icon: "k-ai-dollar" },
    ],
  },
];

const LISTING_TABS: [string, string][] = [
  ["all", "All"],
  ["active", "Active"],
  ["pending", "Pending"],
  ["sold", "Sold"],
  ["draft", "Drafts"],
];

const wholeK = (n: number): string => price(n);

export function derive(
  s: EstateData & { groups: NavGroup[] },
): EstateViews & { groups: NavGroup[] } {
  const shown = listingsShown(s.properties, s.listStatus, s.listQuery);
  const lead = s.leads.find((l) => l.id === s.matchLead);
  const scoreMap: Record<string, number> = {};
  if (lead) for (const p of s.properties) scoreMap[p.id] = matchScore(lead, p);
  const picked = s.properties.find((p) => p.id === s.pickedProp);
  const pickedLead = s.leads.find((l) => l.id === s.pickedLead);
  const live = s.properties.filter((p) => p.status === "active");
  const sold = s.properties.filter((p) => p.status === "sold");
  const coms = commissions(s.leads, s.properties);
  const tot = commissionTotals(coms);
  const tasks = pipelineTasks(s.leads, s.properties);
  return {
    listStats: [
      card("active", "Active listings", String(live.length), {
        hint: `${s.properties.filter((p) => p.status === "pending").length} under offer`,
        icon: "k-ai-home",
        tone: "success",
      }),
      card(
        "value",
        "Value on the market",
        wholeK(live.reduce((t, p) => t + p.price, 0)),
        {
          hint: "active listings",
          icon: "k-ai-dollar",
          tone: "info",
        },
      ),
      card(
        "avg",
        "Average price",
        live.length
          ? wholeK(
              Math.round(live.reduce((t, p) => t + p.price, 0) / live.length),
            )
          : "$0",
        {
          hint: `${sold.length} sold`,
          icon: "k-ai-chart",
          tone: "default",
        },
      ),
    ],
    listFilters: filtersOf(
      LISTING_TABS,
      s.listStatus,
      s.properties,
      (p, id) => p.status === id,
    ),
    cards: propertyViews(shown, s.pickedProp, scoreMap),
    listCols: columnsOf(
      LISTING_COLUMNS,
      s.sortKey ? { key: s.sortKey, dir: s.sortDir } : null,
    ),
    listRows: listingRows(shown, s.sortKey, s.sortDir, s.pickedProp),
    listFooter: `${shown.length} of ${s.properties.length} properties`,
    leadOptions: [
      {
        value: "",
        label: "Match against a buyer",
        selected: s.matchLead === "",
      },
      ...s.leads.map((l) => ({
        value: l.id,
        label: l.name,
        selected: l.id === s.matchLead,
      })),
    ],
    buyers: picked
      ? buyersFor(picked, s.leads).map(({ lead: l, score }) =>
          item(l.id, l.name, score, 100, {
            tone: matchTone(score),
            text: `${score}%`,
            sub: `${l.beds}+ bed ${l.kind}, ${l.city}`,
          }),
        )
      : [],
    buyersTitle: picked ? `Buyers who fit ${picked.title}` : "",
    leadCols: columnsOf(LEAD_COLUMNS, null),
    leadList: leadRows(s.leads, s.properties, s.pickedLead, false),
    matches: pickedLead
      ? bestMatches(pickedLead, s.properties, 4).map(({ property, score }) =>
          item(property.id, property.title, score, 100, {
            tone: matchTone(score),
            text: `${score}%`,
            sub: `${price(property.price)} · ${property.address}, ${property.city} · click to book a viewing`,
          }),
        )
      : [],
    matchesTitle: pickedLead ? `Best homes for ${pickedLead.name}` : "",
    boardCols: boardOf(STAGES, tasks),
    days: viewingDays(s.viewings),
    comStats: [
      card("earned", "Commission earned", price(tot.earned), {
        hint: "closed sales",
        icon: "k-ai-dollar",
        tone: "success",
      }),
      card("contract", "In contract", price(tot.contract), {
        hint: "expected at closing",
        icon: "k-ai-file",
        tone: "info",
      }),
      card("offer", "Offers made", price(tot.offer), {
        hint: "if accepted",
        icon: "k-ai-flag",
        tone: "warning",
      }),
    ],
    comCols: columnsOf(COMMISSION_COLUMNS, null),
    comRows: commissionRows(coms),
    groups: s.groups,
  };
}

const fieldsOf = (
  d: ViewingDraft,
  errors: Record<string, string> = {},
): Field[] =>
  [
    selectField(
      "property",
      "Property",
      d.property,
      PROPERTIES.map((p) => [p.id, `${p.address}, ${p.city}`]),
    ),
    selectField(
      "lead",
      "Buyer",
      d.lead,
      LEADS.map((l) => [l.id, l.name]),
    ),
    field("date", "Date", d.date, { kind: "date" }),
    field("time", "Time", d.time, {
      placeholder: "14:30",
      hint: "24-hour clock",
    }),
  ].map((f) => ({ ...f, error: errors[f.id] ?? "" }));

const sheetOf = (
  d: ViewingDraft,
  open: boolean,
  errors: Record<string, string> = {},
): SheetState => ({
  open,
  draft: d,
  fields: fieldsOf(d, errors),
  buttons: [button("save", "Book viewing")],
});

const data: EstateData & { groups: NavGroup[] } = {
  properties: PROPERTIES,
  leads: LEADS,
  viewings: VIEWINGS,
  listStatus: "all",
  listQuery: "",
  layout: "cards",
  sortKey: "",
  sortDir: "asc",
  pickedProp: "",
  matchLead: "",
  pickedLead: "",
  groups: GROUPS,
};

export const initial: EstateState = {
  screen: "listings",
  title: "Listings",
  navOpen: false,
  notice: "",
  user: { name: "Ines Duarte", role: "Senior agent", initials: "ID" },
  actions: [
    {
      id: "viewing",
      label: "Book viewing",
      icon: "k-icon-plus",
      variant: "default",
    },
  ],
  none: [],
  ...data,
  ...derive(data),
  sheet: sheetOf(emptyViewing(), false),
};

export class EstatePage extends AdminApp<EstateState> {
  view = view;

  _commit(state: EstateState, changes: Partial<EstateData>): Effect[] {
    return patch({ ...changes, ...derive({ ...state, ...changes }) });
  }

  // ---- listings
  "listfilter.pick"(msg: Message, state: EstateState): Effect[] {
    return this._commit(state, { listStatus: msg.payload as string });
  }

  "listfilter.search"(msg: Message, state: EstateState): Effect[] {
    return this._commit(state, { listQuery: msg.event?.value ?? "" });
  }

  showCards(_msg: Message, state: EstateState): Effect[] {
    return this._commit(state, { layout: "cards" });
  }

  showTable(_msg: Message, state: EstateState): Effect[] {
    return this._commit(state, { layout: "table" });
  }

  matchFor(msg: Message, state: EstateState): Effect[] {
    return this._commit(state, { matchLead: msg.event?.value ?? "" });
  }

  "cards.pick"(msg: Message, state: EstateState): Effect[] {
    return this._commit(state, { pickedProp: msg.payload as string });
  }

  "listtable.pick"(msg: Message, state: EstateState): Effect[] {
    return this._commit(state, { pickedProp: msg.payload as string });
  }

  "listtable.sort"(msg: Message, state: EstateState): Effect[] {
    const key = msg.payload as string;
    const dir =
      state.sortKey === key && state.sortDir === "asc" ? "desc" : "asc";
    return this._commit(state, { sortKey: key, sortDir: dir });
  }

  "listtable.act"(msg: Message, state: EstateState): Effect[] {
    const [id] = msg.payload as [string, string];
    const properties = advanceListing(state.properties, id);
    const after = properties.find((p) => p.id === id);
    return [
      ...this._commit(state, { properties }),
      ...notice(`${after?.title} is now ${after?.status}`),
    ];
  }

  "buyers.pick"(msg: Message, state: EstateState): Effect[] {
    return this._commit(state, {
      pickedLead: msg.payload as string,
      matchLead: msg.payload as string,
    });
  }

  // ---- buyers
  "leadtable.pick"(msg: Message, state: EstateState): Effect[] {
    return this._commit(state, { pickedLead: msg.payload as string });
  }

  "matches.pick"(msg: Message, state: EstateState): Effect[] {
    return [
      ...patch({
        screen: "viewings",
        title: "Viewings",
        sheet: sheetOf(
          emptyViewing(msg.payload as string, state.pickedLead),
          true,
        ),
      }),
    ];
  }

  // ---- pipeline
  "board.move"(msg: Message, state: EstateState): Effect[] {
    const [id, dir] = msg.payload as [string, "left" | "right"];
    const leads = moveLead(state.leads, id, dir);
    const l = leads.find((x) => x.id === id);
    return [
      ...this._commit(state, { leads }),
      ...notice(`${l?.name} is in ${l?.stage}`),
    ];
  }

  "board.open"(msg: Message, state: EstateState): Effect[] {
    return this._commit(state, { pickedLead: msg.payload as string });
  }

  // ---- viewings
  "agenda.act"(msg: Message, state: EstateState): Effect[] {
    return [
      ...this._commit(state, {
        viewings: markDone(state.viewings, msg.payload as string),
      }),
      ...notice("Viewing marked done"),
    ];
  }

  "agenda.pick"(msg: Message, state: EstateState): Effect[] {
    const e = state.viewings.find((v) => v.id === msg.payload);
    if (!e || e.done) return [];
    return [
      ...this._commit(state, { viewings: cancelViewing(state.viewings, e.id) }),
      ...notice(`Viewing at ${e.title} cancelled`),
    ];
  }

  "top.action"(_msg: Message, state: EstateState): Effect[] {
    return patch({
      sheet: sheetOf(
        emptyViewing(state.pickedProp || "p1", state.pickedLead || "l1"),
        true,
      ),
    });
  }

  "sheet.close"(_msg: Message, state: EstateState): Effect[] {
    return patch({ sheet: { ...state.sheet, open: false } });
  }

  "sheet.field"(msg: Message, state: EstateState): Effect[] {
    const draft = {
      ...state.sheet.draft,
      [msg.payload as string]: msg.event?.value ?? "",
    };
    return patch({ sheet: sheetOf(draft, true) });
  }

  "sheet.press"(_msg: Message, state: EstateState): Effect[] {
    const d = state.sheet.draft;
    const errors = validateViewing(d, state.viewings, state.properties);
    if (Object.keys(errors).length > 0)
      return patch({ sheet: sheetOf(d, true, errors) });
    return [
      ...this._commit(state, {
        viewings: addViewing(state.viewings, d, state.properties, state.leads),
      }),
      ...patch({
        sheet: { ...state.sheet, open: false },
        screen: "viewings",
        title: "Viewings",
      }),
      ...notice("Viewing booked"),
    ];
  }
}

export const page = new EstatePage();
