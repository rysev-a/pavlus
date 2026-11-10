import { Component, type Effect, type Message } from "@pavlus/client";
import { storeEffector as store } from "@pavlus/client/plugins";
import {
  type Cell,
  longDate,
  type Month,
  monthCells,
  shiftMonth,
  titleOf,
  WEEKDAYS,
} from "../../lib/calendar.ts";
import view from "./calendar.pavlus";

/** A cell as the template reads it: with the flags derived from `selected`. */
export interface DayCell extends Cell {
  /** The day is the picked date. */
  sel: boolean;
  /** `aria-pressed` of the day button. */
  pressed: string;
}

export interface CalendarState {
  month: Month;
  /** Derived from `month`: what the grid shows. */
  title: string;
  cells: DayCell[];
  weekdays: string[];
  selected: string;
  selectedLabel: string;
  /** The date picker's popover. */
  open: boolean;
}

const start: Month = { year: 2026, month: 10 };
const selected = "2026-11-03";

/** The cells of a month, each flagged against the picked date — one place. */
function cellsOf(month: Month, picked: string): DayCell[] {
  return monthCells(month).map((cell) => ({
    ...cell,
    sel: cell.iso === picked,
    pressed: cell.iso === picked ? "true" : "false",
  }));
}

export const initial: CalendarState = {
  month: start,
  title: titleOf(start),
  cells: cellsOf(start, selected),
  weekdays: WEEKDAYS,
  selected,
  selectedLabel: longDate(selected),
  open: false,
};

export class Calendar extends Component<CalendarState> {
  view = view;

  prev(_msg: Message, state: CalendarState): Effect[] {
    return this._show(state, shiftMonth(state.month, -1));
  }

  next(_msg: Message, state: CalendarState): Effect[] {
    return this._show(state, shiftMonth(state.month, 1));
  }

  pick(msg: Message, state: CalendarState): Effect[] {
    const iso = msg.payload as string;
    return [
      store.set("selected", iso),
      store.set("selectedLabel", longDate(iso)),
      store.set("cells", cellsOf(state.month, iso)),
    ];
  }

  _show(state: CalendarState, month: Month): Effect[] {
    return [
      store.set("month", month),
      store.set("title", titleOf(month)),
      store.set("cells", cellsOf(month, state.selected)),
    ];
  }
}

export const page = new Calendar();
