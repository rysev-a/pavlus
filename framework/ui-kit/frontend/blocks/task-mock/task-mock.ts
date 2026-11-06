import {
  type Children,
  Component,
  type Effect,
  type Message,
} from "@pavlus/frontend";
import { storeEffector as store } from "@pavlus/frontend/plugins";
import pageView from "./task-mock.pavlus";
import view from "./view.pavlus";

export type Filter = "all" | "open" | "done";

export interface Task {
  id: number;
  title: string;
  done: boolean;
  /** A short label shown as a badge ("Work", "Home"...). */
  tag: string;
}

export interface Progress {
  done: number;
  total: number;
  percent: number;
}

export interface TaskMockState {
  title: string;
  tasks: Task[];
  draft: string;
  filter: Filter;
  /** The id the next task gets: a counter, since a handler cannot be random. */
  nextId: number;
  error: string;
  // derived from `tasks` and `filter`
  shown: Task[];
  progress: Progress;
  left: number;
}

/** Pure: adds a task (a blank title adds nothing). A `#word` in the title becomes its tag. */
export function addTask(tasks: Task[], text: string, id: number): Task[] {
  const tag = /(?:^|\s)#(\w+)/.exec(text)?.[1] ?? "";
  const title = text
    .replace(/(?:^|\s)#\w+/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!title) return tasks;
  return [
    ...tasks,
    {
      id,
      title,
      done: false,
      tag: tag ? tag[0].toUpperCase() + tag.slice(1) : "",
    },
  ];
}

/** Pure: flips `done` of one task. */
export function toggleTask(tasks: Task[], id: number): Task[] {
  return tasks.map((t) => (t.id === id ? { ...t, done: !t.done } : t));
}

export function removeTask(tasks: Task[], id: number): Task[] {
  return tasks.filter((t) => t.id !== id);
}

/** Pure: the tasks a filter lets through; open ones come before done ones in "all". */
export function visibleTasks(tasks: Task[], filter: Filter): Task[] {
  if (filter === "open") return tasks.filter((t) => !t.done);
  if (filter === "done") return tasks.filter((t) => t.done);
  return [...tasks.filter((t) => !t.done), ...tasks.filter((t) => t.done)];
}

/** Pure: how much is done. An empty list is 0%. */
export function progressOf(tasks: Task[]): Progress {
  const done = tasks.filter((t) => t.done).length;
  return {
    done,
    total: tasks.length,
    percent: tasks.length === 0 ? 0 : Math.round((done / tasks.length) * 100),
  };
}

/** Pure: what follows from the tasks and the filter. */
export function derived(
  tasks: Task[],
  filter: Filter,
): Pick<TaskMockState, "shown" | "progress" | "left"> {
  const progress = progressOf(tasks);
  return {
    shown: visibleTasks(tasks, filter),
    progress,
    left: progress.total - progress.done,
  };
}

export function taskMockState(
  over: Partial<TaskMockState> = {},
): TaskMockState {
  const tasks: Task[] = over.tasks ?? [
    { id: 1, title: "Send the Q3 plan to Maya", done: true, tag: "Work" },
    { id: 2, title: "Book a dentist appointment", done: false, tag: "Home" },
    { id: 3, title: "Review the pricing page copy", done: false, tag: "Work" },
    { id: 4, title: "Plan Sunday dinner", done: false, tag: "Home" },
  ];
  const filter = over.filter ?? "all";
  return {
    title: "Today",
    draft: "",
    filter,
    nextId: tasks.reduce((m, t) => Math.max(m, t.id), 0) + 1,
    error: "",
    ...over,
    tasks,
    ...derived(tasks, filter),
  };
}

const replace = (patch: Partial<TaskMockState>): Effect[] =>
  Object.entries(patch).map(([k, v]) => store.set(k, v));

/** A small working task list: add (try `Call mum #home`), tick, remove, filter. */
export class TaskMock extends Component<TaskMockState> {
  view = view;

  setDraft(msg: Message): Effect[] {
    return [store.set("draft", msg.event?.value ?? ""), store.set("error", "")];
  }

  add(_msg: Message, s: TaskMockState): Effect[] {
    const tasks = addTask(s.tasks, s.draft, s.nextId);
    if (tasks === s.tasks) return [store.set("error", "Type a task first.")];
    return replace({
      tasks,
      draft: "",
      error: "",
      nextId: s.nextId + 1,
      ...derived(tasks, s.filter),
    });
  }

  toggle(msg: Message, s: TaskMockState): Effect[] {
    const tasks = toggleTask(s.tasks, msg.payload as number);
    return replace({ tasks, ...derived(tasks, s.filter) });
  }

  remove(msg: Message, s: TaskMockState): Effect[] {
    const tasks = removeTask(s.tasks, msg.payload as number);
    return replace({ tasks, ...derived(tasks, s.filter) });
  }

  setFilter(msg: Message, s: TaskMockState): Effect[] {
    const filter = msg.payload as Filter;
    return replace({ filter, ...derived(s.tasks, filter) });
  }
}

export const taskMock = new TaskMock();

export interface TaskMockPageState {
  mock: TaskMockState;
}

export const initial: TaskMockPageState = { mock: taskMockState() };

export class TaskMockPage extends Component<TaskMockPageState> {
  view = pageView;
  children: Children<TaskMockPageState> = {
    mock: { component: taskMock, key: "mock" },
  };
}

export const page = new TaskMockPage();
