import {
  Component,
  type Effect,
  type Message,
} from "@service-laboratory/pavlus";
import { patch } from "../admin-shell/shell.ts";
import {
  legendOf,
  type Legend,
  nextStatus,
  type TableDef,
  type TableState,
  type TableView,
  tablesOf,
  withTable,
} from "./floor.ts";
import view from "./floor-plan.pavlus";

export interface FloorPlanState {
  defs: TableDef[];
  states: TableState[];
  selected: string;
  tables: TableView[];
  legend: Legend[];
  cols: number;
  rows: number;
  message: string;
}

const DEFS: TableDef[] = [
  {
    id: "t1",
    label: "1",
    seats: 2,
    col: 1,
    row: 1,
    w: 1,
    h: 1,
    shape: "round",
  },
  {
    id: "t2",
    label: "2",
    seats: 2,
    col: 2,
    row: 1,
    w: 1,
    h: 1,
    shape: "round",
  },
  {
    id: "t3",
    label: "3",
    seats: 4,
    col: 3,
    row: 1,
    w: 1,
    h: 1,
    shape: "square",
  },
  {
    id: "t4",
    label: "4",
    seats: 4,
    col: 4,
    row: 1,
    w: 1,
    h: 1,
    shape: "square",
  },
  { id: "t5", label: "5", seats: 6, col: 1, row: 2, w: 2, h: 1, shape: "wide" },
  {
    id: "t6",
    label: "6",
    seats: 4,
    col: 3,
    row: 2,
    w: 1,
    h: 1,
    shape: "square",
  },
  {
    id: "t7",
    label: "7",
    seats: 2,
    col: 4,
    row: 2,
    w: 1,
    h: 1,
    shape: "round",
  },
  { id: "t8", label: "8", seats: 8, col: 1, row: 3, w: 3, h: 1, shape: "wide" },
  {
    id: "t9",
    label: "9",
    seats: 2,
    col: 4,
    row: 3,
    w: 1,
    h: 1,
    shape: "round",
  },
  {
    id: "t10",
    label: "10",
    seats: 4,
    col: 5,
    row: 1,
    w: 1,
    h: 2,
    shape: "square",
  },
];

const STATES: TableState[] = DEFS.map((d, i) => ({
  id: d.id,
  status: (["seated", "free", "ordered", "paying", "free"] as const)[i % 5],
  guests: i % 5 === 1 || i % 5 === 4 ? 0 : Math.min(d.seats, 2 + (i % 3)),
  since: -60 * (6 + i * 3),
}));

const draw = (states: TableState[], selected: string) => ({
  states,
  selected,
  tables: tablesOf(DEFS, states, selected, 0),
  legend: legendOf(states),
});

export const initial: FloorPlanState = {
  defs: DEFS,
  ...draw(STATES, "t3"),
  cols: 5,
  rows: 3,
  message: "Click a table to select it.",
};

export class FloorPlanPage extends Component<FloorPlanState> {
  view = view;

  "plan.pick"(msg: Message, state: FloorPlanState): Effect[] {
    const id = msg.payload as string;
    return patch({
      ...draw(state.states, id),
      message: `Table ${id.slice(1)} selected.`,
    });
  }

  advance(_msg: Message, state: FloorPlanState): Effect[] {
    const current = state.states.find((s) => s.id === state.selected);
    if (!current) return [];
    const status = nextStatus(current.status);
    const states = withTable(state.states, state.selected, {
      status,
      guests: status === "free" ? 0 : Math.max(2, current.guests),
    });
    return patch({
      ...draw(states, state.selected),
      message: `Table ${state.selected.slice(1)} is now ${status}.`,
    });
  }
}

export const page = new FloorPlanPage();
