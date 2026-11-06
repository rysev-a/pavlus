import { Component } from "@pavlus/frontend";
import { money } from "../admin-shell/shell.ts";
import {
  type LegendItem,
  type MoneyMonth,
  type MoneyRow,
  moneyBars,
} from "./bars.ts";
import view from "./money-bars.pavlus";

export interface MoneyBarsState {
  year: MoneyMonth[];
  legend: LegendItem[];
  half: MoneyMonth[];
  halfLegend: LegendItem[];
}

const MONTHS = [
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
const INCOME = [
  41200, 38800, 36100, 44700, 47300, 45200, 52100, 49800, 51600, 48200, 55400,
  58900,
];
const EXPENSES = [
  39800, 40100, 38900, 41200, 43800, 44700, 46100, 47600, 49900, 50200, 51300,
  52100,
];

const fmt = (v: number): string => money(v, "$", 0);

const rows: MoneyRow[] = MONTHS.map((label, i) => ({
  id: label,
  label,
  values: [
    { id: "income", value: INCOME[i], tone: "success" },
    { id: "expenses", value: EXPENSES[i], tone: "warning" },
    { id: "profit", value: INCOME[i] - EXPENSES[i], tone: "default" },
  ],
}));

const halfRows: MoneyRow[] = rows.slice(6).map((r) => ({
  ...r,
  values: [r.values[0], r.values[1]],
}));

/** Only data: the page has no messages of its own. */
export const initial: MoneyBarsState = {
  year: moneyBars(rows, fmt),
  legend: [
    { id: "income", label: "Income", tone: "success" },
    { id: "expenses", label: "Expenses", tone: "warning" },
    { id: "profit", label: "Profit", tone: "default" },
  ],
  half: moneyBars(halfRows, fmt),
  halfLegend: [
    { id: "income", label: "Income", tone: "success" },
    { id: "expenses", label: "Expenses", tone: "warning" },
  ],
};

export class MoneyBarsPage extends Component<MoneyBarsState> {
  view = view;
}

export const page = new MoneyBarsPage();
