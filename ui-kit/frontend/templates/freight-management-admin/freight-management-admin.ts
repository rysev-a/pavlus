import type { Effect, Message } from "@service-laboratory/pavlus";
import { AdminApp, type AppState } from "../../blocks/admin-shell/app.ts";
import {
  type NavGroup,
  notice,
  patch,
  type ShellAction,
  type ShellUser,
} from "../../blocks/admin-shell/shell.ts";
import { toggleSort } from "../../blocks/data-grid/grid.ts";
import { cycleDoc } from "../../blocks/customs-checklist/customs.ts";
import type { Mode } from "../../blocks/shipment-tracker/tracker.ts";
import {
  type ModeChoice,
  type Quote,
  type QuoteForm,
  quoteView,
} from "../../blocks/quote-calculator/quote.ts";
import {
  type Core,
  derive,
  type Derived,
  LANES,
  shipmentOf,
  startCore,
} from "./freight.ts";
import view from "./freight-management-admin.pavlus";

interface CalcState {
  form: QuoteForm;
  errors: Record<string, string>;
  modes: ModeChoice[];
  quote: Quote | null;
  canExpress: boolean;
}

export interface FreightState extends AppState, Derived {
  user: ShellUser;
  actions: ShellAction[];
  navActive: string;
  core: Core;
  calc: CalcState;
  none: never[];
}

const GROUPS: NavGroup[] = [
  {
    title: "Operations",
    items: [
      { id: "overview", label: "Overview", icon: "k-ai-home" },
      { id: "shipments", label: "Shipments", icon: "k-ai-box" },
      { id: "tracking", label: "Tracking board", icon: "k-ai-truck" },
    ],
  },
  {
    title: "Pricing",
    items: [
      { id: "rates", label: "Carriers and rates", icon: "k-ai-chart" },
      { id: "quote", label: "Quote calculator", icon: "k-ai-dollar" },
    ],
  },
  {
    title: "Paperwork",
    items: [
      { id: "customs", label: "Customs", icon: "k-ai-clipboard" },
      { id: "invoices", label: "Invoices", icon: "k-ai-receipt" },
    ],
  },
];

const START_FORM: QuoteForm = {
  weight: "6200",
  volume: "14",
  distance: "1350",
  mode: "road",
  declared: "40000",
  insured: true,
  express: false,
};

const buildCalc = (form: QuoteForm): CalcState => ({
  form,
  ...quoteView(form),
});
const core = startCore();

export const initial: FreightState = {
  screen: "overview",
  title: "Overview",
  navActive: "overview",
  navOpen: false,
  notice: "",
  groups: GROUPS,
  user: { name: "Lena Fischer", role: "Dispatcher", initials: "LF" },
  actions: [
    {
      id: "quote",
      label: "New quote",
      icon: "k-icon-plus",
      variant: "default",
    },
  ],
  core,
  calc: buildCalc(START_FORM),
  none: [],
  ...derive(core),
};

export class FreightAdmin extends AdminApp<FreightState> {
  view = view;

  /** Change some of the core; every view worked out from it follows. */
  _commit(state: FreightState, changes: Partial<Core>): Effect[] {
    const next: Core = { ...state.core, ...changes };
    return patch({ core: next, ...derive(next) });
  }

  "nav.go"(msg: Message, state: FreightState): Effect[] {
    return [
      ...super["nav.go"](msg, state),
      ...patch({ navActive: msg.payload as string }),
    ];
  }

  _detail(state: FreightState, id: string): Effect[] {
    const x = shipmentOf(id);
    return [
      ...this._commit(state, { selected: id }),
      ...patch({
        screen: "detail",
        title: x ? x.ref : "Shipment",
        navActive: "shipments",
      }),
    ];
  }

  backToList(): Effect[] {
    return patch({
      screen: "shipments",
      title: "Shipments",
      navActive: "shipments",
    });
  }

  "top.action"(): Effect[] {
    return patch({
      screen: "quote",
      title: "Quote calculator",
      navActive: "quote",
    });
  }

  // ---- overview and board
  "att.act"(msg: Message, state: FreightState): Effect[] {
    return this._detail(state, (msg.payload as [string, string])[0]);
  }
  "board.pick"(msg: Message, state: FreightState): Effect[] {
    return this._detail(state, msg.payload as string);
  }

  // ---- shipments
  "shipfilter.pick"(msg: Message, state: FreightState): Effect[] {
    return this._commit(state, { filter: msg.payload as string });
  }
  "shipfilter.search"(msg: Message, state: FreightState): Effect[] {
    return this._commit(state, { query: msg.event?.value ?? "" });
  }
  "ships.sort"(msg: Message, state: FreightState): Effect[] {
    return this._commit(state, {
      sort: toggleSort(state.core.sort, msg.payload as string),
    });
  }
  "ships.pick"(msg: Message, state: FreightState): Effect[] {
    return this._detail(state, msg.payload as string);
  }

  _docs(state: FreightState, id: string, doc: string): Effect[] {
    const list = state.core.docs[id] ?? [];
    return this._commit(state, {
      docs: { ...state.core.docs, [id]: cycleDoc(list, doc) },
    });
  }
  "ddocs.cycle"(msg: Message, state: FreightState): Effect[] {
    return this._docs(state, state.core.selected, msg.payload as string);
  }

  // ---- rates
  lane(msg: Message, state: FreightState): Effect[] {
    const id = msg.event?.value ?? LANES[0].id;
    return this._commit(state, { lane: id, rateSelected: "" });
  }
  "rates.sort"(msg: Message, state: FreightState): Effect[] {
    return this._commit(state, {
      rateSort: toggleSort(state.core.rateSort, msg.payload as string),
    });
  }
  "rates.pick"(msg: Message, state: FreightState): Effect[] {
    return this._commit(state, { rateSelected: msg.payload as string });
  }
  "rates.book"(msg: Message, state: FreightState): Effect[] {
    const lane = LANES.find((l) => l.id === state.core.lane) ?? LANES[0];
    const rate = lane.rates.find((r) => r.id === msg.payload);
    return [
      ...this._commit(state, { rateSelected: msg.payload as string }),
      ...notice(rate ? `Booked with ${rate.carrier} for €${rate.price}` : ""),
    ];
  }

  // ---- quote
  "calc.field"(msg: Message, state: FreightState): Effect[] {
    const key = msg.payload as keyof QuoteForm;
    return patch({
      calc: buildCalc({ ...state.calc.form, [key]: msg.event?.value ?? "" }),
    });
  }
  "calc.mode"(msg: Message, state: FreightState): Effect[] {
    return patch({
      calc: buildCalc({ ...state.calc.form, mode: msg.payload as Mode }),
    });
  }
  "calc.flag"(msg: Message, state: FreightState): Effect[] {
    const key = msg.payload as "insured" | "express";
    return patch({
      calc: buildCalc({
        ...state.calc.form,
        [key]: Boolean(msg.event?.checked),
      }),
    });
  }

  // ---- customs
  "cust.pick"(msg: Message, state: FreightState): Effect[] {
    return this._commit(state, { customsId: msg.payload as string });
  }
  "cdocs.cycle"(msg: Message, state: FreightState): Effect[] {
    return this._docs(state, state.core.customsId, msg.payload as string);
  }

  // ---- invoices
  "invfilter.pick"(msg: Message, state: FreightState): Effect[] {
    return this._commit(state, { invoiceFilter: msg.payload as string });
  }
  "invs.sort"(msg: Message, state: FreightState): Effect[] {
    return this._commit(state, {
      invoiceSort: toggleSort(state.core.invoiceSort, msg.payload as string),
    });
  }
  "invs.act"(msg: Message, state: FreightState): Effect[] {
    const [id] = msg.payload as [string, string];
    return [
      ...this._commit(state, { paid: [...state.core.paid, id] }),
      ...notice(`${id} marked as paid`),
    ];
  }
}

export const page = new FreightAdmin();
