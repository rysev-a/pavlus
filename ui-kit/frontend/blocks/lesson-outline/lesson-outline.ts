import {
  Component,
  type Effect,
  type Message,
} from "@service-laboratory/pavlus";
import { storeEffector as store } from "@service-laboratory/pavlus/plugins";
import {
  type ModuleView,
  type OutlineModule,
  type Solved,
  buildOutline,
  toggleModule,
} from "./outline.ts";
import view from "./lesson-outline.pavlus";

export const SAMPLE: OutlineModule[] = [
  {
    id: "m1",
    title: "Getting around",
    summary: "Folders and files from the command line",
    lessons: [
      { id: "l1", title: "Where am I?", exercises: 3, xp: 40 },
      { id: "l2", title: "Making things", exercises: 4, xp: 60 },
    ],
  },
  {
    id: "m2",
    title: "Saving your work",
    summary: "Version control with git",
    lessons: [
      { id: "l3", title: "Your first commit", exercises: 4, xp: 65 },
      { id: "l4", title: "Branches", exercises: 3, xp: 50 },
    ],
  },
];

export interface LessonOutlineState {
  solved: Solved;
  openModules: string[];
  modules: ModuleView[];
}

const make = (solved: Solved, open: string[]): ModuleView[] =>
  buildOutline(SAMPLE, solved, open, ["l4"]);

export const initial: LessonOutlineState = {
  solved: { l1: 3, l2: 1 },
  openModules: ["m1", "m2"],
  modules: make({ l1: 3, l2: 1 }, ["m1", "m2"]),
};

export class LessonOutlinePage extends Component<LessonOutlineState> {
  view = view;

  "outline.toggle"(msg: Message, s: LessonOutlineState): Effect[] {
    const open = toggleModule(s.openModules, msg.payload as string);
    return [
      store.set("openModules", open),
      store.set("modules", make(s.solved, open)),
    ];
  }

  "outline.open"(msg: Message, s: LessonOutlineState): Effect[] {
    const id = msg.payload as string;
    const lesson = SAMPLE.flatMap((m) => m.lessons).find((l) => l.id === id);
    if (!lesson) return [];
    const solved = {
      ...s.solved,
      [id]: Math.min(lesson.exercises, (s.solved[id] ?? 0) + 1),
    };
    return [
      store.set("solved", solved),
      store.set("modules", make(solved, s.openModules)),
    ];
  }
}

export const page = new LessonOutlinePage();
