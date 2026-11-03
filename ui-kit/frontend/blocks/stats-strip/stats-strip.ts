import { Component } from "@service-laboratory/pavlus";
import view from "./stats-strip.pavlus";

export interface Stat {
  value: string;
  label: string;
}

export interface StatsStripState {
  stats: Stat[];
}

export const initial: StatsStripState = {
  stats: [
    { value: "120k", label: "active users" },
    { value: "4.8/5", label: "average rating" },
    { value: "2.3M", label: "tasks finished" },
    { value: "99.98%", label: "uptime this year" },
  ],
};

/** Only data: the page has no messages of its own. */
export class StatsStripPage extends Component<StatsStripState> {
  view = view;
}

export const page = new StatsStripPage();
