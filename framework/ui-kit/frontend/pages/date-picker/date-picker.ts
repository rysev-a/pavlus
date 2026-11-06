import { type Effect, type Message } from "@pavlus/frontend";
import { storeEffector as store } from "@pavlus/frontend/plugins";
import { Calendar, type CalendarState, initial } from "../calendar/calendar.ts";
import view from "./date-picker.pavlus";

export { initial };

/** The calendar's logic with another look: a popover that closes on a pick. */
export class DatePicker extends Calendar {
  override view = view;

  toggle(_msg: Message, state: CalendarState): Effect[] {
    return [store.set("open", !state.open)];
  }

  close(): Effect[] {
    return [store.set("open", false)];
  }

  override pick(msg: Message): Effect[] {
    return [...super.pick(msg), store.set("open", false)];
  }
}

export const page = new DatePicker();
