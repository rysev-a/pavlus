import {
  Component,
  type Effect,
  type Message,
} from "@service-laboratory/pavlus";
import { patch } from "../admin-shell/shell.ts";
import {
  choice,
  listAction,
  loadMeter,
  type StatusRow,
  statusRow,
} from "./rows.ts";
import view from "./status-list.pavlus";

export interface StatusListState {
  servers: StatusRow[];
  tasks: StatusRow[];
  assigned: Record<string, string>;
  finished: string[];
  message: string;
}

const STAFF = ["Maria", "Tom", "Sofia"];
const TASKS = [
  { id: "r101", name: "Room 101", sub: "Checkout clean" },
  { id: "r204", name: "Room 204", sub: "Stay-over clean" },
  { id: "r305", name: "Room 305", sub: "Deep clean" },
];

/** Pure: the task rows for who is assigned and which are done. */
export function taskRows(
  assigned: Record<string, string>,
  finished: string[],
): StatusRow[] {
  return TASKS.map((t) => {
    const done = finished.includes(t.id);
    return statusRow(
      t.id,
      t.name,
      done ? "Clean" : "Dirty",
      done ? "success" : "warning",
      {
        sub: t.sub,
        done,
        choose: done ? null : choice("Assign", STAFF, assigned[t.id] ?? ""),
        actions: done
          ? []
          : [
              listAction("done", "Mark done", {
                icon: "k-icon-check",
                variant: "default",
                disabled: !assigned[t.id],
              }),
            ],
      },
    );
  });
}

export const initial: StatusListState = {
  servers: [
    statusRow("web-1", "web-1", "Online", "success", {
      sub: "10.0.0.11",
      facts: [{ label: "Uptime", value: "41d 6h" }],
      meters: [
        loadMeter("CPU", 38),
        loadMeter("RAM", 62),
        loadMeter("Disk", 54),
      ],
    }),
    statusRow("db-1", "db-1", "Degraded", "warning", {
      sub: "10.0.0.21",
      facts: [{ label: "Uptime", value: "12d 2h" }],
      meters: [
        loadMeter("CPU", 81),
        loadMeter("RAM", 88),
        loadMeter("Disk", 93),
      ],
    }),
  ],
  tasks: taskRows({}, []),
  assigned: {},
  finished: [],
  message: "Assign someone, then mark the room done.",
};

export class StatusListPage extends Component<StatusListState> {
  view = view;

  "tasks.choose"(msg: Message, state: StatusListState): Effect[] {
    const assigned = {
      ...state.assigned,
      [msg.payload as string]: msg.event?.value ?? "",
    };
    return patch({ assigned, tasks: taskRows(assigned, state.finished) });
  }

  "tasks.act"(msg: Message, state: StatusListState): Effect[] {
    const [id] = msg.payload as [string, string];
    const finished = [...state.finished, id];
    return patch({
      finished,
      tasks: taskRows(state.assigned, finished),
      message: `${id} is clean.`,
    });
  }
}

export const page = new StatusListPage();
