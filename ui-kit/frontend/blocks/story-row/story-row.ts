import {
  Component,
  type Effect,
  type Message,
} from "@service-laboratory/pavlus";
import { storeEffector as store } from "@service-laboratory/pavlus/plugins";
import { initialsOf } from "../feed-post/feed-post.ts";
import view from "./story-row.pavlus";

export interface Story {
  id: string;
  label: string;
  tone: number;
  emoji: string;
  text: string;
  ago: string;
}

export interface StoryRing extends Story {
  initials: string;
  seen: boolean;
}

export interface Viewer {
  label: string;
  initials: string;
  tone: number;
  emoji: string;
  text: string;
  ago: string;
}

/** Pure: the rings, with the seen ones marked. Unseen stories come first. */
export function ringsOf(list: Story[], seen: string[]): StoryRing[] {
  const rings = list.map((s, i) => ({
    ring: { ...s, initials: initialsOf(s.label), seen: seen.includes(s.id) },
    i,
  }));
  return rings
    .sort((a, b) => Number(a.ring.seen) - Number(b.ring.seen) || a.i - b.i)
    .map((r) => r.ring);
}

/** Pure: a story is seen once; the list keeps no duplicates. */
export const markSeen = (seen: string[], id: string): string[] =>
  seen.includes(id) ? seen : [...seen, id];

/** Pure: what the viewer shows for a story id, or null. */
export function viewerOf(list: Story[], id: string): Viewer | null {
  const s = list.find((x) => x.id === id);
  return s
    ? {
        label: s.label,
        initials: initialsOf(s.label),
        tone: s.tone,
        emoji: s.emoji,
        text: s.text,
        ago: s.ago,
      }
    : null;
}

export const STORIES: Story[] = [
  {
    id: "s1",
    label: "Maya",
    tone: 1,
    emoji: "🎨",
    text: "Day eleven on the wall. Almost there.",
    ago: "2h",
  },
  {
    id: "s2",
    label: "Tomás",
    tone: 3,
    emoji: "🚲",
    text: "Sunday ride along the river.",
    ago: "4h",
  },
  {
    id: "s3",
    label: "Hana",
    tone: 4,
    emoji: "🌃",
    text: "Shibuya at midnight, no filter.",
    ago: "5h",
  },
  {
    id: "s4",
    label: "Ines",
    tone: 5,
    emoji: "🥐",
    text: "Test batch number three. This one is it.",
    ago: "7h",
  },
  {
    id: "s5",
    label: "Kofi",
    tone: 2,
    emoji: "🎧",
    text: "New mix is up. Headphones recommended.",
    ago: "9h",
  },
];

export interface StoryRowState {
  seen: string[];
  openId: string;
  stories: {
    stories: StoryRing[];
    current: Viewer | null;
  };
  seenCount: number;
  total: number;
}

const sync = (seen: string[], openId: string) => ({
  stories: {
    stories: ringsOf(STORIES, seen),
    current: viewerOf(STORIES, openId),
  },
  seenCount: seen.length,
});

export const initial: StoryRowState = {
  seen: ["s4"],
  openId: "",
  ...sync(["s4"], ""),
  total: STORIES.length,
};

export class StoryRowPage extends Component<StoryRowState> {
  view = view;

  "stories.open"(msg: Message, state: StoryRowState): Effect[] {
    const id = msg.payload as string;
    const seen = markSeen(state.seen, id);
    const next = sync(seen, id);
    return [
      store.set("seen", seen),
      store.set("openId", id),
      store.set("stories", next.stories),
      store.set("seenCount", next.seenCount),
    ];
  }

  "stories.close"(_msg: Message, state: StoryRowState): Effect[] {
    return [
      store.set("openId", ""),
      store.set("stories", sync(state.seen, "").stories),
    ];
  }

  "stories.add"(): Effect[] {
    return [];
  }
}

export const page = new StoryRowPage();
