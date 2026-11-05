import { expect, test } from "vitest";
import type { Effect, Message } from "@service-laboratory/pavlus";
import { DEMO_PASSWORD, hashPassword } from "../templates/orbit-social/auth.ts";
import type { OrbitState } from "../templates/orbit-social/core.ts";
import {
  deriveShell,
  initialState,
  page,
} from "../templates/orbit-social/orbit-social.ts";
import { gradient } from "../templates/orbit-social/pictures.ts";
import {
  type Db,
  type Friend,
  type User,
  emptyDb,
  NOW,
} from "../templates/orbit-social/schema.ts";
import { seedDb } from "../templates/orbit-social/seed.ts";
import {
  checkAccount,
  checkPassword,
  checkProfile,
  deletionOf,
  isUrl,
  isValidDate,
  parseInterests,
  PRESETS,
  relationOf,
} from "../templates/orbit-social/modules/profile/rules.ts";

/** Runs a message through the page and applies its `store.set` effects, like the store plugin. */
function send(
  state: OrbitState,
  id: string,
  payload?: unknown,
  event?: { value?: string; checked?: boolean },
) {
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
const idbOps = (effects: Effect[]) =>
  plugin(effects, "idb").map((e) => `${e.type}:${e.table}`);

const user = (id: number, name: string, over: Partial<User> = {}): User => ({
  id,
  name,
  email: `${name.split(" ")[0].toLowerCase()}@example.com`,
  passwordHash: hashPassword(DEMO_PASSWORD),
  role: "user",
  status: "active",
  avatar: gradient(id * 30, id * 30 + 40, name.charAt(0)),
  about: "",
  city: "Lisbon",
  birthday: "1990-02-03",
  website: "",
  phone: "+1 555 0100",
  interests: ["music"],
  createdAt: "2025-01-01T10:00:00",
  lastSeen: NOW,
  ...over,
});
const fr = (
  id: number,
  userId: number,
  friendId: number,
  status: Friend["status"] = "accepted",
): Friend => ({ id, userId, friendId, status, since: "2026-01-01T10:00:00" });

function world(): Db {
  const db = emptyDb();
  db.users = [
    user(1, "Ann Stone"),
    user(2, "Ben Reyes"),
    user(3, "Cleo Park"),
    user(4, "Dan Moss"),
    user(5, "Eve Adams", { role: "admin" }),
  ];
  db.friends = [
    fr(1, 1, 2),
    fr(2, 3, 1),
    fr(3, 1, 4, "pending"),
    fr(4, 5, 1, "pending"),
  ];
  return db;
}

function open(
  db: Db,
  me: number,
  params?: Record<string, unknown>,
): OrbitState {
  let s: OrbitState = { ...initialState(), db, me, status: "ready" };
  s = { ...s, ...deriveShell(s) };
  s = send(s, "nav.go", "wall").state;
  // enter the profile screen the way another module's `go` does
  const r = send({ ...s, profile: { ...s.profile } }, "nav.go", "profile");
  s = r.state;
  if (params) {
    // a go with params: use a module handler that does it (the open handler of this module)
    s = send(s, "profile.open", params.userId).state;
  }
  return s;
}

test("own profile: header, tabs, friends count", () => {
  const s = open(world(), 1);
  const p = s.profile;
  expect(p.found && p.own).toBe(true);
  expect(p.head.name).toBe("Ann Stone");
  expect(p.head.friends).toBe(2);
  expect(p.head.role).toBe("Member");
  expect(p.tabs.map((t) => t.label)).toEqual([
    "About me",
    "Contacts",
    "Photo",
    "Settings",
  ]);
  expect(p.about.interests).toEqual(["music"]);
});

test("another profile: params userId, no own tabs, email hidden unless friends", () => {
  const s = open(world(), 1, { userId: 4 });
  expect(s.screen).toBe("profile");
  expect(s.profile.own).toBe(false);
  expect(s.profile.head.name).toBe("Dan Moss");
  expect(s.profile.tabs.map((t) => t.id)).toEqual(["about", "contacts"]);
  expect(s.profile.relation).toBe("sent");
  const c = send(s, "profile.tab", "contacts").state.profile;
  expect(c.contact.visible).toBe(false);
  expect(c.contact.email).toBe("");
  // a friend shows it
  const f = send(open(world(), 1, { userId: 2 }), "profile.tab", "contacts")
    .state.profile;
  expect(f.relation).toBe("friends");
  expect(f.contact.email).toBe("ben@example.com");
  // the settings tab is refused on another profile
  expect(send(s, "profile.tab", "settings").state.profile.tab).toBe("about");
  // an unknown user
  expect(open(world(), 1, { userId: 99 }).profile.found).toBe(false);
});

test("an administrator sees the contact info of anyone", () => {
  const s = send(
    open(world(), 5, { userId: 4 }),
    "profile.tab",
    "contacts",
  ).state;
  expect(s.profile.contact.email).toBe("dan@example.com");
});

test("edit form: validation and save", () => {
  let s = open(world(), 1);
  s = send(s, "profile.editStart").state;
  expect(s.profile.editing).toBe(true);
  expect(s.profile.form.interests).toBe("music");
  s = send(s, "profile.formField", "name", { value: "  " }).state;
  s = send(s, "profile.formField", "birthday", { value: "2020-13-45" }).state;
  s = send(s, "profile.formField", "website", { value: "not a url" }).state;
  s = send(s, "profile.editSave").state;
  expect(Object.keys(s.profile.errors).sort()).toEqual([
    "birthday",
    "name",
    "website",
  ]);
  expect(s.db.users[0].name).toBe("Ann Stone");
  s = send(s, "profile.formField", "name", { value: " Ann S. " }).state;
  s = send(s, "profile.formField", "birthday", { value: "1991-04-05" }).state;
  s = send(s, "profile.formField", "website", {
    value: "https://ann.example.com",
  }).state;
  s = send(s, "profile.formField", "interests", {
    value: "chess, hiking,, chess ,",
  }).state;
  const r = send(s, "profile.editSave");
  expect(r.state.profile.editing).toBe(false);
  expect(r.state.db.users[0]).toMatchObject({
    name: "Ann S.",
    birthday: "1991-04-05",
    website: "https://ann.example.com",
    interests: ["chess", "hiking"],
  });
  expect(idbOps(r.effects)).toContain("put:users");
  expect(r.state.profile.head.name).toBe("Ann S.");
  // cancel drops the form
  const c = send(
    send(open(world(), 1), "profile.editStart").state,
    "profile.editCancel",
  ).state;
  expect(c.profile.editing).toBe(false);
  // another profile cannot be edited
  expect(
    send(open(world(), 1, { userId: 2 }), "profile.editStart").state.profile
      .editing,
  ).toBe(false);
});

test("validators", () => {
  expect(isValidDate("2024-02-29", NOW)).toBe(true);
  expect(isValidDate("2023-02-29", NOW)).toBe(false);
  expect(isValidDate("2030-01-01", NOW)).toBe(false);
  expect(isValidDate("1800-01-01", NOW)).toBe(false);
  expect(isUrl("https://a.example/x?y=1")).toBe(true);
  expect(isUrl("ftp://a.example")).toBe(false);
  expect(isUrl("example")).toBe(false);
  expect(parseInterests(" a, b ,A,, c ")).toEqual(["a", "b", "c"]);
  expect(
    parseInterests(Array.from({ length: 20 }, (_, i) => `t${i}`).join(","))
      .length,
  ).toBe(12);
  expect(
    checkProfile(
      {
        name: "A",
        city: "",
        birthday: "",
        about: "",
        interests: "",
        website: "",
        phone: "",
      },
      NOW,
    ),
  ).toEqual({});
  expect(
    checkProfile(
      {
        name: "A",
        city: "",
        birthday: "",
        about: "",
        interests: "",
        website: "",
        phone: "abc",
      },
      NOW,
    ).phone,
  ).toBeTruthy();
  const db = world();
  expect(
    checkAccount(db, 1, { name: "Ann", email: "BEN@example.com" }).email,
  ).toBe("Someone already has this email");
  expect(
    checkAccount(db, 1, { name: "Ann", email: "ann@example.com" }),
  ).toEqual({});
  expect(checkAccount(db, 1, { name: "", email: "x" })).toEqual({
    name: "Your name is required",
    email: "That is not an email address",
  });
  expect(
    checkPassword(db.users[0], {
      current: "bad",
      next: "abcdef",
      confirm: "abcdef",
    }).current,
  ).toBeTruthy();
  expect(
    checkPassword(db.users[0], {
      current: DEMO_PASSWORD,
      next: "abc",
      confirm: "abc",
    }).next,
  ).toBeTruthy();
  expect(
    checkPassword(db.users[0], {
      current: DEMO_PASSWORD,
      next: "abcdef",
      confirm: "abcdeg",
    }).confirm,
  ).toBeTruthy();
  expect(
    checkPassword(db.users[0], {
      current: DEMO_PASSWORD,
      next: "abcdef",
      confirm: "abcdef",
    }),
  ).toEqual({});
});

test("friends: search, pagination of 12, message and open", () => {
  const db = world();
  for (let i = 10; i < 40; i++) {
    db.users.push(
      user(i, `Pal ${String(i).padStart(2, "0")}`, {
        city: i % 2 ? "Oslo" : "Rome",
      }),
    );
    db.friends.push(fr(100 + i, 1, i));
  }
  let s = send(open(db, 1), "profile.tab", "contacts").state;
  expect(s.profile.friendTotal).toBe(32);
  expect(s.profile.friends).toHaveLength(12);
  expect(s.profile.friendPages).toBe(3);
  expect(s.profile.hasPrev).toBe(false);
  s = send(s, "profile.friendPage", 1).state;
  expect(s.profile.friendPageNo).toBe(2);
  s = send(s, "profile.friendPage", 5).state;
  expect(s.profile.friendPageNo).toBe(3);
  expect(s.profile.friends).toHaveLength(8);
  expect(s.profile.hasNext).toBe(false);
  s = send(s, "profile.friendSearch", undefined, { value: "oslo" }).state;
  expect(s.profile.friendPageNo).toBe(1);
  expect(s.profile.friendTotal).toBe(15);
  s = send(s, "profile.friendSearch", undefined, { value: "pal 12" }).state;
  expect(s.profile.friends.map((f) => f.name)).toEqual(["Pal 12"]);
  const m = send(s, "profile.message", 12).state;
  expect(m.screen).toBe("messages");
  const o = send(s, "profile.open", 12).state;
  expect(o.screen).toBe("profile");
  expect(o.profile.head.name).toBe("Pal 12");
});

test("friend requests: send, cancel, accept, decline, remove", () => {
  const db = world();
  // me = 1 views 3 (already a friend): remove
  let s = open(db, 1, { userId: 3 });
  expect(s.profile.relation).toBe("friends");
  let r = send(s, "profile.remove", 3);
  expect(r.state.db.friends.map((f) => f.id)).toEqual([1, 3, 4]);
  expect(idbOps(r.effects)).toContain("remove:friends");
  // add a stranger, then cancel
  const strangers = { ...db, users: [...db.users, user(6, "Fay Lane")] };
  s = open(strangers, 1, { userId: 6 });
  r = send(s, "profile.add", 6);
  expect(r.state.db.friends.at(-1)).toMatchObject({
    userId: 1,
    friendId: 6,
    status: "pending",
  });
  expect(r.state.profile.relation).toBe("sent");
  expect(send(r.state, "profile.add", 6).state.db.friends).toHaveLength(5); // not twice
  const c = send(r.state, "profile.cancel", 6);
  expect(c.state.db.friends.some((f) => f.friendId === 6)).toBe(false);
  // a request addressed to me: accept / decline
  let mine = open(db, 1);
  mine = send(mine, "profile.tab", "contacts").state;
  expect(mine.profile.incoming.map((x) => x.id)).toEqual([5]);
  expect(mine.profile.outgoing.map((x) => x.id)).toEqual([4]);
  const a = send(mine, "profile.accept", 5);
  expect(a.state.db.friends.find((f) => f.id === 4)?.status).toBe("accepted");
  expect(a.state.profile.incoming).toHaveLength(0);
  expect(a.state.profile.head.friends).toBe(3);
  const d = send(mine, "profile.decline", 5);
  expect(d.state.db.friends.some((f) => f.id === 4)).toBe(false);
  // permissions: I cannot accept my own request, nor decline/cancel the wrong way
  expect(send(mine, "profile.accept", 4).state.db.friends).toEqual(
    mine.db.friends,
  );
  expect(send(mine, "profile.decline", 4).state.db.friends).toEqual(
    mine.db.friends,
  );
  expect(send(mine, "profile.cancel", 5).state.db.friends).toEqual(
    mine.db.friends,
  );
  expect(send(mine, "profile.remove", 4).state.db.friends).toEqual(
    mine.db.friends,
  );
  // "add" on someone who already asked me accepts
  const x = send(open(db, 1, { userId: 5 }), "profile.add", 5);
  expect(x.state.db.friends.find((f) => f.id === 4)?.status).toBe("accepted");
  // not signed in / myself
  expect(send(open(db, 1), "profile.add", 1).state.db.friends).toEqual(
    db.friends,
  );
  expect(relationOf(db, 1, 1)).toBe("self");
});

test("photo tab: upload effect, reply, presets, remove", () => {
  let s = send(open(world(), 1), "profile.tab", "photo").state;
  expect(s.profile.presets).toHaveLength(16);
  expect(PRESETS).toHaveLength(16);
  const up = send(s, "profile.upload");
  const eff = plugin(up.effects, "files");
  expect(eff).toHaveLength(1);
  expect(eff[0]).toMatchObject({
    type: "pickImages",
    maxSide: 512,
    multiple: false,
    onSuccess: "profile.avatarPicked",
    onError: "profile.avatarFailed",
  });
  // the reply goes back to a registered message
  const src = "data:image/jpeg;base64,AAAA";
  const got = send(s, "profile.avatarPicked", {
    images: [{ name: "me.png", src }],
  });
  expect(got.state.db.users[0].avatar).toBe(src);
  expect(got.state.profile.hasUpload).toBe(true);
  expect(got.state.profile.avatarStyle).toContain("background-image");
  expect(got.state.user.initials).toBe("AS");
  // bad replies change nothing
  expect(
    send(s, "profile.avatarPicked", {
      images: [{ name: "x", src: "http://evil/x.png" }],
    }).state.db.users[0].avatar,
  ).toBe(s.db.users[0].avatar);
  expect(
    send(s, "profile.avatarPicked", { images: [] }).state.db.users[0].avatar,
  ).toBe(s.db.users[0].avatar);
  expect(send(s, "profile.avatarFailed", "boom").state.notice).toContain(
    "boom",
  );
  // a preset, then remove the photo
  s = got.state;
  const pr = send(s, "profile.preset", 3).state;
  expect(pr.db.users[0].avatar).toBe(PRESETS[3].src);
  expect(pr.profile.presets[3].active).toBe(true);
  const rm = send(got.state, "profile.removePhoto").state;
  expect(rm.db.users[0].avatar.startsWith("grad:")).toBe(true);
  expect(rm.db.users[0].avatar.endsWith(":A")).toBe(true);
  // nobody else's avatar can be set
  const other = open(world(), 1, { userId: 2 });
  expect(
    send(other, "profile.avatarPicked", { images: [{ name: "x", src }] }).state
      .db.users[1].avatar,
  ).toBe(other.db.users[1].avatar);
});

test("settings: account, password, sign out", () => {
  let s = send(open(world(), 1), "profile.tab", "settings").state;
  expect(s.profile.acc).toEqual({
    name: "Ann Stone",
    email: "ann@example.com",
  });
  s = send(s, "profile.accField", "email", { value: "ben@example.com" }).state;
  s = send(s, "profile.accSave").state;
  expect(s.profile.accErrors.email).toBeTruthy();
  s = send(s, "profile.accField", "email", {
    value: "ann.new@example.com",
  }).state;
  s = send(s, "profile.accField", "name", { value: "Ann New" }).state;
  s = send(s, "profile.accSave").state;
  expect(s.db.users[0]).toMatchObject({
    name: "Ann New",
    email: "ann.new@example.com",
  });
  expect(s.subtitle).toContain("ann.new@example.com");
  // password
  s = send(s, "profile.pwField", "current", { value: "wrong" }).state;
  s = send(s, "profile.pwField", "next", { value: "newpass1" }).state;
  s = send(s, "profile.pwField", "confirm", { value: "newpass1" }).state;
  s = send(s, "profile.pwSave").state;
  expect(s.profile.pwErrors.current).toBeTruthy();
  expect(s.db.users[0].passwordHash).toBe(hashPassword(DEMO_PASSWORD));
  s = send(s, "profile.pwField", "current", { value: DEMO_PASSWORD }).state;
  s = send(s, "profile.pwSave").state;
  expect(s.db.users[0].passwordHash).toBe(hashPassword("newpass1"));
  expect(s.profile.pw).toEqual({ current: "", next: "", confirm: "" });
  // sign out
  const out = send(s, "profile.signOut");
  expect(out.state.me).toBe(0);
  expect(idbOps(out.effects)).toContain("remove:session");
});

function fat(): Db {
  const db = world();
  db.posts = [
    {
      id: 1,
      authorId: 1,
      wallId: 1,
      communityId: 0,
      kind: "text",
      text: "mine",
      songId: 0,
      photoId: 0,
      picture: "",
      url: "",
      linkTitle: "",
      repostOf: 0,
      createdAt: NOW,
      likeIds: [2],
    },
    {
      id: 2,
      authorId: 2,
      wallId: 1,
      communityId: 0,
      kind: "text",
      text: "on my wall",
      songId: 0,
      photoId: 0,
      picture: "",
      url: "",
      linkTitle: "",
      repostOf: 0,
      createdAt: NOW,
      likeIds: [],
    },
    {
      id: 3,
      authorId: 2,
      wallId: 2,
      communityId: 0,
      kind: "text",
      text: "theirs",
      songId: 0,
      photoId: 0,
      picture: "",
      url: "",
      linkTitle: "",
      repostOf: 0,
      createdAt: NOW,
      likeIds: [1],
    },
    {
      id: 4,
      authorId: 3,
      wallId: 3,
      communityId: 0,
      kind: "repost",
      text: "",
      songId: 0,
      photoId: 0,
      picture: "",
      url: "",
      linkTitle: "",
      repostOf: 1,
      createdAt: NOW,
      likeIds: [],
    },
  ];
  db.comments = [
    { id: 1, postId: 3, authorId: 1, text: "c1", createdAt: NOW },
    { id: 2, postId: 1, authorId: 2, text: "c2", createdAt: NOW },
    { id: 3, postId: 3, authorId: 2, text: "c3", createdAt: NOW },
  ];
  db.articles = [
    {
      id: 1,
      authorId: 1,
      title: "a",
      body: "",
      tags: [],
      cover: "",
      createdAt: NOW,
      likeIds: [],
    },
    {
      id: 2,
      authorId: 2,
      title: "b",
      body: "",
      tags: [],
      cover: "",
      createdAt: NOW,
      likeIds: [1],
    },
  ];
  db.photoAlbums = [
    { id: 1, ownerId: 1, title: "A", description: "", createdAt: NOW },
    { id: 2, ownerId: 2, title: "B", description: "", createdAt: NOW },
  ];
  db.photos = [
    {
      id: 1,
      albumId: 1,
      ownerId: 1,
      src: "grad:1:2:x",
      caption: "",
      createdAt: NOW,
    },
    {
      id: 2,
      albumId: 2,
      ownerId: 2,
      src: "grad:1:2:x",
      caption: "",
      createdAt: NOW,
    },
  ];
  db.conversations = [
    { id: 1, kind: "dm", title: "", memberIds: [1, 2], createdAt: NOW },
    { id: 2, kind: "dm", title: "", memberIds: [2, 3], createdAt: NOW },
    { id: 3, kind: "chat", title: "g", memberIds: [1, 2, 3], createdAt: NOW },
  ];
  db.messages = [
    { id: 1, conversationId: 1, authorId: 2, text: "hi", createdAt: NOW },
    { id: 2, conversationId: 2, authorId: 2, text: "yo", createdAt: NOW },
    { id: 3, conversationId: 3, authorId: 1, text: "mine", createdAt: NOW },
    { id: 4, conversationId: 3, authorId: 2, text: "theirs", createdAt: NOW },
  ];
  db.playlists = [
    { id: 1, ownerId: 1, title: "p", songIds: [], createdAt: NOW },
    { id: 2, ownerId: 2, title: "q", songIds: [], createdAt: NOW },
  ];
  db.scores = [
    { id: 1, userId: 1, game: "snake", score: 5, at: NOW },
    { id: 2, userId: 2, game: "snake", score: 6, at: NOW },
  ];
  db.communities = [
    {
      id: 1,
      name: "Chess",
      description: "",
      wallpaper: "",
      ownerId: 2,
      moderatorIds: [1],
      memberIds: [1, 2],
      contactIds: [1, 2],
      createdAt: NOW,
    },
  ];
  return db;
}

test("deletionOf: the cascade", () => {
  const { remove, put } = deletionOf(fat(), 1);
  expect(remove.users).toEqual([1]);
  expect(remove.friends).toEqual([1, 2, 3, 4]);
  expect(remove.posts?.sort()).toEqual([1, 2, 4]); // own, on my wall, a repost of mine
  expect(remove.comments?.sort()).toEqual([1, 2]); // mine, and under my post
  expect(remove.articles).toEqual([1]);
  expect(remove.photoAlbums).toEqual([1]);
  expect(remove.photos).toEqual([1]);
  expect(remove.conversations).toEqual([1]);
  expect(remove.messages?.sort()).toEqual([1, 3]); // the dialogue, and my message in the group
  expect(remove.playlists).toEqual([1]);
  expect(remove.scores).toEqual([1]);
  expect(put.conversations?.[0].memberIds).toEqual([2, 3]);
  expect(put.communities?.[0]).toMatchObject({
    moderatorIds: [],
    memberIds: [2],
    contactIds: [2],
  });
  expect(put.posts?.map((p) => [p.id, p.likeIds])).toEqual([[3, []]]);
  expect(put.articles?.map((a) => [a.id, a.likeIds])).toEqual([[2, []]]);
});

test("delete my account: confirmation, cascade, sign out", () => {
  let s = send(open(fat(), 1), "profile.tab", "settings").state;
  // nothing happens without the confirmation step
  expect(send(s, "profile.deleteConfirm").state.db.users).toHaveLength(5);
  s = send(s, "profile.deleteAsk").state;
  expect(s.profile.confirmDelete).toBe(true);
  expect(send(s, "profile.deleteCancel").state.profile.confirmDelete).toBe(
    false,
  );
  const r = send(s, "profile.deleteConfirm");
  expect(r.state.me).toBe(0);
  expect(r.state.db.users.map((u) => u.id)).toEqual([2, 3, 4, 5]);
  expect(r.state.db.posts.map((p) => p.id)).toEqual([3]);
  expect(r.state.db.friends).toEqual([]);
  expect(r.state.db.photos.map((p) => p.id)).toEqual([2]);
  expect(r.state.db.session).toEqual([]);
  const ops = idbOps(r.effects);
  for (const t of [
    "users",
    "friends",
    "posts",
    "comments",
    "articles",
    "photoAlbums",
    "photos",
    "conversations",
    "messages",
    "playlists",
    "scores",
    "session",
  ]) {
    expect(ops).toContain(`remove:${t}`);
  }
});

test("delete my account is refused for the owner of a community and the last administrator", () => {
  const db = fat();
  let s = send(open(db, 2), "profile.tab", "settings").state;
  s = send(s, "profile.deleteAsk").state;
  expect(s.profile.confirmDelete).toBe(false);
  expect(s.profile.deleteError).toContain("Chess");
  expect(s.profile.deleteBlockedBy).toBe("Chess");
  expect(send(s, "profile.deleteConfirm").state.db.users).toHaveLength(5);
  let a = send(open(db, 5), "profile.tab", "settings").state;
  a = send(a, "profile.deleteAsk").state;
  expect(a.profile.deleteError).toContain("only administrator");
});

test("against the sample data", () => {
  const db = seedDb();
  const me = db.users.find((u) => u.role === "user")!;
  let s = open(db, me.id);
  expect(s.profile.found).toBe(true);
  s = send(s, "profile.tab", "contacts").state;
  expect(s.profile.friends.length).toBeLessThanOrEqual(12);
  expect(s.profile.friendTotal).toBe(s.profile.head.friends);
  const other = db.users.find(
    (u) => u.id !== me.id && relationOf(db, me.id, u.id) === "none",
  )!;
  const o = send(s, "profile.open", other.id).state;
  expect(o.profile.head.name).toBe(other.name);
  expect(o.profile.relation).toBe("none");
});
