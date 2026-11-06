/**
 * A fill-in-the-gaps exercise. The text is written with gaps in double
 * brackets and the accepted answers split by `|`: `git [[commit|ci]] -m "x"`.
 * A line break in the text is a line break on the screen (code).
 */

export interface Gap {
  id: string;
  /** Every answer that counts as right. */
  accepted: string[];
}

export type SegmentKind = "text" | "gap" | "br";

export interface Segment {
  id: string;
  kind: SegmentKind;
  text: string;
}

export interface GapExercise {
  prompt: string;
  /** The text with `[[answer|other]]` gaps. */
  template: string;
  /** Show the text as code. */
  code?: boolean;
}

export interface Parsed {
  segments: Segment[];
  gaps: Gap[];
}

/** Pure: split a template into text, line breaks and gaps. */
export function parseGaps(template: string): Parsed {
  const segments: Segment[] = [];
  const gaps: Gap[] = [];
  const re = /\[\[([^\]]*)\]\]|\n/g;
  let last = 0;
  let n = 0;
  const text = (to: number) => {
    if (to > last)
      segments.push({
        id: `t${n++}`,
        kind: "text",
        text: template.slice(last, to),
      });
  };
  for (const m of template.matchAll(re)) {
    const at = m.index ?? 0;
    text(at);
    if (m[0] === "\n") segments.push({ id: `t${n++}`, kind: "br", text: "" });
    else {
      const id = `g${gaps.length}`;
      gaps.push({ id, accepted: m[1].split("|").map((a) => a.trim()) });
      segments.push({ id, kind: "gap", text: "" });
    }
    last = at + m[0].length;
  }
  text(template.length);
  return { segments, gaps };
}

/** Pure: an answer without the extra spaces around and inside it. */
export const normalize = (answer: string): string =>
  answer.trim().replace(/\s+/g, " ");

/** `ok`, `bad` (a wrong answer), `empty`, or nothing before the first check. */
export type GapMark = "" | "ok" | "bad" | "empty";

export interface GapCheck {
  /** Every gap is right. */
  ok: boolean;
  marks: Record<string, GapMark>;
  /** How many gaps are right. */
  right: number;
}

/** Pure: check the typed answers (by gap id) against the accepted ones. */
export function checkGaps(
  gaps: Gap[],
  answers: Record<string, string>,
): GapCheck {
  const marks: Record<string, GapMark> = {};
  let right = 0;
  for (const gap of gaps) {
    const given = normalize(answers[gap.id] ?? "");
    if (given === "") marks[gap.id] = "empty";
    else if (gap.accepted.some((a) => normalize(a) === given)) {
      marks[gap.id] = "ok";
      right++;
    } else marks[gap.id] = "bad";
  }
  return { ok: gaps.length > 0 && right === gaps.length, marks, right };
}

export interface SegmentView extends Segment {
  value: string;
  /** The width of the input in characters. */
  width: number;
  mark: GapMark;
}

export interface GapProps {
  prompt: string;
  code: boolean;
  segments: SegmentView[];
  /** Typing is off once the exercise is solved. */
  locked: boolean;
}

/** Pure: what the block shows. `marks` is empty before the first check. */
export function gapProps(
  ex: GapExercise,
  answers: Record<string, string>,
  marks: Record<string, GapMark>,
  locked: boolean,
): GapProps {
  const { segments, gaps } = parseGaps(ex.template);
  return {
    prompt: ex.prompt,
    code: ex.code === true,
    locked,
    segments: segments.map((s) => {
      const gap = gaps.find((g) => g.id === s.id);
      return {
        ...s,
        value: s.kind === "gap" ? (answers[s.id] ?? "") : "",
        width: gap
          ? Math.max(5, Math.max(...gap.accepted.map((a) => a.length)) + 2)
          : 0,
        mark: s.kind === "gap" ? (marks[s.id] ?? "") : "",
      };
    }),
  };
}

/** Pure: the first accepted answer of every gap (the solution). */
export function solutionOf(ex: GapExercise): Record<string, string> {
  const answers: Record<string, string> = {};
  for (const g of parseGaps(ex.template).gaps) answers[g.id] = g.accepted[0];
  return answers;
}
