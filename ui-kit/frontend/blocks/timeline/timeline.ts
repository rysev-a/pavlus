import { Component } from "@service-laboratory/pavlus";
import view from "./timeline.pavlus";

export interface TimelineItem {
  key: string;
  /** `2022 - now`, `Mar 2021`... */
  period: string;
  title: string;
  org?: string;
  text?: string;
  points?: string[];
  tags?: string[];
}

export type FullItem = Required<TimelineItem>;

/** The view reads org, text, points and tags: fill what an entry leaves out. */
export function withLists(items: TimelineItem[]): FullItem[] {
  return items.map((item) => ({
    org: "",
    text: "",
    points: [],
    tags: [],
    ...item,
  }));
}

export interface TimelineState {
  work: FullItem[];
  releases: FullItem[];
}

export const initial: TimelineState = {
  work: withLists([
    {
      key: "w3",
      period: "2023 - now",
      title: "Senior frontend engineer",
      org: "Northwind Labs",
      points: [
        "Led the move of the checkout to a typed, pure-function core.",
        "Cut the bundle by 38% and the time to interactive to 1.4 s.",
      ],
      tags: ["TypeScript", "Vite"],
    },
    {
      key: "w2",
      period: "2020 - 2023",
      title: "Frontend engineer",
      org: "Brightside",
      text: "Built the design system and the dashboard used by 40k merchants.",
      tags: ["React", "Design systems"],
    },
    {
      key: "w1",
      period: "2018 - 2020",
      title: "Junior developer",
      org: "Pixel Barn",
      text: "Shipped marketing sites and small web apps for local businesses.",
    },
  ]),
  releases: withLists([
    {
      key: "r3",
      period: "Nov 2026",
      title: "Version 3.0",
      text: "Dark mode and offline support.",
    },
    {
      key: "r2",
      period: "Jun 2026",
      title: "Team workspaces",
      text: "Share boards and invite your colleagues.",
    },
    {
      key: "r1",
      period: "Jan 2026",
      title: "Public launch",
      text: "The first release is out.",
    },
  ]),
};

/** Only data: the page has no messages of its own. */
export class TimelinePage extends Component<TimelineState> {
  view = view;
}

export const page = new TimelinePage();
