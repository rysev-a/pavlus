import {
  Component,
  type Effect,
  type Message,
} from "@service-laboratory/pavlus";
import { storeEffector as store } from "@service-laboratory/pavlus/plugins";
import view from "./experience-list.pavlus";

export interface Position {
  id: string;
  role: string;
  company: string;
  companyId: string;
  emoji: string;
  tone: number;
  /** Start and end as a year and a month number: 2021.03. `end` 0 = now. */
  start: number;
  end: number;
  place: string;
  text: string;
}

export interface PositionRow extends Position {
  period: string;
  current: boolean;
}

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/** Pure: `2021.03` → `Mar 2021`. */
export function monthLabel(ym: number): string {
  const year = Math.floor(ym);
  const month = Math.round((ym - year) * 100);
  return `${MONTHS[Math.min(Math.max(month, 1), 12) - 1]} ${year}`;
}

/** Pure: how long, in a short text: `2 yrs 3 mos`, relative to `now` (a ym). */
export function duration(start: number, end: number, now: number): string {
  const months = (ym: number) =>
    Math.floor(ym) * 12 + Math.round((ym - Math.floor(ym)) * 100) - 1;
  const total = Math.max(0, months(end === 0 ? now : end) - months(start) + 1);
  const y = Math.floor(total / 12);
  const m = total % 12;
  const parts = [
    y > 0 ? `${y} ${y === 1 ? "yr" : "yrs"}` : "",
    m > 0 ? `${m} ${m === 1 ? "mo" : "mos"}` : "",
  ].filter(Boolean);
  return parts.join(" ") || "1 mo";
}

/** Pure: the rows, newest first, with the period text. `now` is a ym. */
export function positionRows(list: Position[], now: number): PositionRow[] {
  return [...list]
    .sort(
      (a, b) =>
        (b.end === 0 ? 9999 : b.end) - (a.end === 0 ? 9999 : a.end) ||
        b.start - a.start,
    )
    .map((p) => ({
      ...p,
      period: `${monthLabel(p.start)} - ${p.end === 0 ? "Present" : monthLabel(p.end)} (${duration(p.start, p.end, now)})`,
      current: p.end === 0,
    }));
}

export const NOW = 2026.11;

const SAMPLE: Position[] = [
  {
    id: "e1",
    role: "Senior product designer",
    company: "Lumo Studio",
    companyId: "lumo",
    emoji: "💡",
    tone: 4,
    start: 2023.02,
    end: 0,
    place: "Lisbon",
    text: "Lead designer for the mobile apps of three clients. Built the studio design system.",
  },
  {
    id: "e2",
    role: "Product designer",
    company: "Northwind",
    companyId: "northwind",
    emoji: "🧭",
    tone: 2,
    start: 2020.06,
    end: 2023.01,
    place: "Remote",
    text: "Shipped the onboarding redesign that lifted activation by 18 percent.",
  },
];

export interface ExperienceState {
  jobs: { title: string; items: PositionRow[] };
  last: string;
}

export const initial: ExperienceState = {
  jobs: { title: "Experience", items: positionRows(SAMPLE, NOW) },
  last: "No company opened.",
};

export class ExperienceListPage extends Component<ExperienceState> {
  view = view;

  "jobs.company"(msg: Message): Effect[] {
    return [store.set("last", `Open the page of ${String(msg.payload)}.`)];
  }
}

export const page = new ExperienceListPage();
