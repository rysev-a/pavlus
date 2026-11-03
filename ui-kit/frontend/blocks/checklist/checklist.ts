import {
  Component,
  type Effect,
  type Message,
} from "@service-laboratory/pavlus";
import { patch } from "../admin-shell/shell.ts";
import { TODAY } from "../week-calendar/dates.ts";
import {
  checklistOf,
  type GroupDef,
  type GroupView,
  overdueCount,
  progress,
  task,
  type Task,
  toggleTask,
} from "./list.ts";
import view from "./checklist.pavlus";

export interface ChecklistState {
  tasks: Task[];
  groups: GroupView[];
  message: string;
}

const DEFS: GroupDef[] = [
  { id: "paper", title: "Paperwork", hint: "Before day one" },
  { id: "it", title: "IT setup", hint: "Accounts and hardware" },
  { id: "team", title: "Meet the team", hint: "First week" },
];

const TASKS: Task[] = [
  task("d1", "paper", "Sign the employment contract", "HR", "2026-11-02", true),
  task(
    "d2",
    "paper",
    "Bank details form",
    "New hire",
    "2026-11-02",
    false,
    "Form",
    "info",
  ),
  task("d3", "paper", "Tax declaration", "HR", "2026-11-06"),
  task("d4", "it", "Laptop and badge", "IT", "2026-11-03", true),
  task(
    "d5",
    "it",
    "Set up two-factor sign-in",
    "New hire",
    "2026-11-03",
    false,
    "Today",
    "warning",
  ),
  task("d6", "it", "Access to the source repositories", "IT", "2026-11-04"),
  task("d7", "team", "Coffee with your buddy", "Buddy", "2026-11-04"),
  task("d8", "team", "Lunch with the product team", "Manager", "2026-11-05"),
];

const summary = (tasks: Task[]): string => {
  const p = progress(tasks);
  return `${p.done} of ${p.total} done, ${overdueCount(tasks, TODAY)} overdue.`;
};

export const initial: ChecklistState = {
  tasks: TASKS,
  groups: checklistOf(TASKS, DEFS, TODAY),
  message: summary(TASKS),
};

export class ChecklistPage extends Component<ChecklistState> {
  view = view;

  "list.toggle"(msg: Message, state: ChecklistState): Effect[] {
    const tasks = toggleTask(state.tasks, msg.payload as string);
    return patch({
      tasks,
      groups: checklistOf(tasks, DEFS, TODAY),
      message: summary(tasks),
    });
  }
}

export const page = new ChecklistPage();
