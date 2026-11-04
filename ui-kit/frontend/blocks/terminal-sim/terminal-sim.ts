import {
  Component,
  type Effect,
  type Message,
} from "@service-laboratory/pavlus";
import {
  DomPlugin,
  storeEffector as store,
} from "@service-laboratory/pavlus/plugins";
import { type Fs, HOME, makeFs } from "./fs.ts";
import { type Goal, type GoalResult, verify } from "./goals.ts";
import { type Term, newTerm, promptOf, stepTerm } from "./session.ts";
import view from "./terminal-sim.pavlus";

export const DEMO_FS: Fs = makeFs({
  [`${HOME}/notes.txt`]: "Remember to read the manual.\nThen practise.\n",
  [`${HOME}/projects/site/index.html`]: "<h1>Hello</h1>\n",
  [`${HOME}/projects/site/style.css`]: "h1 { color: teal; }\n",
});

export const TASK_GOALS: Goal[] = [
  { kind: "dir", path: `${HOME}/docs`, label: "A folder docs exists" },
  {
    kind: "file",
    path: `${HOME}/docs/readme.md`,
    label: "docs contains a file readme.md",
  },
];

const intro = ["Type help to see the commands."];

export interface TerminalSimState {
  term: Term;
  prompt: string;
  task: Term;
  taskPrompt: string;
  goals: GoalResult[];
}

const fresh = (): TerminalSimState => {
  const term = newTerm(DEMO_FS, HOME, intro);
  const task = newTerm(DEMO_FS, HOME, [
    "Task: make a folder docs with a file readme.md inside.",
  ]);
  return {
    term,
    prompt: promptOf(term),
    task,
    taskPrompt: promptOf(task),
    goals: verify(task.fs, task.cwd, TASK_GOALS),
  };
};

export const initial: TerminalSimState = fresh();

export class TerminalSimPage extends Component<TerminalSimState> {
  view = view;

  _show(key: "term" | "task", t: Term): Effect[] {
    return [
      store.set(key, t),
      store.set(key === "term" ? "prompt" : "taskPrompt", promptOf(t)),
      ...(key === "task"
        ? [store.set("goals", verify(t.fs, t.cwd, TASK_GOALS))]
        : []),
    ];
  }

  "term.type"(msg: Message, s: TerminalSimState): Effect[] {
    return this._show("term", stepTerm(s.term, "type", msg.event));
  }
  "term.submit"(msg: Message, s: TerminalSimState): Effect[] {
    return this._show("term", stepTerm(s.term, "submit", msg.event));
  }
  "term.key"(msg: Message, s: TerminalSimState): Effect[] {
    return this._show("term", stepTerm(s.term, "key", msg.event));
  }
  "term.focus"(): Effect[] {
    return [DomPlugin.focus("#tsim-demo-input")];
  }

  "task.type"(msg: Message, s: TerminalSimState): Effect[] {
    return this._show("task", stepTerm(s.task, "type", msg.event));
  }
  "task.submit"(msg: Message, s: TerminalSimState): Effect[] {
    return this._show("task", stepTerm(s.task, "submit", msg.event));
  }
  "task.key"(msg: Message, s: TerminalSimState): Effect[] {
    return this._show("task", stepTerm(s.task, "key", msg.event));
  }
  "task.focus"(): Effect[] {
    return [DomPlugin.focus("#tsim-demo-task")];
  }

  reset(): Effect[] {
    const next = fresh();
    return [
      store.set("task", next.task),
      store.set("taskPrompt", next.taskPrompt),
      store.set("goals", next.goals),
    ];
  }
}

export const page = new TerminalSimPage();
