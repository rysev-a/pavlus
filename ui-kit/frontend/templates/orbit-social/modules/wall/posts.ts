/**
 * The shared logic of the post feed: the wall of a user, the news of a user, and
 * the wall of a community (modules `wall` and `communities` both use it).
 * Pure: indexes of the tables, the rules (who may post, like, delete), the cards
 * the blocks `social-post`, `post-comments` and `wall-composer` show, and the
 * handlers of their events (`feedHandlers`).
 */
import { byId, type DomEvent, type Handler, nextId, type OrbitState, type Update, when } from "../../core.ts";
import { glyphOf, gradient, initialsOf, isUpload, pictureStyle } from "../../pictures.ts";
import type { Comment, Community, Db, Friend, Post, Song, User } from "../../schema.ts";

// ---- constants ----

export const PAGE_SIZE = 10;
export const MAX_TEXT = 1000;

/** The twelve generated pictures to choose from (a post, a cover, a wallpaper). */
export const PICTURES: string[] = [
  gradient(20, 340, "🌅"),
  gradient(200, 240, "🌊"),
  gradient(120, 160, "🌲"),
  gradient(320, 280, "🌸"),
  gradient(260, 300, "🚀"),
  gradient(40, 10, "🎨"),
  gradient(210, 190, "⛰"),
  gradient(250, 220, "🌙"),
  gradient(15, 45, "🔥"),
  gradient(100, 140, "🍀"),
  gradient(290, 330, "🦋"),
  gradient(180, 220, "🎧"),
];

export type Scope =
  | { kind: "wall"; userId: number }
  | { kind: "news"; userId: number }
  | { kind: "community"; communityId: number };

export type ComposeKind = "text" | "music" | "photo" | "picture" | "link";

export const COMPOSE_KINDS: { id: ComposeKind; label: string }[] = [
  { id: "text", label: "Message" },
  { id: "music", label: "Music" },
  { id: "photo", label: "Photo" },
  { id: "picture", label: "Picture" },
  { id: "link", label: "Link" },
];

// ---- indexes (cached per table array) ----

interface PostIndex {
  byWall: Map<number, Post[]>;
  byCommunity: Map<number, Post[]>;
  byAuthor: Map<number, Post[]>;
}

const newest = (a: Post, b: Post): number => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : b.id - a.id);

const postIndexes = new WeakMap<Post[], PostIndex>();

/** The posts of a table by wall, community and author, newest first (built once per array). */
export function postIndex(posts: Post[]): PostIndex {
  let idx = postIndexes.get(posts);
  if (!idx) {
    idx = { byWall: new Map(), byCommunity: new Map(), byAuthor: new Map() };
    const push = (m: Map<number, Post[]>, k: number, p: Post): void => {
      const list = m.get(k);
      if (list) list.push(p);
      else m.set(k, [p]);
    };
    for (const p of [...posts].sort(newest)) {
      if (p.communityId > 0) push(idx.byCommunity, p.communityId, p);
      else push(idx.byWall, p.wallId, p);
      push(idx.byAuthor, p.authorId, p);
    }
    postIndexes.set(posts, idx);
  }
  return idx;
}

const commentIndexes = new WeakMap<Comment[], Map<number, Comment[]>>();

/** The comments of each post, oldest first. */
export function commentsOf(comments: Comment[], postId: number): Comment[] {
  let idx = commentIndexes.get(comments);
  if (!idx) {
    idx = new Map();
    for (const c of [...comments].sort((a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : a.id - b.id))) {
      const list = idx.get(c.postId);
      if (list) list.push(c);
      else idx.set(c.postId, [c]);
    }
    commentIndexes.set(comments, idx);
  }
  return idx.get(postId) ?? [];
}

interface FriendIndex {
  accepted: Map<number, Set<number>>;
  rows: Map<string, Friend>;
}
const friendIndexes = new WeakMap<Friend[], FriendIndex>();

function friendIndex(friends: Friend[]): FriendIndex {
  let idx = friendIndexes.get(friends);
  if (!idx) {
    idx = { accepted: new Map(), rows: new Map() };
    const add = (a: number, b: number): void => {
      const set = idx!.accepted.get(a);
      if (set) set.add(b);
      else idx!.accepted.set(a, new Set([b]));
    };
    for (const f of friends) {
      idx.rows.set(`${f.userId}:${f.friendId}`, f);
      if (f.status === "accepted") {
        add(f.userId, f.friendId);
        add(f.friendId, f.userId);
      }
    }
    friendIndexes.set(friends, idx);
  }
  return idx;
}

/** The ids of the accepted friends of a user. */
export function friendIds(db: Db, userId: number): Set<number> {
  return friendIndex(db.friends).accepted.get(userId) ?? new Set();
}

export type Relation = "self" | "friends" | "sent" | "incoming" | "none";

/** How `me` stands to `other`: friends, a request sent by me, one waiting for me, or nothing. */
export function relation(db: Db, me: number, other: number): Relation {
  if (me === other) return "self";
  const idx = friendIndex(db.friends);
  if (idx.accepted.get(me)?.has(other)) return "friends";
  if (idx.rows.has(`${me}:${other}`)) return "sent";
  if (idx.rows.has(`${other}:${me}`)) return "incoming";
  return "none";
}

/** The friend row between two users (either direction), if any. */
export function friendRow(db: Db, a: number, b: number): Friend | undefined {
  const idx = friendIndex(db.friends);
  return idx.rows.get(`${a}:${b}`) ?? idx.rows.get(`${b}:${a}`);
}

// ---- rules ----

export const isStaff = (u: User | undefined): boolean => u?.role === "admin" || u?.role === "moderator";

/** May `me` write on this wall: their own, a friend's, or a community they belong to. */
export function canPost(db: Db, me: number, scope: Scope): boolean {
  if (me <= 0) return false;
  if (scope.kind === "news") return false;
  if (scope.kind === "wall") return scope.userId === me || relation(db, me, scope.userId) === "friends";
  const c = byId(db.communities).get(scope.communityId);
  return !!c && (c.ownerId === me || c.memberIds.includes(me) || c.moderatorIds.includes(me));
}

const runsCommunity = (c: Community | undefined, me: number): boolean => !!c && (c.ownerId === me || c.moderatorIds.includes(me));

/** The author, the owner of the wall, the moderators and administrators, and the leaders of the community. */
export function canDeletePost(db: Db, me: number, post: Post): boolean {
  if (me <= 0) return false;
  if (post.authorId === me || (post.communityId === 0 && post.wallId === me)) return true;
  if (isStaff(byId(db.users).get(me))) return true;
  return post.communityId > 0 && runsCommunity(byId(db.communities).get(post.communityId), me);
}

/** The comment's author, those who may delete the post, and the author of the post. */
export function canDeleteComment(db: Db, me: number, comment: Comment): boolean {
  if (me <= 0) return false;
  if (comment.authorId === me) return true;
  const post = byId(db.posts).get(comment.postId);
  return !!post && canDeletePost(db, me, post);
}

export function toggleId(ids: number[], id: number): number[] {
  return ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id];
}

/** The posts to show for a scope, newest first. */
export function scopePosts(db: Db, scope: Scope): Post[] {
  const idx = postIndex(db.posts);
  if (scope.kind === "wall") return idx.byWall.get(scope.userId) ?? [];
  if (scope.kind === "community") return idx.byCommunity.get(scope.communityId) ?? [];
  // the news: what my friends published on walls
  const out: Post[] = [];
  for (const f of friendIds(db, scope.userId)) {
    for (const p of idx.byAuthor.get(f) ?? []) if (p.communityId === 0) out.push(p);
  }
  return out.sort(newest);
}

// ---- songs search ----

const haystacks = new WeakMap<Song[], string[]>();

function haystackOf(db: Db): string[] {
  let h = haystacks.get(db.songs);
  if (!h) {
    const artists = byId(db.artists);
    const albums = byId(db.albums);
    h = db.songs.map((s) => `${s.title} ${artists.get(s.artistId)?.name ?? ""} ${albums.get(s.albumId)?.title ?? ""}`.toLowerCase());
    haystacks.set(db.songs, h);
  }
  return h;
}

export interface SongView {
  id: number;
  title: string;
  artist: string;
  album: string;
  duration: string;
}

export const fmtDuration = (seconds: number): string => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;

export function songView(db: Db, id: number): SongView | null {
  const s = byId(db.songs).get(id);
  if (!s) return null;
  return {
    id: s.id,
    title: s.title,
    artist: byId(db.artists).get(s.artistId)?.name ?? "",
    album: byId(db.albums).get(s.albumId)?.title ?? "",
    duration: fmtDuration(s.duration),
  };
}

/** The first matches by title, artist or album (the haystack is built once per songs array). */
export function searchSongs(db: Db, query: string, limit = 8): Song[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const h = haystackOf(db);
  const out: Song[] = [];
  for (let i = 0; i < h.length && out.length < limit; i++) if (h[i].includes(q)) out.push(db.songs[i]);
  return out;
}

/** My latest photos (for the photo post). */
export function myPhotos(db: Db, me: number, limit = 12): Db["photos"] {
  const own = db.photos.filter((p) => p.ownerId === me);
  return own.sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : b.id - a.id)).slice(0, limit);
}

// ---- the composer ----

export interface Compose {
  kind: ComposeKind;
  text: string;
  songQuery: string;
  songId: number;
  photoId: number;
  picture: string;
  url: string;
  linkTitle: string;
  error: string;
}

export const initialCompose = (): Compose => ({ kind: "text", text: "", songQuery: "", songId: 0, photoId: 0, picture: "", url: "", linkTitle: "", error: "" });

/** `example.com/a` as `https://example.com/a`; "" when it is not an http(s) address. */
export function normalizeUrl(raw: string): string {
  const t = raw.trim();
  if (!t || /\s/.test(t)) return "";
  const full = /^[a-z][a-z0-9+.-]*:\/\//i.test(t) ? t : `https://${t}`;
  if (!/^https?:\/\/[^/]+\.[^/]+/i.test(full)) return "";
  return full;
}

/** The post a composer makes, or the reason it cannot. Pure. */
export function newPost(db: Db, me: number, scope: Scope, c: Compose, now: string): { post?: Post; error?: string } {
  if (!canPost(db, me, scope)) return { error: "You cannot write here" };
  const text = c.text.trim().slice(0, MAX_TEXT);
  const base: Post = {
    id: nextId(db.posts),
    authorId: me,
    wallId: scope.kind === "wall" ? scope.userId : 0,
    communityId: scope.kind === "community" ? scope.communityId : 0,
    kind: c.kind,
    text,
    songId: 0,
    photoId: 0,
    picture: "",
    url: "",
    linkTitle: "",
    repostOf: 0,
    createdAt: now,
    likeIds: [],
  };
  if (c.kind === "text") {
    if (!text) return { error: "Write something first" };
  } else if (c.kind === "music") {
    if (!byId(db.songs).has(c.songId)) return { error: "Pick a song" };
    base.songId = c.songId;
  } else if (c.kind === "photo") {
    const photo = byId(db.photos).get(c.photoId);
    if (!photo || photo.ownerId !== me) return { error: "Pick one of your photos" };
    base.photoId = photo.id;
  } else if (c.kind === "picture") {
    if (!PICTURES.includes(c.picture) && !isUpload(c.picture)) return { error: "Pick a picture" };
    base.picture = c.picture;
  } else {
    const url = normalizeUrl(c.url);
    if (!url) return { error: "Enter a web address like example.com" };
    base.url = url;
    base.linkTitle = c.linkTitle.trim().slice(0, 120) || url;
  }
  return { post: base };
}

/** A repost of a post onto my own wall (a repost of a repost shows the original). */
export function repost(db: Db, me: number, postId: number, text: string, now: string): Post | null {
  const target = byId(db.posts).get(postId);
  if (!target || me <= 0) return null;
  const originalId = target.kind === "repost" ? target.repostOf : target.id;
  if (!byId(db.posts).has(originalId)) return null;
  return {
    id: nextId(db.posts),
    authorId: me,
    wallId: me,
    communityId: 0,
    kind: "repost",
    text: text.trim().slice(0, MAX_TEXT),
    songId: 0,
    photoId: 0,
    picture: "",
    url: "",
    linkTitle: "",
    repostOf: originalId,
    createdAt: now,
    likeIds: [],
  };
}

/** A new comment, or null when it is empty or the post is gone. */
export function newComment(db: Db, me: number, postId: number, text: string, now: string): Comment | null {
  const t = text.trim().slice(0, 500);
  if (!t || me <= 0 || !byId(db.posts).has(postId)) return null;
  return { id: nextId(db.comments), postId, authorId: me, text: t, createdAt: now };
}

/** The ids to remove when posts are deleted: the posts and their comments. */
export function postRemoval(db: Db, postIds: number[]): { posts: number[]; comments: number[] } {
  const gone = new Set(postIds);
  return { posts: [...gone], comments: db.comments.filter((c) => gone.has(c.postId)).map((c) => c.id) };
}

// ---- the view ----

export interface Body {
  kind: string;
  text: string;
  hasText: boolean;
  song: SongView | null;
  hasImage: boolean;
  imageStyle: string;
  imageGlyph: string;
  url: string;
  linkTitle: string;
}

export interface Who {
  authorId: number;
  authorName: string;
  avatarStyle: string;
  avatarText: string;
  when: string;
  where: string;
}

export interface CommentView {
  id: number;
  authorId: number;
  name: string;
  avatarStyle: string;
  avatarText: string;
  text: string;
  when: string;
  canDelete: boolean;
}

export interface ThreadView {
  postId: number;
  comments: CommentView[];
  draft: string;
  canSend: boolean;
  me: string;
}

export interface PostCard extends Body, Who {
  id: number;
  likes: number;
  liked: boolean;
  commentCount: number;
  canDelete: boolean;
  canInteract: boolean;
  open: boolean;
  sharing: boolean;
  shareText: string;
  thread: ThreadView | null;
  hasOriginal: boolean;
  originalGone: boolean;
  original: (Body & Who & { id: number }) | null;
}

/** The part of a slice the feed keeps for itself (not rendered). */
export interface FeedUi {
  page: number;
  /** the post whose comments are open, 0 none */
  openId: number;
  draft: string;
  /** the post whose share box is open, 0 none */
  shareId: number;
  shareText: string;
  compose: Compose;
}

export const initialFeedUi = (): FeedUi => ({ page: 1, openId: 0, draft: "", shareId: 0, shareText: "", compose: initialCompose() });

export interface ComposerView {
  kinds: { id: string; label: string; active: boolean }[];
  kind: string;
  text: string;
  placeholder: string;
  error: string;
  canSend: boolean;
  songQuery: string;
  songs: { id: number; title: string; artist: string; selected: boolean }[];
  pickedSong: string;
  hasSearch: boolean;
  photos: { id: number; style: string; selected: boolean }[];
  noPhotos: boolean;
  pictures: { i: number; style: string; glyph: string; selected: boolean }[];
  url: string;
  linkTitle: string;
}

export interface PagerView {
  page: number;
  pages: number;
  total: number;
  label: string;
  hasPrev: boolean;
  hasNext: boolean;
  prevLabel: string;
  nextLabel: string;
}

export interface FeedView {
  cards: PostCard[];
  pager: PagerView;
  composer: ComposerView | null;
  canPost: boolean;
  empty: string;
}

export function pagerView(page: number, size: number, total: number, noun: string, labels: [string, string] = ["Newer", "Older"]): PagerView {
  const pages = Math.max(1, Math.ceil(total / size));
  const p = Math.min(Math.max(1, page), pages);
  return { page: p, pages, total, label: `${total} ${noun}`, hasPrev: p > 1, hasNext: p < pages, prevLabel: labels[0], nextLabel: labels[1] };
}

const avatarTextOf = (u: User | undefined): string => (u && !isUpload(u.avatar) ? glyphOf(u.avatar) || initialsOf(u.name) : "");

function bodyOf(db: Db, p: Post): Body {
  let imageSrc = "";
  if (p.kind === "photo") imageSrc = byId(db.photos).get(p.photoId)?.src ?? "";
  else if (p.kind === "picture") imageSrc = p.picture;
  return {
    kind: p.kind,
    text: p.text,
    hasText: p.text.length > 0,
    song: p.kind === "music" ? songView(db, p.songId) : null,
    hasImage: imageSrc !== "",
    imageStyle: imageSrc ? pictureStyle(imageSrc) : "",
    imageGlyph: imageSrc && !isUpload(imageSrc) ? glyphOf(imageSrc) : "",
    url: p.kind === "link" ? p.url : "",
    linkTitle: p.kind === "link" ? p.linkTitle || p.url : "",
  };
}

function whoOf(db: Db, p: Post, now: string): Who {
  const author = byId(db.users).get(p.authorId);
  let where = "";
  if (p.communityId > 0) where = `in ${byId(db.communities).get(p.communityId)?.name ?? "a community"}`;
  else if (p.wallId !== p.authorId) {
    const owner = byId(db.users).get(p.wallId);
    where = owner ? `on ${owner.name}'s wall` : "";
  }
  return {
    authorId: p.authorId,
    authorName: author?.name ?? "Deleted user",
    avatarStyle: author ? pictureStyle(author.avatar) : "background: var(--muted)",
    avatarText: avatarTextOf(author),
    when: when(p.createdAt, now),
    where,
  };
}

/** The card of one post. */
export function cardOf(db: Db, me: number, p: Post, now: string, ui: FeedUi): PostCard {
  const users = byId(db.users);
  const open = ui.openId === p.id;
  let thread: ThreadView | null = null;
  const list = commentsOf(db.comments, p.id);
  if (open) {
    thread = {
      postId: p.id,
      comments: list.map((c) => {
        const a = users.get(c.authorId);
        return {
          id: c.id,
          authorId: c.authorId,
          name: a?.name ?? "Deleted user",
          avatarStyle: a ? pictureStyle(a.avatar) : "background: var(--muted)",
          avatarText: avatarTextOf(a),
          text: c.text,
          when: when(c.createdAt, now),
          canDelete: canDeleteComment(db, me, c),
        };
      }),
      draft: ui.draft,
      canSend: ui.draft.trim().length > 0,
      me: avatarTextOf(users.get(me)),
    };
  }
  let original: PostCard["original"] = null;
  if (p.kind === "repost") {
    const o = byId(db.posts).get(p.repostOf);
    if (o) original = { id: o.id, ...bodyOf(db, o), ...whoOf(db, o, now) };
  }
  return {
    id: p.id,
    ...bodyOf(db, p),
    ...whoOf(db, p, now),
    likes: p.likeIds.length,
    liked: p.likeIds.includes(me),
    commentCount: list.length,
    canDelete: canDeletePost(db, me, p),
    canInteract: me > 0,
    open,
    sharing: ui.shareId === p.id,
    shareText: ui.shareText,
    thread,
    hasOriginal: original !== null,
    originalGone: p.kind === "repost" && original === null,
    original,
  };
}

export function composerView(db: Db, me: number, c: Compose): ComposerView {
  const picked = byId(db.songs).get(c.songId);
  const song = picked ? songView(db, picked.id) : null;
  const results = searchSongs(db, c.songQuery);
  const artists = byId(db.artists);
  const canSend =
    c.kind === "text"
      ? c.text.trim().length > 0
      : c.kind === "music"
        ? !!picked
        : c.kind === "photo"
          ? c.photoId > 0
          : c.kind === "picture"
            ? c.picture !== ""
            : c.url.trim().length > 0;
  const photos = c.kind === "photo" ? myPhotos(db, me) : [];
  return {
    kinds: COMPOSE_KINDS.map((k) => ({ ...k, active: k.id === c.kind })),
    kind: c.kind,
    text: c.text,
    placeholder: c.kind === "text" ? "What is new?" : "Add a few words (optional)",
    error: c.error,
    canSend,
    songQuery: c.songQuery,
    songs: results.map((s) => ({ id: s.id, title: s.title, artist: artists.get(s.artistId)?.name ?? "", selected: s.id === c.songId })),
    pickedSong: song ? `${song.title} - ${song.artist}` : "",
    hasSearch: c.songQuery.trim().length > 0,
    photos: photos.map((p) => ({ id: p.id, style: pictureStyle(p.src), selected: p.id === c.photoId })),
    noPhotos: c.kind === "photo" && photos.length === 0,
    pictures: c.kind === "picture" ? PICTURES.map((src, i) => ({ i, style: pictureStyle(src), glyph: glyphOf(src), selected: src === c.picture })) : [],
    url: c.url,
    linkTitle: c.linkTitle,
  };
}

/** The whole feed of a scope for the page `ui.page`. Returns the clamped `ui` too. */
export function deriveFeed(db: Db, me: number, now: string, scope: Scope, ui: FeedUi, emptyText: string): { feed: FeedView; ui: FeedUi } {
  const all = scopePosts(db, scope);
  const pager = pagerView(ui.page, PAGE_SIZE, all.length, all.length === 1 ? "post" : "posts");
  const rows = all.slice((pager.page - 1) * PAGE_SIZE, pager.page * PAGE_SIZE);
  const allowed = canPost(db, me, scope);
  return {
    ui: pager.page === ui.page ? ui : { ...ui, page: pager.page },
    feed: {
      cards: rows.map((p) => cardOf(db, me, p, now, ui)),
      pager,
      composer: allowed ? composerView(db, me, ui.compose) : null,
      canPost: allowed,
      empty: emptyText,
    },
  };
}

// ---- the handlers of the feed events ----

const text = (e: DomEvent | undefined): string => String(e?.value ?? "");

/**
 * The handlers of the events of `social-post` (`post.*`), `post-comments` (`cm.*`),
 * `wall-composer` (`composer.*`) and the pager (`newer`, `older`). `scopeOf` says which
 * posts the module shows (null when none), and `key` is the module's slice, which
 * holds `ui: FeedUi`.
 */
export function feedHandlers(key: "wall" | "communities", scopeOf: (s: OrbitState) => Scope | null): Record<string, Handler> {
  const uiOf = (s: OrbitState): FeedUi => (s[key] as unknown as { ui: FeedUi }).ui;
  const patch = (s: OrbitState, p: Partial<FeedUi>): Update => ({ slice: { ui: { ...uiOf(s), ...p } } });
  const compose = (s: OrbitState, p: Partial<Compose>): Update => patch(s, { compose: { ...uiOf(s).compose, error: "", ...p } });
  const postOf = (s: OrbitState, id: unknown): Post | undefined => byId(s.db.posts).get(Number(id));

  const removePost = (s: OrbitState, id: unknown): Update | void => {
    const p = postOf(s, id);
    if (!p || !canDeletePost(s.db, s.me, p)) return { notice: "You cannot delete this post" };
    const r = postRemoval(s.db, [p.id]);
    const ui = uiOf(s);
    return {
      remove: { posts: r.posts, comments: r.comments },
      slice: { ui: { ...ui, openId: ui.openId === p.id ? 0 : ui.openId, shareId: ui.shareId === p.id ? 0 : ui.shareId } },
      notice: "Post deleted",
    };
  };

  return {
    "post.like": (id, _e, s) => {
      const p = postOf(s, id);
      if (!p || s.me <= 0) return;
      return { put: { posts: [{ ...p, likeIds: toggleId(p.likeIds, s.me) }] } };
    },
    "post.comments": (id, _e, s) => patch(s, { openId: uiOf(s).openId === Number(id) ? 0 : Number(id), draft: "" }),
    "post.share": (id, _e, s) => patch(s, { shareId: uiOf(s).shareId === Number(id) ? 0 : Number(id), shareText: "" }),
    "post.setShare": (_p, e, s) => patch(s, { shareText: text(e) }),
    "post.shareSend": (id, _e, s) => {
      const p = repost(s.db, s.me, Number(id), uiOf(s).shareText, s.now);
      if (!p) return { notice: "This post cannot be shared" };
      return { put: { posts: [p] }, ...patch(s, { shareId: 0, shareText: "" }), notice: "Shared on your wall" };
    },
    "post.remove": (id, _e, s) => removePost(s, id),
    "post.profile": (userId) => ({ go: { screen: "wall", params: { userId: Number(userId) } } }),
    "post.original": (id, _e, s) => {
      const p = postOf(s, id);
      const o = p ? postOf(s, p.repostOf) : undefined;
      if (!o) return { notice: "The original post was deleted" };
      if (o.communityId > 0) return { go: { screen: "communities", params: { communityId: o.communityId } } };
      return { go: { screen: "wall", params: { userId: o.wallId } } };
    },
    "post.play": (songId) => ({ go: { screen: "music", params: { songId: Number(songId) } } }),

    "cm.setDraft": (_p, e, s) => patch(s, { draft: text(e) }),
    "cm.send": (_p, _e, s) => {
      const ui = uiOf(s);
      const c = newComment(s.db, s.me, ui.openId, ui.draft, s.now);
      if (!c) return;
      return { put: { comments: [c] }, ...patch(s, { draft: "" }) };
    },
    "cm.remove": (id, _e, s) => {
      const c = byId(s.db.comments).get(Number(id));
      if (!c || !canDeleteComment(s.db, s.me, c)) return { notice: "You cannot delete this comment" };
      return { remove: { comments: [c.id] } };
    },
    "cm.open": (userId) => ({ go: { screen: "wall", params: { userId: Number(userId) } } }),

    "composer.pickKind": (id, _e, s) => compose(s, { kind: String(id) as ComposeKind }),
    "composer.setText": (_p, e, s) => compose(s, { text: text(e) }),
    "composer.setSongQuery": (_p, e, s) => compose(s, { songQuery: text(e) }),
    "composer.pickSong": (id, _e, s) => compose(s, { songId: uiOf(s).compose.songId === Number(id) ? 0 : Number(id) }),
    "composer.pickPhoto": (id, _e, s) => compose(s, { photoId: uiOf(s).compose.photoId === Number(id) ? 0 : Number(id) }),
    "composer.pickPicture": (i, _e, s) => compose(s, { picture: PICTURES[Number(i)] ?? "" }),
    "composer.setUrl": (_p, e, s) => compose(s, { url: text(e) }),
    "composer.setLinkTitle": (_p, e, s) => compose(s, { linkTitle: text(e) }),
    "composer.send": (_p, _e, s) => {
      const scope = scopeOf(s);
      if (!scope) return;
      const r = newPost(s.db, s.me, scope, uiOf(s).compose, s.now);
      if (!r.post) return compose(s, { error: r.error ?? "" });
      return { put: { posts: [r.post] }, ...patch(s, { compose: initialCompose(), page: 1 }), notice: "Posted" };
    },

    newer: (_p, _e, s) => patch(s, { page: Math.max(1, uiOf(s).page - 1), openId: 0, shareId: 0 }),
    older: (_p, _e, s) => patch(s, { page: uiOf(s).page + 1, openId: 0, shareId: 0 }),
  };
}
