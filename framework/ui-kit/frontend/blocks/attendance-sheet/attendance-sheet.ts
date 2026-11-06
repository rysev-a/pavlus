import { Component, type Effect, type Message } from "@pavlus/frontend";
import { patch } from "../admin-shell/shell.ts";
import {
  type AttRow,
  clearMarks,
  type Mark,
  markRest,
  type Pupil,
  rowsOf,
  type Summary,
  setMark,
  summarize,
} from "./attendance.ts";
import view from "./attendance-sheet.pavlus";

export interface AttendancePageState {
  pupils: Pupil[];
  rows: AttRow[];
  summary: Summary;
}

const PUPILS: Pupil[] = [
  { id: "p1", name: "Aisha Rahman", mark: "present", note: "" },
  { id: "p2", name: "Ben Carter", mark: "late", note: "Bus delayed" },
  { id: "p3", name: "Chloe Nguyen", mark: "", note: "" },
  { id: "p4", name: "Daniel Okafor", mark: "absent", note: "Dentist" },
  { id: "p5", name: "Emma Lindqvist", mark: "", note: "" },
  { id: "p6", name: "Felix Moreau", mark: "", note: "Needs a glasses check" },
];

const views = (pupils: Pupil[]) => ({
  pupils,
  rows: rowsOf(pupils),
  summary: summarize(pupils),
});

export const initial: AttendancePageState = views(PUPILS);

export class AttendanceSheetPage extends Component<AttendancePageState> {
  view = view;

  "register.mark"(msg: Message, state: AttendancePageState): Effect[] {
    const [id, mark] = msg.payload as [string, Mark];
    return patch(views(setMark(state.pupils, id, mark)));
  }

  "register.rest"(_msg: Message, state: AttendancePageState): Effect[] {
    return patch(views(markRest(state.pupils, "present")));
  }

  "register.clear"(_msg: Message, state: AttendancePageState): Effect[] {
    return patch(views(clearMarks(state.pupils)));
  }
}

export const page = new AttendanceSheetPage();
