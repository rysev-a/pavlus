import {
  Component,
  type Effect,
  type Message,
} from "@service-laboratory/pavlus";
import { storeEffector as store } from "@service-laboratory/pavlus/plugins";
import {
  type ChoiceExercise,
  type ChoiceProps,
  type Verdict,
  checkChoice,
  choiceProps,
  toggleChoice,
} from "./quiz.ts";
import view from "./exercise-quiz.pavlus";

export const ONE: ChoiceExercise = {
  prompt: "Which command prints the folder you are in?",
  mono: true,
  options: [
    { id: "a", text: "ls" },
    { id: "b", text: "pwd" },
    { id: "c", text: "cd" },
    { id: "d", text: "cat" },
  ],
  correct: ["b"],
};

export const MANY: ChoiceExercise = {
  prompt: "Which of these commands create something new?",
  mono: true,
  options: [
    { id: "a", text: "mkdir photos" },
    { id: "b", text: "ls -l" },
    { id: "c", text: "touch notes.txt" },
    { id: "d", text: "echo hi > greeting.txt" },
  ],
  correct: ["a", "c", "d"],
};

export interface ExerciseQuizState {
  selOne: string[];
  selMany: string[];
  verdictOne: Verdict;
  verdictMany: Verdict;
  one: ChoiceProps;
  many: ChoiceProps;
}

export const initial: ExerciseQuizState = {
  selOne: [],
  selMany: [],
  verdictOne: "",
  verdictMany: "",
  one: choiceProps(ONE, [], ""),
  many: choiceProps(MANY, [], ""),
};

export class ExerciseQuizPage extends Component<ExerciseQuizState> {
  view = view;

  "one.choose"(msg: Message, s: ExerciseQuizState): Effect[] {
    const sel = toggleChoice(ONE, s.selOne, msg.payload as string);
    return [
      store.set("selOne", sel),
      store.set("verdictOne", ""),
      store.set("one", choiceProps(ONE, sel, "")),
    ];
  }

  "many.choose"(msg: Message, s: ExerciseQuizState): Effect[] {
    const sel = toggleChoice(MANY, s.selMany, msg.payload as string);
    return [
      store.set("selMany", sel),
      store.set("verdictMany", ""),
      store.set("many", choiceProps(MANY, sel, "")),
    ];
  }

  checkOne(_msg: Message, s: ExerciseQuizState): Effect[] {
    const verdict: Verdict = checkChoice(ONE, s.selOne) ? "correct" : "wrong";
    return [
      store.set("verdictOne", verdict),
      store.set("one", choiceProps(ONE, s.selOne, verdict)),
    ];
  }

  checkMany(_msg: Message, s: ExerciseQuizState): Effect[] {
    const verdict: Verdict = checkChoice(MANY, s.selMany) ? "correct" : "wrong";
    return [
      store.set("verdictMany", verdict),
      store.set("many", choiceProps(MANY, s.selMany, verdict)),
    ];
  }
}

export const page = new ExerciseQuizPage();
