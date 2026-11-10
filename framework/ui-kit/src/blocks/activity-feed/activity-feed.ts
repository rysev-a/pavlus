import { Component } from "@pavlus/client";
import view from "./activity-feed.pavlus";
import { type Activity, type FeedItem, feedItems } from "./feed.ts";

export interface ActivityFeedState {
  items: FeedItem[];
  none: FeedItem[];
}

const LIST: Activity[] = [
  {
    id: "a5",
    kind: "meeting",
    title: "Demo with the finance team",
    text: "Walked through invoicing and the approval flow. Two follow-up questions on SSO.",
    who: "Maya Chen",
    when: "Today, 10:30",
  },
  {
    id: "a4",
    kind: "email",
    title: "Proposal sent",
    text: "Pricing for 40 seats, annual plan, with the onboarding package.",
    who: "Maya Chen",
    when: "Yesterday",
  },
  {
    id: "a3",
    kind: "stage",
    title: "Moved to Proposal",
    text: "",
    who: "Maya Chen",
    when: "Nov 1",
  },
  {
    id: "a2",
    kind: "call",
    title: "Discovery call, 25 minutes",
    text: "They run three tools today and want one. Budget is approved for Q1.",
    who: "Maya Chen",
    when: "Oct 28",
  },
  {
    id: "a1",
    kind: "note",
    title: "Lead came from the webinar",
    text: "",
    who: "Marketing",
    when: "Oct 24",
  },
];

export const initial: ActivityFeedState = {
  items: feedItems(LIST),
  none: [],
};

/** Only data: the page has no messages of its own. */
export class ActivityFeedPage extends Component<ActivityFeedState> {
  view = view;
}

export const page = new ActivityFeedPage();
