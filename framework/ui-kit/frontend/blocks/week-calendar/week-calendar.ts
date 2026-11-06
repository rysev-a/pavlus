import { Component, type Effect, type Message } from "@pavlus/frontend";
import { storeEffector as store } from "@pavlus/frontend/plugins";
import { clockOf, longDay, TODAY } from "./dates.ts";
import { type CalendarView, type CalItem, weekView } from "./week.ts";
import view from "./week-calendar.pavlus";

export interface WeekCalendarState extends CalendarView {
  items: CalItem[];
  message: string;
}

const block = (
  id: string,
  title: string,
  tone: string,
  day: string,
  start: number,
  dur: number,
): CalItem => ({ id, title, tone, day, start, dur, sub: "" });

const H = (h: number, m = 0): number => h * 60 + m;

export const ITEMS: CalItem[] = [
  block("a1", "Deep work", "c1", "2026-11-02", H(9), 180),
  block("a2", "Gym", "c3", "2026-11-02", H(18), 60),
  block("a3", "Standup", "c1", "2026-11-03", H(9, 30), 30),
  block("a4", "Design review", "c1", "2026-11-03", H(10), 90),
  block("a5", "Spanish class", "c2", "2026-11-03", H(10, 30), 60),
  block("a6", "Lunch with Maya", "c4", "2026-11-03", H(13), 60),
  block("a7", "Pick up parcels", "c5", "2026-11-03", H(17, 30), 30),
  block("a8", "Run", "c3", "2026-11-04", H(7), 45),
  block("a9", "Deep work", "c1", "2026-11-04", H(9), 240),
  block("a10", "Guitar", "pr", "2026-11-04", H(20), 60),
  block("a11", "Dentist", "de", "2026-11-05", H(15), 60),
  block("a12", "Reading", "c2", "2026-11-05", H(21), 45),
  block("a13", "Family dinner", "c4", "2026-11-06", H(19), 120),
  block("a14", "Hike", "c3", "2026-11-07", H(8), 240),
  block("a15", "Market", "c5", "2026-11-07", H(11, 30), 60),
];

export const initial: WeekCalendarState = {
  items: ITEMS,
  ...weekView(ITEMS, TODAY, TODAY, H(14, 20)),
  message: "Click a block or an empty hour.",
};

export class WeekCalendarPage extends Component<WeekCalendarState> {
  view = view;

  "cal.pick"(msg: Message, state: WeekCalendarState): Effect[] {
    const found = state.items.find((x) => x.id === msg.payload);
    return [
      store.set(
        "message",
        found
          ? `${found.title}, ${longDay(found.day)}, ${clockOf(found.start)}`
          : "",
      ),
    ];
  }

  "cal.slot"(msg: Message): Effect[] {
    const [day, hour] = msg.payload as [string, number];
    return [
      store.set(
        "message",
        `An empty hour: ${longDay(day)}, ${clockOf(hour * 60)}`,
      ),
    ];
  }

  "cal.pickday"(msg: Message): Effect[] {
    return [
      store.set("message", `Day header: ${longDay(msg.payload as string)}`),
    ];
  }
}

export const page = new WeekCalendarPage();
