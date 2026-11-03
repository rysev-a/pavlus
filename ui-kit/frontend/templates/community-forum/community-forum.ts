import {
  Component,
  type Effect,
  type Message,
} from "@service-laboratory/pavlus";
import { storeEffector as store } from "@service-laboratory/pavlus/plugins";
import { initialsOf } from "../../blocks/feed-post/feed-post.ts";
import {
  type MarkBlock,
  parseMarkup,
} from "../../blocks/markup-preview/markup-preview.ts";
import { picksProps } from "../../blocks/pick-list/pick-list.ts";
import { badgeOf } from "../../blocks/rep-badge/rep-badge.ts";
import {
  acceptReply,
  addReply,
  hideReply,
  type Reply,
  rowsOf,
  voteOn,
} from "../../blocks/reply-tree/reply-tree.ts";
import { navProps, type Tab } from "../../blocks/social-nav/social-nav.ts";
import {
  sortThreads,
  type ThreadItem,
  type ThreadSort,
} from "../../blocks/thread-row/thread-row.ts";
import { applyVote, scoreOf } from "../../blocks/vote-buttons/vote-buttons.ts";
import {
  CATEGORIES,
  categoryOf,
  type ForumThread,
  ME,
  MEMBERS,
  memberOf,
  REPLIES,
  THREADS,
} from "./community-forum-data.ts";
import view from "./community-forum.pavlus";

export type View = "list" | "thread" | "new";

export interface NewThread {
  title: string;
  category: string;
  body: string;
}

export type Errors = Record<string, string>;

/** Pure: what is wrong with the new thread form, by field. */
export function validateThread(f: NewThread): Errors {
  const errors: Errors = {};
  const title = f.title.trim();
  if (title.length < 8)
    errors.title = "Write a title of at least 8 characters.";
  else if (title.length > 100)
    errors.title = "Keep the title under 100 characters.";
  if (!CATEGORIES.some((c) => c.id === f.category))
    errors.category = "Choose a category.";
  if (f.body.trim().length < 20)
    errors.body = "Say a little more: at least 20 characters.";
  return errors;
}

/** Pure: the thread as a row of the list (its counters come from the replies). */
export function threadItem(t: ForumThread, replies: Reply[]): ThreadItem {
  const c = categoryOf(t.categoryId);
  return {
    id: t.id,
    title: t.title,
    name: memberOf(t.authorId).name,
    category: c.label,
    emoji: c.emoji,
    score: scoreOf(t.base, t.vote),
    replies: replies.length,
    views: t.views,
    hours: t.hours,
    ago: t.ago,
    pinned: t.pinned,
    locked: t.locked,
    solved: replies.some((r) => r.accepted),
    hidden: t.hidden,
  };
}

/** Pure: the threads a reader sees: by category and words; hidden ones only for a moderator. */
export function visibleThreads(
  list: ForumThread[],
  category: string,
  query: string,
  mod: boolean,
): ForumThread[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  return list.filter(
    (t) =>
      (mod || !t.hidden) &&
      (category === "all" || t.categoryId === category) &&
      words.every((w) => t.title.toLowerCase().includes(w)),
  );
}

/** Pure: a new thread by me at the top. */
export function createThread(
  list: ForumThread[],
  f: NewThread,
  id: string,
): ForumThread[] {
  return [
    {
      id,
      title: f.title.trim(),
      authorId: ME,
      categoryId: f.category,
      body: f.body.trim(),
      base: 0,
      vote: 0,
      views: 0,
      hours: 0,
      ago: "just now",
      pinned: false,
      locked: false,
      hidden: false,
    },
    ...list,
  ];
}

/** Pure: change one thread. */
export function updateThread(
  list: ForumThread[],
  id: string,
  patch: Partial<ForumThread>,
): ForumThread[] {
  return list.map((t) => (t.id === id ? { ...t, ...patch } : t));
}

export interface Core {
  view: View;
  threads: ForumThread[];
  replies: Record<string, Reply[]>;
  category: string;
  sort: ThreadSort;
  query: string;
  openId: string;
  replyingTo: string;
  replyDraft: string;
  answerDraft: string;
  mod: boolean;
  form: NewThread;
  errors: Errors;
  nextId: number;
}

const TABS: Tab[] = [
  { id: "list", label: "Threads", glyph: "message", badge: 0 },
  { id: "new", label: "New thread", glyph: "plus", badge: 0 },
];

const EMPTY_FORM: NewThread = { title: "", category: "", body: "" };

export function derive(s: Core) {
  const shown = visibleThreads(s.threads, s.category, s.query, s.mod);
  const items = shown.map((t) => threadItem(t, s.replies[t.id] ?? []));
  const sorted = sortThreads(items, s.sort);
  const all = visibleThreads(s.threads, "all", s.query, s.mod);
  const open = s.threads.find((t) => t.id === s.openId);
  const replies = s.replies[s.openId] ?? [];
  const author = open ? memberOf(open.authorId) : memberOf(ME);
  const canAccept = open ? open.authorId === ME || s.mod : false;
  const rows = rowsOf(replies, s.replyingTo, canAccept, s.mod).map((row) => {
    const m = MEMBERS.find((x) => x.name === row.name);
    return {
      ...row,
      op: open ? m?.id === open.authorId : false,
      badge: m ? badgeOf(m.points, m.moderator, false).label : "",
    };
  });
  const category = categoryOf(open?.categoryId ?? "");
  return {
    nav: navProps("Commons", TABS, s.view === "new" ? "new" : "list", "SW"),
    cats: picksProps(
      [
        { id: "all", label: "All threads", emoji: "🗂️", count: all.length },
        ...CATEGORIES.map((c) => ({
          id: c.id,
          label: c.label,
          emoji: c.emoji,
          count: all.filter((t) => t.categoryId === c.id).length,
        })),
      ],
      s.category,
      "Categories",
    ),
    sortPick: picksProps(
      [
        { id: "new", label: "New", emoji: "🕒", count: "" },
        { id: "top", label: "Top", emoji: "🔥", count: "" },
        { id: "unanswered", label: "Unanswered", emoji: "❓", count: "" },
      ],
      s.sort,
      "",
      true,
    ),
    list: sorted,
    listEmpty: sorted.length === 0,
    top: [...MEMBERS]
      .sort((a, b) => b.points - a.points)
      .slice(0, 4)
      .map((m) => ({
        id: m.id,
        name: m.name,
        initials: initialsOf(m.name),
        tone: m.tone,
        badge: badgeOf(m.points, m.moderator),
      })),
    detail: open
      ? {
          id: open.id,
          title: open.title,
          author: author.name,
          initials: initialsOf(author.name),
          tone: author.tone,
          badge: badgeOf(author.points, author.moderator),
          category: category.label,
          emoji: category.emoji,
          ago: open.ago,
          views: open.views,
          pinned: open.pinned,
          locked: open.locked,
          hidden: open.hidden,
          solved: replies.some((r) => r.accepted),
          blocks: parseMarkup(open.body),
        }
      : null,
    opVote: open
      ? { id: open.id, score: scoreOf(open.base, open.vote), vote: open.vote }
      : { id: "", score: 0, vote: 0 },
    tree: {
      rows,
      draft: s.replyDraft,
      canSend: s.replyDraft.trim().length > 0,
      canReply: open ? !open.locked : false,
    },
    replyCount: replies.length,
    canAnswer: open ? !open.locked : false,
    canSendAnswer: s.answerDraft.trim().length > 0,
    catOptions: CATEGORIES,
    preview: { blocks: parseMarkup(s.form.body) },
    previewTitle: s.form.title.trim(),
  };
}

export type Derived = ReturnType<typeof derive>;

const core: Core = {
  view: "list",
  threads: THREADS,
  replies: REPLIES,
  category: "all",
  sort: "new",
  query: "",
  openId: "",
  replyingTo: "",
  replyDraft: "",
  answerDraft: "",
  mod: false,
  form: EMPTY_FORM,
  errors: {},
  nextId: 1,
};

export type ForumState = Core & Derived;

export const initial: ForumState = { ...core, ...derive(core) };

const CORE_KEYS = Object.keys(core) as (keyof Core)[];
const coreOf = (state: ForumState): Core => {
  const c: Record<string, unknown> = {};
  for (const k of CORE_KEYS) c[k] = state[k];
  return c as unknown as Core;
};

export class CommunityForum extends Component<ForumState> {
  view = view;

  // ---- navigation and the list ----
  "nav.go"(msg: Message, state: ForumState): Effect[] {
    const v = msg.payload as View;
    return this._show(state, {
      view: v,
      form: v === "new" ? EMPTY_FORM : state.form,
      errors: {},
    });
  }
  "nav.home"(_msg: Message, state: ForumState): Effect[] {
    return this._show(state, { view: "list", category: "all", query: "" });
  }
  "nav.me"(): Effect[] {
    return [];
  }
  "cats.pick"(msg: Message, state: ForumState): Effect[] {
    return this._show(state, { view: "list", category: msg.payload as string });
  }
  "sortPick.pick"(msg: Message, state: ForumState): Effect[] {
    return this._show(state, { sort: msg.payload as ThreadSort });
  }
  setQuery(msg: Message, state: ForumState): Effect[] {
    return this._show(state, {
      view: "list",
      query: msg.event?.value ?? "",
    });
  }
  toggleMod(msg: Message, state: ForumState): Effect[] {
    return this._show(state, { mod: msg.event?.checked === true });
  }
  "row.open"(msg: Message, state: ForumState): Effect[] {
    const id = msg.payload as string;
    return this._show(state, {
      view: "thread",
      openId: id,
      replyingTo: "",
      replyDraft: "",
      answerDraft: "",
      threads: state.threads.map((t) =>
        t.id === id ? { ...t, views: t.views + 1 } : t,
      ),
    });
  }
  back(_msg: Message, state: ForumState): Effect[] {
    return this._show(state, { view: "list" });
  }

  // ---- a thread ----
  "opvote.vote"(msg: Message, state: ForumState): Effect[] {
    const [id, dir] = msg.payload as [string, number];
    const t = state.threads.find((x) => x.id === id);
    if (!t) return [];
    return this._show(state, {
      threads: updateThread(state.threads, id, {
        vote: applyVote(t.vote, dir),
      }),
    });
  }
  "tree.vote.vote"(msg: Message, state: ForumState): Effect[] {
    const [id, dir] = msg.payload as [string, number];
    return this._setReplies(state, voteOn(this._replies(state), id, dir));
  }
  "tree.reply"(msg: Message, state: ForumState): Effect[] {
    return this._show(state, {
      replyingTo: msg.payload as string,
      replyDraft: "",
    });
  }
  "tree.accept"(msg: Message, state: ForumState): Effect[] {
    return this._setReplies(
      state,
      acceptReply(this._replies(state), msg.payload as string),
    );
  }
  "tree.moderate"(msg: Message, state: ForumState): Effect[] {
    return this._setReplies(
      state,
      hideReply(this._replies(state), msg.payload as string),
    );
  }
  "tree.draft"(msg: Message, state: ForumState): Effect[] {
    return this._show(state, { replyDraft: msg.event?.value ?? "" });
  }
  "tree.cancel"(_msg: Message, state: ForumState): Effect[] {
    return this._show(state, { replyingTo: "", replyDraft: "" });
  }
  "tree.send"(_msg: Message, state: ForumState): Effect[] {
    if (state.replyDraft.trim() === "") return [];
    const me = memberOf(ME);
    return this._show(state, {
      replies: {
        ...state.replies,
        [state.openId]: addReply(
          this._replies(state),
          state.replyingTo,
          state.replyDraft,
          { name: me.name, tone: me.tone, badge: "" },
          `n${state.nextId}`,
        ),
      },
      nextId: state.nextId + 1,
      replyingTo: "",
      replyDraft: "",
    });
  }
  setAnswer(msg: Message, state: ForumState): Effect[] {
    return this._show(state, { answerDraft: msg.event?.value ?? "" });
  }
  postAnswer(_msg: Message, state: ForumState): Effect[] {
    if (state.answerDraft.trim() === "") return [];
    const me = memberOf(ME);
    return this._show(state, {
      replies: {
        ...state.replies,
        [state.openId]: addReply(
          this._replies(state),
          "",
          state.answerDraft,
          { name: me.name, tone: me.tone, badge: "" },
          `n${state.nextId}`,
        ),
      },
      nextId: state.nextId + 1,
      answerDraft: "",
    });
  }
  togglePin(_msg: Message, state: ForumState): Effect[] {
    return this._mod(state, (t) => ({ pinned: !t.pinned }));
  }
  toggleLock(_msg: Message, state: ForumState): Effect[] {
    return this._mod(state, (t) => ({ locked: !t.locked }));
  }
  toggleHide(_msg: Message, state: ForumState): Effect[] {
    return this._mod(state, (t) => ({ hidden: !t.hidden }));
  }

  // ---- the new thread form ----
  setField(msg: Message, state: ForumState): Effect[] {
    const field = msg.payload as keyof NewThread;
    const { [field]: _gone, ...errors } = state.errors;
    return this._show(state, {
      form: { ...state.form, [field]: msg.event?.value ?? "" },
      errors,
    });
  }
  createThread(_msg: Message, state: ForumState): Effect[] {
    const errors = validateThread(state.form);
    if (Object.keys(errors).length > 0) return this._show(state, { errors });
    const id = `n${state.nextId}t`;
    return this._show(state, {
      threads: createThread(state.threads, state.form, id),
      nextId: state.nextId + 1,
      form: EMPTY_FORM,
      errors: {},
      view: "thread",
      openId: id,
      category: "all",
    });
  }

  _replies(state: ForumState): Reply[] {
    return state.replies[state.openId] ?? [];
  }
  _setReplies(state: ForumState, list: Reply[]): Effect[] {
    return this._show(state, {
      replies: { ...state.replies, [state.openId]: list },
    });
  }
  _mod(
    state: ForumState,
    f: (t: ForumThread) => Partial<ForumThread>,
  ): Effect[] {
    const t = state.threads.find((x) => x.id === state.openId);
    if (!t || !state.mod) return [];
    return this._show(state, {
      threads: updateThread(state.threads, t.id, f(t)),
    });
  }

  _show(state: ForumState, patch: Partial<Core>): Effect[] {
    const next: Core = { ...coreOf(state), ...patch };
    const derived = derive(next);
    return [
      ...(Object.keys(patch) as (keyof Core)[]).map((k) =>
        store.set(k, patch[k]),
      ),
      ...(Object.keys(derived) as (keyof Derived)[]).map((k) =>
        store.set(k, derived[k]),
      ),
    ];
  }
}

export const page = new CommunityForum();

export type { MarkBlock };
