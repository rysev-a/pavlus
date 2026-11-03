import {
  Component,
  type Effect,
  type Message,
} from "@service-laboratory/pavlus";
import { patch } from "../admin-shell/shell.ts";
import { shiftMonth, TODAY } from "./dates.ts";
import { type CalendarEvent, type MonthView, monthCells } from "./grid.ts";
import view from "./month-grid.pavlus";

export interface MonthGridState {
  y: number;
  m: number;
  selected: string;
  month: MonthView;
  note: string;
}

const EVENTS: CalendarEvent[] = [
  { id: "e1", date: "2026-11-03", label: "Product update", tone: "info" },
  { id: "e2", date: "2026-11-05", label: "Sale teaser", tone: "warning" },
  { id: "e3", date: "2026-11-05", label: "Webinar invite", tone: "success" },
  { id: "e4", date: "2026-11-05", label: "Survey", tone: "default" },
  {
    id: "e5",
    date: "2026-11-12",
    label: "Win-back offer",
    tone: "destructive",
  },
  { id: "e6", date: "2026-11-26", label: "Big sale", tone: "warning" },
];

const start = { y: 2026, m: 11 };

export const initial: MonthGridState = {
  ...start,
  selected: "",
  month: monthCells(start.y, start.m, EVENTS, TODAY),
  note: "Click a day or an event.",
};

export class MonthGridPage extends Component<MonthGridState> {
  view = view;

  _show(y: number, m: number, selected: string): Effect[] {
    return patch({
      y,
      m,
      selected,
      month: monthCells(y, m, EVENTS, TODAY, selected),
    });
  }

  "month.prev"(_msg: Message, s: MonthGridState): Effect[] {
    const to = shiftMonth(s.y, s.m, -1);
    return this._show(to.y, to.m, s.selected);
  }

  "month.next"(_msg: Message, s: MonthGridState): Effect[] {
    const to = shiftMonth(s.y, s.m, 1);
    return this._show(to.y, to.m, s.selected);
  }

  "month.pick"(msg: Message, s: MonthGridState): Effect[] {
    return [
      ...this._show(s.y, s.m, msg.payload as string),
      ...patch({ note: `Day ${msg.payload as string}` }),
    ];
  }

  "month.open"(msg: Message, s: MonthGridState): Effect[] {
    const ev = EVENTS.find((e) => e.id === msg.payload);
    return patch({ note: ev ? `${ev.label} on ${ev.date}` : s.note });
  }
}

export const page = new MonthGridPage();
