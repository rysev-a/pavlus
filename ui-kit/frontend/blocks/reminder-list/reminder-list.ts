import {
  Component,
  type Effect,
  type Message,
} from "@service-laboratory/pavlus";
import { patch } from "../admin-shell/shell.ts";
import type { Habit } from "../habit-grid/habits.ts";
import {
  nextText,
  type Reminder,
  reminderRows,
  type ReminderRow,
  setReminderTime,
  toggleReminder,
} from "./reminders.ts";
import view from "./reminder-list.pavlus";

const NOW = 14 * 60 + 20;

const HABITS: Habit[] = [
  { id: "h1", name: "Read 20 pages", icon: "📖", tone: "info", freq: "daily" },
  { id: "h2", name: "Run", icon: "🏃", tone: "success", freq: "mwf" },
  { id: "h3", name: "Journal", icon: "✍️", tone: "warning", freq: "weekdays" },
];

const LIST: Reminder[] = [
  { id: "r1", habitId: "h1", time: "21:00", on: true },
  { id: "r2", habitId: "h2", time: "07:00", on: true },
  { id: "r3", habitId: "h3", time: "22:00", on: false },
];

export interface RemindersDemoState {
  list: Reminder[];
  rows: ReminderRow[];
  summary: string;
}

const derive = (list: Reminder[]) => ({
  list,
  rows: reminderRows(list, HABITS),
  summary: nextText(list, HABITS, NOW),
});

export const initial: RemindersDemoState = derive(LIST);

export class RemindersPage extends Component<RemindersDemoState> {
  view = view;

  "remind.toggle"(msg: Message, state: RemindersDemoState): Effect[] {
    return patch(derive(toggleReminder(state.list, msg.payload as string)));
  }

  "remind.time"(msg: Message, state: RemindersDemoState): Effect[] {
    const time = msg.event?.value ?? "08:00";
    return patch(
      derive(setReminderTime(state.list, msg.payload as string, time)),
    );
  }
}

export const page = new RemindersPage();
