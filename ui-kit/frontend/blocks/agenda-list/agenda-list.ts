import {
  Component,
  type Effect,
  type Message,
} from "@service-laboratory/pavlus";
import { patch } from "../admin-shell/shell.ts";
import { TODAY } from "../week-calendar/dates.ts";
import { type AgendaDay, type AgendaIn, agendaOf } from "./agenda.ts";
import view from "./agenda-list.pavlus";

export interface AgendaState {
  items: AgendaIn[];
  nowMin: number;
  days: AgendaDay[];
  message: string;
}

const item = (
  id: string,
  title: string,
  sub: string,
  tone: string,
  day: string,
  start: number,
  dur: number,
): AgendaIn => ({ id, title, sub, tone, day, start, dur, done: false });

const ITEMS: AgendaIn[] = [
  item("g1", "Standup", "Team call", "c1", TODAY, 9 * 60 + 30, 30),
  item("g2", "Design review", "Room 2", "c1", TODAY, 10 * 60, 90),
  item("g3", "Lunch with Maya", "", "c4", TODAY, 13 * 60, 60),
  item(
    "g4",
    "Project proposal",
    "Write the first draft",
    "c1",
    TODAY,
    14 * 60,
    120,
  ),
  item("g5", "Spanish class", "Online", "c2", TODAY, 17 * 60, 60),
  item("g6", "Run", "5 km", "c3", "2026-11-04", 7 * 60, 45),
  item("g7", "Dentist", "Dr. Okafor", "de", "2026-11-04", 15 * 60, 60),
];

export const initial: AgendaState = {
  items: ITEMS,
  nowMin: 14 * 60 + 20,
  days: agendaOf(ITEMS, TODAY, 14 * 60 + 20),
  message: "Tick an item to mark it done.",
};

export class AgendaPage extends Component<AgendaState> {
  view = view;

  "plan.toggle"(msg: Message, state: AgendaState): Effect[] {
    const items = state.items.map((i) =>
      i.id === msg.payload ? { ...i, done: !i.done } : i,
    );
    return patch({ items, days: agendaOf(items, TODAY, state.nowMin) });
  }

  "plan.pick"(msg: Message, state: AgendaState): Effect[] {
    const found = state.items.find((i) => i.id === msg.payload);
    return patch({ message: found ? `You opened: ${found.title}` : "" });
  }
}

export const page = new AgendaPage();
