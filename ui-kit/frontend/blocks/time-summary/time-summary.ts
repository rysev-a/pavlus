import { Component } from "@service-laboratory/pavlus";
import { summaryView, type SummaryView } from "./summary.ts";
import view from "./time-summary.pavlus";

export interface TimeSummaryState {
  day: SummaryView;
  week: SummaryView;
}

const CATS = [
  { id: "work", name: "Work", tone: "c1" },
  { id: "study", name: "Study", tone: "c2" },
  { id: "sport", name: "Sport", tone: "c3" },
  { id: "family", name: "Family", tone: "c4" },
  { id: "sleep", name: "Sleep", tone: "pr" },
];

export const initial: TimeSummaryState = {
  day: summaryView(
    "Today",
    { work: 330, study: 60, sport: 0, family: 60, sleep: 420 },
    CATS,
    { work: 360, sport: 60 },
  ),
  week: summaryView(
    "This week",
    { work: 1680, study: 420, sport: 330, family: 600, sleep: 2900 },
    CATS,
    { work: 2400, study: 360, sport: 300, sleep: 3000 },
  ),
};

/** Only data: the page has no messages of its own. */
export class TimeSummaryPage extends Component<TimeSummaryState> {
  view = view;
}

export const page = new TimeSummaryPage();
