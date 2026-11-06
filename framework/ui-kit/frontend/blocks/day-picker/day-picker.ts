import { Component, type Effect, type Message } from "@pavlus/frontend";
import { storeEffector as store } from "@pavlus/frontend/plugins";
import {
  longDate,
  type Month,
  monthCells,
  shiftMonth,
  titleOf,
  WEEKDAYS,
} from "../../lib/calendar.ts";
import { weekdayOf } from "../time-slots/time-slots.ts";
import view from "./day-picker.pavlus";

export interface DayCell {
  key: string;
  day: number;
  iso: string;
  /** Before `min`, after `max` or on a closed weekday. */
  disabled: boolean;
  selected: boolean;
}

export interface DayRules {
  selected: string;
  /** The first date that can be picked (ISO), e.g. today. */
  min?: string;
  /** The last date that can be picked (ISO). */
  max?: string;
  /** Weekdays that cannot be picked, 0 = Sunday. */
  closed?: number[];
}

/** Pure: can this ISO date be picked under the rules? */
export function isPickable(iso: string, rules: DayRules): boolean {
  if (rules.min && iso < rules.min) return false;
  if (rules.max && iso > rules.max) return false;
  return !(rules.closed ?? []).includes(weekdayOf(iso));
}

/** Pure: the month grid, every day marked as pickable or not, and the selected one. */
export function dayCells(month: Month, rules: DayRules): DayCell[] {
  return monthCells(month).map((cell) => ({
    ...cell,
    disabled: cell.day === 0 ? true : !isPickable(cell.iso, rules),
    selected: cell.iso !== "" && cell.iso === rules.selected,
  }));
}

/** Pure: the whole state of the picker (what `view.pavlus` takes as props). */
export function pickerProps(month: Month, rules: DayRules) {
  return {
    title: titleOf(month),
    weekdays: WEEKDAYS,
    cells: dayCells(month, rules),
    // the first month with a pickable day cannot go back
    canGoBack:
      !rules.min || monthIndex(month) > monthIndex(firstMonth(rules.min)),
  };
}

const monthIndex = (m: Month): number => m.year * 12 + m.month;

/** Pure: the month an ISO date is in. */
export function firstMonth(iso: string): Month {
  const [year, month] = iso.split("-").map(Number);
  return { year, month: month - 1 };
}

const RULES = { min: "2026-11-03", closed: [0] };
const START: Month = { year: 2026, month: 10 };

export interface DayPickerState {
  month: Month;
  selected: string;
  label: string;
  title: string;
  weekdays: string[];
  cells: DayCell[];
  canGoBack: boolean;
}

const shown = (month: Month, selected: string): DayPickerState => ({
  month,
  selected,
  label: longDate(selected),
  ...pickerProps(month, { ...RULES, selected }),
});

export const initial: DayPickerState = shown(START, "2026-11-05");

export class DayPickerPage extends Component<DayPickerState> {
  view = view;

  "days.prev"(_msg: Message, state: DayPickerState): Effect[] {
    return this._set(shown(shiftMonth(state.month, -1), state.selected));
  }

  "days.next"(_msg: Message, state: DayPickerState): Effect[] {
    return this._set(shown(shiftMonth(state.month, 1), state.selected));
  }

  "days.pick"(msg: Message, state: DayPickerState): Effect[] {
    return this._set(shown(state.month, msg.payload as string));
  }

  _set(next: DayPickerState): Effect[] {
    return (Object.keys(next) as (keyof DayPickerState)[]).map((k) =>
      store.set(k, next[k]),
    );
  }
}

export const page = new DayPickerPage();
