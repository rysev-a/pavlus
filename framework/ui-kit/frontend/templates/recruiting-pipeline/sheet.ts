import {
  button,
  type Field,
  field,
  selectField,
  type SheetButton,
  valuesOf,
} from "../../blocks/record-sheet/sheet.ts";
import { clockOf, addDays } from "../../blocks/week-calendar/dates.ts";
import {
  type Candidate,
  type InterviewDraft,
  type Job,
  KINDS,
  type OfferDraft,
  suggestedStart,
  TODAY,
} from "./rec.ts";

export interface SheetState {
  open: boolean;
  kind: "offer" | "interview";
  /** The candidate an offer is for. */
  cand: string;
  title: string;
  description: string;
  fields: Field[];
  buttons: SheetButton[];
}

const withErrors = (fields: Field[], errors: Record<string, string>): Field[] =>
  fields.map((f) => ({ ...f, error: errors[f.id] ?? "" }));

export function offerSheet(
  c: Candidate,
  job: Job,
  d: OfferDraft,
  errors: Record<string, string> = {},
): SheetState {
  return {
    open: true,
    kind: "offer",
    cand: c.id,
    title: `Offer for ${c.name}`,
    description: `${job.title}. The range is ${job.min}k to ${job.max}k; they expect ${c.expected}k.`,
    fields: withErrors(
      [
        field("salary", "Yearly salary (thousands)", d.salary, {
          kind: "number",
          placeholder: String(c.expected),
          hint: "For example 105 means $105,000.",
        }),
        field("bonus", "Yearly bonus (thousands)", d.bonus, {
          kind: "number",
          hint: "At most 30% of the salary. Leave empty for none.",
        }),
        field("start", "Start date", d.start, { kind: "date" }),
      ],
      errors,
    ),
    buttons: [button("save", "Send the offer")],
  };
}

export const newOfferDraft = (c: Candidate): OfferDraft => ({
  salary: String(c.expected),
  bonus: "",
  start: suggestedStart(TODAY),
});

export const offerDraftOf = (fields: Field[]): OfferDraft => {
  const v = valuesOf(fields);
  return { salary: v.salary, bonus: v.bonus, start: v.start };
};

/** Half-hour slots from 09:00 to 17:30. */
export const SLOTS: [string, string][] = Array.from({ length: 18 }, (_, i) => {
  const t = clockOf(9 * 60 + i * 30);
  return [t, t];
});

export const DURATIONS: [string, string][] = [
  ["30", "30 minutes"],
  ["45", "45 minutes"],
  ["60", "1 hour"],
  ["90", "90 minutes"],
];

export function interviewSheet(
  cands: Candidate[],
  d: InterviewDraft,
  errors: Record<string, string> = {},
): SheetState {
  return {
    open: true,
    kind: "interview",
    cand: d.cand,
    title: "Schedule an interview",
    description: "Pick the person, the kind of talk and a free time.",
    fields: withErrors(
      [
        selectField(
          "cand",
          "Candidate",
          d.cand,
          cands.map((c) => [c.id, `${c.name}, ${c.role}`]),
        ),
        selectField(
          "kind",
          "Kind",
          d.kind,
          KINDS.map(([id, label]) => [id, label]),
        ),
        field("day", "Day", d.day, { kind: "date" }),
        selectField("time", "Time", d.time, SLOTS),
        selectField("dur", "Length", d.dur, DURATIONS),
      ],
      errors,
    ),
    buttons: [button("save", "Schedule")],
  };
}

export const newInterviewDraft = (cand: string): InterviewDraft => ({
  cand,
  kind: "phone",
  day: addDays(TODAY, 3),
  time: "10:00",
  dur: "45",
});

export const interviewDraftOf = (fields: Field[]): InterviewDraft => {
  const v = valuesOf(fields);
  return { cand: v.cand, kind: v.kind, day: v.day, time: v.time, dur: v.dur };
};

export const closedSheet = (cands: Candidate[]): SheetState => ({
  ...interviewSheet(cands, newInterviewDraft(cands[0].id)),
  open: false,
});
