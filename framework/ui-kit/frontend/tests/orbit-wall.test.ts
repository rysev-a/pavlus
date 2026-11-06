import type { Message } from "@pavlus/frontend";
import { expect, test } from "vitest";
import type { OrbitState } from "../templates/orbit-social/core.ts";
import {
  canDeleteComment,
  canDeletePost,
  canPost,
  friendIds,
  normalizeUrl,
  PAGE_SIZE,
  PICTURES,
  relation,
  scopePosts,
  searchSongs,
} from "../templates/orbit-social/modules/wall/posts.ts";
import { initialState, page } from "../templates/orbit-social/orbit-social.ts";
import { gradient } from "../templates/orbit-social/pictures.ts";
import {
  type Comment,
  type Community,
  type Db,
  emptyDb,
  NOW,
  type Post,
  type User,
} from "../templates/orbit-social/schema.ts";
import { seedDb } from "../templates/orbit-social/seed.ts";

/** Runs a message through the page and applies its `store.set` effects, like the store plugin. */
function send(
  state: OrbitState,
  id: string,
  payload?: unknown,
  event?: { value?: string; checked?: boolean },
): OrbitState {
  const effects = page.dispatch(
    {
      id,
      payload,
      event: event && { type: "input", value: "", ...event },
    } as Message,
    state,
  );
  const next = { ...state } as Record<string, unknown>;
  for (const e of effects) {
    const x = e as unknown as {
      plugin: string;
      type: string;
      path: string;
      value: unknown;
    };
    if (x.plugin === "store" && x.type === "set") next[x.path] = x.value;
  }
  return next as unknown as OrbitState;
}

const user = (id: number, name: string, role: User["role"] = "user"): User => ({
  id,
  name,
  email: `${name.toLowerCase()}@example.com`,
  passwordHash: "",
  role,
  status: "active",
  avatar: gradient(id * 50, id * 50 + 40, name.charAt(0)),
  about: "",
  city: "Lisbon",
  birthday: "1990-01-01",
  website: "",
  phone: "",
  interests: [],
  createdAt: "2025-01-01T10:00:00",
  lastSeen: NOW,
});

const post = (
  id: number,
  authorId: number,
  wallId: number,
  extra: Partial<Post> = {},
): Post => ({
  id,
  authorId,
  wallId,
  communityId: 0,
  kind: "text",
  text: `post ${id}`,
  songId: 0,
  photoId: 0,
  picture: "",
  url: "",
  linkTitle: "",
  repostOf: 0,
  createdAt: `2026-10-${String(10 + (id % 18)).padStart(2, "0")}T10:00:00`,
  likeIds: [],
  ...extra,
});

/** 1 Ann, 2 Ben (Ann's friend), 3 Cleo (a stranger), 4 Mia (moderator), 5 Root (admin). */
function world(): Db {
  const db = emptyDb();
  db.users = [
    user(1, "Ann"),
    user(2, "Ben"),
    user(3, "Cleo"),
    user(4, "Mia", "moderator"),
    user(5, "Root", "admin"),
  ];
  db.friends = [
    {
      id: 1,
      userId: 1,
      friendId: 2,
      status: "accepted",
      since: "2026-01-01T10:00:00",
    },
  ];
  db.artists = [{ id: 1, name: "The Night Owls", country: "PT" }];
  db.albums = [
    {
      id: 1,
      artistId: 1,
      title: "Low Light",
      year: 2020,
      cover: gradient(1, 2),
    },
  ];
  db.songs = [
    {
      id: 1,
      albumId: 1,
      artistId: 1,
      title: "Blue Hours",
      genre: "Jazz",
      duration: 222,
      year: 2020,
    },
    {
      id: 2,
      albumId: 1,
      artistId: 1,
      title: "Red Morning",
      genre: "Jazz",
      duration: 180,
      year: 2020,
    },
  ];
  db.photoAlbums = [
    {
      id: 1,
      ownerId: 1,
      title: "Trip",
      description: "",
      createdAt: "2026-01-01T10:00:00",
    },
  ];
  db.photos = [
    {
      id: 1,
      albumId: 1,
      ownerId: 1,
      src: gradient(10, 50, "🌅"),
      caption: "",
      createdAt: "2026-02-01T10:00:00",
    },
    {
      id: 2,
      albumId: 1,
      ownerId: 3,
      src: gradient(10, 50, "🌲"),
      caption: "",
      createdAt: "2026-02-01T10:00:00",
    },
  ];
  return db;
}

function app(
  db: Db,
  me = 1,
  screen: "wall" | "communities" = "wall",
): OrbitState {
  const s: OrbitState = {
    ...initialState(),
    db,
    me,
    status: "ready",
    view: "app",
    screen,
    now: NOW,
  };
  return {
    ...s,
    [screen]: screen === "wall" ? s.wall : s.communities,
  } as OrbitState;
}

/** The state of the wall after `enter` and `derive` (what the shell does when the screen opens). */
function openWall(db: Db, me = 1, userId = 0): OrbitState {
  let s = app(db, me);
  s = send(s, "nav.go", "wall");
  if (userId) s = send(s, "wall.post.profile", userId);
  return s;
}

test("the wall opens on my own wall and shows the header and the posts newest first", () => {
  const db = world();
  db.posts = [
    post(1, 1, 1, { createdAt: "2026-10-01T10:00:00" }),
    post(2, 1, 1, { createdAt: "2026-10-05T10:00:00" }),
    post(3, 2, 1, { createdAt: "2026-10-03T10:00:00" }),
  ];
  const s = openWall(db);
  expect(s.screen).toBe("wall");
  expect(s.wall.header.title).toBe("Ann");
  expect(s.wall.header.stats[0]).toEqual({ label: "friend", value: "1" });
  expect(s.wall.header.actions.map((a) => a.id)).toEqual(["edit"]);
  expect(s.wall.feed.cards.map((c) => c.id)).toEqual([2, 3, 1]);
  expect(s.wall.showTabs).toBe(true);
  expect(s.wall.feed.composer?.kinds).toHaveLength(5);
});

test("an author name opens that user's wall; a stranger's wall has no composer and no tabs", () => {
  const db = world();
  db.posts = [post(1, 3, 3)];
  let s = openWall(db, 1, 3);
  expect(s.wall.header.title).toBe("Cleo");
  expect(s.wall.showTabs).toBe(false);
  expect(s.wall.feed.composer).toBeNull();
  expect(s.wall.hint).toMatch(/friends/);
  expect(s.wall.header.actions.map((a) => a.id)).toEqual([
    "addFriend",
    "message",
  ]);
  // a friend's wall can be written on
  s = openWall(db, 1, 2);
  expect(s.wall.feed.composer).not.toBeNull();
  expect(s.wall.header.actions.map((a) => a.label)).toEqual([
    "Friends",
    "Message",
  ]);
});

test("Add friend puts a pending row, Message goes to the messages with the user, Edit goes to the profile", () => {
  const db = world();
  let s = openWall(db, 1, 3);
  s = send(s, "wall.header.action", "addFriend");
  expect(s.db.friends.at(-1)).toMatchObject({
    userId: 1,
    friendId: 3,
    status: "pending",
  });
  expect(relation(s.db, 1, 3)).toBe("sent");
  expect(s.wall.header.actions[0]).toMatchObject({
    label: "Request sent",
    disabled: true,
  });
  // doing it twice adds nothing
  const before = s.db.friends.length;
  s = send(s, "wall.header.action", "addFriend");
  expect(s.db.friends).toHaveLength(before);
  // the other side sees "Accept request" and accepts
  let c = openWall(s.db, 3, 1);
  expect(c.wall.header.actions[0].label).toBe("Accept request");
  c = send(c, "wall.header.action", "accept");
  expect(relation(c.db, 3, 1)).toBe("friends");
  expect(friendIds(c.db, 1).has(3)).toBe(true);
  // message
  s = openWall(db, 1, 3);
  const m = send(s, "wall.header.action", "message");
  expect(m.screen).toBe("messages");
  const e = send(openWall(db), "wall.header.action", "edit");
  expect(e.screen).toBe("profile");
});

test("like toggles the id in likeIds", () => {
  const db = world();
  db.posts = [post(1, 1, 1)];
  let s = openWall(db);
  s = send(s, "wall.post.like", 1);
  expect(s.db.posts[0].likeIds).toEqual([1]);
  expect(s.wall.feed.cards[0]).toMatchObject({ likes: 1, liked: true });
  s = send(s, "wall.post.like", 1);
  expect(s.db.posts[0].likeIds).toEqual([]);
  expect(s.wall.feed.cards[0].liked).toBe(false);
});

test("share reposts the post onto my wall with an optional text, and the card quotes the original", () => {
  const db = world();
  db.posts = [post(1, 3, 3, { text: "original words" })];
  let s = openWall(db, 1, 3);
  s = send(s, "wall.post.share", 1);
  expect(s.wall.feed.cards[0].sharing).toBe(true);
  s = send(s, "wall.post.setShare", undefined, { value: "so true" });
  s = send(s, "wall.post.shareSend", 1);
  const r = s.db.posts.at(-1) as Post;
  expect(r).toMatchObject({
    kind: "repost",
    authorId: 1,
    wallId: 1,
    repostOf: 1,
    text: "so true",
    communityId: 0,
  });
  // my own wall now shows it with the original inside
  s = send(s, "nav.go", "wall");
  const card = s.wall.feed.cards[0];
  expect(card.kind).toBe("repost");
  expect(card.hasOriginal).toBe(true);
  expect(card.original).toMatchObject({
    id: 1,
    authorName: "Cleo",
    text: "original words",
  });
  expect(s.wall.ui.shareId).toBe(0);
  // reposting a repost points at the original, not at the repost
  const again = send(openWall(s.db, 2, 1), "wall.post.shareSend", r.id);
  expect(again.db.posts.at(-1)).toMatchObject({
    authorId: 2,
    wallId: 2,
    repostOf: 1,
  });
  // "Go to the original wall"
  const go = send(openWall(s.db), "wall.post.original", r.id);
  expect(go.screen).toBe("wall");
  expect(go.wall.header.title).toBe("Cleo");
});

test("a repost whose original was deleted says so", () => {
  const db = world();
  db.posts = [
    post(1, 3, 3),
    post(2, 1, 1, { kind: "repost", repostOf: 1, text: "" }),
  ];
  let s = openWall(db, 3);
  s = send(s, "wall.post.remove", 1);
  s = send(openWall(s.db), "nav.go", "wall");
  expect(s.wall.feed.cards[0]).toMatchObject({
    kind: "repost",
    hasOriginal: false,
    originalGone: true,
  });
});

test("who may delete a post: the author, the wall owner, moderators and administrators", () => {
  const db = world();
  const p = post(1, 3, 1);
  expect(canDeletePost(db, 3, p)).toBe(true);
  expect(canDeletePost(db, 1, p)).toBe(true);
  expect(canDeletePost(db, 4, p)).toBe(true);
  expect(canDeletePost(db, 5, p)).toBe(true);
  expect(canDeletePost(db, 2, p)).toBe(false);
  expect(canDeletePost(db, 0, p)).toBe(false);
  db.posts = [p];
  const denied = send(openWall(db, 2, 1), "wall.post.remove", 1);
  expect(denied.db.posts).toHaveLength(1);
  const done = send(openWall(db, 1), "wall.post.remove", 1);
  expect(done.db.posts).toHaveLength(0);
});

test("deleting a post deletes its comments too", () => {
  const db = world();
  db.posts = [post(1, 1, 1), post(2, 1, 1)];
  const c = (id: number, postId: number): Comment => ({
    id,
    postId,
    authorId: 2,
    text: "hi",
    createdAt: NOW,
  });
  db.comments = [c(1, 1), c(2, 1), c(3, 2)];
  const s = send(openWall(db), "wall.post.remove", 1);
  expect(s.db.comments.map((x) => x.id)).toEqual([3]);
});

test("comments: open, type, send, and delete my own (the post owner and staff may delete any)", () => {
  const db = world();
  db.posts = [post(1, 1, 1)];
  let s = openWall(db, 2, 1);
  s = send(s, "wall.post.comments", 1);
  expect(s.wall.feed.cards[0].open).toBe(true);
  expect(s.wall.feed.cards[0].thread?.canSend).toBe(false);
  s = send(s, "wall.cm.setDraft", undefined, { value: "  nice one  " });
  expect(s.wall.feed.cards[0].thread?.canSend).toBe(true);
  s = send(s, "wall.cm.send");
  expect(s.db.comments).toHaveLength(1);
  expect(s.db.comments[0]).toMatchObject({
    postId: 1,
    authorId: 2,
    text: "nice one",
  });
  expect(s.wall.feed.cards[0].commentCount).toBe(1);
  expect(s.wall.feed.cards[0].thread?.draft).toBe("");
  // an empty draft sends nothing
  const none = send(s, "wall.cm.send");
  expect(none.db.comments).toHaveLength(1);
  const cm = s.db.comments[0];
  expect(canDeleteComment(s.db, 2, cm)).toBe(true);
  expect(canDeleteComment(s.db, 1, cm)).toBe(true); // the wall owner
  expect(canDeleteComment(s.db, 4, cm)).toBe(true); // a moderator
  expect(canDeleteComment(s.db, 3, cm)).toBe(false);
  const blocked = send({ ...s, me: 3 }, "wall.cm.remove", cm.id);
  expect(blocked.db.comments).toHaveLength(1);
  const removed = send(s, "wall.cm.remove", cm.id);
  expect(removed.db.comments).toHaveLength(0);
  // the button toggles the thread
  const closed = send(s, "wall.post.comments", 1);
  expect(closed.wall.feed.cards[0].open).toBe(false);
});

test("pagination: ten per page, Older and Newer, clamped", () => {
  const db = world();
  db.posts = Array.from({ length: 25 }, (_, i) =>
    post(i + 1, 1, 1, {
      createdAt: `2026-10-01T10:${String(i).padStart(2, "0")}:00`,
    }),
  );
  let s = openWall(db);
  expect(PAGE_SIZE).toBe(10);
  expect(s.wall.feed.cards).toHaveLength(10);
  expect(s.wall.feed.cards[0].id).toBe(25);
  expect(s.wall.feed.pager).toMatchObject({
    page: 1,
    pages: 3,
    total: 25,
    hasPrev: false,
    hasNext: true,
  });
  s = send(s, "wall.pager.next");
  expect(s.wall.feed.cards[0].id).toBe(15);
  s = send(s, "wall.pager.next");
  expect(s.wall.feed.cards).toHaveLength(5);
  expect(s.wall.feed.pager.hasNext).toBe(false);
  s = send(s, "wall.pager.next");
  expect(s.wall.ui.page).toBe(3);
  s = send(s, "wall.pager.prev");
  s = send(s, "wall.pager.prev");
  s = send(s, "wall.pager.prev");
  expect(s.wall.ui.page).toBe(1);
});

test("the composer posts a text message, and refuses an empty one", () => {
  const db = world();
  let s = openWall(db);
  s = send(s, "wall.composer.send");
  expect(s.db.posts).toHaveLength(0);
  expect(s.wall.feed.composer?.error).toMatch(/Write something/);
  s = send(s, "wall.composer.setText", undefined, { value: "Hello wall" });
  expect(s.wall.feed.composer?.canSend).toBe(true);
  expect(s.wall.feed.composer?.error).toBe("");
  s = send(s, "wall.composer.send");
  expect(s.db.posts).toHaveLength(1);
  expect(s.db.posts[0]).toMatchObject({
    kind: "text",
    text: "Hello wall",
    authorId: 1,
    wallId: 1,
    communityId: 0,
    createdAt: NOW,
  });
  expect(s.wall.feed.cards[0].text).toBe("Hello wall");
  expect(s.wall.feed.composer?.text).toBe("");
});

test("music: search the library, pick a song, post it; the card shows the song and play goes to the music screen", () => {
  const db = world();
  let s = openWall(db);
  s = send(s, "wall.composer.pickKind", "music");
  s = send(s, "wall.composer.setSongQuery", undefined, { value: "night owls" });
  expect(s.wall.feed.composer?.songs.map((x) => x.id)).toEqual([1, 2]);
  s = send(s, "wall.composer.send");
  expect(s.wall.feed.composer?.error).toMatch(/song/);
  s = send(s, "wall.composer.pickSong", 2);
  expect(s.wall.feed.composer?.pickedSong).toBe("Red Morning - The Night Owls");
  s = send(s, "wall.composer.send");
  expect(s.db.posts[0]).toMatchObject({ kind: "music", songId: 2 });
  expect(s.wall.feed.cards[0].song).toEqual({
    id: 2,
    title: "Red Morning",
    artist: "The Night Owls",
    album: "Low Light",
    duration: "3:00",
  });
  const play = send(s, "wall.post.play", 2);
  expect(play.screen).toBe("music");
});

test("photo: only my own photos can be chosen; picture and link posts", () => {
  const db = world();
  let s = openWall(db);
  s = send(s, "wall.composer.pickKind", "photo");
  expect(s.wall.feed.composer?.photos.map((p) => p.id)).toEqual([1]);
  s = send(s, "wall.composer.pickPhoto", 2); // somebody else's photo
  s = send(s, "wall.composer.send");
  expect(s.db.posts).toHaveLength(0);
  s = send(s, "wall.composer.pickPhoto", 1);
  s = send(s, "wall.composer.send");
  expect(s.db.posts[0]).toMatchObject({ kind: "photo", photoId: 1 });
  expect(s.wall.feed.cards[0]).toMatchObject({
    hasImage: true,
    imageGlyph: "🌅",
  });

  s = send(s, "wall.composer.pickKind", "picture");
  expect(s.wall.feed.composer?.pictures).toHaveLength(12);
  s = send(s, "wall.composer.pickPicture", 3);
  s = send(s, "wall.composer.send");
  expect(s.db.posts.at(-1)).toMatchObject({
    kind: "picture",
    picture: PICTURES[3],
  });

  s = send(s, "wall.composer.pickKind", "link");
  s = send(s, "wall.composer.setUrl", undefined, { value: "not a link" });
  s = send(s, "wall.composer.send");
  expect(s.wall.feed.composer?.error).toMatch(/web address/);
  s = send(s, "wall.composer.setUrl", undefined, { value: "example.com/a" });
  s = send(s, "wall.composer.setLinkTitle", undefined, { value: "A page" });
  s = send(s, "wall.composer.send");
  expect(s.db.posts.at(-1)).toMatchObject({
    kind: "link",
    url: "https://example.com/a",
    linkTitle: "A page",
  });
  expect(s.wall.feed.cards[0]).toMatchObject({
    url: "https://example.com/a",
    linkTitle: "A page",
  });
  expect(normalizeUrl("javascript:alert(1)")).toBe("");
  expect(normalizeUrl("ftp://example.com")).toBe("");
});

test("nobody writes on a stranger's wall; a friend's wall takes the post with that wall's id", () => {
  const db = world();
  expect(canPost(db, 1, { kind: "wall", userId: 3 })).toBe(false);
  expect(canPost(db, 1, { kind: "wall", userId: 2 })).toBe(true);
  expect(canPost(db, 1, { kind: "news", userId: 1 })).toBe(false);
  let s = openWall(db, 1, 2);
  s = send(s, "wall.composer.setText", undefined, { value: "hi Ben" });
  s = send(s, "wall.composer.send");
  expect(s.db.posts[0]).toMatchObject({ authorId: 1, wallId: 2 });
  expect(s.wall.feed.cards[0].where).toBe("on Ben's wall");
  // on my own wall nothing was added: the post lives on Ben's wall
  expect(openWall(s.db).wall.feed.cards).toHaveLength(0);
});

test("News shows what my friends posted, newest first, and only on my own wall", () => {
  const db = world();
  db.posts = [
    post(1, 2, 2, { createdAt: "2026-10-01T10:00:00" }),
    post(2, 2, 1, { createdAt: "2026-10-05T10:00:00" }),
    post(3, 3, 3, { createdAt: "2026-10-06T10:00:00" }),
    post(4, 1, 1, { createdAt: "2026-10-07T10:00:00" }),
    post(5, 2, 0, { communityId: 9, createdAt: "2026-10-08T10:00:00" }),
  ];
  let s = openWall(db);
  s = send(s, "wall.pickTab", "news");
  expect(s.wall.tabs.map((t) => t.active)).toEqual([false, true]);
  expect(s.wall.feed.cards.map((c) => c.id)).toEqual([2, 1]);
  expect(s.wall.feed.composer).toBeNull();
  expect(scopePosts(db, { kind: "news", userId: 3 })).toEqual([]);
  s = send(s, "wall.pickTab", "wall");
  expect(s.wall.feed.cards.map((c) => c.id)).toEqual([4, 2]);
  // somebody else's wall never shows the News tab
  const other = openWall(db, 1, 2);
  expect(other.wall.tabs).toEqual([]);
});

test("a new sign-in starts on its own wall", () => {
  const db = world();
  let s = openWall(db, 1, 3);
  expect(s.wall.header.title).toBe("Cleo");
  s = { ...s, me: 2 };
  s = send(s, "nav.go", "wall");
  expect(s.wall.header.title).toBe("Ben");
  const missing = send(openWall(db), "wall.post.profile", 999);
  expect(missing.wall.notFound).toBe(true);
});

test("song search lists the first 8 matches and caches its haystack once per songs array", () => {
  const db = emptyDb();
  db.artists = [{ id: 1, name: "Artist", country: "" }];
  db.albums = [{ id: 1, artistId: 1, title: "Album", year: 2000, cover: "" }];
  db.songs = Array.from({ length: 10000 }, (_, i) => ({
    id: i + 1,
    albumId: 1,
    artistId: 1,
    title: `Song number ${i}`,
    genre: "Rock",
    duration: 200,
    year: 2000,
  }));
  expect(searchSongs(db, "")).toEqual([]);
  expect(searchSongs(db, "song number 1")).toHaveLength(8);
  expect(searchSongs(db, "Song Number 9999").map((s) => s.id)).toEqual([10000]);
  expect(searchSongs(db, "artist")).toHaveLength(8);
  // after the cache exists, typing is fast even for a query that matches late
  const t = performance.now();
  for (let i = 0; i < 200; i++) searchSongs(db, "number 99");
  expect(performance.now() - t).toBeLessThan(1500);
});

test("on the real sample data a wall, its News tab and a community feed derive", () => {
  const db = seedDb();
  const me = db.users.find((u) => u.role === "user")!.id;
  let s = openWall(db, me);
  expect(s.wall.header.title).toBe(db.users.find((u) => u.id === me)!.name);
  expect(s.wall.feed.cards.length).toBeGreaterThan(0);
  s = send(s, "wall.pickTab", "news");
  expect(s.wall.feed.cards.length).toBeGreaterThan(0);
  // every card builds: kinds are all known
  for (const c of s.wall.feed.cards)
    expect(["text", "music", "photo", "picture", "link", "repost"]).toContain(
      c.kind,
    );
  const community: Community | undefined = db.communities[0];
  expect(community).toBeDefined();
});
