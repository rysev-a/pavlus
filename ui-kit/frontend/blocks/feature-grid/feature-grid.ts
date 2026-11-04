import { Component } from "@service-laboratory/pavlus";
import view from "./feature-grid.pavlus";

export interface Feature {
  icon: string;
  title: string;
  text: string;
}

export interface FeatureGridState {
  items: Feature[];
  short: Feature[];
}

const items: Feature[] = [
  {
    icon: "zap",
    title: "Instant capture",
    text: "Press one key anywhere and the thought is in your inbox before you lose it.",
  },
  {
    icon: "calendar",
    title: "Smart scheduling",
    text: "Drag a task onto the week and it blocks the time, around your meetings.",
  },
  {
    icon: "users",
    title: "Shared projects",
    text: "Invite people, assign work and see who is on what without a status meeting.",
  },
  {
    icon: "repeat",
    title: "Recurring routines",
    text: "Weekly reviews and monthly reports create themselves when they are due.",
  },
  {
    icon: "chart",
    title: "Honest reports",
    text: "See where the hours went and which projects quietly slip.",
  },
  {
    icon: "lock",
    title: "Private by default",
    text: "End-to-end encrypted notes and a data export that is one click away.",
  },
];

export const initial: FeatureGridState = { items, short: items.slice(0, 3) };

/** Only data: the page has no messages of its own. */
export class FeatureGridPage extends Component<FeatureGridState> {
  view = view;
}

export const page = new FeatureGridPage();
