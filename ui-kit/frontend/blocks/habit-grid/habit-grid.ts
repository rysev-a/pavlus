import {
  Component,
  type Effect,
  type Message,
} from "@service-laboratory/pavlus";
import { shiftMonth, type Month } from "../../lib/calendar.ts";
import { patch } from "../admin-shell/shell.ts";
import {
  type Checks,
  type GridDay,
  type GridRow,
  type Habit,
  type HeatWeek,
  HEAT_WEEKDAYS,
  heatTitle,
  heatWeeks,
  toggleCheck,
  weekDays,
  weekRows,
} from "./habits.ts";
import view from "./habit-grid.pavlus";

const TODAY = "2026-11-03";

const HABITS: Habit[] = [
  { id: "h1", name: "Read 20 pages", icon: "📖", tone: "info", freq: "daily" },
  { id: "h2", name: "Run", icon: "🏃", tone: "success", freq: "mwf" },
  { id: "h3", name: "Journal", icon: "✍️", tone: "warning", freq: "weekdays" },
];

const CHECKS: Checks = {
  h1: ["2026-10-30", "2026-10-31", "2026-11-01", "2026-11-02"],
  h2: ["2026-10-28", "2026-10-30", "2026-11-02"],
  h3: ["2026-10-29", "2026-10-30", "2026-11-02"],
};

export interface HabitGridState {
  habits: Habit[];
  checks: Checks;
  month: Month;
  days: GridDay[];
  rows: GridRow[];
  heatTitle: string;
  weekdays: string[];
  weeks: HeatWeek[];
}

const derive = (checks: Checks, month: Month) => ({
  checks,
  month,
  rows: weekRows(HABITS, checks, TODAY),
  heatTitle: heatTitle(month),
  weeks: heatWeeks(HABITS, checks, month, TODAY),
});

export const initial: HabitGridState = {
  habits: HABITS,
  days: weekDays(TODAY),
  weekdays: HEAT_WEEKDAYS,
  ...derive(CHECKS, { year: 2026, month: 10 }),
};

export class HabitGridPage extends Component<HabitGridState> {
  view = view;

  "grid.toggle"(msg: Message, state: HabitGridState): Effect[] {
    const [id, iso] = msg.payload as [string, string];
    return patch(derive(toggleCheck(state.checks, id, iso), state.month));
  }

  "heat.prev"(_msg: Message, state: HabitGridState): Effect[] {
    return patch(derive(state.checks, shiftMonth(state.month, -1)));
  }

  "heat.next"(_msg: Message, state: HabitGridState): Effect[] {
    return patch(derive(state.checks, shiftMonth(state.month, 1)));
  }
}

export const page = new HabitGridPage();
