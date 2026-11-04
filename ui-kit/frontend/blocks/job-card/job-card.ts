import {
  Component,
  type Effect,
  type Message,
} from "@service-laboratory/pavlus";
import { storeEffector as store } from "@service-laboratory/pavlus/plugins";
import view from "./job-card.pavlus";

export interface JobData {
  id: string;
  title: string;
  company: string;
  companyId: string;
  emoji: string;
  tone: number;
  place: string;
  kind: string;
  /** Yearly pay in thousands (0 = not shown). */
  salaryK: number;
  hours: number;
  ago: string;
  tags: string[];
  level: string;
}

export interface JobProps extends JobData {
  salary: string;
  saved: boolean;
  applied: boolean;
}

/** Pure: `120` → `$120k a year`, 0 → `Pay not shown`. */
export const salaryLabel = (k: number): string =>
  k > 0 ? `$${k}k a year` : "Pay not shown";

/** Pure: the cards with my saved and applied marks. */
export function jobProps(
  list: JobData[],
  saved: string[],
  applied: string[],
): JobProps[] {
  return list.map((j) => ({
    ...j,
    salary: salaryLabel(j.salaryK),
    saved: saved.includes(j.id),
    applied: applied.includes(j.id),
  }));
}

/** Pure: an id in or out of a list. */
export const toggleId = (ids: string[], id: string): string[] =>
  ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id];

/** Pure: an id added once. */
export const addId = (ids: string[], id: string): string[] =>
  ids.includes(id) ? ids : [...ids, id];

const SAMPLE: JobData[] = [
  {
    id: "j1",
    title: "Senior product designer",
    company: "Lumo Studio",
    companyId: "lumo",
    emoji: "💡",
    tone: 4,
    place: "Lisbon",
    kind: "Hybrid",
    salaryK: 95,
    hours: 20,
    ago: "1d ago",
    tags: ["Figma", "Design systems"],
    level: "Senior",
  },
  {
    id: "j2",
    title: "Frontend engineer",
    company: "Northwind",
    companyId: "northwind",
    emoji: "🧭",
    tone: 2,
    place: "Remote",
    kind: "Full-time",
    salaryK: 120,
    hours: 70,
    ago: "3d ago",
    tags: ["TypeScript", "Vite"],
    level: "Mid",
  },
];

export interface JobCardState {
  saved: string[];
  applied: string[];
  jobs: JobProps[];
  last: string;
}

export const initial: JobCardState = {
  saved: ["j2"],
  applied: [],
  jobs: jobProps(SAMPLE, ["j2"], []),
  last: "Nothing clicked yet.",
};

export class JobCardPage extends Component<JobCardState> {
  view = view;

  _show(saved: string[], applied: string[], last: string): Effect[] {
    return [
      store.set("saved", saved),
      store.set("applied", applied),
      store.set("jobs", jobProps(SAMPLE, saved, applied)),
      store.set("last", last),
    ];
  }

  "job.save"(msg: Message, state: JobCardState): Effect[] {
    return this._show(
      toggleId(state.saved, msg.payload as string),
      state.applied,
      "Saved or unsaved.",
    );
  }

  "job.apply"(msg: Message, state: JobCardState): Effect[] {
    return this._show(
      state.saved,
      addId(state.applied, msg.payload as string),
      "Application sent.",
    );
  }

  "job.open"(msg: Message): Effect[] {
    return [store.set("last", `Open ${String(msg.payload)}.`)];
  }

  "job.company"(msg: Message): Effect[] {
    return [store.set("last", `Open the page of ${String(msg.payload)}.`)];
  }
}

export const page = new JobCardPage();
