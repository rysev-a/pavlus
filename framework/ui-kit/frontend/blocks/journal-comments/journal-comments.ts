import { Component, type Effect, type Message } from "@pavlus/frontend";
import { patch } from "../admin-shell/shell.ts";
import {
  addComment,
  type Comment,
  type CommentCard,
  cardOf,
  validateComment,
} from "./comments.ts";
import view from "./journal-comments.pavlus";

export interface CommentsDemoState {
  list: Comment[];
  cards: CommentCard[];
  heading: string;
  draft: string;
  error: string;
}

const LIST: Comment[] = [
  {
    id: "c1",
    entryId: "demo",
    author: "Martha Kell",
    hue: 24,
    text: "I read this twice. The radiators here do exactly the same thing, and I had never noticed the smell was a ritual.",
    when: "2 days ago",
  },
  {
    id: "c2",
    entryId: "demo",
    author: "Tomas Ruiz",
    hue: 200,
    text: "Write to her. You will feel lighter by Thursday.",
    when: "yesterday",
  },
];

const view_ = (list: Comment[]) => ({
  list,
  cards: list.map(cardOf),
  heading: `${list.length} comments`,
});

export const initial: CommentsDemoState = {
  ...view_(LIST),
  draft: "",
  error: "",
};

export class CommentsPage extends Component<CommentsDemoState> {
  view = view;

  "com.type"(msg: Message): Effect[] {
    return patch({ draft: msg.event?.value ?? "", error: "" });
  }

  "com.send"(_msg: Message, state: CommentsDemoState): Effect[] {
    const error = validateComment(state.draft);
    if (error) return patch({ error });
    const list = addComment(state.list, "demo", "You", 336, state.draft);
    return patch({ ...view_(list), draft: "", error: "" });
  }
}

export const page = new CommentsPage();
