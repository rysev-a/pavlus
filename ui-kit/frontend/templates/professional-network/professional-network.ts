import {
  Component,
  type Effect,
  type Message,
} from "@service-laboratory/pavlus";
import {
  storeEffector as store,
  timeEffector as time,
} from "@service-laboratory/pavlus/plugins";
import {
  answerFor,
  appendMessage,
  canSend,
  type ChatMessage,
} from "../../blocks/chat-thread/chat-thread.ts";
import {
  addComment,
  type Comment,
  commentRows,
  likeComment,
  type ThreadProps,
} from "../../blocks/comment-thread/comment-thread.ts";
import {
  bumpConversation,
  chatOf,
  type Conversation,
  ensureConversation,
  inboxProps,
  openConversation,
  totalUnread,
} from "../../blocks/conversation-list/conversation-list.ts";
import {
  NOW,
  positionRows,
} from "../../blocks/experience-list/experience-list.ts";
import {
  compact,
  initialsOf,
  type Post,
  toggleLike,
  toggleShare,
  type PostProps,
} from "../../blocks/feed-post/feed-post.ts";
import {
  addId,
  type JobData,
  jobProps,
  toggleId,
} from "../../blocks/job-card/job-card.ts";
import { personRows } from "../../blocks/people-list/people-list.ts";
import { picksProps } from "../../blocks/pick-list/pick-list.ts";
import {
  canPost,
  composerProps,
  type MoodDef,
  moodLabel,
  pickMood,
} from "../../blocks/post-composer/post-composer.ts";
import {
  type HeaderProps,
  personHeader,
} from "../../blocks/profile-header/profile-header.ts";
import {
  skillRows,
  toggleEndorse,
} from "../../blocks/skill-endorse/skill-endorse.ts";
import { navProps, type Tab } from "../../blocks/social-nav/social-nav.ts";
import {
  COMMENTS,
  companyOf,
  CONVERSATIONS,
  JOBS,
  type Member,
  MEMBERS,
  memberOf,
  ME,
  MESSAGES,
  POSTS,
  START_CONNECTIONS,
  START_INVITES,
  SUGGESTIONS,
  COMPANIES,
} from "./professional-network-data.ts";
import view from "./professional-network.pavlus";

export type View =
  "home" | "network" | "jobs" | "messages" | "profile" | "company";

export interface JobFilter {
  query: string;
  /** "All", "Remote", "Hybrid" or "On-site". */
  kind: string;
  /** "Any", "Junior", "Mid" or "Senior". */
  level: string;
  savedOnly: boolean;
}

export const KINDS = ["All", "Remote", "Hybrid", "On-site"];
export const LEVELS = ["Any", "Junior", "Mid", "Senior"];

/** Pure: the jobs that match the words, the kind, the level and the saved box. Newest first. */
export function filterJobs(
  list: JobData[],
  f: JobFilter,
  saved: string[],
): JobData[] {
  const words = f.query.toLowerCase().split(/\s+/).filter(Boolean);
  return list
    .filter((j) => {
      const hay =
        `${j.title} ${j.company} ${j.place} ${j.tags.join(" ")}`.toLowerCase();
      return (
        words.every((w) => hay.includes(w)) &&
        (f.kind === "All" || j.kind === f.kind) &&
        (f.level === "Any" || j.level === f.level) &&
        (!f.savedOnly || saved.includes(j.id))
      );
    })
    .sort((a, b) => a.hours - b.hours);
}

/** Pure: the invitations after one was accepted or ignored, and the new connections. */
export function answerInvite(
  invites: string[],
  connections: string[],
  id: string,
  accept: boolean,
): { invites: string[]; connections: string[] } {
  return {
    invites: invites.filter((x) => x !== id),
    connections:
      accept && invites.includes(id) ? addId(connections, id) : connections,
  };
}

export type Relation = "me" | "connected" | "sent" | "invited" | "none";

/** Pure: how I am related to a member. */
export function relationTo(
  id: string,
  connections: string[],
  sent: string[],
  invites: string[],
): Relation {
  if (id === ME) return "me";
  if (connections.includes(id)) return "connected";
  if (sent.includes(id)) return "sent";
  if (invites.includes(id)) return "invited";
  return "none";
}

const RELATION_LABEL: Record<Relation, string> = {
  me: "",
  connected: "Connected",
  sent: "Invite sent",
  invited: "Accept invite",
  none: "Connect",
};

export const MOODS: MoodDef[] = [
  { id: "hiring", label: "hiring", emoji: "📣" },
  { id: "milestone", label: "milestone", emoji: "🏅" },
  { id: "insight", label: "insight", emoji: "💡" },
];

export interface FeedPost extends Post {
  hours: number;
}

/** Pure: a new update by me, at the top. */
export function publish(
  posts: FeedPost[],
  text: string,
  mood: string,
  id: string,
): FeedPost[] {
  if (!canPost(text)) return posts;
  const me = memberOf(ME);
  return [
    {
      id,
      name: me.name,
      handle: ME,
      tone: me.tone,
      ago: "just now",
      hours: 0,
      text: text.trim(),
      mood: moodLabel(mood, MOODS),
      photo: "",
      phototone: me.tone,
      likes: 0,
      liked: false,
      comments: 0,
      shares: 0,
      shared: false,
    },
    ...posts,
  ];
}

export interface FeedItem {
  post: PostProps;
  open: boolean;
  thread: ThreadProps;
}

const EMPTY_THREAD: ThreadProps = {
  comments: [],
  draft: "",
  canSend: false,
  me: "RC",
  placeholder: "Add a comment...",
};

/** Pure: the updates, newest first, with the comments of the open one. */
export function feedItems(
  posts: FeedPost[],
  comments: Record<string, Comment[]>,
  openId: string,
  draft: string,
): FeedItem[] {
  return [...posts]
    .sort((a, b) => a.hours - b.hours)
    .map((p) => {
      const mine = comments[p.id] ?? [];
      const open = p.id === openId;
      return {
        post: { ...p, comments: mine.length, initials: initialsOf(p.name) },
        open,
        thread: open
          ? {
              ...EMPTY_THREAD,
              comments: commentRows(mine),
              draft,
              canSend: draft.trim().length > 0,
            }
          : EMPTY_THREAD,
      };
    });
}

export interface Core {
  view: View;
  posts: FeedPost[];
  comments: Record<string, Comment[]>;
  openComments: string;
  commentDraft: string;
  draft: string;
  mood: string;
  connections: string[];
  invitesIn: string[];
  sent: string[];
  followed: string[];
  endorsed: string[];
  saved: string[];
  applied: string[];
  filters: JobFilter;
  viewing: string;
  companyId: string;
  conversations: Conversation[];
  activeConv: string;
  messages: Record<string, ChatMessage[]>;
  chatDraft: string;
  typingIn: string;
  inboxQuery: string;
  nextId: number;
}

const TABS: Tab[] = [
  { id: "home", label: "Home", glyph: "home", badge: 0 },
  { id: "network", label: "Network", glyph: "users", badge: 0 },
  { id: "jobs", label: "Jobs", glyph: "target", badge: 0 },
  { id: "messages", label: "Messages", glyph: "message", badge: 0 },
];

const rowOf = (m: Member) => ({
  id: m.id,
  name: m.name,
  tone: m.tone,
  sub: m.headline,
});

export function derive(s: Core) {
  const m = memberOf(s.viewing);
  const rel = relationTo(m.id, s.connections, s.sent, s.invitesIn);
  const base = personHeader({
    id: m.id,
    name: m.name,
    handle: m.id,
    tone: m.tone,
    headline: m.headline,
    bio: m.about,
    place: m.place,
    posts: 0,
    followers: 0,
    followingCount: 0,
    following: false,
    isMe: m.id === ME,
  });
  const head: HeaderProps = {
    ...base,
    handle: "",
    stats: [
      {
        label: "connections",
        value: compact(
          m.connections + (rel === "connected" && m.id !== ME ? 1 : 0),
        ),
      },
      { label: "positions", value: String(m.positions.length) },
      { label: "skills", value: String(m.skills.length) },
    ],
    primaryLabel: RELATION_LABEL[rel],
    primaryDone: rel === "connected" || rel === "sent",
    secondaryLabel: rel === "me" ? "" : "Message",
  };
  const co = companyOf(s.companyId);
  const roles = JOBS.filter((j) => j.companyId === co.id);
  const companyHead: HeaderProps = {
    id: co.id,
    name: co.name,
    handle: "",
    initials: co.emoji,
    tone: co.tone,
    cover: ((co.tone + 1) % 5) + 1,
    square: true,
    headline: co.tagline,
    bio: co.about,
    place: co.place,
    verified: true,
    stats: [
      {
        label: "followers",
        value: compact(co.followers + (s.followed.includes(co.id) ? 1 : 0)),
      },
      { label: "employees", value: String(co.employees) },
      { label: "open roles", value: String(roles.length) },
    ],
    primaryLabel: s.followed.includes(co.id) ? "Following" : "Follow",
    primaryDone: s.followed.includes(co.id),
    secondaryLabel: "",
  };
  const found = filterJobs(JOBS, s.filters, s.saved);
  const current =
    s.view === "profile" && s.viewing === ME
      ? "me"
      : s.view === "profile" || s.view === "company"
        ? "network"
        : s.view;
  return {
    nav: navProps(
      "Linkwork",
      TABS.map((t) => ({
        ...t,
        badge:
          t.id === "network"
            ? s.invitesIn.length
            : t.id === "messages"
              ? totalUnread(s.conversations)
              : 0,
      })),
      current,
      "RC",
    ),
    composer: composerProps(
      s.draft,
      s.mood,
      false,
      "RC",
      "Share an update with your network",
      MOODS,
    ),
    feed: feedItems(s.posts, s.comments, s.openComments, s.commentDraft),
    invites: {
      title: `Invitations (${s.invitesIn.length})`,
      empty: "No pending invitations.",
      people: personRows(
        s.invitesIn.map((id) => rowOf(memberOf(id))),
        [],
        "Accept",
        "Accepted",
        "Ignore",
      ),
    },
    suggest: {
      title: "People you may know",
      empty: "No suggestions right now.",
      people: personRows(
        SUGGESTIONS.filter((id) => !s.connections.includes(id)).map((id) =>
          rowOf(memberOf(id)),
        ),
        s.sent,
        "Connect",
        "Invite sent",
      ),
    },
    conns: {
      title: `Your connections (${s.connections.length})`,
      empty: "Nobody yet.",
      people: personRows(
        s.connections.map((id) => rowOf(memberOf(id))),
        [],
        "Message",
        "Message",
      ),
    },
    kindPick: picksProps(
      KINDS.map((k) => ({ id: k, label: k, emoji: "", count: "" })),
      s.filters.kind,
      "",
      true,
    ),
    jobs: jobProps(found, s.saved, s.applied),
    jobsLabel: found.length === 1 ? "1 job" : `${found.length} jobs`,
    jobsFiltered:
      s.filters.query !== "" ||
      s.filters.kind !== "All" ||
      s.filters.level !== "Any" ||
      s.filters.savedOnly,
    levels: LEVELS,
    head,
    experience: {
      title: "Experience",
      items: positionRows(m.positions, NOW),
    },
    skills: {
      title: "Skills and endorsements",
      own: m.id === ME,
      skills: skillRows(m.skills, s.endorsed),
    },
    companyHead,
    roles: jobProps(roles, s.saved, s.applied),
    staff: {
      title: "People who work here",
      empty: "Nobody listed.",
      people: personRows(
        MEMBERS.filter((x) =>
          x.positions.some((p) => p.companyId === co.id && p.end === 0),
        ).map(rowOf),
        [],
        "View",
        "View",
      ),
    },
    inbox: inboxProps(s.conversations, s.inboxQuery, s.activeConv),
    chat: chatOf(
      s.conversations,
      s.messages,
      s.activeConv,
      s.chatDraft,
      s.typingIn !== "" && s.typingIn === s.activeConv,
    ),
    companies: COMPANIES.length,
  };
}

export type Derived = ReturnType<typeof derive>;

const core: Core = {
  view: "home",
  posts: POSTS,
  comments: COMMENTS,
  openComments: "",
  commentDraft: "",
  draft: "",
  mood: "",
  connections: START_CONNECTIONS,
  invitesIn: START_INVITES,
  sent: [],
  followed: ["northwind"],
  endorsed: [],
  saved: ["j2"],
  applied: [],
  filters: { query: "", kind: "All", level: "Any", savedOnly: false },
  viewing: ME,
  companyId: "lumo",
  conversations: CONVERSATIONS,
  activeConv: "leo",
  messages: MESSAGES,
  chatDraft: "",
  typingIn: "",
  inboxQuery: "",
  nextId: 1,
};

export type ProState = Core & Derived;

export const initial: ProState = { ...core, ...derive(core) };

const CORE_KEYS = Object.keys(core) as (keyof Core)[];
const coreOf = (state: ProState): Core => {
  const c: Record<string, unknown> = {};
  for (const k of CORE_KEYS) c[k] = state[k];
  return c as unknown as Core;
};

export class ProfessionalNetwork extends Component<ProState> {
  view = view;

  // ---- navigation ----
  "nav.go"(msg: Message, state: ProState): Effect[] {
    return this._show(state, { view: msg.payload as View });
  }
  "nav.home"(_msg: Message, state: ProState): Effect[] {
    return this._show(state, { view: "home" });
  }
  "nav.me"(_msg: Message, state: ProState): Effect[] {
    return this._show(state, { view: "profile", viewing: ME });
  }

  // ---- updates ----
  "composer.draft"(msg: Message, state: ProState): Effect[] {
    return this._show(state, { draft: msg.event?.value ?? "" });
  }
  "composer.mood"(msg: Message, state: ProState): Effect[] {
    return this._show(state, {
      mood: pickMood(state.mood, msg.payload as string),
    });
  }
  "composer.photo"(): Effect[] {
    return [];
  }
  "composer.post"(_msg: Message, state: ProState): Effect[] {
    if (!canPost(state.draft)) return [];
    return this._show(state, {
      posts: publish(
        state.posts,
        state.draft,
        state.mood,
        `u${state.nextId + 50}`,
      ),
      nextId: state.nextId + 1,
      draft: "",
      mood: "",
    });
  }
  _updatePost(
    state: ProState,
    id: string,
    f: (p: FeedPost) => FeedPost,
  ): Effect[] {
    return this._show(state, {
      posts: state.posts.map((p) => (p.id === id ? f(p) : p)),
    });
  }
  "post.like"(msg: Message, state: ProState): Effect[] {
    return this._updatePost(state, msg.payload as string, toggleLike);
  }
  "post.share"(msg: Message, state: ProState): Effect[] {
    return this._updatePost(state, msg.payload as string, toggleShare);
  }
  "post.comment"(msg: Message, state: ProState): Effect[] {
    const id = msg.payload as string;
    return this._show(state, {
      openComments: state.openComments === id ? "" : id,
      commentDraft: "",
    });
  }
  "post.open"(msg: Message, state: ProState): Effect[] {
    const p = state.posts.find((x) => x.id === msg.payload);
    return p && MEMBERS.some((m) => m.id === p.handle)
      ? this._show(state, { view: "profile", viewing: p.handle })
      : [];
  }
  "cm.like"(msg: Message, state: ProState): Effect[] {
    const open = state.openComments;
    return this._show(state, {
      comments: {
        ...state.comments,
        [open]: likeComment(state.comments[open] ?? [], msg.payload as string),
      },
    });
  }
  "cm.draft"(msg: Message, state: ProState): Effect[] {
    return this._show(state, { commentDraft: msg.event?.value ?? "" });
  }
  "cm.send"(_msg: Message, state: ProState): Effect[] {
    const open = state.openComments;
    if (open === "" || state.commentDraft.trim() === "") return [];
    return this._show(state, {
      comments: {
        ...state.comments,
        [open]: addComment(
          state.comments[open] ?? [],
          state.commentDraft,
          { name: memberOf(ME).name, tone: 4 },
          `x${state.nextId}`,
        ),
      },
      commentDraft: "",
      nextId: state.nextId + 1,
    });
  }

  // ---- network ----
  "invites.primary"(msg: Message, state: ProState): Effect[] {
    const r = answerInvite(
      state.invitesIn,
      state.connections,
      msg.payload as string,
      true,
    );
    return this._show(state, {
      invitesIn: r.invites,
      connections: r.connections,
    });
  }
  "invites.secondary"(msg: Message, state: ProState): Effect[] {
    const r = answerInvite(
      state.invitesIn,
      state.connections,
      msg.payload as string,
      false,
    );
    return this._show(state, {
      invitesIn: r.invites,
      connections: r.connections,
    });
  }
  "suggest.primary"(msg: Message, state: ProState): Effect[] {
    return this._show(state, {
      sent: addId(state.sent, msg.payload as string),
    });
  }
  "conns.primary"(msg: Message, state: ProState): Effect[] {
    return this._message(state, msg.payload as string);
  }
  _profile(state: ProState, id: string): Effect[] {
    return this._show(state, { view: "profile", viewing: id });
  }
  "invites.open"(msg: Message, state: ProState): Effect[] {
    return this._profile(state, msg.payload as string);
  }
  "suggest.open"(msg: Message, state: ProState): Effect[] {
    return this._profile(state, msg.payload as string);
  }
  "conns.open"(msg: Message, state: ProState): Effect[] {
    return this._profile(state, msg.payload as string);
  }
  "staff.open"(msg: Message, state: ProState): Effect[] {
    return this._profile(state, msg.payload as string);
  }
  "staff.primary"(msg: Message, state: ProState): Effect[] {
    return this._profile(state, msg.payload as string);
  }

  // ---- a profile ----
  "head.primary"(_msg: Message, state: ProState): Effect[] {
    const id = state.viewing;
    const rel = relationTo(id, state.connections, state.sent, state.invitesIn);
    if (rel === "none")
      return this._show(state, { sent: addId(state.sent, id) });
    if (rel === "invited") {
      const r = answerInvite(state.invitesIn, state.connections, id, true);
      return this._show(state, {
        invitesIn: r.invites,
        connections: r.connections,
      });
    }
    return [];
  }
  "head.secondary"(_msg: Message, state: ProState): Effect[] {
    return this._message(state, state.viewing);
  }
  "skills.endorse"(msg: Message, state: ProState): Effect[] {
    return this._show(state, {
      endorsed: toggleEndorse(state.endorsed, msg.payload as string),
    });
  }
  "jobs.company"(msg: Message, state: ProState): Effect[] {
    return this._show(state, {
      view: "company",
      companyId: msg.payload as string,
    });
  }
  "experience.company"(msg: Message, state: ProState): Effect[] {
    return this._show(state, {
      view: "company",
      companyId: msg.payload as string,
    });
  }

  // ---- companies ----
  "companyHead.primary"(_msg: Message, state: ProState): Effect[] {
    return this._show(state, {
      followed: toggleId(state.followed, state.companyId),
    });
  }

  // ---- jobs ----
  setQuery(msg: Message, state: ProState): Effect[] {
    return this._show(state, {
      filters: { ...state.filters, query: msg.event?.value ?? "" },
    });
  }
  setLevel(msg: Message, state: ProState): Effect[] {
    return this._show(state, {
      filters: { ...state.filters, level: msg.event?.value ?? "Any" },
    });
  }
  toggleSavedOnly(msg: Message, state: ProState): Effect[] {
    return this._show(state, {
      filters: { ...state.filters, savedOnly: msg.event?.checked === true },
    });
  }
  "kindPick.pick"(msg: Message, state: ProState): Effect[] {
    return this._show(state, {
      filters: { ...state.filters, kind: msg.payload as string },
    });
  }
  clearFilters(_msg: Message, state: ProState): Effect[] {
    return this._show(state, {
      filters: { query: "", kind: "All", level: "Any", savedOnly: false },
    });
  }
  _save(state: ProState, id: string): Effect[] {
    return this._show(state, { saved: toggleId(state.saved, id) });
  }
  _apply(state: ProState, id: string): Effect[] {
    return this._show(state, { applied: addId(state.applied, id) });
  }
  "job.save"(msg: Message, state: ProState): Effect[] {
    return this._save(state, msg.payload as string);
  }
  "job.apply"(msg: Message, state: ProState): Effect[] {
    return this._apply(state, msg.payload as string);
  }
  "job.company"(msg: Message, state: ProState): Effect[] {
    return this._show(state, {
      view: "company",
      companyId: msg.payload as string,
    });
  }
  "job.open"(msg: Message, state: ProState): Effect[] {
    const j = JOBS.find((x) => x.id === msg.payload);
    return j
      ? this._show(state, { view: "company", companyId: j.companyId })
      : [];
  }
  "role.save"(msg: Message, state: ProState): Effect[] {
    return this._save(state, msg.payload as string);
  }
  "role.apply"(msg: Message, state: ProState): Effect[] {
    return this._apply(state, msg.payload as string);
  }

  // ---- messages ----
  _message(state: ProState, id: string): Effect[] {
    const m = memberOf(id);
    const next = ensureConversation(state.conversations, state.messages, m);
    return this._show(state, {
      view: "messages",
      activeConv: id,
      conversations: openConversation(next.list, id),
      messages: next.messages,
    });
  }
  "inbox.pick"(msg: Message, state: ProState): Effect[] {
    const id = msg.payload as string;
    return this._show(state, {
      activeConv: id,
      conversations: openConversation(state.conversations, id),
      chatDraft: "",
    });
  }
  "inbox.search"(msg: Message, state: ProState): Effect[] {
    return this._show(state, { inboxQuery: msg.event?.value ?? "" });
  }
  "chat.draft"(msg: Message, state: ProState): Effect[] {
    return this._show(state, { chatDraft: msg.event?.value ?? "" });
  }
  "chat.send"(_msg: Message, state: ProState): Effect[] {
    const id = state.activeConv;
    if (id === "" || !canSend(state.chatDraft)) return [];
    const text = state.chatDraft.trim();
    return [
      ...this._show(state, {
        messages: {
          ...state.messages,
          [id]: appendMessage(
            state.messages[id] ?? [],
            text,
            true,
            "now",
            `m${state.nextId}`,
          ),
        },
        conversations: bumpConversation(state.conversations, id, text),
        chatDraft: "",
        typingIn: id,
        nextId: state.nextId + 2,
      }),
      time.setTimeout("pro-reply", 1300, "answer"),
    ];
  }
  answer(_msg: Message, state: ProState): Effect[] {
    const id = state.typingIn;
    if (id === "") return [];
    const text = answerFor(state.nextId);
    return this._show(state, {
      messages: {
        ...state.messages,
        [id]: appendMessage(
          state.messages[id] ?? [],
          text,
          false,
          "now",
          `m${state.nextId - 1}`,
        ),
      },
      conversations: state.conversations.map((c) =>
        c.id === id ? { ...c, preview: text, time: "now" } : c,
      ),
      typingIn: "",
    });
  }

  _show(state: ProState, patch: Partial<Core>): Effect[] {
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

export const page = new ProfessionalNetwork();
