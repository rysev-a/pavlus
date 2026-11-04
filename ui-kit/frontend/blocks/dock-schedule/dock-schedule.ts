import {
  Component,
  type Effect,
  type Message,
} from "@service-laboratory/pavlus";
import { patch } from "../admin-shell/shell.ts";
import {
  type Appt,
  conflicts,
  type DockDef,
  type DockRow,
  type Hour,
  hoursFrom,
  longestFit,
  rowsOf,
} from "./docks.ts";
import view from "./dock-schedule.pavlus";

export interface DockScheduleState {
  appts: Appt[];
  hours: Hour[];
  rows: DockRow[];
  message: string;
}

const FIRST = 6;
const COUNT = 12;
const DOCKS: DockDef[] = [
  { id: "d1", name: "Door 1", kind: "Inbound" },
  { id: "d2", name: "Door 2", kind: "Inbound" },
  { id: "d3", name: "Door 3", kind: "Outbound" },
  { id: "d4", name: "Door 4", kind: "Both" },
];

const APPTS: Appt[] = [
  {
    id: "a1",
    dock: "d1",
    start: 1,
    span: 2,
    carrier: "Nordfrakt",
    ref: "IN-1042",
    kind: "inbound",
    status: "done",
  },
  {
    id: "a2",
    dock: "d1",
    start: 4,
    span: 3,
    carrier: "Baltic Lines",
    ref: "IN-1047",
    kind: "inbound",
    status: "scheduled",
  },
  {
    id: "a3",
    dock: "d2",
    start: 3,
    span: 2,
    carrier: "FreshMove",
    ref: "IN-1045",
    kind: "inbound",
    status: "arrived",
  },
  {
    id: "a4",
    dock: "d3",
    start: 2,
    span: 2,
    carrier: "QuickParcel",
    ref: "OUT-2210",
    kind: "outbound",
    status: "done",
  },
  {
    id: "a5",
    dock: "d3",
    start: 6,
    span: 3,
    carrier: "Eurotrans",
    ref: "OUT-2214",
    kind: "outbound",
    status: "scheduled",
  },
  {
    id: "a6",
    dock: "d4",
    start: 5,
    span: 1,
    carrier: "Dalex",
    ref: "OUT-2215",
    kind: "outbound",
    status: "scheduled",
  },
];

const draw = (appts: Appt[]) => ({ appts, rows: rowsOf(DOCKS, appts, COUNT) });

export const initial: DockScheduleState = {
  ...draw(APPTS),
  hours: hoursFrom(FIRST, COUNT, 9),
  message: "Click a free hour to book a truck, click a truck to remove it.",
};

export class DockSchedulePage extends Component<DockScheduleState> {
  view = view;

  "docks.book"(msg: Message, state: DockScheduleState): Effect[] {
    const [dock, hour] = msg.payload as [string, number];
    const span = longestFit(state.appts, dock, hour, COUNT, 2);
    if (conflicts(state.appts, dock, hour, span, COUNT)) {
      return patch({ message: "That hour is not free." });
    }
    const id = `a${state.appts.length + 1}-${dock}-${hour}`;
    const appt: Appt = {
      id,
      dock,
      start: hour,
      span,
      carrier: "New truck",
      ref: "",
      kind: "inbound",
      status: "scheduled",
    };
    return patch({
      ...draw([...state.appts, appt]),
      message: `Booked ${dock.toUpperCase()} at ${FIRST + hour}:00 for ${span} h.`,
    });
  }

  "docks.open"(msg: Message, state: DockScheduleState): Effect[] {
    return patch({
      ...draw(state.appts.filter((a) => a.id !== msg.payload)),
      message: "The truck was removed from the schedule.",
    });
  }
}

export const page = new DockSchedulePage();
