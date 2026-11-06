/**
 * The exercises of the course as data, and the pure functions that check an
 * answer to each kind: multiple choice, gaps, order and a terminal task.
 */
import {
  type ChoiceExercise,
  checkChoice,
} from "../../blocks/exercise-quiz/quiz.ts";
import {
  type GapExercise,
  checkGaps,
  parseGaps,
} from "../../blocks/exercise-gaps/gaps.ts";
import {
  type OrderExercise,
  checkOrder,
} from "../../blocks/exercise-order/order.ts";
import type { Fs } from "../../blocks/terminal-sim/fs.ts";
import { type Goal, allMet, verify } from "../../blocks/terminal-sim/goals.ts";

interface Base {
  id: string;
  /** What the exercise is worth, before hints and wrong checks. */
  xp: number;
  /** Shown one at a time; each costs XP. */
  hints: string[];
  /** Said when the answer is right. */
  explain: string;
}

export interface TerminalExercise extends Base {
  kind: "terminal";
  prompt: string;
  /** The files the learner starts with, and the folder. */
  files: Record<string, string | null>;
  cwd: string;
  /** Commands run before the learner gets the terminal (a repository to start from). */
  setup: string[];
  goals: Goal[];
  intro: string[];
}

export type Exercise =
  | (Base & { kind: "choice"; ex: ChoiceExercise })
  | (Base & { kind: "gaps"; ex: GapExercise })
  | (Base & { kind: "order"; ex: OrderExercise })
  | TerminalExercise;

export type Answer =
  | { kind: "choice"; selected: string[] }
  | { kind: "gaps"; answers: Record<string, string> }
  | { kind: "order"; order: string[] }
  | { kind: "terminal"; fs: Fs; cwd: string };

export interface CheckResult {
  ok: boolean;
  /** What to tell the learner: the explanation when right, a nudge when not. */
  message: string;
  /** How many parts are right out of how many (gaps, goals), else 0 of 0. */
  right: number;
  total: number;
}

/**
 * Pure: check an answer. An answer of the wrong kind for the exercise is
 * simply not right, so a late message from a previous exercise cannot score.
 */
export function checkExercise(ex: Exercise, answer: Answer): CheckResult {
  if (ex.kind !== answer.kind) {
    return {
      ok: false,
      message: "That answer is for another exercise.",
      right: 0,
      total: 0,
    };
  }
  switch (ex.kind) {
    case "choice": {
      const a = answer as Extract<Answer, { kind: "choice" }>;
      if (a.selected.length === 0)
        return {
          ok: false,
          message: "Pick an answer first.",
          right: 0,
          total: 0,
        };
      const ok = checkChoice(ex.ex, a.selected);
      return {
        ok,
        message: ok
          ? ex.explain
          : "Not quite. Read the question again, or ask for a hint.",
        right: ok ? 1 : 0,
        total: 1,
      };
    }
    case "gaps": {
      const a = answer as Extract<Answer, { kind: "gaps" }>;
      const gaps = parseGaps(ex.ex.template).gaps;
      const r = checkGaps(gaps, a.answers);
      const empty = Object.values(r.marks).filter((m) => m === "empty").length;
      return {
        ok: r.ok,
        message: r.ok
          ? ex.explain
          : empty === gaps.length
            ? "Fill in the gaps first."
            : `${r.right} of ${gaps.length} gaps are right. Fix the red ones.`,
        right: r.right,
        total: gaps.length,
      };
    }
    case "order": {
      const a = answer as Extract<Answer, { kind: "order" }>;
      const ok = checkOrder(ex.ex, a.order);
      return {
        ok,
        message: ok
          ? ex.explain
          : "Not in order yet. The green lines are already in the right place.",
        right: 0,
        total: 0,
      };
    }
    case "terminal": {
      const a = answer as Extract<Answer, { kind: "terminal" }>;
      const results = verify(a.fs, a.cwd, ex.goals);
      const right = results.filter((r) => r.ok).length;
      const ok = allMet(results);
      return {
        ok,
        message: ok
          ? ex.explain
          : `${right} of ${results.length} goals reached. Keep going in the terminal.`,
        right,
        total: results.length,
      };
    }
  }
}
