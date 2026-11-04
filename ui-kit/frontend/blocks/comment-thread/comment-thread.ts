import {
  Component,
  type Effect,
  type Message,
} from "@service-laboratory/pavlus";
import { storeEffector as store } from "@service-laboratory/pavlus/plugins";
import { initialsOf } from "../feed-post/feed-post.ts";
import view from "./comment-thread.pavlus";

export interface Comment {
  id: string;
  name: string;
  tone: number;
  text: string;
  ago: string;
  likes: number;
  liked: boolean;
}

export interface CommentRow extends Comment {
  initials: string;
}

/** Pure: the rows with initials. */
export const commentRows = (list: Comment[]): CommentRow[] =>
  list.map((c) => ({ ...c, initials: initialsOf(c.name) }));

/** Pure: like or unlike one comment. */
export function likeComment(list: Comment[], id: string): Comment[] {
  return list.map((c) =>
    c.id === id
      ? {
          ...c,
          liked: !c.liked,
          likes: Math.max(0, c.likes + (c.liked ? -1 : 1)),
        }
      : c,
  );
}

/** Pure: a new comment at the end; an empty text changes nothing. */
export function addComment(
  list: Comment[],
  text: string,
  author: { name: string; tone: number },
  id: string,
): Comment[] {
  const clean = text.trim();
  if (clean === "") return list;
  return [
    ...list,
    {
      id,
      name: author.name,
      tone: author.tone,
      text: clean,
      ago: "just now",
      likes: 0,
      liked: false,
    },
  ];
}

/** Pure: `1 comment`, `3 comments`. */
export const countLabel = (n: number): string =>
  n === 1 ? "1 comment" : `${n} comments`;

export interface ThreadProps {
  comments: CommentRow[];
  draft: string;
  canSend: boolean;
  me: string;
  placeholder: string;
}

export interface CommentThreadState {
  list: Comment[];
  thread: ThreadProps;
  summary: string;
  nextId: number;
}

const START: Comment[] = [
  {
    id: "k1",
    name: "Ivy Chen",
    tone: 2,
    text: "This light is unreal. Where was it taken?",
    ago: "1h",
    likes: 5,
    liked: false,
  },
  {
    id: "k2",
    name: "Marco Bell",
    tone: 5,
    text: "Saving this for my next trip.",
    ago: "35m",
    likes: 2,
    liked: true,
  },
];

const thread = (list: Comment[], draft: string): ThreadProps => ({
  comments: commentRows(list),
  draft,
  canSend: draft.trim().length > 0,
  me: "YO",
  placeholder: "Add a comment...",
});

export const initial: CommentThreadState = {
  list: START,
  thread: thread(START, ""),
  summary: countLabel(START.length),
  nextId: 1,
};

export class CommentThreadPage extends Component<CommentThreadState> {
  view = view;

  _show(state: CommentThreadState, list: Comment[], draft: string): Effect[] {
    return [
      store.set("list", list),
      store.set("thread", thread(list, draft)),
      store.set("summary", countLabel(list.length)),
    ];
  }

  "cm.like"(msg: Message, state: CommentThreadState): Effect[] {
    return this._show(
      state,
      likeComment(state.list, msg.payload as string),
      state.thread.draft,
    );
  }

  "cm.draft"(msg: Message, state: CommentThreadState): Effect[] {
    return [store.set("thread", thread(state.list, msg.event?.value ?? ""))];
  }

  "cm.send"(_msg: Message, state: CommentThreadState): Effect[] {
    if (state.thread.draft.trim() === "") return [];
    return [
      ...this._show(
        state,
        addComment(
          state.list,
          state.thread.draft,
          { name: "You", tone: 1 },
          `n${state.nextId}`,
        ),
        "",
      ),
      store.set("nextId", state.nextId + 1),
    ];
  }
}

export const page = new CommentThreadPage();
