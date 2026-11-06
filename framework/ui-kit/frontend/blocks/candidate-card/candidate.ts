import type { Tone } from "../admin-shell/shell.ts";
import { initials } from "../admin-shell/shell.ts";

export interface Stage {
  id: string;
  title: string;
  tone: Tone;
}

export interface Person {
  id: string;
  name: string;
  role: string;
  email: string;
  location: string;
  source: string;
  /** Expected yearly salary in thousands. */
  expected: number;
  skills: string[];
  note: string;
  stage: string;
}

export interface CandidateView {
  id: string;
  name: string;
  initials: string;
  role: string;
  stage: string;
  tone: Tone;
  facts: { label: string; value: string }[];
  skills: string[];
  note: string;
  /** The label of the button that moves the candidate on, or empty at the end. */
  advance: string;
  canReject: boolean;
  closed: boolean;
}

/** Pure: the next stage id after this one (not past the end, never "rejected"). */
export function nextStage(order: string[], current: string): string {
  const i = order.indexOf(current);
  return i < 0 || i >= order.length - 1 ? current : order[i + 1];
}

/** Pure: the props of the card. `order` is the line of stages from start to hired. */
export function candidateView(
  p: Person,
  stages: Stage[],
  order: string[],
): CandidateView {
  const stage = stages.find((s) => s.id === p.stage);
  const next = nextStage(order, p.stage);
  const nextTitle = stages.find((s) => s.id === next)?.title ?? "";
  const closed = p.stage === "rejected" || p.stage === order[order.length - 1];
  return {
    id: p.id,
    name: p.name,
    initials: initials(p.name),
    role: p.role,
    stage: stage?.title ?? p.stage,
    tone: stage?.tone ?? "default",
    facts: [
      { label: "Email", value: p.email },
      { label: "Location", value: p.location },
      { label: "Source", value: p.source },
      { label: "Expects", value: `$${p.expected}k a year` },
    ],
    skills: p.skills,
    note: p.note,
    advance: closed || next === p.stage ? "" : `Move to ${nextTitle}`,
    canReject: p.stage !== "rejected" && p.stage !== order[order.length - 1],
    closed,
  };
}
