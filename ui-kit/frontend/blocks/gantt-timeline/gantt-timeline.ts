import { Component } from "@service-laboratory/pavlus";
import {
  pctOf,
  type Span,
  type TimelineRow,
  timelineRows,
  type Week,
  weeksFrom,
} from "./timeline.ts";
import view from "./gantt-timeline.pavlus";

export interface GanttState {
  weeks: Week[];
  rows: TimelineRow[];
  today: number;
}

const DAYS = 56;
const SPANS: Span[] = [
  {
    id: "site",
    name: "Website redesign",
    sub: "Northwind",
    start: 0,
    end: 33,
    progress: 70,
    tone: "info",
    milestones: [
      { at: 10, label: "Wireframes approved", done: true },
      { at: 33, label: "Launch", done: false },
    ],
  },
  {
    id: "brand",
    name: "Brand identity",
    sub: "Acme Inc",
    start: 8,
    end: 41,
    progress: 35,
    tone: "warning",
    milestones: [{ at: 24, label: "Logo review", done: false }],
  },
  {
    id: "app",
    name: "Mobile app",
    sub: "Globex",
    start: 21,
    end: 55,
    progress: 8,
    tone: "success",
    milestones: [{ at: 42, label: "Beta", done: false }],
  },
];

export const initial: GanttState = {
  weeks: weeksFrom(2026, 10, 26, DAYS),
  rows: timelineRows(SPANS, DAYS),
  today: pctOf(8.5, DAYS),
};

/** Only data: the page has no messages of its own. */
export class GanttPage extends Component<GanttState> {
  view = view;
}

export const page = new GanttPage();
