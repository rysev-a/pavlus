/**
 * The "wall" module: a user's wall (the signed-in user's own by default, or another
 * user's wall opened with `go: { screen: "wall", params: { userId } }`). Tabs: "Wall"
 * (posts on this wall) and, on my own wall, "News" (what my friends published).
 * The post cards, the composer, comments, likes, reposts and the pager are shared
 * with the communities (see posts.ts).
 */
import {
  byId,
  type Handler,
  type Module,
  nextId,
  type OrbitState,
  type Update,
} from "../../core.ts";
import { glyphOf, initialsOf, isUpload, pictureStyle } from "../../pictures.ts";
import type { Db } from "../../schema.ts";
import {
  deriveFeed,
  type FeedUi,
  type FeedView,
  feedHandlers,
  friendIds,
  friendRow,
  initialFeedUi,
  relation,
  type Scope,
  scopePosts,
} from "./posts.ts";

export type WallTab = "wall" | "news";

export interface HeaderView {
  coverStyle: string;
  avatarStyle: string;
  avatarText: string;
  title: string;
  subtitle: string;
  about: string;
  badges: { label: string; tone: string }[];
  stats: { label: string; value: string }[];
  actions: { id: string; label: string; variant: string; disabled: boolean }[];
}

export interface WallState {
  /** whose wall: 0 is my own */
  userId: number;
  /** the signed-in user this state was made for (a new sign-in starts on its own wall) */
  forMe: number;
  tab: WallTab;
  ui: FeedUi;
  // derived
  notFound: boolean;
  isOwn: boolean;
  showTabs: boolean;
  tabs: { id: string; label: string; active: boolean }[];
  header: HeaderView;
  feed: FeedView;
  hint: string;
}

const NO_HEADER: HeaderView = {
  coverStyle: "",
  avatarStyle: "",
  avatarText: "",
  title: "",
  subtitle: "",
  about: "",
  badges: [],
  stats: [],
  actions: [],
};
const NO_FEED: FeedView = {
  cards: [],
  pager: {
    page: 1,
    pages: 1,
    total: 0,
    label: "0 posts",
    hasPrev: false,
    hasNext: false,
    prevLabel: "Newer",
    nextLabel: "Older",
  },
  composer: null,
  canPost: false,
  empty: "",
};

/** The id of the wall the slice shows (0 is mine). */
export const wallOwner = (s: WallState, me: number): number =>
  s.forMe === me && s.userId > 0 ? s.userId : me;

/** The posts the wall tab shows: News only on my own wall. */
export function scopeOf(s: WallState, me: number): Scope {
  const owner = wallOwner(s, me);
  return owner === me && s.forMe === me && s.tab === "news"
    ? { kind: "news", userId: me }
    : { kind: "wall", userId: owner };
}

/** The header of a user's wall. */
export function headerOf(db: Db, me: number, userId: number): HeaderView {
  const u = byId(db.users).get(userId);
  if (!u) return NO_HEADER;
  const rel = relation(db, me, userId);
  const actions: HeaderView["actions"] = [];
  if (rel === "self")
    actions.push({
      id: "edit",
      label: "Edit profile",
      variant: "outline",
      disabled: false,
    });
  else {
    if (rel === "none")
      actions.push({
        id: "addFriend",
        label: "Add friend",
        variant: "default",
        disabled: false,
      });
    else if (rel === "incoming")
      actions.push({
        id: "accept",
        label: "Accept request",
        variant: "default",
        disabled: false,
      });
    else if (rel === "sent")
      actions.push({
        id: "none",
        label: "Request sent",
        variant: "secondary",
        disabled: true,
      });
    else
      actions.push({
        id: "none",
        label: "Friends",
        variant: "secondary",
        disabled: true,
      });
    actions.push({
      id: "message",
      label: "Message",
      variant: "outline",
      disabled: false,
    });
  }
  const badges: HeaderView["badges"] = [];
  if (u.role === "admin")
    badges.push({ label: "Administrator", tone: "default" });
  else if (u.role === "moderator")
    badges.push({ label: "Moderator", tone: "secondary" });
  if (u.status === "banned")
    badges.push({ label: "Banned", tone: "destructive" });
  const friends = friendIds(db, userId).size;
  return {
    coverStyle: pictureStyle(u.avatar),
    avatarStyle: pictureStyle(u.avatar),
    avatarText: isUpload(u.avatar)
      ? ""
      : glyphOf(u.avatar) || initialsOf(u.name),
    title: u.name,
    subtitle: u.city,
    about: u.about,
    badges,
    stats: [
      { label: friends === 1 ? "friend" : "friends", value: String(friends) },
      {
        label: "posts",
        value: String(scopePosts(db, { kind: "wall", userId }).length),
      },
    ],
    actions,
  };
}

/** What a header button does. Pure. */
export function headerAction(
  db: Db,
  me: number,
  owner: number,
  id: string,
  now: string,
): Update | void {
  if (id === "edit") return { go: { screen: "profile" } };
  if (id === "message")
    return { go: { screen: "messages", params: { userId: owner } } };
  if (id === "addFriend") {
    if (relation(db, me, owner) !== "none") return;
    return {
      put: {
        friends: [
          {
            id: nextId(db.friends),
            userId: me,
            friendId: owner,
            status: "pending",
            since: now,
          },
        ],
      },
      notice: "Friend request sent",
    };
  }
  if (id === "accept") {
    const row = friendRow(db, me, owner);
    if (!row || row.status !== "pending" || row.friendId !== me) return;
    return {
      put: { friends: [{ ...row, status: "accepted", since: now }] },
      notice: "You are friends now",
    };
  }
}

export const initialWall = (): WallState => ({
  userId: 0,
  forMe: 0,
  tab: "wall",
  ui: initialFeedUi(),
  notFound: false,
  isOwn: true,
  showTabs: false,
  tabs: [],
  header: NO_HEADER,
  feed: NO_FEED,
  hint: "",
});

function derive(state: OrbitState): WallState {
  let s = state.wall;
  if (s.forMe !== state.me)
    s = { ...s, userId: 0, forMe: state.me, tab: "wall", ui: initialFeedUi() };
  const owner = wallOwner(s, state.me);
  if (!byId(state.db.users).has(owner))
    return {
      ...s,
      notFound: true,
      header: NO_HEADER,
      feed: NO_FEED,
      showTabs: false,
      tabs: [],
      hint: "",
    };
  const own = owner === state.me;
  const scope = scopeOf(s, state.me);
  const news = scope.kind === "news";
  const { feed, ui } = deriveFeed(
    state.db,
    state.me,
    state.now,
    scope,
    s.ui,
    news
      ? "Your friends have not posted yet. Add some friends to see their news."
      : own
        ? "Your wall is empty. Write the first post above."
        : "Nothing on this wall yet.",
  );
  return {
    ...s,
    ui,
    notFound: false,
    isOwn: own,
    showTabs: own,
    tabs: own
      ? [
          { id: "wall", label: "Wall", active: !news },
          { id: "news", label: "News", active: news },
        ]
      : [],
    header: headerOf(state.db, state.me, owner),
    feed,
    hint:
      !news && !feed.canPost && !own
        ? "Become friends to write on this wall."
        : "",
  };
}

const feed = feedHandlers("wall", (s) => scopeOf(s.wall, s.me));

const handlers: Record<string, Handler> = {
  ...feed,
  "pager.prev": feed.newer,
  "pager.next": feed.older,
  pickTab: (id, _e, s) => ({
    slice: {
      tab: id === "news" ? "news" : "wall",
      ui: { ...s.wall.ui, page: 1, openId: 0, shareId: 0 },
    },
  }),
  "header.action": (id, _e, s) =>
    headerAction(s.db, s.me, wallOwner(s.wall, s.me), String(id), s.now),
};

export const wallModule: Module<WallState> = {
  key: "wall",
  screens: ["wall"],
  initial: initialWall,
  derive,
  enter: (params, state) => {
    const uid = Number(params?.userId) || 0;
    return {
      slice: {
        userId: uid === state.me ? 0 : uid,
        forMe: state.me,
        tab: "wall",
        ui: initialFeedUi(),
      },
    };
  },
  handlers,
};
