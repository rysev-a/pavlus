import { Component, type Effect, type Message } from "@pavlus/frontend";
import { patch } from "../admin-shell/shell.ts";
import { type EntryCard, entryCard, type Person, type Post } from "./entry.ts";
import view from "./journal-entry.pavlus";

const ANNA: Person = {
  id: "anna",
  name: "Anna Wren",
  hue: 336,
  handle: "annawren",
};

const POST: Post = {
  id: "demo",
  author: "anna",
  iso: "2026-11-03",
  time: "21:40",
  title: "The first evening the heating came back on",
  body: "The radiators ticked and groaned around six, the way they do every November, and the whole flat smelled of warm dust for an hour. I made tea and sat on the floor next to the one that works best.\n\nI keep thinking how much of a year is made of small thresholds like this: the first coat, the first dark commute, the first time you turn on a lamp at four in the afternoon and do not feel sad about it.\n\nTomorrow I will finally write to Martha. Tonight I only wanted to notice the warmth.",
  mood: "calm",
  music: "Nils Frahm, Says",
  location: "Lisbon, at home",
  tags: ["autumn", "home", "mornings"],
  privacy: "friends",
};

export interface EntryDemoState {
  feed: EntryCard[];
  whole: EntryCard[];
  said: string;
}

export const initial: EntryDemoState = {
  feed: [entryCard(POST, ANNA, 3)],
  whole: [entryCard(POST, ANNA, 3)],
  said: "Nothing clicked yet.",
};

export class EntryPage extends Component<EntryDemoState> {
  view = view;

  "feed.open"(msg: Message): Effect[] {
    return patch({ said: `Opened entry ${msg.payload}` });
  }
  "feed.tag"(msg: Message): Effect[] {
    return patch({ said: `Picked the tag #${msg.payload}` });
  }
  "feed.read"(msg: Message): Effect[] {
    return patch({ said: `Reading mode for ${msg.payload}` });
  }
  "feed.comments"(msg: Message): Effect[] {
    return patch({ said: `Comments of ${msg.payload}` });
  }
}

export const page = new EntryPage();
