import { HINT_COST } from "../xp-bar/xp.ts";

export interface FooterProps {
  status: "" | "correct" | "wrong";
  feedback: string;
  /** `+15 XP` once solved. */
  xpText: string;
  hints: { id: number; text: string }[];
  hintsLeft: number;
  hintLabel: string;
  canCheck: boolean;
  checkLabel: string;
  nextLabel: string;
  resetLabel: string;
}

export interface FooterInput {
  status: FooterProps["status"];
  feedback?: string;
  /** All the hints of the exercise, and how many were asked for. */
  hints: string[];
  hintsShown: number;
  /** XP the exercise gave (shown once solved). */
  xp?: number;
  canCheck?: boolean;
  checkLabel?: string;
  last?: boolean;
  resetLabel?: string;
}

/** Pure: the props of the footer from what the exercise knows. */
export function footerProps(input: FooterInput): FooterProps {
  const shown = Math.min(input.hintsShown, input.hints.length);
  const solved = input.status === "correct";
  return {
    status: input.status,
    feedback: input.feedback ?? "",
    xpText: solved && input.xp !== undefined ? `+${input.xp} XP` : "",
    hints: input.hints.slice(0, shown).map((text, id) => ({ id, text })),
    hintsLeft: solved ? 0 : input.hints.length - shown,
    hintLabel: `Hint (-${HINT_COST} XP)`,
    canCheck: input.canCheck ?? true,
    checkLabel: input.checkLabel ?? "Check",
    nextLabel: input.last ? "Finish lesson" : "Next exercise",
    resetLabel: input.resetLabel ?? "",
  };
}
