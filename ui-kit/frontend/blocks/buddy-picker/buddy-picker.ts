import {
  Component,
  type Effect,
  type Message,
} from "@service-laboratory/pavlus";
import { patch } from "../admin-shell/shell.ts";
import { type Buddy, buddyRows, type BuddyRow, choose } from "./buddies.ts";
import view from "./buddy-picker.pavlus";

export const BUDDIES: Buddy[] = [
  {
    id: "b1",
    name: "Priya Raman",
    role: "Senior engineer",
    team: "Platform",
    mentees: 1,
  },
  {
    id: "b2",
    name: "Tomas Berg",
    role: "Product designer",
    team: "Design",
    mentees: 0,
  },
  {
    id: "b3",
    name: "Lena Fischer",
    role: "Support lead",
    team: "Customer care",
    mentees: 2,
  },
  {
    id: "b4",
    name: "Diego Alvarez",
    role: "Engineering manager",
    team: "Platform",
    mentees: 0,
    away: "until Nov 9",
  },
];

export interface BuddyPickerState {
  chosen: string;
  rows: BuddyRow[];
}

export const initial: BuddyPickerState = {
  chosen: "b2",
  rows: buddyRows(BUDDIES, "b2"),
};

export class BuddyPickerPage extends Component<BuddyPickerState> {
  view = view;

  "pick.choose"(msg: Message, state: BuddyPickerState): Effect[] {
    const chosen = choose(state.chosen, msg.payload as string);
    return patch({ chosen, rows: buddyRows(BUDDIES, chosen) });
  }
}

export const page = new BuddyPickerPage();
