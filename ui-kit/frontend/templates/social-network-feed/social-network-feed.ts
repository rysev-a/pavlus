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
  initialsOf,
  type PostProps,
  toggleLike,
  toggleShare,
} from "../../blocks/feed-post/feed-post.ts";
import {
  readAllNotes,
  readNote,
  type Note,
  notesProps,
  unreadCount,
} from "../../blocks/notification-list/notification-list.ts";
import { picksProps } from "../../blocks/pick-list/pick-list.ts";
import {
  canPost,
  composerProps,
  moodLabel,
  pickMood,
} from "../../blocks/post-composer/post-composer.ts";
import {
  type HeaderProps,
  personHeader,
} from "../../blocks/profile-header/profile-header.ts";
import { personRows } from "../../blocks/people-list/people-list.ts";
import { navProps, type Tab } from "../../blocks/social-nav/social-nav.ts";
import {
  markSeen,
  ringsOf,
  type Story,
  viewerOf,
} from "../../blocks/story-row/story-row.ts";
import { trendRows } from "../../blocks/trend-list/trend-list.ts";
import {
  COMMENTS,
  CONVERSATIONS,
  type FeedPost,
  ME,
  MESSAGES,
  MY_STORY,
  nameOf,
  NOTES,
  PEOPLE,
  POSTS,
  type Person,
  START_FOLLOWING,
  STORIES,
  SUGGESTED,
  TOPICS,
} from "./social-network-feed-data.ts";
import view from "./social-network-feed.pavlus";

export type View = "home" | "profile" | "messages" | "alerts";
export type FeedTab = "all" | "following";

export interface Core {
  view: View;
  posts: FeedPost[];
  comments: Record<string, Comment[]>;
  openComments: string;
  commentDraft: string;
  following: string[];
  feedTab: FeedTab;
  /** A topic id (`sourdough`), or "". */
  topic: string;
  draft: string;
  mood: string;
  photoOn: boolean;
  stories: Story[];
  seen: string[];
  openStory: string;
  notes: Note[];
  viewing: string;
  conversations: Conversation[];
  activeConv: string;
  messages: Record<string, ChatMessage[]>;
  chatDraft: string;
  /** The conversation whose partner is "typing". */
  typingIn: string;
  query: string;
  nextId: number;
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
  me: "AM",
  placeholder: "Write a comment...",
};

/** Pure: the posts a feed shows: the tab, then the topic; newest first. */
export function visiblePosts(
  posts: FeedPost[],
  tab: FeedTab,
  following: string[],
  topic: string,
): FeedPost[] {
  const tag = topic === "" ? "" : `#${topic}`;
  return posts
    .filter(
      (p) =>
        (tab === "all" || p.handle === ME || following.includes(p.handle)) &&
        (tag === "" || p.text.toLowerCase().includes(tag)),
    )
    .sort((a, b) => a.hours - b.hours);
}

/** Pure: the posts of one person, newest first. */
export const postsOf = (posts: FeedPost[], handle: string): FeedPost[] =>
  posts.filter((p) => p.handle === handle).sort((a, b) => a.hours - b.hours);

/** Pure: a new post by me at the top of the list. */
export function publish(
  posts: FeedPost[],
  text: string,
  mood: string,
  photo: boolean,
  id: string,
): FeedPost[] {
  const clean = text.trim();
  if (!canPost(text)) return posts;
  const me = PEOPLE.find((p) => p.id === ME) as Person;
  return [
    {
      id,
      name: me.name,
      handle: ME,
      tone: me.tone,
      ago: "just now",
      text: clean,
      mood: moodLabel(mood),
      photo: photo ? "🌄" : "",
      phototone: me.tone,
      likes: 0,
      liked: false,
      comments: 0,
      shares: 0,
      shared: false,
      hours: 0,
    },
    ...posts,
  ];
}

/** Pure: the feed items; only the open post carries its comments. */
export function feedItems(
  list: FeedPost[],
  comments: Record<string, Comment[]>,
  openId: string,
  draft: string,
): FeedItem[] {
  return list.map((p) => {
    const mine = comments[p.id] ?? [];
    const open = p.id === openId;
    return {
      post: {
        ...p,
        comments: mine.length,
        initials: initialsOf(p.name),
      },
      open,
      thread: open
        ? {
            comments: commentRows(mine),
            draft,
            canSend: draft.trim().length > 0,
            me: "AM",
            placeholder: "Write a comment...",
          }
        : EMPTY_THREAD,
    };
  });
}

const TABS: Tab[] = [
  { id: "home", label: "Home", glyph: "home", badge: 0 },
  { id: "messages", label: "Messages", glyph: "message", badge: 0 },
  { id: "alerts", label: "Alerts", glyph: "bell", badge: 0 },
];

export function derive(s: Core) {
  const tabs = TABS.map((t) => ({
    ...t,
    badge:
      t.id === "messages"
        ? totalUnread(s.conversations)
        : t.id === "alerts"
          ? unreadCount(s.notes)
          : 0,
  }));
  const current = s.view === "profile" && s.viewing === ME ? "me" : s.view;
  const list =
    s.view === "profile"
      ? postsOf(s.posts, s.viewing)
      : visiblePosts(s.posts, s.feedTab, s.following, s.topic);
  const person = PEOPLE.find((p) => p.id === s.viewing) as Person;
  const isMe = s.viewing === ME;
  const head: HeaderProps = personHeader({
    id: person.id,
    name: person.name,
    handle: person.id,
    tone: person.tone,
    headline: person.headline,
    bio: person.bio,
    place: person.place,
    posts: isMe ? postsOf(s.posts, ME).length : person.posts,
    followers: person.followers,
    followingCount: person.following,
    following: s.following.includes(person.id),
    isMe,
  });
  const chosen = TOPICS.find((t) => t.id === s.topic);
  return {
    nav: navProps("Chatter", tabs, current, "AM"),
    storyRow: {
      stories: ringsOf(s.stories, s.seen),
      current: viewerOf(s.stories, s.openStory),
    },
    composer: composerProps(
      s.draft,
      s.mood,
      s.photoOn,
      "AM",
      "What is on your mind, Alex?",
    ),
    tabs: picksProps(
      [
        { id: "all", label: "For you", emoji: "✨", count: "" },
        { id: "following", label: "Following", emoji: "👥", count: "" },
      ],
      s.feedTab,
      "",
      true,
    ),
    feed: feedItems(list, s.comments, s.openComments, s.commentDraft),
    topicLabel: chosen ? chosen.tag : "",
    feedEmpty: list.length === 0,
    suggest: {
      title: "People to follow",
      empty: "You follow everyone we know. Nice.",
      people: personRows(
        SUGGESTED.map((id) => {
          const p = PEOPLE.find((x) => x.id === id) as Person;
          return { id, name: p.name, tone: p.tone, sub: p.headline };
        }),
        s.following,
        "Follow",
        "Following",
      ),
    },
    trends: { title: "Trending now", items: trendRows(TOPICS, s.topic) },
    alertList: notesProps(s.notes, "Alerts"),
    head,
    isMe,
    inbox: inboxProps(s.conversations, s.query, s.activeConv),
    chat: chatOf(
      s.conversations,
      s.messages,
      s.activeConv,
      s.chatDraft,
      s.typingIn !== "" && s.typingIn === s.activeConv,
    ),
  };
}

export type Derived = ReturnType<typeof derive>;

const core: Core = {
  view: "home",
  posts: POSTS,
  comments: COMMENTS,
  openComments: "",
  commentDraft: "",
  following: START_FOLLOWING,
  feedTab: "all",
  topic: "",
  draft: "",
  mood: "",
  photoOn: false,
  stories: STORIES,
  seen: ["s4"],
  openStory: "",
  notes: NOTES,
  viewing: ME,
  conversations: CONVERSATIONS,
  activeConv: "nina",
  messages: MESSAGES,
  chatDraft: "",
  typingIn: "",
  query: "",
  nextId: 1,
};

export type SocialFeedState = Core & Derived;

export const initial: SocialFeedState = { ...core, ...derive(core) };

const CORE_KEYS = Object.keys(core) as (keyof Core)[];
const coreOf = (state: SocialFeedState): Core => {
  const c: Record<string, unknown> = {};
  for (const k of CORE_KEYS) c[k] = state[k];
  return c as unknown as Core;
};

export class SocialNetworkFeed extends Component<SocialFeedState> {
  view = view;

  // ---- navigation ----
  "nav.go"(msg: Message, state: SocialFeedState): Effect[] {
    return this._show(state, { view: msg.payload as View, openStory: "" });
  }
  "nav.home"(_msg: Message, state: SocialFeedState): Effect[] {
    return this._show(state, { view: "home", topic: "", openStory: "" });
  }
  "nav.me"(_msg: Message, state: SocialFeedState): Effect[] {
    return this._show(state, { view: "profile", viewing: ME });
  }

  // ---- feed ----
  "tabs.pick"(msg: Message, state: SocialFeedState): Effect[] {
    return this._show(state, { feedTab: msg.payload as FeedTab });
  }
  "trends.pick"(msg: Message, state: SocialFeedState): Effect[] {
    const id = msg.payload as string;
    return this._show(state, {
      view: "home",
      topic: state.topic === id ? "" : id,
    });
  }
  clearTopic(_msg: Message, state: SocialFeedState): Effect[] {
    return this._show(state, { topic: "" });
  }

  "composer.draft"(msg: Message, state: SocialFeedState): Effect[] {
    return this._show(state, { draft: msg.event?.value ?? "" });
  }
  "composer.mood"(msg: Message, state: SocialFeedState): Effect[] {
    return this._show(state, {
      mood: pickMood(state.mood, msg.payload as string),
    });
  }
  "composer.photo"(_msg: Message, state: SocialFeedState): Effect[] {
    return this._show(state, { photoOn: !state.photoOn });
  }
  "composer.post"(_msg: Message, state: SocialFeedState): Effect[] {
    if (!canPost(state.draft)) return [];
    return this._show(state, {
      posts: publish(
        state.posts,
        state.draft,
        state.mood,
        state.photoOn,
        `p${state.nextId + 100}`,
      ),
      nextId: state.nextId + 1,
      draft: "",
      mood: "",
      photoOn: false,
      feedTab: "all",
      topic: "",
    });
  }

  _updatePost(
    state: SocialFeedState,
    id: string,
    f: (p: FeedPost) => FeedPost,
  ): Effect[] {
    return this._show(state, {
      posts: state.posts.map((p) => (p.id === id ? f(p) : p)),
    });
  }
  "post.like"(msg: Message, state: SocialFeedState): Effect[] {
    return this._updatePost(state, msg.payload as string, toggleLike);
  }
  "post.share"(msg: Message, state: SocialFeedState): Effect[] {
    return this._updatePost(state, msg.payload as string, toggleShare);
  }
  "post.comment"(msg: Message, state: SocialFeedState): Effect[] {
    const id = msg.payload as string;
    return this._show(state, {
      openComments: state.openComments === id ? "" : id,
      commentDraft: "",
    });
  }
  "post.open"(msg: Message, state: SocialFeedState): Effect[] {
    const post = state.posts.find((p) => p.id === msg.payload);
    return post
      ? this._show(state, { view: "profile", viewing: post.handle })
      : [];
  }

  "cm.like"(msg: Message, state: SocialFeedState): Effect[] {
    const open = state.openComments;
    return this._show(state, {
      comments: {
        ...state.comments,
        [open]: likeComment(state.comments[open] ?? [], msg.payload as string),
      },
    });
  }
  "cm.draft"(msg: Message, state: SocialFeedState): Effect[] {
    return this._show(state, { commentDraft: msg.event?.value ?? "" });
  }
  "cm.send"(_msg: Message, state: SocialFeedState): Effect[] {
    const open = state.openComments;
    if (open === "" || state.commentDraft.trim() === "") return [];
    return this._show(state, {
      comments: {
        ...state.comments,
        [open]: addComment(
          state.comments[open] ?? [],
          state.commentDraft,
          { name: nameOf(ME), tone: 1 },
          `x${state.nextId}`,
        ),
      },
      commentDraft: "",
      nextId: state.nextId + 1,
    });
  }

  // ---- stories ----
  "stories.open"(msg: Message, state: SocialFeedState): Effect[] {
    const id = msg.payload as string;
    return this._show(state, {
      openStory: id,
      seen: markSeen(state.seen, id),
    });
  }
  "stories.close"(_msg: Message, state: SocialFeedState): Effect[] {
    return this._show(state, { openStory: "" });
  }
  "stories.add"(_msg: Message, state: SocialFeedState): Effect[] {
    if (state.stories.some((s) => s.id === MY_STORY.id))
      return this._show(state, { openStory: MY_STORY.id });
    return this._show(state, {
      stories: [MY_STORY, ...state.stories],
      openStory: MY_STORY.id,
      seen: markSeen(state.seen, MY_STORY.id),
    });
  }

  // ---- people ----
  _toggleFollow(state: SocialFeedState, id: string): Effect[] {
    return this._show(state, {
      following: state.following.includes(id)
        ? state.following.filter((x) => x !== id)
        : [...state.following, id],
    });
  }
  "suggest.primary"(msg: Message, state: SocialFeedState): Effect[] {
    return this._toggleFollow(state, msg.payload as string);
  }
  "suggest.open"(msg: Message, state: SocialFeedState): Effect[] {
    return this._show(state, {
      view: "profile",
      viewing: msg.payload as string,
    });
  }
  "head.primary"(_msg: Message, state: SocialFeedState): Effect[] {
    return state.viewing === ME ? [] : this._toggleFollow(state, state.viewing);
  }
  "head.secondary"(_msg: Message, state: SocialFeedState): Effect[] {
    const person = PEOPLE.find((p) => p.id === state.viewing);
    if (!person) return [];
    const next = ensureConversation(
      state.conversations,
      state.messages,
      person,
    );
    return this._show(state, {
      view: "messages",
      activeConv: person.id,
      conversations: next.list,
      messages: next.messages,
    });
  }

  // ---- alerts ----
  "notes.open"(msg: Message, state: SocialFeedState): Effect[] {
    return this._show(state, {
      notes: readNote(state.notes, msg.payload as string),
    });
  }
  "notes.readAll"(_msg: Message, state: SocialFeedState): Effect[] {
    return this._show(state, { notes: readAllNotes(state.notes) });
  }

  // ---- messages ----
  "inbox.pick"(msg: Message, state: SocialFeedState): Effect[] {
    const id = msg.payload as string;
    return this._show(state, {
      activeConv: id,
      conversations: openConversation(state.conversations, id),
      chatDraft: "",
    });
  }
  "inbox.search"(msg: Message, state: SocialFeedState): Effect[] {
    return this._show(state, { query: msg.event?.value ?? "" });
  }
  "chat.draft"(msg: Message, state: SocialFeedState): Effect[] {
    return this._show(state, { chatDraft: msg.event?.value ?? "" });
  }
  "chat.send"(_msg: Message, state: SocialFeedState): Effect[] {
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
      time.setTimeout("snf-reply", 1300, "answer"),
    ];
  }
  answer(_msg: Message, state: SocialFeedState): Effect[] {
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

  _show(state: SocialFeedState, patch: Partial<Core>): Effect[] {
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

export const page = new SocialNetworkFeed();
