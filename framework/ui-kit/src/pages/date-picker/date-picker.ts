import { type Effect, type Message } from "@pavlus/client";
import { storeEffector as store } from "@pavlus/client/plugins";
import { longDate } from "../../lib/calendar.ts";
import {
  Calendar,
  type CalendarState,
  initial as calendarInitial,
} from "../calendar/calendar.ts";
import view from "./date-picker.pavlus";

/** The calendar's state, plus the fields its popover trigger reads. */
export interface DatePickerState extends CalendarState {
  /** Derived from `open`: the trigger's `aria-expanded`. */
  expanded: string;
  /** Derived from `selected`: the trigger's label. */
  buttonLabel: string;
}

/** `aria-expanded` from the open flag — one place. */
const expandedOf = (open: boolean): string => (open ? "true" : "false");

/** The trigger's label — one place decides the empty-selection case. */
function labelOf(selected: string, selectedLabel: string): string {
  return selected ? selectedLabel : "Pick a date";
}

export const initial: DatePickerState = {
  ...calendarInitial,
  expanded: expandedOf(calendarInitial.open),
  buttonLabel: labelOf(calendarInitial.selected, calendarInitial.selectedLabel),
};

/** The calendar's logic with another look: a popover that closes on a pick. */
export class DatePicker extends Calendar {
  override view = view;

  toggle(_msg: Message, state: CalendarState): Effect[] {
    const open = !state.open;
    return [store.set("open", open), store.set("expanded", expandedOf(open))];
  }

  close(): Effect[] {
    return [store.set("open", false), store.set("expanded", expandedOf(false))];
  }

  override pick(msg: Message, state: CalendarState): Effect[] {
    const iso = msg.payload as string;
    return [
      ...super.pick(msg, state),
      store.set("buttonLabel", labelOf(iso, longDate(iso))),
      store.set("open", false),
      store.set("expanded", expandedOf(false)),
    ];
  }
}

export const page = new DatePicker();
