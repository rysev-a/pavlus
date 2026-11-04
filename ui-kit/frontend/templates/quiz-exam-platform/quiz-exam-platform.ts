import {
  Component,
  type Effect,
  type Message,
} from "@service-laboratory/pavlus";
import {
  storeEffector as store,
  timeEffector as time,
} from "@service-laboratory/pavlus/plugins";
import {
  formatClock,
  type TimerProps,
  tick,
  timerProps,
} from "../../blocks/countdown-timer/countdown-timer.ts";
import {
  navItems,
  type NavItem,
  type NavSummary,
  summaryOf,
} from "../../blocks/question-navigator/question-navigator.ts";
import {
  type QuestionProps,
  questionProps,
  type Score,
  scoreQuiz,
  toggleAnswer,
} from "../../blocks/quiz-question/quiz-question.ts";
import { TESTS, type Test } from "./quiz-data.ts";
import view from "./quiz-exam-platform.pavlus";

const TIMER = "quiz:timer";

export type Answers = Record<string, string[]>;

/** Pure: indexes of the questions that have an answer. */
export const answeredIndexes = (test: Test, answers: Answers): number[] =>
  test.questions.flatMap((q, i) =>
    (answers[q.id] ?? []).length > 0 ? [i] : [],
  );

/** Pure: how much of the limit was used, `3:05`. */
export const timeUsed = (total: number, remaining: number): string =>
  formatClock(total - remaining);

/** Pure: the sentence above the score. */
export function headline(percent: number, passed: boolean): string {
  if (passed && percent === 100) return "Flawless!";
  if (passed) return "You passed";
  return percent >= 50 ? "So close" : "Not this time";
}

export interface CatalogueCard {
  id: string;
  title: string;
  blurb: string;
  emoji: string;
  level: string;
  count: number;
  minutes: number;
  pass: number;
  /** The best result so far, or -1. */
  best: number;
  bestLabel: string;
}

export interface Attempt {
  testId: string;
  percent: number;
  passed: boolean;
}

/** Pure: the cards of the catalogue with the best result of each test. */
export function catalogue(tests: Test[], attempts: Attempt[]): CatalogueCard[] {
  return tests.map((t) => {
    const mine = attempts.filter((a) => a.testId === t.id);
    const best =
      mine.length === 0 ? -1 : Math.max(...mine.map((a) => a.percent));
    return {
      id: t.id,
      title: t.title,
      blurb: t.blurb,
      emoji: t.emoji,
      level: t.level,
      count: t.questions.length,
      minutes: t.minutes,
      pass: t.pass,
      best,
      bestLabel: best < 0 ? "Not taken yet" : `Best: ${best}%`,
    };
  });
}

export interface ResultView {
  title: string;
  headline: string;
  percent: number;
  passed: boolean;
  correct: number;
  total: number;
  answered: number;
  skipped: number;
  pass: number;
  used: string;
  timeUp: boolean;
}

export interface ReviewItem {
  id: string;
  index: number;
  correct: boolean;
  question: QuestionProps;
}

/** Pure: the result page's numbers. */
export function resultView(
  test: Test,
  score: Score,
  total: number,
  remaining: number,
): ResultView {
  return {
    title: test.title,
    headline: headline(score.percent, score.passed),
    percent: score.percent,
    passed: score.passed,
    correct: score.correct,
    total: score.total,
    answered: score.answered,
    skipped: score.total - score.answered,
    pass: test.pass,
    used: timeUsed(total, remaining),
    timeUp: remaining <= 0,
  };
}

/** Pure: every question with the right answers revealed. */
export function reviewOf(
  test: Test,
  answers: Answers,
  score: Score,
  onlyWrong: boolean,
): ReviewItem[] {
  return test.questions
    .map((q, index) => ({
      id: q.id,
      index,
      correct: score.results[index].correct,
      question: questionProps(
        q,
        index + 1,
        test.questions.length,
        answers[q.id] ?? [],
        true,
        false,
        false,
      ),
    }))
    .filter((r) => !onlyWrong || !r.correct);
}

export interface Core {
  screen: "catalogue" | "quiz" | "result";
  testId: string;
  current: number;
  answers: Answers;
  flagged: number[];
  total: number;
  remaining: number;
  confirming: boolean;
  onlyWrong: boolean;
  attempts: Attempt[];
}

export interface Derived {
  cards: CatalogueCard[];
  testTitle: string;
  question: QuestionProps | null;
  items: NavItem[];
  summary: NavSummary;
  timer: TimerProps;
  isFirst: boolean;
  isLast: boolean;
  unanswered: number;
  result: ResultView | null;
  review: ReviewItem[];
  history: string[];
}

const testOf = (id: string): Test | undefined => TESTS.find((t) => t.id === id);

export function derive(s: Core): Derived {
  const test = testOf(s.testId);
  const cards = catalogue(TESTS, s.attempts);
  const history = [...s.attempts]
    .reverse()
    .slice(0, 5)
    .map(
      (a) =>
        `${testOf(a.testId)?.title ?? a.testId}: ${a.percent}% (${a.passed ? "passed" : "failed"})`,
    );
  if (!test) {
    return {
      cards,
      testTitle: "",
      question: null,
      items: [],
      summary: { answered: 0, flagged: 0, left: 0 },
      timer: timerProps(0, 0),
      isFirst: true,
      isLast: false,
      unanswered: 0,
      result: null,
      review: [],
      history,
    };
  }
  const n = test.questions.length;
  const answered = answeredIndexes(test, s.answers);
  const items = navItems(n, s.current, answered, s.flagged);
  const q = test.questions[Math.min(s.current, n - 1)];
  const score = scoreQuiz(test.questions, s.answers, test.pass);
  return {
    cards,
    testTitle: test.title,
    question: questionProps(
      q,
      s.current + 1,
      n,
      s.answers[q.id] ?? [],
      false,
      s.flagged.includes(s.current),
    ),
    items,
    summary: summaryOf(items),
    timer: timerProps(s.remaining, s.total, "Time left"),
    isFirst: s.current === 0,
    isLast: s.current === n - 1,
    unanswered: n - answered.length,
    result:
      s.screen === "result"
        ? resultView(test, score, s.total, s.remaining)
        : null,
    review:
      s.screen === "result"
        ? reviewOf(test, s.answers, score, s.onlyWrong)
        : [],
    history,
  };
}

const core: Core = {
  screen: "catalogue",
  testId: "",
  current: 0,
  answers: {},
  flagged: [],
  total: 0,
  remaining: 0,
  confirming: false,
  onlyWrong: false,
  attempts: [
    { testId: "geo", percent: 83, passed: true },
    { testId: "logic", percent: 50, passed: false },
  ],
};

export interface QuizState extends Core, Derived {}

export const initial: QuizState = { ...core, ...derive(core) };

const CORE_KEYS = Object.keys(core) as (keyof Core)[];
const coreOf = (state: QuizState): Core => {
  const c: Record<string, unknown> = {};
  for (const k of CORE_KEYS) c[k] = state[k];
  return c as unknown as Core;
};

export class QuizExamPlatform extends Component<QuizState> {
  view = view;

  start(msg: Message, state: QuizState): Effect[] {
    const test = testOf(msg.payload as string);
    if (!test) return [];
    const total = test.minutes * 60;
    return this._show(
      state,
      {
        screen: "quiz",
        testId: test.id,
        current: 0,
        answers: {},
        flagged: [],
        total,
        remaining: total,
        confirming: false,
        onlyWrong: false,
      },
      [time.setInterval(TIMER, 1000, "tick")],
    );
  }

  "question.choose"(msg: Message, state: QuizState): Effect[] {
    const test = testOf(state.testId);
    if (!test || state.screen !== "quiz") return [];
    const q = test.questions[state.current];
    const next = toggleAnswer(
      q,
      state.answers[q.id] ?? [],
      msg.payload as string,
    );
    return this._show(state, {
      answers: { ...state.answers, [q.id]: next },
      confirming: false,
    });
  }

  "question.flag"(_msg: Message, state: QuizState): Effect[] {
    const at = state.current;
    return this._show(state, {
      flagged: state.flagged.includes(at)
        ? state.flagged.filter((i) => i !== at)
        : [...state.flagged, at],
    });
  }

  "nav.go"(msg: Message, state: QuizState): Effect[] {
    return this._show(state, {
      current: msg.payload as number,
      confirming: false,
    });
  }

  prev(_msg: Message, state: QuizState): Effect[] {
    return this._show(state, { current: Math.max(0, state.current - 1) });
  }

  next(_msg: Message, state: QuizState): Effect[] {
    const last = (testOf(state.testId)?.questions.length ?? 1) - 1;
    return this._show(state, { current: Math.min(last, state.current + 1) });
  }

  /** "Submit": asks first when some questions are open. */
  submit(_msg: Message, state: QuizState): Effect[] {
    if (state.unanswered > 0 && !state.confirming) {
      return this._show(state, { confirming: true });
    }
    return this._finish(state);
  }

  keepGoing(_msg: Message, state: QuizState): Effect[] {
    return this._show(state, { confirming: false });
  }

  tick(_msg: Message, state: QuizState): Effect[] {
    if (state.screen !== "quiz") return [time.cancel(TIMER)];
    const remaining = tick(state.remaining);
    if (remaining === 0) return this._finish({ ...state, remaining });
    return this._show(state, { remaining });
  }

  retake(_msg: Message, state: QuizState): Effect[] {
    return this.start({ id: "start", payload: state.testId }, state);
  }

  toggleWrong(_msg: Message, state: QuizState): Effect[] {
    return this._show(state, { onlyWrong: !state.onlyWrong });
  }

  toCatalogue(_msg: Message, state: QuizState): Effect[] {
    return this._show(
      state,
      { screen: "catalogue", testId: "", confirming: false },
      [time.cancel(TIMER)],
    );
  }

  /** The timer is the time plugin's: stop it when the page goes away. */
  leave(): Effect[] {
    return [time.cancel(TIMER)];
  }

  _finish(state: QuizState): Effect[] {
    const test = testOf(state.testId);
    if (!test) return [time.cancel(TIMER)];
    const score = scoreQuiz(test.questions, state.answers, test.pass);
    return this._show(
      state,
      {
        screen: "result",
        remaining: state.remaining,
        confirming: false,
        attempts: [
          ...state.attempts,
          { testId: test.id, percent: score.percent, passed: score.passed },
        ],
      },
      [time.cancel(TIMER)],
    );
  }

  _show(state: QuizState, patch: Partial<Core>, more: Effect[] = []): Effect[] {
    const next: Core = { ...coreOf(state), ...patch };
    const derived = derive(next);
    return [
      ...(Object.keys(patch) as (keyof Core)[]).map((k) =>
        store.set(k, patch[k]),
      ),
      ...(Object.keys(derived) as (keyof Derived)[]).map((k) =>
        store.set(k, derived[k]),
      ),
      ...more,
    ];
  }
}

export const page = new QuizExamPlatform();
