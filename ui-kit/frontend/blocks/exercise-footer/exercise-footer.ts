import {
  Component,
  type Effect,
  type Message,
} from "@service-laboratory/pavlus";
import { storeEffector as store } from "@service-laboratory/pavlus/plugins";
import { type FooterProps, footerProps } from "./footer.ts";
import view from "./exercise-footer.pavlus";

const HINTS = [
  "Think about what the command is short for.",
  "It is the two letters that stand for 'list'.",
];

const STATES: Record<string, FooterProps> = {
  idle: footerProps({ status: "", hints: HINTS, hintsShown: 0 }),
  hint: footerProps({ status: "", hints: HINTS, hintsShown: 1 }),
  wrong: footerProps({
    status: "wrong",
    feedback: "ls prints a list of files, but you picked pwd.",
    hints: HINTS,
    hintsShown: 1,
  }),
  correct: footerProps({
    status: "correct",
    feedback: "ls lists the files in the current folder.",
    hints: HINTS,
    hintsShown: 1,
    xp: 9,
    last: true,
    resetLabel: "Try again",
  }),
};

export interface ExerciseFooterState {
  current: string;
  states: { id: string; label: string }[];
  footer: FooterProps;
}

export const initial: ExerciseFooterState = {
  current: "idle",
  states: [
    { id: "idle", label: "Fresh" },
    { id: "hint", label: "A hint used" },
    { id: "wrong", label: "Wrong" },
    { id: "correct", label: "Correct" },
  ],
  footer: STATES.idle,
};

export class ExerciseFooterPage extends Component<ExerciseFooterState> {
  view = view;

  pick(msg: Message): Effect[] {
    const id = msg.payload as string;
    return [store.set("current", id), store.set("footer", STATES[id])];
  }
}

export const page = new ExerciseFooterPage();
