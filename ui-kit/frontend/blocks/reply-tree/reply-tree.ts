import {
  Component,
  type Effect,
  type Message,
} from "@service-laboratory/pavlus";
import { storeEffector as store } from "@service-laboratory/pavlus/plugins";
import { initialsOf } from "../feed-post/feed-post.ts";
import { applyVote, scoreOf, voteTotal } from "../vote-buttons/vote-buttons.ts";
import view from "./reply-tree.pavlus";

/** One reply of a flat list; `parentId` is "" for a direct answer. */
export interface Reply {
  id: string;
  parentId: string;
  name: string;
  tone: number;
  text: string;
  ago: string;
  /** The score without my vote. */
  base: number;
  vote: -1 | 0 | 1;
  badge: string;
  op: boolean;
  accepted: boolean;
  hidden: boolean;
}

export interface Row {
  id: string;
  depth: number;
  name: string;
  initials: string;
  tone: number;
  text: string;
  ago: string;
  score: number;
  vote: number;
  badge: string;
  op: boolean;
  accepted: boolean;
  hidden: boolean;
  canAccept: boolean;
  canMod: boolean;
  replying: boolean;
}

export const MAX_DEPTH = 4;

/**
 * Pure: the replies in reading order (each reply followed by its children).
 * Siblings: the accepted one first, then the higher score, then the older.
 * `depth` stops at MAX_DEPTH so a long chain still fits a phone.
 */
export function flattenReplies(
  list: Reply[],
): { reply: Reply; depth: number }[] {
  const out: { reply: Reply; depth: number }[] = [];
  const known = new Set(list.map((r) => r.id));
  const order = new Map(list.map((r, i) => [r.id, i]));
  const children = (parent: string): Reply[] =>
    list
      .filter((r) =>
        parent === ""
          ? r.parentId === "" || !known.has(r.parentId)
          : r.parentId === parent,
      )
      .sort(
        (a, b) =>
          Number(b.accepted) - Number(a.accepted) ||
          scoreOf(b.base, b.vote) - scoreOf(a.base, a.vote) ||
          (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0),
      );
  const walk = (parent: string, depth: number, seen: Set<string>) => {
    for (const r of children(parent)) {
      if (seen.has(r.id)) continue;
      seen.add(r.id);
      out.push({ reply: r, depth: Math.min(depth, MAX_DEPTH) });
      walk(r.id, depth + 1, seen);
    }
  };
  walk("", 0, new Set());
  return out;
}

/** Pure: the rows of the view. `canAccept` is true when I asked the question. */
export function rowsOf(
  list: Reply[],
  replyingTo: string,
  canAccept: boolean,
  canMod = false,
): Row[] {
  return flattenReplies(list).map(({ reply: r, depth }) => ({
    id: r.id,
    depth,
    name: r.name,
    initials: initialsOf(r.name),
    tone: r.tone,
    text: r.text,
    ago: r.ago,
    score: scoreOf(r.base, r.vote),
    vote: r.vote,
    badge: r.badge,
    op: r.op,
    accepted: r.accepted,
    hidden: r.hidden,
    canAccept: canAccept && r.parentId === "" && !r.hidden,
    canMod,
    replying: r.id === replyingTo,
  }));
}

/** Pure: the list with my vote changed on one reply. */
export function voteOn(list: Reply[], id: string, dir: number): Reply[] {
  return list.map((r) =>
    r.id === id ? { ...r, vote: applyVote(r.vote, dir) } : r,
  );
}

/** Pure: a moderator hides a reply, or shows it again. */
export function hideReply(list: Reply[], id: string): Reply[] {
  return list.map((r) => (r.id === id ? { ...r, hidden: !r.hidden } : r));
}

/** Pure: only one answer is accepted; accepting it again takes it back. */
export function acceptReply(list: Reply[], id: string): Reply[] {
  const was = list.find((r) => r.id === id)?.accepted ?? false;
  return list.map((r) => ({ ...r, accepted: r.id === id ? !was : false }));
}

/** Pure: the list with a new reply under `parentId`. */
export function addReply(
  list: Reply[],
  parentId: string,
  text: string,
  author: { name: string; tone: number; badge: string },
  id: string,
): Reply[] {
  const clean = text.trim();
  if (clean === "") return list;
  return [
    ...list,
    {
      id,
      parentId,
      name: author.name,
      tone: author.tone,
      text: clean,
      ago: "just now",
      base: 0,
      vote: 0,
      badge: author.badge,
      op: false,
      accepted: false,
      hidden: false,
    },
  ];
}

/** Pure: how many replies are in the subtree below `id` (not counting it). */
export function descendants(list: Reply[], id: string): number {
  const kids = list.filter((r) => r.parentId === id);
  return kids.reduce((n, k) => n + 1 + descendants(list, k.id), 0);
}

export { voteTotal };

const r = (
  id: string,
  parentId: string,
  name: string,
  tone: number,
  text: string,
  ago: string,
  base: number,
  more: Partial<Reply> = {},
): Reply => ({
  id,
  parentId,
  name,
  tone,
  text,
  ago,
  base,
  vote: 0,
  badge: "",
  op: false,
  accepted: false,
  hidden: false,
  ...more,
});

export const SAMPLE: Reply[] = [
  r(
    "r1",
    "",
    "Priya Nair",
    2,
    "Run it with --inspect first. Nine times out of ten the leak is a listener that is never removed.",
    "3h",
    12,
    { badge: "Expert" },
  ),
  r(
    "r2",
    "r1",
    "Sam Whitfield",
    4,
    "That was it, the resize handler. Thank you!",
    "2h",
    3,
    { op: true },
  ),
  r(
    "r3",
    "r2",
    "Priya Nair",
    2,
    "Glad it helped. Add a cleanup in the effect so it cannot come back.",
    "2h",
    4,
    { badge: "Expert" },
  ),
  r(
    "r4",
    "",
    "Leo Park",
    5,
    "Check your timers too. A setInterval without a clear will hold the whole closure.",
    "1h",
    7,
  ),
  r("r5", "r4", "Dana Cruz", 1, "Spam removed.", "1h", 0, { hidden: true }),
];

export interface ReplyTreeState {
  replies: Reply[];
  replyingTo: string;
  draft: string;
  canSend: boolean;
  total: number;
  tree: { rows: Row[]; draft: string; canSend: boolean };
  nextId: number;
}

const treeOf = (
  replies: Reply[],
  replyingTo: string,
  draft: string,
): ReplyTreeState["tree"] => ({
  rows: rowsOf(replies, replyingTo, true),
  draft,
  canSend: draft.trim().length > 0,
});

export const initial: ReplyTreeState = {
  replies: SAMPLE,
  replyingTo: "",
  draft: "",
  canSend: false,
  total: voteTotal(SAMPLE),
  tree: treeOf(SAMPLE, "", ""),
  nextId: 1,
};

export class ReplyTreePage extends Component<ReplyTreeState> {
  view = view;

  _show(
    state: ReplyTreeState,
    patch: Partial<
      Pick<ReplyTreeState, "replies" | "replyingTo" | "draft" | "nextId">
    >,
  ): Effect[] {
    const next = { ...state, ...patch };
    const tree = treeOf(next.replies, next.replyingTo, next.draft);
    return [
      ...(Object.keys(patch) as (keyof typeof patch)[]).map((k) =>
        store.set(k, patch[k]),
      ),
      store.set("canSend", tree.canSend),
      store.set("total", voteTotal(next.replies)),
      store.set("tree", tree),
    ];
  }

  "tree.vote.vote"(msg: Message, state: ReplyTreeState): Effect[] {
    const [id, dir] = msg.payload as [string, number];
    return this._show(state, { replies: voteOn(state.replies, id, dir) });
  }

  "tree.reply"(msg: Message, state: ReplyTreeState): Effect[] {
    return this._show(state, { replyingTo: msg.payload as string, draft: "" });
  }

  "tree.accept"(msg: Message, state: ReplyTreeState): Effect[] {
    return this._show(state, {
      replies: acceptReply(state.replies, msg.payload as string),
    });
  }

  "tree.draft"(msg: Message, state: ReplyTreeState): Effect[] {
    return this._show(state, { draft: msg.event?.value ?? "" });
  }

  "tree.cancel"(_msg: Message, state: ReplyTreeState): Effect[] {
    return this._show(state, { replyingTo: "", draft: "" });
  }

  "tree.send"(_msg: Message, state: ReplyTreeState): Effect[] {
    if (state.draft.trim() === "") return [];
    return this._show(state, {
      replies: addReply(
        state.replies,
        state.replyingTo,
        state.draft,
        { name: "You", tone: 3, badge: "" },
        `n${state.nextId}`,
      ),
      nextId: state.nextId + 1,
      replyingTo: "",
      draft: "",
    });
  }
}

export const page = new ReplyTreePage();
