import {
  Component,
  type Effect,
  type Message,
} from "@service-laboratory/pavlus";
import { patch } from "../admin-shell/shell.ts";
import { type AgendaDay, type AgendaEntry, agendaDays } from "./agenda.ts";
import view from "./agenda-list.pavlus";

const entry = (
  id: string,
  date: string,
  time: string,
  title: string,
  sub: string,
  done = false,
): AgendaEntry => ({
  id,
  date,
  time,
  title,
  sub,
  status: done ? "done" : "booked",
  tone: done ? "muted" : "info",
  action: done ? "" : "Mark done",
  done,
});

const START: AgendaEntry[] = [
  entry(
    "v1",
    "2026-11-03",
    "09:30",
    "14 Alder Lane",
    "Dana Whitfield with Ines",
    true,
  ),
  entry(
    "v2",
    "2026-11-03",
    "15:00",
    "9 Linden Court, Apt 5",
    "Tomas Reyes with Omar",
  ),
  entry(
    "v3",
    "2026-11-04",
    "11:15",
    "221 Mill Street",
    "Priya and Sam Kapoor with Ines",
  ),
];

export interface AgendaListState {
  entries: AgendaEntry[];
  days: AgendaDay[];
  message: string;
}

const build = (list: AgendaEntry[]) =>
  agendaDays(list, "2026-11-03", "2026-11-04");

export const initial: AgendaListState = {
  entries: START,
  days: build(START),
  message: "Press Mark done on a row.",
};

export class AgendaListPage extends Component<AgendaListState> {
  view = view;

  "agenda.act"(msg: Message, state: AgendaListState): Effect[] {
    const entries = state.entries.map((e) =>
      e.id === msg.payload
        ? entry(e.id, e.date, e.time, e.title, e.sub, true)
        : e,
    );
    return patch({ entries, days: build(entries), message: "Marked done." });
  }

  "agenda.pick"(msg: Message): Effect[] {
    return patch({ message: `Opened ${msg.payload as string}.` });
  }
}

export const page = new AgendaListPage();
