import { Component, type Effect, type Message } from "@pavlus/frontend";
import { storeEffector as store } from "@pavlus/frontend/plugins";
import {
  buildGrid,
  col,
  collides,
  entry,
  fill,
  slot,
  type TtCol,
  type TtEntry,
  type TtRow,
  type TtSlot,
  timeSlots,
} from "./timetable.ts";
import view from "./timetable-grid.pavlus";

export interface TimetableState {
  weekCols: TtCol[];
  weekSlots: TtSlot[];
  weekEntries: TtEntry[];
  weekRows: TtRow[];
  docCols: TtCol[];
  daySlots: TtSlot[];
  dayEntries: TtEntry[];
  dayRows: TtRow[];
  message: string;
}

const weekCols = ["Mon", "Tue", "Wed", "Thu", "Fri"].map((d, i) =>
  col(d, d, `${2 + i} Nov`, i === 1),
);
const weekSlots: TtSlot[] = [
  slot("p1", "P1", "08:30"),
  slot("p2", "P2", "09:25"),
  slot("brk", "", "", "Break"),
  slot("p3", "P3", "10:50"),
  slot("p4", "P4", "11:45"),
];
const weekEntries = [
  entry("e1", "Mon", "p1", "Maths", { sub: "Room 12", tone: "info" }),
  entry("e2", "Mon", "p2", "English", { sub: "Room 4", tone: "success" }),
  entry("e3", "Tue", "p1", "Science", {
    sub: "Lab 2",
    tone: "warning",
    span: 2,
  }),
  entry("e4", "Wed", "p3", "History", { sub: "Room 7", tone: "destructive" }),
  entry("e5", "Thu", "p2", "Maths", { sub: "Room 12", tone: "info" }),
  entry("e6", "Fri", "p4", "Art", { sub: "Studio", tone: "default" }),
];

const docCols = [
  col("lee", "Dr. Lee", "General"),
  col("ruiz", "Dr. Ruiz", "Paediatrics"),
  col("khan", "Dr. Khan", "Cardiology"),
];
const daySlots = timeSlots(9 * 60, 12 * 60, 30);
const dayEntries = [
  entry("a1", "lee", "09:00", "Amelia Stone", {
    sub: "Check-up",
    tone: "success",
  }),
  entry("a2", "lee", "10:00", "Noah Reed", {
    sub: "Follow-up",
    tone: "info",
    span: 2,
  }),
  entry("a3", "ruiz", "09:30", "Ivy Marsh", {
    sub: "Vaccination",
    tone: "warning",
  }),
  entry("a4", "khan", "11:00", "Omar Haddad", {
    sub: "ECG",
    tone: "destructive",
  }),
];

export const initial: TimetableState = {
  weekCols,
  weekSlots,
  weekEntries,
  weekRows: buildGrid(weekCols, weekSlots, weekEntries),
  docCols,
  daySlots,
  dayEntries,
  dayRows: buildGrid(docCols, daySlots, dayEntries),
  message: `Booked ${fill(dayEntries, docCols, daySlots).pct}% of the half hours. Click an empty cell to add a visit.`,
};

export class TimetableGridPage extends Component<TimetableState> {
  view = view;

  "day.pick"(msg: Message, state: TimetableState): Effect[] {
    const found = state.dayEntries.find((e) => e.id === msg.payload);
    return [store.set("message", found ? `${found.title}: ${found.sub}` : "")];
  }

  "day.add"(msg: Message, state: TimetableState): Effect[] {
    const [colId, slotId] = msg.payload as [string, string];
    if (collides(state.dayEntries, state.daySlots, colId, slotId, 1)) {
      return [store.set("message", "That slot is taken")];
    }
    const next = [
      ...state.dayEntries,
      entry(`a${state.dayEntries.length + 1}`, colId, slotId, "New visit", {
        sub: "Walk-in",
        tone: "default",
      }),
    ];
    return [
      store.set("dayEntries", next),
      store.set("dayRows", buildGrid(state.docCols, state.daySlots, next)),
      store.set("message", `Visit added at ${slotId}`),
    ];
  }
}

export const page = new TimetableGridPage();
