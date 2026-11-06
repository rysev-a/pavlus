import { beforeAll, expect, test } from "vitest";
import { emptyDb, TABLES, type Db } from "../templates/orbit-social/schema.ts";
import { seedDb } from "../templates/orbit-social/seed.ts";
import {
  bytesOf,
  dbCounts,
  parseSnapshot,
  snapshotOf,
  snapshotText,
} from "../templates/orbit-social/snapshot.ts";

const NOW = "2026-11-04T12:00:00";
let full: Db;
let fullText = "";
beforeAll(() => {
  full = seedDb();
  fullText = snapshotText(snapshotOf(full, NOW));
});

/** A tiny database with one row of every kind. */
function small(): Db {
  return {
    ...emptyDb(),
    users: [1, 2].map((id) => ({
      id,
      name: `U${id}`,
      email: `u${id}@x.io`,
      passwordHash: "h",
      role: id === 1 ? ("admin" as const) : ("user" as const),
      status: "active" as const,
      avatar: "grad:1:2:A",
      about: "",
      city: "Oslo",
      birthday: "2000-01-01",
      website: "",
      phone: "",
      interests: ["chess"],
      createdAt: "2026-01-01T00:00:00",
      lastSeen: "2026-01-02T00:00:00",
    })),
    friends: [
      {
        id: 1,
        userId: 1,
        friendId: 2,
        status: "accepted",
        since: "2026-02-01T00:00:00",
      },
    ],
    posts: [
      {
        id: 1,
        authorId: 1,
        wallId: 1,
        communityId: 0,
        kind: "music",
        text: "",
        songId: 1,
        photoId: 0,
        picture: "",
        url: "",
        linkTitle: "",
        repostOf: 0,
        createdAt: "2026-03-01T00:00:00",
        likeIds: [2],
      },
      {
        id: 2,
        authorId: 2,
        wallId: 0,
        communityId: 1,
        kind: "repost",
        text: "",
        songId: 0,
        photoId: 1,
        picture: "",
        url: "",
        linkTitle: "",
        repostOf: 1,
        createdAt: "2026-03-02T00:00:00",
        likeIds: [],
      },
    ],
    comments: [
      {
        id: 1,
        postId: 1,
        authorId: 2,
        text: "hi",
        createdAt: "2026-03-03T00:00:00",
      },
    ],
    articles: [
      {
        id: 1,
        authorId: 1,
        title: "T",
        body: "B",
        tags: ["a"],
        cover: "grad:1:2:",
        createdAt: "2026-03-03T00:00:00",
        likeIds: [1],
      },
    ],
    photoAlbums: [
      {
        id: 1,
        ownerId: 1,
        title: "A",
        description: "",
        createdAt: "2026-03-03T00:00:00",
      },
    ],
    photos: [
      {
        id: 1,
        albumId: 1,
        ownerId: 1,
        src: "grad:1:2:",
        caption: "",
        createdAt: "2026-03-03T00:00:00",
      },
    ],
    conversations: [
      {
        id: 1,
        kind: "dm",
        title: "",
        memberIds: [1, 2],
        createdAt: "2026-03-03T00:00:00",
      },
    ],
    messages: [
      {
        id: 1,
        conversationId: 1,
        authorId: 1,
        text: "yo",
        createdAt: "2026-03-03T00:00:00",
      },
    ],
    communities: [
      {
        id: 1,
        name: "C",
        description: "d",
        wallpaper: "grad:1:2:",
        ownerId: 1,
        moderatorIds: [2],
        memberIds: [1, 2],
        contactIds: [1],
        createdAt: "2026-03-03T00:00:00",
      },
    ],
    artists: [{ id: 1, name: "Band", country: "UK" }],
    albums: [
      { id: 1, artistId: 1, title: "LP", year: 2020, cover: "grad:1:2:" },
    ],
    songs: [
      {
        id: 1,
        albumId: 1,
        artistId: 1,
        title: "S",
        genre: "Rock",
        duration: 200,
        year: 2020,
      },
    ],
    playlists: [
      {
        id: 1,
        ownerId: 1,
        title: "P",
        songIds: [1],
        createdAt: "2026-03-03T00:00:00",
      },
    ],
    scores: [
      { id: 1, userId: 1, game: "snake", score: 10, at: "2026-03-03T00:00:00" },
    ],
    session: [{ id: 1, userId: 1 }],
  };
}

/** Parses the snapshot of `small()` after `mutate` changed its plain-JSON copy. */
function corrupt(mutate: (data: Record<string, any[]>) => void) {
  const snap = JSON.parse(snapshotText(snapshotOf(small(), NOW)));
  mutate(snap.data);
  return parseSnapshot(JSON.stringify(snap));
}
const errorOf = (r: ReturnType<typeof parseSnapshot>) => (r.ok ? "" : r.error);

test("round trip of the full seed, fast, compact", () => {
  expect(fullText).not.toContain("\n");
  const t0 = performance.now();
  const r = parseSnapshot(fullText);
  const ms = performance.now() - t0;
  expect(r.ok).toBe(true);
  expect(r).toEqual({ ok: true, db: full });
  expect(ms).toBeLessThan(2000);
  expect(bytesOf(fullText)).toBeGreaterThan(5_000_000);
  expect(bytesOf(fullText)).toBeLessThan(16_000_000);
});

test("small database and empty database round-trip; counts and bytes", () => {
  const db = small();
  expect(parseSnapshot(snapshotText(snapshotOf(db, NOW)))).toEqual({
    ok: true,
    db,
  });
  expect(parseSnapshot(snapshotText(snapshotOf(emptyDb(), NOW)))).toEqual({
    ok: true,
    db: emptyDb(),
  });
  expect(Object.keys(dbCounts(db))).toEqual(TABLES);
  expect(dbCounts(db).songs).toBe(1);
  expect(dbCounts(full).users).toBe(1000);
  expect(bytesOf("é")).toBe(2);
});

test("not JSON", () => {
  expect(errorOf(parseSnapshot("{oops"))).toMatch(/^not valid JSON/);
});

test("not an object, wrong app, wrong version, no data", () => {
  expect(errorOf(parseSnapshot("[]"))).toBe("the file is not a JSON object");
  expect(errorOf(parseSnapshot('{"app":"other","version":1}'))).toContain(
    'app is "other"',
  );
  expect(
    errorOf(parseSnapshot('{"app":"orbit-social","version":2}')),
  ).toContain("version 2");
  expect(
    errorOf(parseSnapshot('{"app":"orbit-social","version":1}')),
  ).toContain('"data"');
});

test("a missing table and a table that is not an array", () => {
  expect(errorOf(corrupt((d) => delete d.posts))).toBe(
    'table "posts" is missing',
  );
  expect(errorOf(corrupt((d) => (d.posts = {} as never)))).toBe(
    'table "posts" is not an array',
  );
  expect(errorOf(corrupt((d) => delete d.session))).toBe(
    'table "session" is missing',
  );
});

test("a row that is not an object", () => {
  expect(errorOf(corrupt((d) => (d.users[0] = 5)))).toBe(
    "users[0] is not an object",
  );
});

test("bad ids: missing, zero, fractional, duplicate", () => {
  expect(errorOf(corrupt((d) => delete d.users[0].id))).toContain(
    "users[0].id undefined is not a positive integer",
  );
  expect(errorOf(corrupt((d) => (d.users[0].id = 0)))).toContain(
    "users[0].id 0 is not a positive integer",
  );
  expect(errorOf(corrupt((d) => (d.users[0].id = 1.5)))).toContain(
    "not a positive integer",
  );
  expect(errorOf(corrupt((d) => (d.users[0].id = -3)))).toContain(
    "not a positive integer",
  );
  expect(errorOf(corrupt((d) => d.songs.push({ ...d.songs[0] })))).toBe(
    "songs: id 1 appears twice",
  );
});

test("a required field missing, of the wrong type, or out of its enum", () => {
  expect(errorOf(corrupt((d) => delete d.users[0].email))).toBe(
    "users[1].email is missing",
  );
  expect(errorOf(corrupt((d) => (d.songs[0].duration = "9")))).toBe(
    'songs[1].duration "9" is not an integer',
  );
  expect(errorOf(corrupt((d) => (d.songs[0].year = 2020.5)))).toContain(
    "songs[1].year 2020.5 is not an integer",
  );
  expect(errorOf(corrupt((d) => (d.users[0].name = 5)))).toBe(
    "users[1].name 5 is not a string",
  );
  expect(errorOf(corrupt((d) => (d.users[0].role = "root")))).toBe(
    'users[1].role "root" is not one of user, moderator, admin',
  );
  expect(errorOf(corrupt((d) => (d.users[0].status = "gone")))).toContain(
    "users[1].status",
  );
  expect(errorOf(corrupt((d) => (d.friends[0].status = "maybe")))).toContain(
    "friends[1].status",
  );
  expect(errorOf(corrupt((d) => (d.posts[0].kind = "video")))).toContain(
    "posts[1].kind",
  );
  expect(
    errorOf(corrupt((d) => (d.conversations[0].kind = "group"))),
  ).toContain("conversations[1].kind");
  expect(errorOf(corrupt((d) => (d.scores[0].game = "pong")))).toBe(
    'scores[1].game "pong" is not one of snake, pacman, tetris',
  );
});

test("arrays: not an array, wrong element type", () => {
  expect(errorOf(corrupt((d) => (d.posts[0].likeIds = [2, "x"])))).toBe(
    'posts[1].likeIds[1] "x" is not an integer',
  );
  expect(errorOf(corrupt((d) => (d.posts[0].likeIds = null)))).toBe(
    "posts[1].likeIds null is not an array",
  );
  expect(errorOf(corrupt((d) => (d.users[0].interests = [3])))).toBe(
    "users[1].interests[0] 3 is not a string",
  );
  expect(errorOf(corrupt((d) => (d.playlists[0].songIds = [1.5])))).toContain(
    "playlists[1].songIds[0]",
  );
});

test("every foreign key must resolve", () => {
  const cases: [string, (d: Record<string, any[]>) => void, string][] = [
    [
      "posts",
      (d) => (d.posts[0].authorId = 999),
      "posts[1].authorId 999 is not a user",
    ],
    [
      "posts",
      (d) => (d.posts[0].wallId = 9),
      "posts[1].wallId 9 is not a user",
    ],
    [
      "posts",
      (d) => (d.posts[1].communityId = 9),
      "posts[2].communityId 9 is not a community",
    ],
    [
      "posts",
      (d) => (d.posts[0].songId = 9),
      "posts[1].songId 9 is not a song",
    ],
    [
      "posts",
      (d) => (d.posts[1].photoId = 9),
      "posts[2].photoId 9 is not a photo",
    ],
    [
      "posts",
      (d) => (d.posts[1].repostOf = 9),
      "posts[2].repostOf 9 is not a post",
    ],
    [
      "posts",
      (d) => (d.posts[0].likeIds = [1, 77]),
      "posts[1].likeIds[1] 77 is not a user",
    ],
    [
      "friends",
      (d) => (d.friends[0].friendId = 9),
      "friends[1].friendId 9 is not a user",
    ],
    [
      "comments",
      (d) => (d.comments[0].postId = 9),
      "comments[1].postId 9 is not a post",
    ],
    [
      "comments",
      (d) => (d.comments[0].authorId = 9),
      "comments[1].authorId 9 is not a user",
    ],
    [
      "articles",
      (d) => (d.articles[0].authorId = 9),
      "articles[1].authorId 9 is not a user",
    ],
    [
      "articles",
      (d) => (d.articles[0].likeIds = [9]),
      "articles[1].likeIds[0] 9 is not a user",
    ],
    [
      "photoAlbums",
      (d) => (d.photoAlbums[0].ownerId = 9),
      "photoAlbums[1].ownerId 9 is not a user",
    ],
    [
      "photos",
      (d) => (d.photos[0].albumId = 9),
      "photos[1].albumId 9 is not a photo album",
    ],
    [
      "photos",
      (d) => (d.photos[0].ownerId = 9),
      "photos[1].ownerId 9 is not a user",
    ],
    [
      "conversations",
      (d) => (d.conversations[0].memberIds = [1, 9]),
      "conversations[1].memberIds[1] 9 is not a user",
    ],
    [
      "messages",
      (d) => (d.messages[0].conversationId = 9),
      "messages[1].conversationId 9 is not a conversation",
    ],
    [
      "messages",
      (d) => (d.messages[0].authorId = 9),
      "messages[1].authorId 9 is not a user",
    ],
    [
      "communities",
      (d) => (d.communities[0].ownerId = 9),
      "communities[1].ownerId 9 is not a user",
    ],
    [
      "communities",
      (d) => (d.communities[0].moderatorIds = [9]),
      "communities[1].moderatorIds[0] 9 is not a user",
    ],
    [
      "communities",
      (d) => (d.communities[0].memberIds = [1, 9]),
      "communities[1].memberIds[1] 9 is not a user",
    ],
    [
      "communities",
      (d) => (d.communities[0].contactIds = [9]),
      "communities[1].contactIds[0] 9 is not a user",
    ],
    [
      "albums",
      (d) => (d.albums[0].artistId = 9),
      "albums[1].artistId 9 is not an artist",
    ],
    [
      "songs",
      (d) => (d.songs[0].albumId = 9),
      "songs[1].albumId 9 is not an album",
    ],
    [
      "songs",
      (d) => (d.songs[0].artistId = 9),
      "songs[1].artistId 9 is not an artist",
    ],
    [
      "playlists",
      (d) => (d.playlists[0].ownerId = 9),
      "playlists[1].ownerId 9 is not a user",
    ],
    [
      "playlists",
      (d) => (d.playlists[0].songIds = [1, 9]),
      "playlists[1].songIds[1] 9 is not a song",
    ],
    [
      "scores",
      (d) => (d.scores[0].userId = 9),
      "scores[1].userId 9 is not a user",
    ],
    [
      "session",
      (d) => (d.session[0].userId = 9),
      "session[1].userId 9 is not a user",
    ],
  ];
  for (const [, mutate, message] of cases)
    expect(errorOf(corrupt(mutate))).toBe(message);
});

test("0 means none for wallId, communityId, songId, photoId, repostOf", () => {
  expect(
    corrupt((d) =>
      Object.assign(d.posts[0], { songId: 0, photoId: 0, repostOf: 0 }),
    ).ok,
  ).toBe(true);
});

test("rules across fields", () => {
  expect(errorOf(corrupt((d) => (d.friends[0].friendId = 1)))).toContain(
    "themselves",
  );
  expect(errorOf(corrupt((d) => (d.posts[0].wallId = 0)))).toContain("no wall");
  expect(errorOf(corrupt((d) => (d.posts[1].wallId = 1)))).toContain("at once");
  expect(
    errorOf(
      corrupt(
        (d) =>
          d.artists.push({ id: 2, name: "B", country: "UK" }) &&
          (d.songs[0].artistId = 2),
      ),
    ),
  ).toContain("belongs to another artist");
  expect(errorOf(corrupt((d) => (d.photos[0].ownerId = 2)))).toContain(
    "is not the owner of album 1",
  );
  expect(
    errorOf(corrupt((d) => (d.conversations[0].memberIds = [1]))),
  ).toContain("dm");
});

test("unknown extra fields are dropped", () => {
  const r = corrupt((d) => {
    d.users[0].secret = "x";
    d.posts[0].extra = 1;
    d.session[0].more = true;
  });
  expect(r).toEqual({ ok: true, db: small() });
});
