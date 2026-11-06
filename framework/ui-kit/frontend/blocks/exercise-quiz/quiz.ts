/** A multiple choice exercise: one answer or several, checked by a pure function. */

export interface ChoiceOption {
  id: string;
  text: string;
}

export interface ChoiceExercise {
  prompt: string;
  options: ChoiceOption[];
  /** The ids of the right options. More than one makes it "select all". */
  correct: string[];
  /** Show the options in a monospace face (commands). */
  mono?: boolean;
}

/** `""` while answering, then what the last check found. */
export type Verdict = "" | "correct" | "wrong";

export interface ChoiceOptionView extends ChoiceOption {
  selected: boolean;
  /** `correct` once solved, `wrong` for a selected option after a failed check. */
  mark: "" | "correct" | "wrong";
}

export interface ChoiceProps {
  prompt: string;
  multiple: boolean;
  mono: boolean;
  locked: boolean;
  options: ChoiceOptionView[];
}

export const isMultiple = (ex: Pick<ChoiceExercise, "correct">): boolean =>
  ex.correct.length > 1;

/** Pure: the selection after a click: a single choice replaces, several toggle. */
export function toggleChoice(
  ex: ChoiceExercise,
  selected: string[],
  id: string,
): string[] {
  if (!ex.options.some((o) => o.id === id)) return selected;
  if (!isMultiple(ex)) return [id];
  const next = selected.includes(id)
    ? selected.filter((s) => s !== id)
    : [...selected, id];
  return ex.options.map((o) => o.id).filter((o) => next.includes(o));
}

/** Pure: is the selection exactly the right set? */
export function checkChoice(ex: ChoiceExercise, selected: string[]): boolean {
  return (
    selected.length === ex.correct.length &&
    ex.correct.every((id) => selected.includes(id))
  );
}

/** Pure: what the block shows. After a failed check the wrong picks are marked but the answer is not given away. */
export function choiceProps(
  ex: ChoiceExercise,
  selected: string[],
  verdict: Verdict,
): ChoiceProps {
  return {
    prompt: ex.prompt,
    multiple: isMultiple(ex),
    mono: ex.mono === true,
    locked: verdict === "correct",
    options: ex.options.map((o) => {
      const picked = selected.includes(o.id);
      const mark =
        verdict === "correct" && ex.correct.includes(o.id)
          ? "correct"
          : verdict === "wrong" && picked && !ex.correct.includes(o.id)
            ? "wrong"
            : "";
      return { ...o, selected: picked, mark };
    }),
  };
}
