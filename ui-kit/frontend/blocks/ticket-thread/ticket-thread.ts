import { Component } from "@service-laboratory/pavlus";
import { type Bubble, bubbles, type ThreadMessage } from "./thread.ts";
import view from "./ticket-thread.pavlus";

const LIST: ThreadMessage[] = [
  {
    id: "m1",
    side: "customer",
    who: "Elena Marquez",
    text: "Hi, since Monday our exports to CSV come out empty. We have a board meeting on Thursday and need the numbers. Can you help?",
    when: "Mon, 16:20",
  },
  {
    id: "m2",
    side: "agent",
    who: "Jonas Weber",
    text: "Hello Elena, sorry about that. I can see the export job failing on your workspace. I am checking with engineering and will come back within the hour.",
    when: "Mon, 16:48",
  },
  {
    id: "m3",
    side: "note",
    who: "Jonas Weber",
    text: "Known issue with exports over 50k rows, fix ships Wednesday. Offer the manual export meanwhile.",
    when: "Mon, 17:05",
  },
  {
    id: "m4",
    side: "customer",
    who: "Elena Marquez",
    text: "Thank you. A manual export would be perfect.",
    when: "Tue, 08:10",
  },
];

export interface TicketThreadState {
  messages: Bubble[];
  none: Bubble[];
}

export const initial: TicketThreadState = {
  messages: bubbles(LIST),
  none: [],
};

/** Only data: the page has no messages of its own. */
export class TicketThreadPage extends Component<TicketThreadState> {
  view = view;
}

export const page = new TicketThreadPage();
