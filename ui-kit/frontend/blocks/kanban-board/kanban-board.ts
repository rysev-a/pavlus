import {
  Component,
  type Effect,
  type Message,
} from "@service-laboratory/pavlus";
import { patch } from "../admin-shell/shell.ts";
import {
  boardOf,
  type ColumnDef,
  type ColumnView,
  moveTask,
  type Task,
} from "./board.ts";
import view from "./kanban-board.pavlus";

export interface KanbanState {
  tasks: Task[];
  columns: ColumnView[];
  message: string;
}

const DEFS: ColumnDef[] = [
  { id: "todo", title: "To do" },
  { id: "doing", title: "In progress" },
  { id: "review", title: "Review" },
  { id: "done", title: "Done" },
];

const TASKS: Task[] = [
  {
    id: "t1",
    title: "Write the brief",
    column: "todo",
    project: "Website",
    who: "AL",
    due: "Nov 6",
    tag: "Docs",
    tone: "info",
  },
  {
    id: "t2",
    title: "Wireframes",
    column: "doing",
    project: "Website",
    who: "JP",
    due: "Nov 9",
    tag: "Design",
    tone: "warning",
  },
  {
    id: "t3",
    title: "Logo variants",
    column: "review",
    project: "Brand",
    who: "ES",
    due: "Nov 5",
    tag: "Design",
    tone: "warning",
  },
  {
    id: "t4",
    title: "Kick-off call",
    column: "done",
    project: "Brand",
    who: "AL",
    due: "Nov 2",
    tag: "Meeting",
    tone: "success",
  },
];

export const initial: KanbanState = {
  tasks: TASKS,
  columns: boardOf(DEFS, TASKS),
  message: "Use the arrows on a card to move it.",
};

export class KanbanPage extends Component<KanbanState> {
  view = view;

  "board.move"(msg: Message, state: KanbanState): Effect[] {
    const [id, dir] = msg.payload as [string, "left" | "right"];
    const tasks = moveTask(state.tasks, DEFS, id, dir);
    return patch({ tasks, columns: boardOf(DEFS, tasks) });
  }
}

export const page = new KanbanPage();
