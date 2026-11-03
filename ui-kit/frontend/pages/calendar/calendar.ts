import {
  Component,
  type Effect,
  type Message,
} from "@service-laboratory/pavlus";
import { storeEffector as store } from "@service-laboratory/pavlus/plugins";
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

export interface CalendarState {
  month: Month;
  /** Derived from `month`: what the grid shows. */
  title: string;
  cells: Cell[];
  weekdays: string[];
  selected: string;
  selectedLabel: string;
  /** The date picker's popover. */
  open: boolean;
}

const start: Month = { year: 2026, month: 10 };
const selected = "2026-11-03";

export const initial: CalendarState = {
  month: start,
  title: titleOf(start),
  cells: monthCells(start),
  weekdays: WEEKDAYS,
  selected,
  selectedLabel: longDate(selected),
  open: false,
};

export class Calendar extends Component<CalendarState> {
  view = view;

  prev(_msg: Message, state: CalendarState): Effect[] {
    return this._show(shiftMonth(state.month, -1));
  }

  next(_msg: Message, state: CalendarState): Effect[] {
    return this._show(shiftMonth(state.month, 1));
  }

  pick(msg: Message): Effect[] {
    const iso = msg.payload as string;
    return [
      store.set("selected", iso),
      store.set("selectedLabel", longDate(iso)),
    ];
  }

  _show(month: Month): Effect[] {
    return [
      store.set("month", month),
      store.set("title", titleOf(month)),
      store.set("cells", monthCells(month)),
    ];
  }
}

export const page = new Calendar();
