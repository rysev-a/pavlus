import {
  Component,
  type Effect,
  type Message,
} from "@service-laboratory/pavlus";
import { patch } from "../admin-shell/shell.ts";
import type { Person, Post } from "../journal-entry/entry.ts";
import { friendCards, type FriendCard } from "./friends.ts";
import view from "./friend-latest.pavlus";

const TODAY = "2026-11-03";

const FRIENDS: Person[] = [
  { id: "martha", name: "Martha Kell", hue: 24, handle: "marthak" },
  { id: "tomas", name: "Tomas Ruiz", hue: 200, handle: "tomasr" },
  { id: "ida", name: "Ida Holm", hue: 140, handle: "idaholm" },
];

const post = (
  p: Partial<Post> & Pick<Post, "id" | "author" | "iso" | "title" | "body">,
): Post => ({
  time: "20:00",
  mood: "",
  music: "",
  location: "",
  tags: [],
  privacy: "friends",
  ...p,
});

const POSTS: Post[] = [
  post({
    id: "m1",
    author: "martha",
    iso: "2026-11-02",
    title: "A bakery that opens at five",
    body: "I walked past it on the way to the night bus and the whole street smelled of cardamom. The baker waved me in and gave me the heel of a loaf without asking for money.",
    mood: "happy",
    music: "Khruangbin, Time (You and I)",
  }),
  post({
    id: "t1",
    author: "tomas",
    iso: "2026-10-30",
    title: "Notes on a quiet week",
    body: "Nothing happened and I want to remember it exactly like that: the slow coffee, the long emails not sent, a book finished on a tram.",
    mood: "calm",
  }),
  post({
    id: "t2",
    author: "tomas",
    iso: "2026-11-01",
    time: "23:10",
    title: "A letter I will not send",
    body: "Private.",
    privacy: "private",
  }),
  post({
    id: "i1",
    author: "ida",
    iso: "2026-10-12",
    title: "The lake in October",
    body: "Mist until eleven. We rowed out to the middle and stopped talking.",
    mood: "nostalgic",
    privacy: "public",
  }),
];

export interface FriendsDemoState {
  seen: string[];
  cards: FriendCard[];
}

export const initial: FriendsDemoState = {
  seen: ["i1"],
  cards: friendCards(FRIENDS, POSTS, TODAY, ["i1"]),
};

export class FriendsPage extends Component<FriendsDemoState> {
  view = view;

  "friends.open"(msg: Message, state: FriendsDemoState): Effect[] {
    const seen = [...state.seen, msg.payload as string];
    return patch({ seen, cards: friendCards(FRIENDS, POSTS, TODAY, seen) });
  }
}

export const page = new FriendsPage();
