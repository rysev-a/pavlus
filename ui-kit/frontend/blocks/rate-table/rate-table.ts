import {
  Component,
  type Effect,
  type Message,
} from "@service-laboratory/pavlus";
import { patch } from "../admin-shell/shell.ts";
import { type Column, type Sort, toggleSort } from "../data-grid/grid.ts";
import { type Rate, rateColumns, rateRows, type RateRow } from "./rates.ts";
import view from "./rate-table.pavlus";

const RATES: Rate[] = [
  {
    id: "n",
    carrier: "Nordline",
    mode: "road",
    price: 1480,
    days: 3,
    reliability: 94,
    note: "Full truck, tail lift",
  },
  {
    id: "a",
    carrier: "AlpRail Cargo",
    mode: "rail",
    price: 1120,
    days: 5,
    reliability: 90,
    note: "Terminal to terminal, door delivery +€90",
  },
  {
    id: "e",
    carrier: "EuroExpress",
    mode: "road",
    price: 1890,
    days: 2,
    reliability: 96,
    note: "Two drivers, no stops",
  },
  {
    id: "b",
    carrier: "BudgetHaul",
    mode: "road",
    price: 980,
    days: 6,
    reliability: 81,
    note: "Groupage, shared truck",
  },
  {
    id: "s",
    carrier: "SkyBridge Air",
    mode: "air",
    price: 3650,
    days: 1,
    reliability: 97,
    note: "Airport to airport, next day",
  },
];

export interface RatesDemoState {
  rates: Rate[];
  sort: Sort | null;
  selected: string;
  columns: Column[];
  rows: RateRow[];
  said: string;
}

const derive = (rates: Rate[], sort: Sort | null, selected: string) => ({
  sort,
  selected,
  columns: rateColumns(sort),
  rows: rateRows(rates, sort, selected),
});

export const initial: RatesDemoState = {
  rates: RATES,
  said: "Nothing booked.",
  ...derive(RATES, { key: "price", dir: "asc" }, ""),
};

export class RatesPage extends Component<RatesDemoState> {
  view = view;

  "rates.sort"(msg: Message, state: RatesDemoState): Effect[] {
    const sort = toggleSort(state.sort, msg.payload as string);
    return patch(derive(state.rates, sort, state.selected));
  }

  "rates.pick"(msg: Message, state: RatesDemoState): Effect[] {
    return patch(derive(state.rates, state.sort, msg.payload as string));
  }

  "rates.book"(msg: Message, state: RatesDemoState): Effect[] {
    const rate = state.rates.find((r) => r.id === msg.payload);
    return patch({
      ...derive(state.rates, state.sort, msg.payload as string),
      said: rate ? `Booked with ${rate.carrier} for €${rate.price}.` : "",
    });
  }
}

export const page = new RatesPage();
