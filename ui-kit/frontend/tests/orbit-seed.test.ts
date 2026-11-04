import { beforeAll, expect, test } from "vitest";
import {
  DEMO_ADMIN,
  DEMO_PASSWORD,
  hashPassword,
} from "../templates/orbit-social/auth.ts";
import {
  GAMES,
  GENRES,
  NOW,
  SEED_COUNTS,
  TABLES,
  type Db,
} from "../templates/orbit-social/schema.ts";
import { seedDb } from "../templates/orbit-social/seed.ts";

let db: Db;
let ms = 0;
beforeAll(() => {
  const t0 = performance.now();
  db = seedDb();
  ms = performance.now() - t0;
});

const ids = (rows: { id: number }[]) => new Set(rows.map((r) => r.id));
const unique = <T>(xs: T[]) => new Set(xs).size === xs.length;

test("speed: the whole database in well under 3 seconds", () => {
  expect(ms).toBeLessThan(3000);
});

test("counts", () => {
  expect(db.users).toHaveLength(SEED_COUNTS.users);
  expect(db.communities).toHaveLength(SEED_COUNTS.communities);
  expect(db.artists).toHaveLength(SEED_COUNTS.artists);
  expect(db.albums).toHaveLength(SEED_COUNTS.albums);
  expect(db.songs).toHaveLength(SEED_COUNTS.songs);
  expect(db.playlists).toHaveLength(SEED_COUNTS.playlists);
  expect(db.session).toEqual([]);
  const accepted = db.friends.filter((f) => f.status === "accepted").length;
  expect(accepted).toBe(6000);
  expect(db.friends.length - accepted).toBe(300);
  expect(db.posts).toHaveLength(4000);
  expect(db.comments).toHaveLength(8000);
  expect(db.articles).toHaveLength(1200);
  expect(db.photoAlbums).toHaveLength(900);
  expect(db.photos).toHaveLength(3500);
  expect(db.conversations).toHaveLength(1200);
  expect(db.conversations.filter((c) => c.kind === "dm")).toHaveLength(800);
  expect(db.messages).toHaveLength(12000);
  expect(db.scores).toHaveLength(300);
});

test("ids start at 1, ascend and are unique in every table", () => {
  for (const t of TABLES) {
    (db[t] as { id: number }[]).forEach((r, i) => expect(r.id).toBe(i + 1));
  }
});

test("users: admin, moderators, banned, unique emails and names of the first members", () => {
  const [admin, ann] = db.users;
  expect(admin).toMatchObject({
    id: 1,
    email: DEMO_ADMIN,
    role: "admin",
    name: "Orbit Admin",
  });
  expect(ann.email).toBe("ann.stone@example.com");
  expect(db.users.filter((u) => u.role === "admin")).toHaveLength(1);
  expect(db.users.filter((u) => u.role === "moderator")).toHaveLength(12);
  expect(db.users.filter((u) => u.status === "banned")).toHaveLength(15);
  expect(
    db.users
      .filter((u) => u.role !== "user")
      .every((u) => u.status === "active"),
  ).toBe(true);
  expect(unique(db.users.map((u) => u.email.toLowerCase()))).toBe(true);
  for (const u of db.users.slice(1, 21))
    expect(u.email).toMatch(/^[a-z]+\.[a-z]+@example\.com$/);
  const h = hashPassword(DEMO_PASSWORD);
  expect(db.users.every((u) => u.passwordHash === h)).toBe(true);
  expect(db.users.every((u) => u.avatar.startsWith("grad:"))).toBe(true);
  expect(
    db.users.every(
      (u) =>
        u.interests.length >= 2 &&
        u.interests.length <= 6 &&
        unique(u.interests),
    ),
  ).toBe(true);
  expect(
    db.users.every((u) => u.createdAt <= u.lastSeen && u.lastSeen <= NOW),
  ).toBe(true);
  expect(
    db.users.every((u) => u.birthday >= "1960" && u.birthday < "2009"),
  ).toBe(true);
  expect(new Set(db.users.map((u) => u.city)).size).toBeGreaterThanOrEqual(55);
  expect(db.users.every((u) => u.about.length > 0)).toBe(true);
});

test("friends: no self, no duplicates (either direction), since after both users", () => {
  const users = new Map(db.users.map((u) => [u.id, u]));
  const seen = new Set<string>();
  for (const f of db.friends) {
    expect(f.userId).not.toBe(f.friendId);
    const key = [f.userId, f.friendId].sort((a, b) => a - b).join("-");
    expect(seen.has(key)).toBe(false);
    seen.add(key);
    expect(f.since >= users.get(f.userId)!.createdAt).toBe(true);
    expect(f.since >= users.get(f.friendId)!.createdAt).toBe(true);
    expect(f.since <= NOW).toBe(true);
  }
  // the first member has friends and pending requests to answer
  expect(
    db.friends.filter(
      (f) => f.status === "accepted" && (f.userId === 2 || f.friendId === 2),
    ).length,
  ).toBeGreaterThan(10);
  expect(
    db.friends.some((f) => f.status === "pending" && f.friendId === 2),
  ).toBe(true);
});

test("posts: walls, kinds, links, reposts", () => {
  const users = ids(db.users);
  const posts = new Map(db.posts.map((p) => [p.id, p]));
  const songs = ids(db.songs);
  const photos = new Map(db.photos.map((p) => [p.id, p]));
  const comm = new Map(db.communities.map((c) => [c.id, c]));
  const friend = new Set<string>();
  for (const f of db.friends)
    if (f.status === "accepted")
      (friend.add(`${f.userId}-${f.friendId}`),
        friend.add(`${f.friendId}-${f.userId}`));
  let own = 0;
  let onFriend = 0;
  let inCommunity = 0;
  const kinds = new Map<string, number>();
  for (const p of db.posts) {
    expect(users.has(p.authorId)).toBe(true);
    kinds.set(p.kind, (kinds.get(p.kind) ?? 0) + 1);
    if (p.communityId) {
      inCommunity++;
      expect(p.wallId).toBe(0);
      expect(comm.get(p.communityId)!.memberIds).toContain(p.authorId);
    } else if (p.wallId === p.authorId) own++;
    else {
      onFriend++;
      expect(friend.has(`${p.authorId}-${p.wallId}`)).toBe(true);
    }
    if (p.kind === "music") expect(songs.has(p.songId)).toBe(true);
    else expect(p.songId).toBe(0);
    if (p.kind === "photo")
      expect(photos.get(p.photoId)!.ownerId).toBe(p.authorId);
    else expect(p.photoId).toBe(0);
    if (p.kind === "picture") expect(p.picture).toMatch(/^grad:/);
    if (p.kind === "link") expect(p.url).toMatch(/^https:\/\/.+\..+\//);
    if (p.kind === "link") expect(p.linkTitle.length).toBeGreaterThan(3);
    if (p.kind === "repost") {
      const o = posts.get(p.repostOf)!;
      expect(o.id).toBeLessThan(p.id);
      expect(o.authorId).not.toBe(p.authorId);
    } else expect(p.repostOf).toBe(0);
    if (p.kind === "text") expect(p.text.length).toBeGreaterThan(5);
    expect(p.likeIds.length).toBeLessThanOrEqual(40);
    expect(unique(p.likeIds)).toBe(true);
    expect(p.likeIds.every((l) => users.has(l))).toBe(true);
  }
  expect(own / 4000).toBeGreaterThan(0.55);
  expect(own / 4000).toBeLessThan(0.75);
  expect(onFriend / 4000).toBeGreaterThan(0.08);
  expect(inCommunity / 4000).toBeGreaterThan(0.12);
  expect(inCommunity / 4000).toBeLessThan(0.25);
  for (const k of ["text", "music", "photo", "picture", "link", "repost"])
    expect(kinds.get(k) ?? 0).toBeGreaterThan(100);
  expect(kinds.get("text")! / 4000).toBeGreaterThan(0.45);
  // creation order, within the last 12 months, after the author joined
  const born = new Map(db.users.map((u) => [u.id, u.createdAt]));
  for (let i = 1; i < db.posts.length; i++)
    expect(db.posts[i].createdAt >= db.posts[i - 1].createdAt).toBe(true);
  expect(db.posts[0].createdAt >= "2025-11-04").toBe(true);
  expect(db.posts.at(-1)!.createdAt <= NOW).toBe(true);
  for (const p of db.posts)
    expect(p.createdAt >= born.get(p.authorId)!).toBe(true);
});

test("comments come after their post, from an existing user", () => {
  const posts = new Map(db.posts.map((p) => [p.id, p]));
  const users = ids(db.users);
  for (const c of db.comments) {
    expect(c.createdAt > posts.get(c.postId)!.createdAt).toBe(true);
    expect(c.createdAt <= NOW).toBe(true);
    expect(users.has(c.authorId)).toBe(true);
    expect(c.text.length).toBeGreaterThan(1);
  }
});

test("articles", () => {
  const users = ids(db.users);
  for (const a of db.articles) {
    expect(users.has(a.authorId)).toBe(true);
    expect(a.title.length).toBeGreaterThan(8);
    const paragraphs = a.body.split("\n\n");
    expect(paragraphs.length).toBeGreaterThanOrEqual(2);
    expect(paragraphs.length).toBeLessThanOrEqual(4);
    expect(a.tags.length).toBeGreaterThanOrEqual(1);
    expect(a.tags.length).toBeLessThanOrEqual(4);
    expect(unique(a.tags)).toBe(true);
    expect(a.cover).toMatch(/^grad:/);
    expect(unique(a.likeIds)).toBe(true);
  }
  expect(new Set(db.articles.flatMap((a) => a.tags)).size).toBe(30);
});

test("albums and photos", () => {
  const albums = new Map(db.photoAlbums.map((a) => [a.id, a]));
  const users = ids(db.users);
  const used = new Set<number>();
  for (const a of db.photoAlbums) expect(users.has(a.ownerId)).toBe(true);
  for (const p of db.photos) {
    const a = albums.get(p.albumId)!;
    used.add(a.id);
    expect(p.ownerId).toBe(a.ownerId);
    expect(p.createdAt >= a.createdAt).toBe(true);
    expect(p.src).toMatch(/^grad:\d+:\d+:.+/);
  }
  expect(used.size).toBe(db.photoAlbums.length);
  const empty = db.photos.filter((p) => p.caption === "").length;
  expect(empty / db.photos.length).toBeGreaterThan(0.5);
});

test("conversations and messages", () => {
  const users = ids(db.users);
  const convs = new Map(db.conversations.map((c) => [c.id, c]));
  const pairs = new Set<string>();
  for (const c of db.conversations) {
    expect(unique(c.memberIds)).toBe(true);
    expect(c.memberIds.every((m) => users.has(m))).toBe(true);
    if (c.kind === "dm") {
      expect(c.memberIds).toHaveLength(2);
      const key = [...c.memberIds].sort((a, b) => a - b).join("-");
      expect(pairs.has(key)).toBe(false);
      pairs.add(key);
    } else {
      expect(c.memberIds.length).toBeGreaterThanOrEqual(3);
      expect(c.memberIds.length).toBeLessThanOrEqual(12);
      expect(c.title.length).toBeGreaterThan(2);
    }
  }
  const count = new Map<number, number>();
  const last = new Map<number, string>();
  for (const m of db.messages) {
    const c = convs.get(m.conversationId)!;
    expect(c.memberIds).toContain(m.authorId);
    expect(m.createdAt > c.createdAt).toBe(true);
    expect(m.createdAt <= NOW).toBe(true);
    expect(m.createdAt >= (last.get(m.conversationId) ?? "")).toBe(true);
    last.set(m.conversationId, m.createdAt);
    count.set(m.conversationId, (count.get(m.conversationId) ?? 0) + 1);
  }
  for (const c of db.conversations)
    expect(count.get(c.id) ?? 0).toBeGreaterThanOrEqual(3);
  // the first member has conversations to open
  expect(
    db.conversations.filter((c) => c.memberIds.includes(2)).length,
  ).toBeGreaterThanOrEqual(5);
});

test("communities: owner is a member, moderators are members, contacts are members", () => {
  const users = ids(db.users);
  for (const c of db.communities) {
    expect(users.has(c.ownerId)).toBe(true);
    expect(c.memberIds).toContain(c.ownerId);
    expect(c.memberIds.length).toBeGreaterThanOrEqual(20);
    expect(c.memberIds.length).toBeLessThanOrEqual(300);
    expect(unique(c.memberIds)).toBe(true);
    expect(c.moderatorIds.length).toBeGreaterThanOrEqual(1);
    expect(c.moderatorIds.length).toBeLessThanOrEqual(3);
    expect(c.moderatorIds).not.toContain(c.ownerId);
    for (const m of c.moderatorIds) expect(c.memberIds).toContain(m);
    expect(c.contactIds).toContain(c.ownerId);
    for (const m of c.contactIds) expect(c.memberIds).toContain(m);
    expect(c.wallpaper).toMatch(/^grad:/);
    expect(c.description.length).toBeGreaterThan(20);
  }
  expect(unique(db.communities.map((c) => c.name))).toBe(true);
  expect(
    db.communities.filter((c) => c.memberIds.includes(2)).length,
  ).toBeGreaterThanOrEqual(3);
});

test("music: artists, albums, songs, genres", () => {
  const artists = ids(db.artists);
  const albums = new Map(db.albums.map((a) => [a.id, a]));
  expect(unique(db.artists.map((a) => a.name))).toBe(true);
  const albumsOf = new Set<number>();
  for (const a of db.albums) {
    expect(artists.has(a.artistId)).toBe(true);
    albumsOf.add(a.artistId);
    expect(a.year).toBeGreaterThanOrEqual(1960);
    expect(a.year).toBeLessThanOrEqual(2026);
    expect(a.cover).toMatch(/^grad:/);
  }
  expect(albumsOf.size).toBe(db.artists.length);
  expect(unique(db.albums.map((a) => `${a.artistId}|${a.title}`))).toBe(true);
  const songsOfAlbum = new Map<number, number>();
  const genresOfArtist = new Map<number, Set<string>>();
  const pairs = new Set<string>();
  for (const s of db.songs) {
    const al = albums.get(s.albumId)!;
    expect(al.artistId).toBe(s.artistId);
    expect(s.year).toBe(al.year);
    expect((GENRES as readonly string[]).includes(s.genre)).toBe(true);
    expect(s.duration).toBeGreaterThanOrEqual(90);
    expect(s.duration).toBeLessThanOrEqual(420);
    const key = `${s.artistId}|${s.title}`;
    expect(pairs.has(key)).toBe(false);
    pairs.add(key);
    songsOfAlbum.set(s.albumId, (songsOfAlbum.get(s.albumId) ?? 0) + 1);
    if (!genresOfArtist.has(s.artistId))
      genresOfArtist.set(s.artistId, new Set());
    genresOfArtist.get(s.artistId)!.add(s.genre);
  }
  for (const al of db.albums)
    expect(songsOfAlbum.get(al.id) ?? 0).toBeGreaterThanOrEqual(3);
  expect(genresOfArtist.size).toBe(db.artists.length); // every artist has songs
  // search by genre makes sense: each genre has many songs and artists are mostly focused
  for (const g of GENRES)
    expect(db.songs.filter((s) => s.genre === g).length).toBeGreaterThan(100);
  const focused = [...genresOfArtist.values()].filter(
    (g) => g.size <= 4,
  ).length;
  expect(focused / genresOfArtist.size).toBeGreaterThan(0.7);
});

test("playlists and scores", () => {
  const users = ids(db.users);
  const songs = ids(db.songs);
  for (const p of db.playlists) {
    expect(users.has(p.ownerId)).toBe(true);
    expect(p.songIds.length).toBeGreaterThanOrEqual(3);
    expect(p.songIds.length).toBeLessThanOrEqual(60);
    expect(unique(p.songIds)).toBe(true);
    expect(p.songIds.every((s) => songs.has(s))).toBe(true);
    expect(p.title.length).toBeGreaterThan(2);
  }
  for (const s of db.scores) {
    expect(users.has(s.userId)).toBe(true);
    expect((GAMES as readonly string[]).includes(s.game)).toBe(true);
    expect(s.score).toBeGreaterThan(0);
  }
  for (const g of GAMES) expect(db.scores.some((s) => s.game === g)).toBe(true);
});

test("deterministic: same seed, same database; another seed, another one", () => {
  expect(seedDb(20261104)).toEqual(db);
  const other = seedDb(7);
  expect(other).not.toEqual(db);
  expect(other.users).toHaveLength(SEED_COUNTS.users);
  expect(other.users[1].email).toBe("ann.stone@example.com");
});
