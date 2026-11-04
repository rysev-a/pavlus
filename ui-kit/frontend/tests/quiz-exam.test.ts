import { expect, test } from "vitest";
import {
  formatClock,
  tick,
  timerProps,
  toneOf,
} from "../blocks/countdown-timer/countdown-timer.ts";
import {
  navItems,
  nextOpen,
  summaryOf,
} from "../blocks/question-navigator/question-navigator.ts";
import {
  isCorrect,
  markOf,
  questionProps,
  scoreQuiz,
  toggleAnswer,
  type Question,
} from "../blocks/quiz-question/quiz-question.ts";
import { TESTS } from "../templates/quiz-exam-platform/quiz-data.ts";
import {
  answeredIndexes,
  catalogue,
  derive,
  headline,
  resultView,
  reviewOf,
  timeUsed,
} from "../templates/quiz-exam-platform/quiz-exam-platform.ts";

const single: Question = {
  id: "q1",
  text: "One?",
  options: [
    { id: "a", text: "A" },
    { id: "b", text: "B" },
    { id: "c", text: "C" },
  ],
  correct: ["b"],
  explanation: "B.",
};
const multi: Question = {
  id: "q2",
  text: "Many?",
  options: [
    { id: "a", text: "A" },
    { id: "b", text: "B" },
    { id: "c", text: "C" },
    { id: "d", text: "D" },
  ],
  correct: ["a", "c"],
  explanation: "A and C.",
};

test("a single choice replaces, a multiple choice toggles", () => {
  expect(toggleAnswer(single, ["a"], "c")).toEqual(["c"]);
  expect(toggleAnswer(single, ["c"], "c")).toEqual(["c"]);
  expect(toggleAnswer(multi, [], "c")).toEqual(["c"]);
  // the order of the options is kept, so equal answers are equal arrays
  expect(toggleAnswer(multi, ["c"], "a")).toEqual(["a", "c"]);
  expect(toggleAnswer(multi, ["a", "c"], "a")).toEqual(["c"]);
  // not an option of the question
  expect(toggleAnswer(multi, ["a"], "z")).toEqual(["a"]);
});

test("a multiple choice answer is all or nothing", () => {
  expect(isCorrect(single, ["b"])).toBe(true);
  expect(isCorrect(single, [])).toBe(false);
  expect(isCorrect(multi, ["c", "a"])).toBe(true);
  expect(isCorrect(multi, ["a"])).toBe(false);
  expect(isCorrect(multi, ["a", "c", "d"])).toBe(false);
});

test("scoring: correct, percent, pass mark and unanswered", () => {
  const qs = [single, multi];
  const all = scoreQuiz(qs, { q1: ["b"], q2: ["a", "c"] }, 70);
  expect(all).toMatchObject({
    correct: 2,
    total: 2,
    percent: 100,
    passed: true,
    answered: 2,
  });
  const half = scoreQuiz(qs, { q1: ["b"], q2: ["a"] }, 70);
  expect(half).toMatchObject({ correct: 1, percent: 50, passed: false });
  expect(half.results.map((r) => r.correct)).toEqual([true, false]);
  // exactly on the pass mark passes
  expect(scoreQuiz(qs, { q1: ["b"] }, 50).passed).toBe(true);
  const none = scoreQuiz(qs, {}, 50);
  expect(none).toMatchObject({
    correct: 0,
    answered: 0,
    percent: 0,
    passed: false,
  });
  // rounding
  const three = scoreQuiz(
    [single, { ...single, id: "q9" }, { ...single, id: "q3" }],
    { q1: ["b"] },
    30,
  );
  expect(three.percent).toBe(33);
  // an empty test never passes
  expect(scoreQuiz([], {}, 0).passed).toBe(false);
});

test("every test in the catalogue is well formed", () => {
  for (const test of TESTS) {
    expect(test.questions.length).toBeGreaterThanOrEqual(5);
    for (const q of test.questions) {
      const ids = q.options.map((o) => o.id);
      expect(new Set(ids).size).toBe(ids.length);
      expect(q.correct.length).toBeGreaterThan(0);
      expect(q.correct.every((id) => ids.includes(id))).toBe(true);
      expect(q.explanation.length).toBeGreaterThan(10);
    }
    // picking all the right answers passes every test
    const answers = Object.fromEntries(
      test.questions.map((q) => [q.id, q.correct]),
    );
    expect(scoreQuiz(test.questions, answers, test.pass).percent).toBe(100);
  }
  expect(TESTS.some((t) => t.questions.some((q) => q.correct.length > 1))).toBe(
    true,
  );
});

test("marks and the props of a revealed question", () => {
  expect(markOf(multi, ["a", "d"], "a")).toBe("correct");
  expect(markOf(multi, ["a", "d"], "d")).toBe("wrong");
  expect(markOf(multi, ["a", "d"], "c")).toBe("missed");
  expect(markOf(multi, ["a", "d"], "b")).toBe("");
  const open = questionProps(multi, 2, 5, ["a"], false);
  expect(open.options.every((o) => o.mark === "")).toBe(true);
  expect(open.multiple).toBe(true);
  expect(open.explanation).toBe("");
  const shown = questionProps(multi, 2, 5, ["a", "c"], true);
  expect(shown.verdict).toBe("correct");
  expect(shown.explanation).toBe("A and C.");
  expect(questionProps(single, 1, 5, [], true).verdict).toBe("skipped");
  expect(questionProps(single, 1, 5, ["a"], true).verdict).toBe("wrong");
});

test("the countdown: clock, tone and tick", () => {
  expect(formatClock(0)).toBe("00:00");
  expect(formatClock(65)).toBe("01:05");
  expect(formatClock(600)).toBe("10:00");
  expect(formatClock(-4)).toBe("00:00");
  expect(tick(3)).toBe(2);
  expect(tick(0)).toBe(0);
  expect(toneOf(300, 300)).toBe("ok");
  expect(toneOf(70, 300)).toBe("warn");
  expect(toneOf(25, 300)).toBe("danger");
  expect(toneOf(9, 20)).toBe("danger");
  const p = timerProps(150, 300);
  expect(p).toMatchObject({
    clock: "02:30",
    percent: 50,
    tone: "ok",
    finished: false,
  });
  expect(timerProps(0, 300).finished).toBe(true);
  expect(timerProps(0, 0).percent).toBe(0);
});

test("the navigator marks current, answered and flagged questions", () => {
  const items = navItems(5, 2, [0, 2], [1]);
  expect(items.map((i) => i.n)).toEqual([1, 2, 3, 4, 5]);
  expect(items[2]).toMatchObject({ current: true, answered: true });
  expect(items[1].flagged).toBe(true);
  expect(summaryOf(items)).toEqual({ answered: 2, flagged: 1, left: 3 });
  expect(nextOpen(items, 2)).toBe(3);
  expect(nextOpen(navItems(3, 0, [0, 1, 2], []), 0)).toBe(-1);
  expect(nextOpen(items, 4)).toBe(1);
});

test("the platform: results, review and the catalogue", () => {
  const test = TESTS[0];
  const answers = Object.fromEntries(
    test.questions.map((q) => [q.id, q.correct]),
  );
  answers[test.questions[0].id] = ["a"]; // one wrong
  const score = scoreQuiz(test.questions, answers, test.pass);
  const res = resultView(test, score, 300, 95);
  expect(res.correct).toBe(test.questions.length - 1);
  expect(res.used).toBe("03:25");
  expect(res.timeUp).toBe(false);
  expect(resultView(test, score, 300, 0).timeUp).toBe(true);
  expect(reviewOf(test, answers, score, false)).toHaveLength(
    test.questions.length,
  );
  const wrong = reviewOf(test, answers, score, true);
  expect(wrong.map((r) => r.index)).toEqual([0]);
  expect(wrong[0].question.reveal).toBe(true);
  expect(answeredIndexes(test, { [test.questions[1].id]: ["a"] })).toEqual([1]);
  expect(timeUsed(300, 300)).toBe("00:00");
  expect(headline(100, true)).toBe("Flawless!");
  expect(headline(80, true)).toBe("You passed");
  expect(headline(55, false)).toBe("So close");
  expect(headline(10, false)).toBe("Not this time");
  const cards = catalogue(TESTS, [
    { testId: "js", percent: 40, passed: false },
    { testId: "js", percent: 85, passed: true },
  ]);
  expect(cards.find((c) => c.id === "js")?.best).toBe(85);
  expect(cards.find((c) => c.id === "geo")?.bestLabel).toBe("Not taken yet");
});

test("deriving the quiz screen from the core state", () => {
  const d = derive({
    screen: "quiz",
    testId: "js",
    current: 1,
    answers: { js1: ["b"] },
    flagged: [1],
    total: 300,
    remaining: 120,
    confirming: false,
    onlyWrong: false,
    attempts: [],
  });
  expect(d.question?.number).toBe(2);
  expect(d.timer.clock).toBe("02:00");
  expect(d.summary).toMatchObject({ answered: 1, flagged: 1 });
  expect(d.unanswered).toBe(TESTS[0].questions.length - 1);
  expect(d.result).toBeNull();
});
