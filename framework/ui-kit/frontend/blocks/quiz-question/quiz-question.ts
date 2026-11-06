import { Component, type Effect, type Message } from "@pavlus/frontend";
import { storeEffector as store } from "@pavlus/frontend/plugins";
import view from "./quiz-question.pavlus";

export interface Option {
  id: string;
  text: string;
}

export interface Question {
  id: string;
  text: string;
  options: Option[];
  /** The ids of the right options: one is a single choice, more is a multiple one. */
  correct: string[];
  explanation: string;
}

/** What each answer is, once the right ones are revealed. */
export type Mark = "" | "correct" | "wrong" | "missed";

export interface OptionView extends Option {
  selected: boolean;
  mark: Mark;
}

export interface QuestionProps {
  number: number;
  total: number;
  text: string;
  multiple: boolean;
  hint: string;
  options: OptionView[];
  reveal: boolean;
  /** `correct` / `wrong` / `skipped` once revealed, else empty. */
  verdict: string;
  explanation: string;
  flagged: boolean;
  canFlag: boolean;
}

export const isMultiple = (q: Pick<Question, "correct">): boolean =>
  q.correct.length > 1;

/** Pure: the new selection after a click: single replaces, multiple toggles. */
export function toggleAnswer(
  q: Question,
  selected: string[],
  optionId: string,
): string[] {
  if (!q.options.some((o) => o.id === optionId)) return selected;
  if (!isMultiple(q)) return [optionId];
  const next = selected.includes(optionId)
    ? selected.filter((id) => id !== optionId)
    : [...selected, optionId];
  // keep the order of the options, so two equal answers are equal arrays
  return q.options.map((o) => o.id).filter((id) => next.includes(id));
}

/** Pure: is the selection exactly the set of right options? */
export function isCorrect(q: Question, selected: string[]): boolean {
  return (
    selected.length === q.correct.length &&
    q.correct.every((id) => selected.includes(id))
  );
}

export interface Result {
  id: string;
  answered: boolean;
  correct: boolean;
}

export interface Score {
  correct: number;
  total: number;
  answered: number;
  /** 0..100, rounded. */
  percent: number;
  passed: boolean;
  results: Result[];
}

/**
 * Pure: the score of a test. A question counts when the chosen options are
 * exactly the right ones (a multiple choice has no half points); an
 * unanswered question is wrong. `passPercent` is the pass mark.
 */
export function scoreQuiz(
  questions: Question[],
  answers: Record<string, string[]>,
  passPercent: number,
): Score {
  const results = questions.map((q): Result => {
    const given = answers[q.id] ?? [];
    return {
      id: q.id,
      answered: given.length > 0,
      correct: isCorrect(q, given),
    };
  });
  const correct = results.filter((r) => r.correct).length;
  const total = questions.length;
  const percent = total === 0 ? 0 : Math.round((correct / total) * 100);
  return {
    correct,
    total,
    answered: results.filter((r) => r.answered).length,
    percent,
    passed: total > 0 && percent >= passPercent,
    results,
  };
}

/** Pure: the mark of one option once the answers are revealed. */
export function markOf(q: Question, selected: string[], id: string): Mark {
  const right = q.correct.includes(id);
  const chosen = selected.includes(id);
  return right && chosen ? "correct" : chosen ? "wrong" : right ? "missed" : "";
}

/** Pure: everything `view.pavlus` shows for a question. */
export function questionProps(
  q: Question,
  number: number,
  total: number,
  selected: string[],
  reveal: boolean,
  flagged = false,
  canFlag = true,
): QuestionProps {
  const multiple = isMultiple(q);
  return {
    number,
    total,
    text: q.text,
    multiple,
    hint: multiple ? "Select all that apply" : "Select one answer",
    options: q.options.map((o) => ({
      ...o,
      selected: selected.includes(o.id),
      mark: reveal ? markOf(q, selected, o.id) : "",
    })),
    reveal,
    verdict: !reveal
      ? ""
      : selected.length === 0
        ? "skipped"
        : isCorrect(q, selected)
          ? "correct"
          : "wrong",
    explanation: reveal ? q.explanation : "",
    flagged,
    canFlag,
  };
}

export const SAMPLE: Question[] = [
  {
    id: "s1",
    text: "Which method adds an element to the end of an array?",
    options: [
      { id: "a", text: "array.unshift()" },
      { id: "b", text: "array.push()" },
      { id: "c", text: "array.concat()" },
      { id: "d", text: "array.splice()" },
    ],
    correct: ["b"],
    explanation:
      "push() appends to the end and returns the new length. unshift() adds to the front, and concat() returns a new array instead of changing this one.",
  },
  {
    id: "s2",
    text: "Which of these values are falsy in JavaScript?",
    options: [
      { id: "a", text: "0" },
      { id: "b", text: '"0" (a string)' },
      { id: "c", text: "null" },
      { id: "d", text: "[] (an empty array)" },
    ],
    correct: ["a", "c"],
    explanation:
      'Only 0 and null are falsy here. A non-empty string such as "0" and any array, even an empty one, are truthy.',
  },
];

export interface QuizQuestionState {
  selectedA: string[];
  selectedB: string[];
  revealed: boolean;
  a: QuestionProps;
  b: QuestionProps;
  flagA: boolean;
}

const props = (
  selectedA: string[],
  selectedB: string[],
  revealed: boolean,
  flagA: boolean,
): Pick<QuizQuestionState, "a" | "b"> => ({
  a: questionProps(SAMPLE[0], 1, 2, selectedA, revealed, flagA),
  b: questionProps(SAMPLE[1], 2, 2, selectedB, revealed, false, false),
});

export const initial: QuizQuestionState = {
  selectedA: ["b"],
  selectedB: ["a"],
  revealed: false,
  flagA: false,
  ...props(["b"], ["a"], false, false),
};

export class QuizQuestionPage extends Component<QuizQuestionState> {
  view = view;

  "qa.choose"(msg: Message, state: QuizQuestionState): Effect[] {
    const selectedA = toggleAnswer(
      SAMPLE[0],
      state.selectedA,
      msg.payload as string,
    );
    return this._show({ ...state, selectedA });
  }

  "qb.choose"(msg: Message, state: QuizQuestionState): Effect[] {
    const selectedB = toggleAnswer(
      SAMPLE[1],
      state.selectedB,
      msg.payload as string,
    );
    return this._show({ ...state, selectedB });
  }

  "qa.flag"(_msg: Message, state: QuizQuestionState): Effect[] {
    return this._show({ ...state, flagA: !state.flagA });
  }

  toggleReveal(_msg: Message, state: QuizQuestionState): Effect[] {
    return this._show({ ...state, revealed: !state.revealed });
  }

  _show(next: QuizQuestionState): Effect[] {
    const { selectedA, selectedB, revealed, flagA } = next;
    return [
      store.set("selectedA", selectedA),
      store.set("selectedB", selectedB),
      store.set("revealed", revealed),
      store.set("flagA", flagA),
      ...(Object.entries(props(selectedA, selectedB, revealed, flagA)).map(
        ([k, v]) => store.set(k, v),
      ) as Effect[]),
    ];
  }
}

export const page = new QuizQuestionPage();
