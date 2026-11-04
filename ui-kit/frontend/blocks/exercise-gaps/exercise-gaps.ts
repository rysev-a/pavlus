import {
  Component,
  type Effect,
  type Message,
} from "@service-laboratory/pavlus";
import { storeEffector as store } from "@service-laboratory/pavlus/plugins";
import {
  type GapExercise,
  type GapMark,
  type GapProps,
  checkGaps,
  gapProps,
  parseGaps,
  solutionOf,
} from "./gaps.ts";
import view from "./exercise-gaps.pavlus";

export const WORDS: GapExercise = {
  prompt: "Complete the sentence.",
  template:
    "The command [[cd]] changes the folder, and [[ls]] lists what is in it.",
};

export const CODE: GapExercise = {
  prompt: "Fill in the git commands.",
  code: true,
  template: 'git [[init]]\ngit [[add]] .\ngit [[commit|ci]] -m "first commit"',
};

type Answers = Record<string, string>;

export interface ExerciseGapsState {
  ansWords: Answers;
  ansCode: Answers;
  words: GapProps;
  code: GapProps;
  resultWords: string;
  resultWordsTone: "success" | "destructive";
  resultCode: string;
  resultCodeTone: "success" | "destructive";
}

const NONE: Record<string, GapMark> = {};

export const initial: ExerciseGapsState = {
  ansWords: {},
  ansCode: {},
  words: gapProps(WORDS, {}, NONE, false),
  code: gapProps(CODE, {}, NONE, false),
  resultWords: "",
  resultWordsTone: "success",
  resultCode: "",
  resultCodeTone: "success",
};

const summary = (n: number, total: number, ok: boolean): string =>
  ok ? "All right" : `${n} of ${total} right`;

export class ExerciseGapsPage extends Component<ExerciseGapsState> {
  view = view;

  "words.fill"(msg: Message, s: ExerciseGapsState): Effect[] {
    const answers = {
      ...s.ansWords,
      [msg.payload as string]: msg.event?.value ?? "",
    };
    return [
      store.set("ansWords", answers),
      store.set("words", gapProps(WORDS, answers, NONE, false)),
      store.set("resultWords", ""),
    ];
  }

  "code.fill"(msg: Message, s: ExerciseGapsState): Effect[] {
    const answers = {
      ...s.ansCode,
      [msg.payload as string]: msg.event?.value ?? "",
    };
    return [
      store.set("ansCode", answers),
      store.set("code", gapProps(CODE, answers, NONE, false)),
      store.set("resultCode", ""),
    ];
  }

  checkWords(_msg: Message, s: ExerciseGapsState): Effect[] {
    const r = checkGaps(parseGaps(WORDS.template).gaps, s.ansWords);
    return [
      store.set("words", gapProps(WORDS, s.ansWords, r.marks, r.ok)),
      store.set("resultWords", summary(r.right, 2, r.ok)),
      store.set("resultWordsTone", r.ok ? "success" : "destructive"),
    ];
  }

  showWords(): Effect[] {
    const answers = solutionOf(WORDS);
    return [
      store.set("ansWords", answers),
      store.set("words", gapProps(WORDS, answers, NONE, false)),
    ];
  }

  checkCode(_msg: Message, s: ExerciseGapsState): Effect[] {
    const r = checkGaps(parseGaps(CODE.template).gaps, s.ansCode);
    return [
      store.set("code", gapProps(CODE, s.ansCode, r.marks, r.ok)),
      store.set("resultCode", summary(r.right, 3, r.ok)),
      store.set("resultCodeTone", r.ok ? "success" : "destructive"),
    ];
  }
}

export const page = new ExerciseGapsPage();
