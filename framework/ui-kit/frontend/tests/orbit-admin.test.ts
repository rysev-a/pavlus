import type { Effect, Message } from "@pavlus/frontend";
import { expect, test } from "vitest";
import { hashPassword } from "../templates/orbit-social/auth.ts";
import type { OrbitState } from "../templates/orbit-social/core.ts";
import { planDelete } from "../templates/orbit-social/modules/admin/cascade.ts";
import { ENTITIES } from "../templates/orbit-social/modules/admin/entities.ts";
import { isAdmin } from "../templates/orbit-social/modules/admin/index.ts";
import { initialState, page } from "../templates/orbit-social/orbit-social.ts";
import {
  type Db,
  emptyDb,
  NOW,
  TABLES,
} from "../templates/orbit-social/schema.ts";
import { seedDb } from "../templates/orbit-social/seed.ts";
import {
  parseSnapshot,
  snapshotOf,
  snapshotText,
} from "../templates/orbit-social/snapshot.ts";

/** Runs a message through the page and applies its `store.set` effects, like the store plugin. */
function send(
  state: OrbitState,
  id: string,
  payload?: unknown,
  event?: { value?: string; checked?: boolean },
): { state: OrbitState; effects: Effect[] } {
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
  return { state: next as unknown as OrbitState, effects };
}
const plugin = (effects: Effect[], name: string) =>
  effects.filter(
    (e) => (e as { plugin: string }).plugin === name,
  ) as unknown as Record<string, unknown>[];
const admin = (
  s: OrbitState,
  id: string,
  payload?: unknown,
  event?: { value?: string; checked?: boolean },
) => send(s, `admin.${id}`, payload, event);
const type = (s: OrbitState, key: string, value: string) =>
  admin(s, "form.change", key, { value }).state;

// ---- a small database by hand ----

const user = (id: number, name: string, role: "user" | "admin" = "user") => ({
  id,
  name,
  email: `${name.toLowerCase()}@example.com`,
  passwordHash: hashPassword("secret1"),
  role,
  status: "active" as const,
  avatar: "grad:10:50:A",
  about: "",
  city: "Lisbon",
  birthday: "1990-01-01",
  website: "",
  phone: "",
  interests: [],
  createdAt: "2026-10-01T10:00:00",
  lastSeen: NOW,
});
const post = (
  id: number,
  authorId: number,
  wallId: number,
  extra: object = {},
) => ({
  id,
  authorId,
  wallId,
  communityId: 0,
  kind: "text" as const,
  text: `post ${id}`,
  songId: 0,
  photoId: 0,
  picture: "",
  url: "",
  linkTitle: "",
  repostOf: 0,
  createdAt: "2026-10-02T10:00:00",
  likeIds: [],
  ...extra,
});

function smallDb(): Db {
  const db = emptyDb();
  db.users = [
    user(1, "Ada", "admin"),
    user(2, "Ben"),
    user(3, "Cy"),
    user(4, "Di"),
  ];
  db.session = [{ id: 1, userId: 1 }];
  db.friends = [
    { id: 1, userId: 2, friendId: 3, status: "accepted", since: NOW },
    { id: 2, userId: 4, friendId: 2, status: "pending", since: NOW },
    { id: 3, userId: 3, friendId: 4, status: "accepted", since: NOW },
  ];
  db.posts = [
    post(1, 2, 2),
    post(2, 3, 2),
    post(3, 4, 4, { kind: "repost", repostOf: 1, text: "" }),
    post(4, 2, 2, { kind: "photo", photoId: 1 }),
    post(5, 3, 3, { likeIds: [2, 4] }),
    post(6, 4, 0, { communityId: 1 }),
  ];
  db.comments = [
    { id: 1, postId: 1, authorId: 3, text: "c1", createdAt: NOW },
    { id: 2, postId: 2, authorId: 2, text: "c2", createdAt: NOW },
    { id: 3, postId: 3, authorId: 3, text: "c3", createdAt: NOW },
    { id: 4, postId: 5, authorId: 4, text: "c4", createdAt: NOW },
  ];
  db.articles = [
    {
      id: 1,
      authorId: 2,
      title: "Hello",
      body: "text",
      tags: ["a"],
      cover: "",
      createdAt: NOW,
      likeIds: [3],
    },
  ];
  db.photoAlbums = [
    { id: 1, ownerId: 2, title: "Trip", description: "", createdAt: NOW },
  ];
  db.photos = [
    {
      id: 1,
      albumId: 1,
      ownerId: 2,
      src: "grad:1:2:x",
      caption: "Sea",
      createdAt: NOW,
    },
  ];
  db.conversations = [
    { id: 1, kind: "dm", title: "", memberIds: [2, 3], createdAt: NOW },
    {
      id: 2,
      kind: "chat",
      title: "Team",
      memberIds: [2, 3, 4],
      createdAt: NOW,
    },
    { id: 3, kind: "dm", title: "", memberIds: [3, 4], createdAt: NOW },
  ];
  db.messages = [
    { id: 1, conversationId: 1, authorId: 3, text: "hi", createdAt: NOW },
    { id: 2, conversationId: 2, authorId: 2, text: "yo", createdAt: NOW },
    { id: 3, conversationId: 2, authorId: 3, text: "hey", createdAt: NOW },
    { id: 4, conversationId: 3, authorId: 4, text: "psst", createdAt: NOW },
  ];
  db.communities = [
    {
      id: 1,
      name: "Chess",
      description: "",
      wallpaper: "grad:1:2:x",
      ownerId: 3,
      moderatorIds: [],
      memberIds: [2, 3, 4],
      contactIds: [3],
      createdAt: NOW,
    },
  ];
  db.artists = [{ id: 1, name: "Band", country: "PT" }];
  db.albums = [{ id: 1, artistId: 1, title: "First", year: 2020, cover: "" }];
  db.songs = [
    {
      id: 1,
      albumId: 1,
      artistId: 1,
      title: "Song",
      genre: "Rock",
      duration: 200,
      year: 2020,
    },
  ];
  db.playlists = [
    { id: 1, ownerId: 2, title: "Mix", songIds: [1], createdAt: NOW },
  ];
  db.scores = [
    { id: 1, userId: 2, game: "snake", score: 50, at: NOW },
    { id: 2, userId: 3, game: "tetris", score: 70, at: NOW },
  ];
  return db;
}

/** The panel open, for the signed-in user `me`. */
function open(db: Db = smallDb(), me = 1): OrbitState {
  db.session = [{ id: 1, userId: me }];
  let s = send(initialState(), "loaded", { data: db, empty: false }).state;
  expect(s.me).toBe(me);
  s = send(s, "nav.go", "admin").state;
  return s;
}
const section = (s: OrbitState, id: string) => admin(s, "section", id).state;
const ids = (rows: { id: number }[]) => rows.map((r) => r.id);

/** Every reference of the database points at a row that exists. */
function dangling(db: Db): string[] {
  const has = (rows: { id: number }[]) => new Set(rows.map((r) => r.id));
  const u = has(db.users);
  const bad: string[] = [];
  const need = (what: string, ok: boolean) => ok || bad.push(what);
  const p = has(db.posts);
  const ph = has(db.photos);
  const al = has(db.photoAlbums);
  const cv = has(db.conversations);
  const sg = has(db.songs);
  const cm = has(db.communities);
  for (const f of db.friends)
    need(`friend ${f.id}`, u.has(f.userId) && u.has(f.friendId));
  for (const x of db.posts) {
    need(`post ${x.id} author`, u.has(x.authorId));
    need(`post ${x.id} wall`, x.wallId === 0 || u.has(x.wallId));
    need(
      `post ${x.id} community`,
      x.communityId === 0 || cm.has(x.communityId),
    );
    need(`post ${x.id} repost`, x.repostOf === 0 || p.has(x.repostOf));
    need(`post ${x.id} photo`, x.photoId === 0 || ph.has(x.photoId));
    need(`post ${x.id} song`, x.songId === 0 || sg.has(x.songId));
    need(
      `post ${x.id} likes`,
      x.likeIds.every((l) => u.has(l)),
    );
  }
  for (const c of db.comments)
    need(`comment ${c.id}`, p.has(c.postId) && u.has(c.authorId));
  for (const a of db.articles)
    need(
      `article ${a.id}`,
      u.has(a.authorId) && a.likeIds.every((l) => u.has(l)),
    );
  for (const a of db.photoAlbums) need(`album ${a.id}`, u.has(a.ownerId));
  for (const x of db.photos)
    need(`photo ${x.id}`, u.has(x.ownerId) && al.has(x.albumId));
  for (const c of db.conversations)
    need(
      `conversation ${c.id}`,
      c.memberIds.length >= 2 && c.memberIds.every((m) => u.has(m)),
    );
  for (const m of db.messages)
    need(`message ${m.id}`, cv.has(m.conversationId) && u.has(m.authorId));
  for (const c of db.communities)
    need(
      `community ${c.id}`,
      u.has(c.ownerId) &&
        [...c.memberIds, ...c.moderatorIds, ...c.contactIds].every((m) =>
          u.has(m),
        ),
    );
  for (const x of db.playlists)
    need(
      `playlist ${x.id}`,
      u.has(x.ownerId) && x.songIds.every((s) => sg.has(s)),
    );
  for (const x of db.scores) need(`score ${x.id}`, u.has(x.userId));
  return bad;
}

// ---- permissions ----

test("a member sees nothing and every handler refuses", () => {
  let s = open(smallDb(), 2);
  expect(s.admin.allowed).toBe(false);
  expect(s.admin.view).toBe("denied");
  expect(s.groups.flatMap((g) => g.items).some((i) => i.id === "admin")).toBe(
    false,
  );
  const before = s.db;
  for (const [id, payload] of [
    ["section", "users"],
    ["table.add"],
    ["bulkBan"],
    ["settingsReset"],
    ["confirmYes"],
    ["table.remove", 3],
    ["viewUser", 3],
  ] as [string, unknown?][]) {
    const r = admin(s, id, payload);
    expect(r.state.db, id).toBe(before);
    expect(r.state.admin.view, id).toBe("denied");
  }
  s = admin(s, "section", "settings").state;
  expect(s.notice).toBe("Admins only");
  expect(plugin(admin(s, "settingsExport").effects, "files")).toHaveLength(0);
});

test("a banned administrator is not an administrator", () => {
  const db = smallDb();
  expect(isAdmin({ db, me: 1 })).toBe(true);
  db.users = [{ ...db.users[0], status: "banned" }, ...db.users.slice(1)];
  expect(isAdmin({ db, me: 1 })).toBe(false);
  expect(isAdmin({ db, me: 99 })).toBe(false);
});

test("the administrator gets the panel with tabs", () => {
  const s = open();
  expect(s.admin.allowed).toBe(true);
  expect(s.admin.view).toBe("overview");
  expect(s.admin.tabs.map((t) => t.id)).toEqual([
    "overview",
    "users",
    "data",
    "settings",
  ]);
  expect(s.admin.overview.kpis.map((k) => k.id)).toEqual(
    expect.arrayContaining([
      "users",
      "posts",
      "comments",
      "messages",
      "photos",
      "songs",
      "communities",
    ]),
  );
  expect(s.admin.overview.usersChart.points).toHaveLength(12);
  expect(s.admin.overview.postsCols).toHaveLength(12);
  expect(s.admin.overview.topUsers.length).toBeLessThanOrEqual(5);
  expect(s.admin.overview.topCommunities).toHaveLength(1);
});

// ---- users ----

test("the users table: search, filters, sort, pages and ticks", () => {
  let s = section(open(), "users");
  expect(s.admin.view).toBe("list");
  expect(s.admin.grid.all).toBe(4);
  s = admin(s, "table.search", undefined, { value: "ben" }).state;
  expect(s.admin.grid.rows).toHaveLength(1);
  s = admin(s, "table.search", undefined, { value: "" }).state;
  s = admin(s, "table.filter", "role", { value: "admin" }).state;
  expect(s.admin.grid.total).toBe(1);
  s = admin(s, "table.filter", "role", { value: "" }).state;
  s = admin(s, "table.pageSize", undefined, { value: "25" }).state;
  expect(s.admin.grid.pageSize).toBe(25);
  s = admin(s, "table.sort", "name").state;
  expect(s.admin.grid.columns.find((c) => c.key === "name")?.dir).toBe("desc");
  s = admin(s, "table.toggleRow", 2).state;
  expect(s.admin.bulk).toMatchObject({ show: true, count: 1, canView: true });
});

test("create a user: the form is checked, the email is unique, the password is hashed", () => {
  let s = section(open(), "users");
  s = admin(s, "table.add").state;
  expect(s.admin.view).toBe("form");
  s = admin(s, "form.save").state;
  expect(s.admin.errors.name).toBeTruthy();
  expect(s.admin.errors.email).toBeTruthy();
  expect(s.admin.errors.newPassword).toMatch(/needs a password/);
  s = type(s, "name", "Eve Adams");
  s = type(s, "email", "BEN@example.com");
  s = type(s, "newPassword", "abc");
  s = admin(s, "form.save").state;
  expect(s.admin.errors.email).toMatch(/already/);
  expect(s.admin.errors.newPassword).toMatch(/6/);
  s = type(s, "email", "eve@example.com");
  s = type(s, "newPassword", "longenough");
  s = type(s, "role", "moderator");
  const done = admin(s, "form.save");
  expect(done.state.admin.view).toBe("list");
  const eve = done.state.db.users.find((u) => u.email === "eve@example.com")!;
  expect(eve).toMatchObject({
    id: 5,
    name: "Eve Adams",
    role: "moderator",
    status: "active",
  });
  expect(eve.passwordHash).toBe(hashPassword("longenough"));
  expect(eve.avatar).toMatch(/^grad:/);
  expect(
    plugin(done.effects, "idb").find((e) => e.type === "put"),
  ).toMatchObject({ table: "users" });
});

test("update a user: a new password replaces the hash, an empty one keeps it", () => {
  let s = section(open(), "users");
  s = admin(s, "table.edit", 2).state;
  expect(s.admin.form.editing).toBe(true);
  expect(s.admin.draft.name).toBe("Ben");
  s = type(s, "city", "Porto");
  s = admin(s, "form.save").state;
  expect(s.db.users[1]).toMatchObject({
    city: "Porto",
    passwordHash: hashPassword("secret1"),
  });
  s = admin(s, "table.edit", 2).state;
  s = type(s, "newPassword", "fresh-pass");
  s = type(s, "status", "banned");
  s = admin(s, "form.save").state;
  expect(s.db.users[1]).toMatchObject({
    status: "banned",
    passwordHash: hashPassword("fresh-pass"),
  });
  expect(
    (s.db.users[1] as unknown as Record<string, unknown>).newPassword,
  ).toBeUndefined();
});

test("you cannot demote, ban or delete yourself", () => {
  let s = section(open(), "users");
  s = admin(s, "table.edit", 1).state;
  s = type(s, "role", "user");
  s = type(s, "status", "banned");
  s = admin(s, "form.save").state;
  expect(s.admin.errors.role).toMatch(/demote/);
  expect(s.admin.errors.status).toMatch(/ban yourself/);
  expect(s.db.users[0].role).toBe("admin");
  s = admin(s, "form.remove").state;
  expect(s.admin.guardNote).toMatch(/own account/);
  expect(s.admin.confirm.open).toBe(false);
});

test("bulk ban and unban", () => {
  let s = section(open(), "users");
  for (const id of [1, 2, 3]) s = admin(s, "table.toggleRow", id).state;
  s = admin(s, "bulkBan").state;
  expect(s.db.users.map((u) => u.status)).toEqual([
    "active",
    "banned",
    "banned",
    "active",
  ]);
  expect(s.notice).toMatch(/2 users banned/);
  expect(s.notice).toMatch(/yourself/);
  expect(s.admin.table.selected).toEqual([]);
  s = admin(s, "table.toggleRow", 2).state;
  s = admin(s, "bulkUnban").state;
  expect(s.db.users[1].status).toBe("active");
});

test("deleting a user asks first, then cascades", () => {
  let s = section(open(), "users");
  s = admin(s, "table.remove", 2).state;
  expect(s.admin.confirm.open).toBe(true);
  expect(s.admin.confirm.text).toMatch(/This also deletes/);
  expect(s.db.users).toHaveLength(4);
  const no = admin(s, "confirmNo").state;
  expect(no.admin.confirm.open).toBe(false);
  expect(no.db.users).toHaveLength(4);
  const r = admin(s, "confirmYes");
  const db = r.state.db;
  expect(ids(db.users)).toEqual([1, 3, 4]);
  expect(ids(db.friends)).toEqual([3]);
  // Ben's posts (1, 4), posts on his wall (2), the repost of post 1 (3); post 5 and 6 stay
  expect(ids(db.posts)).toEqual([5, 6]);
  // comments under removed posts and Ben's own comments are gone
  expect(ids(db.comments)).toEqual([4]);
  expect(db.articles).toHaveLength(0);
  expect(db.photoAlbums).toHaveLength(0);
  expect(db.photos).toHaveLength(0);
  // the dialogue with Ben goes, the group chat loses him, the dialogue of the others stays
  expect(ids(db.conversations)).toEqual([2, 3]);
  expect(db.conversations[0].memberIds).toEqual([3, 4]);
  expect(ids(db.messages)).toEqual([3, 4]);
  expect(db.playlists).toHaveLength(0);
  expect(ids(db.scores)).toEqual([2]);
  expect(db.communities[0].memberIds).toEqual([3, 4]);
  expect(db.posts.find((x) => x.id === 5)?.likeIds).toEqual([4]);
  expect(db.articles).toHaveLength(0);
  expect(dangling(db)).toEqual([]);
  expect(
    plugin(r.effects, "idb")
      .filter((e) => e.type === "remove")
      .map((e) => e.table),
  ).toEqual(expect.arrayContaining(["users", "posts", "comments", "friends"]));
  expect(r.state.notice).toBe("User deleted");
});

test("the owner of a community cannot be deleted", () => {
  let s = section(open(), "users");
  s = admin(s, "table.remove", 3).state;
  expect(s.admin.confirm.open).toBe(false);
  expect(s.admin.guardNote).toMatch(/owner of 1 community/);
  expect(s.db.users).toHaveLength(4);
  // deleting the community first frees the user
  const plan = planDelete(s.db, "communities", [1]);
  expect(plan.refused).toBe("");
  expect(planDelete(s.db, "users", [3]).refused).toMatch(/owner/);
});

test("delete the ticked users at once", () => {
  let s = section(open(), "users");
  s = admin(s, "table.toggleRow", 2).state;
  s = admin(s, "table.toggleRow", 4).state;
  s = admin(s, "table.removeSelected").state;
  expect(s.admin.confirm.text).toMatch(/2 users/);
  s = admin(s, "confirmYes").state;
  expect(ids(s.db.users)).toEqual([1, 3]);
  expect(dangling(s.db)).toEqual([]);
});

test("the page with all the data of a user", () => {
  let s = section(open(), "users");
  s = admin(s, "table.toggleRow", 2).state;
  s = admin(s, "viewTicked").state;
  expect(s.admin.view).toBe("detail");
  const d = s.admin.detail!;
  expect(d.name).toBe("Ben");
  expect(d.fields.map((f) => f.label)).not.toContain("Password");
  expect(JSON.stringify(d)).not.toContain(hashPassword("secret1"));
  const count = (label: string) =>
    d.counts.find((c) => c.label === label)?.value;
  expect(count("Posts")).toBe("2");
  expect(count("Comments")).toBe("1");
  expect(count("Articles")).toBe("1");
  expect(count("Albums")).toBe("1");
  expect(count("Photos")).toBe("1");
  expect(count("Friends")).toBe("1");
  expect(count("Conversations")).toBe("2");
  expect(count("Messages")).toBe("1");
  expect(count("Playlists")).toBe("1");
  expect(count("Scores")).toBe("1");
  expect(count("Communities joined")).toBe("1");
  expect(count("Communities owned")).toBe("0");
  expect(d.lists.map((l) => l.key)).toEqual([
    "posts",
    "albums",
    "photos",
    "friends",
    "playlists",
    "scores",
  ]);
  expect(d.lists[0].items).toHaveLength(2);
  const wall = admin(s, "openWall");
  expect(wall.state.screen).toBe("wall");
  // edit from the detail and come back to it
  s = admin(s, "detailEdit").state;
  expect(s.admin.view).toBe("form");
  s = admin(s, "form.cancel").state;
  expect(s.admin.view).toBe("detail");
  s = admin(s, "detailBack").state;
  expect(s.admin.view).toBe("list");
});

test("another screen can open a user's data with go", () => {
  let s = open();
  s = send(s, "nav.go", "wall").state;
  const r = send(s, "admin.viewUser", 4);
  expect(r.state.admin.detailId).toBe(4);
  expect(r.state.admin.view).toBe("detail");
});

test("paged lists of a user", () => {
  const db = smallDb();
  for (let i = 10; i < 22; i++) db.posts.push(post(i, 2, 2));
  let s = section(open(db), "users");
  s = admin(s, "viewUser", 2).state;
  expect(s.admin.detail!.lists[0]).toMatchObject({
    key: "posts",
    total: 14,
    pages: 3,
    page: 1,
  });
  s = admin(s, "detailPage", ["posts", 1]).state;
  s = admin(s, "detailPage", ["posts", 1]).state;
  s = admin(s, "detailPage", ["posts", 1]).state;
  expect(s.admin.detail!.lists[0].page).toBe(3);
  expect(s.admin.detail!.lists[0].items).toHaveLength(4);
});

// ---- the other tables ----

test("every table has a list, a form and valid defaults", () => {
  let s = section(open(), "data");
  expect(s.admin.entities).toHaveLength(14);
  for (const e of ENTITIES.filter((x) => x.key !== "users")) {
    s = admin(s, "entity", undefined, { value: e.key }).state;
    expect(s.admin.view, e.key).toBe("list");
    expect(s.admin.grid.all, e.key).toBe(s.db[e.key].length);
    expect(s.admin.grid.columns.length, e.key).toBeGreaterThanOrEqual(3);
    expect(s.admin.grid.rows.length, e.key).toBeGreaterThan(0);
    s = admin(s, "table.add").state;
    expect(s.admin.view, e.key).toBe("form");
    expect(s.admin.form.fields.length, e.key).toBe(e.fields.length);
    s = admin(s, "form.cancel").state;
    s = admin(s, "table.edit", s.admin.grid.rows[0].id).state;
    expect(s.admin.form.editing, e.key).toBe(true);
    // an untouched row validates and saves unchanged
    const saved = admin(s, "form.save");
    expect(saved.state.admin.errors, e.key).toEqual({});
    expect(saved.state.admin.view, e.key).toBe("list");
    s = saved.state;
  }
  expect(dangling(s.db)).toEqual([]);
});

test("the users table of the users section is the same list", () => {
  const s = section(open(), "users");
  expect(s.admin.grid.columns.map((c) => c.key)).toEqual([
    "id",
    "name",
    "city",
    "role",
    "status",
    "createdAt",
    "lastSeen",
  ]);
});

test("foreign keys are checked against the table", () => {
  let s = admin(section(open(), "data"), "entity", undefined, {
    value: "comments",
  }).state;
  s = admin(s, "table.add").state;
  s = type(s, "postId", "999");
  s = type(s, "authorId", "3");
  s = type(s, "text", "Nice");
  s = admin(s, "form.save").state;
  expect(s.admin.errors.postId).toMatch(/no post with id 999/);
  s = type(s, "authorId", "77");
  s = type(s, "postId", "1");
  s = admin(s, "form.save").state;
  expect(s.admin.errors.authorId).toMatch(/no user with id 77/);
  s = type(s, "authorId", "3");
  s = admin(s, "form.save").state;
  expect(s.db.comments.at(-1)).toMatchObject({
    id: 5,
    postId: 1,
    authorId: 3,
    text: "Nice",
    createdAt: s.db.comments.at(-1)!.createdAt,
  });
});

test("a post of music needs its song, a photo must belong to its album's owner", () => {
  let s = admin(section(open(), "data"), "entity", undefined, {
    value: "posts",
  }).state;
  s = admin(s, "table.add").state;
  s = type(s, "kind", "music");
  s = type(s, "authorId", "2");
  s = type(s, "wallId", "2");
  s = admin(s, "form.save").state;
  expect(s.admin.errors.kind).toMatch(/song/);
  s = type(s, "songId", "1");
  s = admin(s, "form.save").state;
  expect(s.admin.errors).toEqual({});
  expect(s.db.posts.at(-1)).toMatchObject({
    kind: "music",
    songId: 1,
    wallId: 2,
    communityId: 0,
  });

  s = admin(s, "entity", undefined, { value: "photos" }).state;
  s = admin(s, "table.add").state;
  s = type(s, "albumId", "1");
  s = type(s, "ownerId", "3");
  s = admin(s, "form.save").state;
  expect(s.admin.errors.ownerId).toMatch(/belongs to Ben/);
});

test("deleting a post removes its comments and its reposts", () => {
  let s = admin(section(open(), "data"), "entity", undefined, {
    value: "posts",
  }).state;
  s = admin(s, "table.remove", 1).state;
  expect(s.admin.confirm.text).toMatch(/1 post.*2 comments|2 comments.*1 post/);
  s = admin(s, "confirmYes").state;
  expect(ids(s.db.posts)).toEqual([2, 4, 5, 6]);
  expect(ids(s.db.comments)).toEqual([2, 4]);
  expect(dangling(s.db)).toEqual([]);
});

test("deleting a photo removes the photo posts; a song leaves the playlists", () => {
  let s = admin(section(open(), "data"), "entity", undefined, {
    value: "photos",
  }).state;
  s = admin(s, "table.remove", 1).state;
  s = admin(s, "confirmYes").state;
  expect(s.db.photos).toHaveLength(0);
  expect(s.db.posts.some((p) => p.id === 4)).toBe(false);
  s = admin(s, "entity", undefined, { value: "songs" }).state;
  s = admin(s, "table.remove", 1).state;
  s = admin(s, "confirmYes").state;
  expect(s.db.songs).toHaveLength(0);
  expect(s.db.playlists[0].songIds).toEqual([]);
  expect(dangling(s.db)).toEqual([]);
});

test("an artist or an album that still has children cannot be deleted", () => {
  let s = admin(section(open(), "data"), "entity", undefined, {
    value: "artists",
  }).state;
  s = admin(s, "table.remove", 1).state;
  expect(s.admin.guardNote).toMatch(/still has 1 album and 1 song/);
  s = admin(s, "entity", undefined, { value: "albums" }).state;
  s = admin(s, "table.remove", 1).state;
  expect(s.admin.guardNote).toMatch(/1 song/);
  expect(s.db.albums).toHaveLength(1);
});

test("deleting a conversation removes its messages; deleting a community its wall", () => {
  let s = admin(section(open(), "data"), "entity", undefined, {
    value: "conversations",
  }).state;
  s = admin(s, "table.remove", 2).state;
  s = admin(s, "confirmYes").state;
  expect(ids(s.db.messages)).toEqual([1, 4]);
  s = admin(s, "entity", undefined, { value: "communities" }).state;
  s = admin(s, "table.remove", 1).state;
  s = admin(s, "confirmYes").state;
  expect(s.db.communities).toHaveLength(0);
  expect(s.db.posts.some((p) => p.id === 6)).toBe(false);
  expect(dangling(s.db)).toEqual([]);
});

test("a community saved from the form always has its owner among the members", () => {
  let s = admin(section(open(), "data"), "entity", undefined, {
    value: "communities",
  }).state;
  s = admin(s, "table.edit", 1).state;
  s = type(s, "memberIds", "2");
  s = type(s, "moderatorIds", "4");
  s = admin(s, "form.save").state;
  expect(s.db.communities[0].memberIds.sort()).toEqual([2, 3, 4]);
  s = admin(s, "table.edit", 1).state;
  s = type(s, "memberIds", "2, x");
  s = admin(s, "form.save").state;
  expect(s.admin.errors.memberIds).toMatch(/not an id/);
});

// ---- settings ----

test("settings: counts of every table, export, import and reset", () => {
  let s = section(open(), "settings");
  expect(s.admin.view).toBe("settings");
  expect(s.admin.counts).toHaveLength(15);
  expect(s.admin.counts.find((c) => c.id === "users")?.count).toBe("4");
  expect(s.admin.size).toMatch(/kB$/);

  const ex = admin(s, "settingsExport");
  const dl = plugin(ex.effects, "files").find((e) => e.type === "download")!;
  expect(dl.name).toBe(`orbit-social-${s.now.slice(0, 10)}.json`);
  const parsed = parseSnapshot(String(dl.text));
  expect(parsed.ok).toBe(true);
  expect(dl.text).toBe(snapshotText(snapshotOf(s.db, s.now)));
  expect(dl.onSuccess).toBe("admin.exported");

  const pick = plugin(admin(s, "settingsImport").effects, "files").find(
    (e) => e.type === "pick",
  )!;
  expect(pick.onSuccess).toBe("admin.importPicked");

  // a broken file shows an error and changes nothing
  const bad = admin(s, "importPicked", { name: "x.json", text: "{nope" });
  expect(bad.state.admin.importError).toMatch(/x\.json/);
  expect(bad.state.db).toBe(s.db);
  expect(admin(s, "importFailed", "denied").state.admin.importError).toMatch(
    /denied/,
  );

  // a good one replaces the database and is written
  const other = smallDb();
  other.users.push(user(9, "Zed"));
  const good = admin(s, "importPicked", {
    name: "ok.json",
    text: snapshotText(snapshotOf(other, NOW)),
  });
  expect(good.state.db.users).toHaveLength(5);
  expect(good.state.admin.importError).toBe("");
  expect(good.state.me).toBe(1);
  expect(good.state.db.session).toEqual([{ id: 1, userId: 1 }]);
  expect(plugin(good.effects, "idb").some((e) => e.type === "replaceAll")).toBe(
    true,
  );
  expect(good.state.notice).toMatch(/Imported ok\.json/);
  s = good.state;

  // reset: a question first
  s = admin(s, "settingsAskReset").state;
  expect(s.admin.askReset).toBe(true);
  expect(admin(s, "settingsCancelReset").state.admin.askReset).toBe(false);
  const reset = admin(s, "settingsReset");
  expect(reset.state.admin.askReset).toBe(false);
  expect(reset.state.db.users.length).toBe(1000);
  expect(
    plugin(reset.effects, "idb").some((e) => e.type === "replaceAll"),
  ).toBe(true);
  expect(
    reset.state.db.users.some((u) => u.id === 1 && u.role === "admin"),
  ).toBe(true);
  expect(reset.state.admin.counts.find((c) => c.id === "songs")?.count).toBe(
    "10,000",
  );
});

test("an import without the signed-in user signs them out", () => {
  const s = section(open(), "settings");
  const other = smallDb();
  other.users = other.users.filter((u) => u.id !== 1);
  other.session = [];
  const r = admin(s, "importPicked", {
    name: "o.json",
    text: snapshotText(snapshotOf(other, NOW)),
  });
  expect(r.state.db.session).toEqual([]);
  expect(r.state.view).toBe("auth");
});

// ---- the sample data ----

test("on the sample data: the overview, the users, a cascade that keeps the data consistent", () => {
  let s = open(seedDb(), 1);
  expect(s.admin.view).toBe("overview");
  expect(s.admin.overview.kpis.find((k) => k.id === "users")?.value).toBe(
    "1,000",
  );
  expect(s.admin.overview.topUsers).toHaveLength(5);
  expect(s.admin.overview.topCommunities).toHaveLength(5);
  expect(
    s.admin.overview.usersChart.points.reduce(
      (n, p) => n + Number(p.text.replace("k", "")),
      0,
    ),
  ).toBeGreaterThan(0);

  s = section(s, "users");
  expect(s.admin.grid.all).toBe(1000);
  s = admin(s, "table.pageSize", undefined, { value: "100" }).state;
  expect(s.admin.grid.rows).toHaveLength(100);
  expect(s.admin.grid.pages).toBe(10);
  s = admin(s, "table.search", undefined, { value: "a" }).state;
  expect(s.admin.grid.total).toBeGreaterThan(10);
  s = admin(s, "table.search", undefined, { value: "" }).state;

  const base = dangling(s.db);
  // a user who owns no community
  const owners = new Set(s.db.communities.map((c) => c.ownerId));
  const victim = s.db.users.find(
    (u) =>
      u.id > 1 &&
      !owners.has(u.id) &&
      s.db.posts.some((p) => p.authorId === u.id),
  )!;
  const detail = admin(s, "viewUser", victim.id).state;
  expect(detail.admin.detail!.counts[0].value).not.toBe("0");
  let r = admin(detail, "detailRemove").state;
  r = admin(r, "confirmYes").state;
  expect(r.db.users).toHaveLength(999);
  expect(
    r.db.posts.some((p) => p.authorId === victim.id || p.wallId === victim.id),
  ).toBe(false);
  expect(dangling(r.db)).toEqual(base);

  // a post and a song of the sample data
  const target =
    r.db.posts.find((p) => r.db.posts.some((q) => q.repostOf === p.id)) ??
    r.db.posts[0];
  r = admin(admin(r, "section", "data").state, "entity", undefined, {
    value: "posts",
  }).state;
  r = admin(r, "table.remove", target.id).state;
  r = admin(r, "confirmYes").state;
  expect(dangling(r.db)).toEqual(base);

  // every table of the sample data has a working list and form
  for (const e of ENTITIES) {
    expect(s.db[e.key].length, e.key).toBeGreaterThan(0);
  }
  expect(TABLES).toContain("scores");
});
