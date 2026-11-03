import {
  Component,
  type Effect,
  type Message,
} from "@service-laboratory/pavlus";
import { storeEffector as store } from "@service-laboratory/pavlus/plugins";
import view from "./feed-post.pavlus";

/** The data of a post (the props of the view are this plus the initials). */
export interface Post {
  id: string;
  name: string;
  handle: string;
  /** 1..5: which `--chart-N` colors the avatar. */
  tone: number;
  ago: string;
  text: string;
  mood: string;
  /** An emoji drawn on a gradient tile, or "". */
  photo: string;
  phototone: number;
  likes: number;
  liked: boolean;
  comments: number;
  shares: number;
  shared: boolean;
}

export interface PostProps extends Post {
  initials: string;
}

/** Pure: `Ann Lee` → `AL`. */
export function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.slice(0, 1))
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

/** Pure: 1234 → `1.2k`, 15 → `15`. */
export function compact(n: number): string {
  if (n < 1000) return String(n);
  if (n < 10000) return `${Math.round(n / 100) / 10}k`;
  if (n < 1_000_000) return `${Math.round(n / 1000)}k`;
  return `${Math.round(n / 100_000) / 10}M`;
}

/** Pure: the post after a like or an unlike. */
export function toggleLike<T extends Post>(post: T): T {
  return {
    ...post,
    liked: !post.liked,
    likes: Math.max(0, post.likes + (post.liked ? -1 : 1)),
  };
}

/** Pure: the post after a share or an undo. */
export function toggleShare<T extends Post>(post: T): T {
  return {
    ...post,
    shared: !post.shared,
    shares: Math.max(0, post.shares + (post.shared ? -1 : 1)),
  };
}

/** Pure: the posts with the initials, ready for `+Post#post(...post)`. */
export function postProps(list: Post[]): PostProps[] {
  return list.map((p) => ({ ...p, initials: initialsOf(p.name) }));
}

const SAMPLE: Post[] = [
  {
    id: "d1",
    name: "Maya Ortiz",
    handle: "maya",
    tone: 1,
    ago: "2h",
    text: "Finally finished the mural on Dock Street. Eleven days, forty cans, one very patient ladder.",
    mood: "😊 proud",
    photo: "🎨",
    phototone: 2,
    likes: 128,
    liked: false,
    comments: 14,
    shares: 6,
    shared: false,
  },
  {
    id: "d2",
    name: "Tomás Reyes",
    handle: "tomas",
    tone: 3,
    ago: "5h",
    text: "Hot take: the best commute is the one where you get a seat and a podcast you actually like.",
    mood: "",
    photo: "",
    phototone: 1,
    likes: 41,
    liked: true,
    comments: 9,
    shares: 1,
    shared: false,
  },
];

export interface FeedPostState {
  posts: PostProps[];
  last: string;
}

export const initial: FeedPostState = {
  posts: postProps(SAMPLE),
  last: "Nothing clicked yet.",
};

export class FeedPostPage extends Component<FeedPostState> {
  view = view;

  _update(
    state: FeedPostState,
    id: string,
    f: (p: PostProps) => PostProps,
    note: string,
  ): Effect[] {
    return [
      store.set(
        "posts",
        state.posts.map((p) => (p.id === id ? f(p) : p)),
      ),
      store.set("last", note),
    ];
  }

  "post.like"(msg: Message, state: FeedPostState): Effect[] {
    return this._update(state, msg.payload as string, toggleLike, "Liked.");
  }

  "post.share"(msg: Message, state: FeedPostState): Effect[] {
    return this._update(state, msg.payload as string, toggleShare, "Shared.");
  }

  "post.comment"(msg: Message): Effect[] {
    return [store.set("last", `Open the comments of ${String(msg.payload)}.`)];
  }

  "post.open"(msg: Message): Effect[] {
    return [store.set("last", `Open the profile of ${String(msg.payload)}.`)];
  }
}

export const page = new FeedPostPage();
