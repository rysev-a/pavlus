import {
  Component,
  type Effect,
  type Message,
} from "@service-laboratory/pavlus";
import { storeEffector as store } from "@service-laboratory/pavlus/plugins";
import { initialsOf } from "../feed-post/feed-post.ts";
import view from "./photo-card.pavlus";

export type Shape = "tall" | "square" | "wide";

export interface PhotoData {
  id: string;
  title: string;
  author: string;
  authorId: string;
  tone: number;
  tone2: number;
  emoji: string;
  shape: Shape;
  likes: number;
  tags: string[];
  album: string;
}

export interface PhotoProps extends PhotoData {
  initials: string;
  liked: boolean;
  saved: boolean;
  large: boolean;
}

/** Pure: the cards for the ids I liked and saved. */
export function photoProps(
  list: PhotoData[],
  liked: string[],
  saved: string[],
  large = false,
): PhotoProps[] {
  return list.map((p) => ({
    ...p,
    initials: initialsOf(p.author),
    likes: p.likes + (liked.includes(p.id) ? 1 : 0),
    liked: liked.includes(p.id),
    saved: saved.includes(p.id),
    large,
  }));
}

/** Pure: an id in the list, or out of it. */
export const toggleId = (ids: string[], id: string): string[] =>
  ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id];

const SAMPLE: PhotoData[] = [
  {
    id: "d1",
    title: "Blue hour",
    author: "Hana Sato",
    authorId: "hana",
    tone: 4,
    tone2: 5,
    emoji: "🌃",
    shape: "tall",
    likes: 214,
    tags: ["#city", "#night"],
    album: "Tokyo",
  },
  {
    id: "d2",
    title: "Market morning",
    author: "Ines Moreau",
    authorId: "ines",
    tone: 3,
    tone2: 1,
    emoji: "🍊",
    shape: "square",
    likes: 96,
    tags: ["#market", "#food"],
    album: "Lyon",
  },
  {
    id: "d3",
    title: "Ridge walk",
    author: "Kofi Mensah",
    authorId: "kofi",
    tone: 2,
    tone2: 4,
    emoji: "🏔️",
    shape: "wide",
    likes: 331,
    tags: ["#hiking", "#mountains"],
    album: "Alps",
  },
  {
    id: "d4",
    title: "Quiet harbor",
    author: "Hana Sato",
    authorId: "hana",
    tone: 5,
    tone2: 2,
    emoji: "⛵",
    shape: "square",
    likes: 58,
    tags: ["#sea"],
    album: "Tokyo",
  },
];

export interface PhotoCardState {
  liked: string[];
  saved: string[];
  photos: PhotoProps[];
  big: PhotoProps;
  last: string;
}

const sync = (liked: string[], saved: string[]) => ({
  liked,
  saved,
  photos: photoProps(SAMPLE, liked, saved),
  big: photoProps(
    [SAMPLE[2] as PhotoData],
    liked,
    saved,
    true,
  )[0] as PhotoProps,
});

export const initial: PhotoCardState = {
  ...sync(["d2"], []),
  last: "Nothing clicked yet.",
};

export class PhotoCardPage extends Component<PhotoCardState> {
  view = view;

  _show(
    state: PhotoCardState,
    liked: string[],
    saved: string[],
    last: string,
  ): Effect[] {
    const next = sync(liked, saved);
    return [
      store.set("liked", next.liked),
      store.set("saved", next.saved),
      store.set("photos", next.photos),
      store.set("big", next.big),
      store.set("last", last || state.last),
    ];
  }

  _like(msg: Message, state: PhotoCardState): Effect[] {
    return this._show(
      state,
      toggleId(state.liked, msg.payload as string),
      state.saved,
      "Liked.",
    );
  }

  _save(msg: Message, state: PhotoCardState): Effect[] {
    return this._show(
      state,
      state.liked,
      toggleId(state.saved, msg.payload as string),
      "Saved.",
    );
  }

  "photo.like"(msg: Message, state: PhotoCardState): Effect[] {
    return this._like(msg, state);
  }
  "photo.save"(msg: Message, state: PhotoCardState): Effect[] {
    return this._save(msg, state);
  }
  "big.like"(msg: Message, state: PhotoCardState): Effect[] {
    return this._like(msg, state);
  }
  "big.save"(msg: Message, state: PhotoCardState): Effect[] {
    return this._save(msg, state);
  }
  "big.tag"(msg: Message): Effect[] {
    return [store.set("last", `Open ${String(msg.payload)}.`)];
  }
}

export const page = new PhotoCardPage();
