import { expect, test } from "vitest";
import type { Message } from "@service-laboratory/pavlus";
import {
  applyUpdate,
  initialState,
  page,
} from "../templates/orbit-social/orbit-social.ts";
import type { OrbitState } from "../templates/orbit-social/core.ts";
import { gradient } from "../templates/orbit-social/pictures.ts";
import {
  type Community,
  type Db,
  type Post,
  type User,
  emptyDb,
  NOW,
} from "../templates/orbit-social/schema.ts";
import { seedDb } from "../templates/orbit-social/seed.ts";
import {
  canDeletePost,
  canPost,
  PICTURES,
} from "../templates/orbit-social/modules/wall/posts.ts";
import {
  canManage,
  canModerate,
  communityRemoval,
  createCommunity,
  emptyCommunityForm,
  joinCommunity,
  leaveCommunity,
  membersPage,
  removeMember,
  roleOf,
  setModerator,
  validateCommunity,
} from "../templates/orbit-social/modules/communities/community.ts";

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
  avatar: gradient(id * 20, id * 20 + 40, name.charAt(0)),
  about: "",
  city: "Lisbon",
  birthday: "1990-01-01",
  website: "",
  phone: "",
  interests: [],
  createdAt: "2025-01-01T10:00:00",
  lastSeen: NOW,
});

const community = (extra: Partial<Community> = {}): Community => ({
  id: 1,
  name: "Hikers",
  description: "Trails and maps",
  wallpaper: PICTURES[2],
  ownerId: 1,
  moderatorIds: [2],
  memberIds: [1, 2, 3, 4],
  contactIds: [1, 2],
  createdAt: "2026-01-01T10:00:00",
  ...extra,
});

const post = (id: number, authorId: number, communityId: number): Post => ({
  id,
  authorId,
  wallId: communityId ? 0 : authorId,
  communityId,
  kind: "text",
  text: `post ${id}`,
  songId: 0,
  photoId: 0,
  picture: "",
  url: "",
  linkTitle: "",
  repostOf: 0,
  createdAt: `2026-10-${String(10 + id).padStart(2, "0")}T10:00:00`,
  likeIds: [],
});

/** 1 Ann (owner), 2 Ben (moderator), 3 Cleo and 4 Dan (members), 5 Eve (outsider), 6 Mia (site moderator), 7 Root (admin). */
function world(): Db {
  const db = emptyDb();
  db.users = [
    user(1, "Ann"),
    user(2, "Ben"),
    user(3, "Cleo"),
    user(4, "Dan"),
    user(5, "Eve"),
    user(6, "Mia", "moderator"),
    user(7, "Root", "admin"),
  ];
  db.communities = [
    community(),
    community({
      id: 2,
      name: "Bakers",
      description: "Bread talk",
      ownerId: 5,
      moderatorIds: [],
      memberIds: [5],
      contactIds: [5],
    }),
  ];
  db.posts = [post(1, 3, 1), post(2, 4, 1), post(3, 5, 2), post(4, 3, 3)];
  db.comments = [
    { id: 1, postId: 1, authorId: 4, text: "a", createdAt: NOW },
    { id: 2, postId: 2, authorId: 3, text: "b", createdAt: NOW },
    { id: 3, postId: 3, authorId: 3, text: "c", createdAt: NOW },
  ];
  return db;
}

function open(db: Db, me = 1): OrbitState {
  const s: OrbitState = {
    ...initialState(),
    db,
    me,
    status: "ready",
    view: "app",
    screen: "wall",
    now: NOW,
  };
  return send(s, "nav.go", "communities");
}

/** The shell's `go` into a community page (what a click on a post's repost link does). */
function openCommunity(db: Db, me: number, id: number): OrbitState {
  const s: OrbitState = {
    ...initialState(),
    db,
    me,
    status: "ready",
    view: "app",
    screen: "wall",
    now: NOW,
  };
  return applyUpdate(s, "wall", {
    go: { screen: "communities", params: { communityId: id } },
  }).state;
}

test("the list: cards with the member count and my role, All / Mine tabs, search", () => {
  let s = open(world(), 3);
  expect(s.communities.mode).toBe("list");
  expect(s.communities.cards.map((c) => c.name)).toEqual(["Hikers", "Bakers"]);
  expect(s.communities.cards[0]).toMatchObject({
    members: "4 members",
    role: "Member",
  });
  expect(s.communities.cards[1]).toMatchObject({
    members: "1 member",
    role: "",
  });
  s = send(s, "communities.pickTab", "mine");
  expect(s.communities.cards.map((c) => c.name)).toEqual(["Hikers"]);
  s = send(s, "communities.pickTab", "all");
  s = send(s, "communities.search", undefined, { value: "bread" });
  expect(s.communities.cards.map((c) => c.name)).toEqual(["Bakers"]);
  s = send(s, "communities.search", undefined, { value: "zzz" });
  expect(s.communities.cards).toEqual([]);
  expect(s.communities.empty).toMatch(/No communities/);
  // the roles
  const owner = open(world(), 1);
  expect(owner.communities.cards[0].role).toBe("Administrator");
  expect(open(world(), 2).communities.cards[0].role).toBe("Moderator");
});

test("create: the creator becomes the owner, a member and a contact", () => {
  let s = open(world(), 5);
  s = send(s, "communities.create");
  expect(s.communities.mode).toBe("create");
  s = send(s, "communities.form.save");
  expect(s.db.communities).toHaveLength(2);
  expect(s.communities.formView.errors.name).toMatch(/at least 3/);
  s = send(s, "communities.form.setName", undefined, { value: "Hikers" });
  s = send(s, "communities.form.save");
  expect(s.communities.formView.errors.name).toMatch(/exists/);
  s = send(s, "communities.form.setName", undefined, { value: "Climbers" });
  s = send(s, "communities.form.setDescription", undefined, {
    value: "Up we go",
  });
  s = send(s, "communities.form.pickWallpaper", 7);
  s = send(s, "communities.form.save");
  const c = s.db.communities.at(-1) as Community;
  expect(c).toMatchObject({
    id: 3,
    name: "Climbers",
    description: "Up we go",
    ownerId: 5,
    moderatorIds: [],
    memberIds: [5],
    contactIds: [5],
    wallpaper: PICTURES[7],
  });
  expect(s.communities.mode).toBe("page");
  expect(s.communities.title).toBe("Climbers");
  expect(s.communities.header.badges[0].label).toBe("Administrator");
  expect(
    createCommunity(
      world(),
      0,
      { ...emptyCommunityForm(), name: "Valid name" },
      NOW,
    ).community,
  ).toBeUndefined();
  expect(
    validateCommunity(world(), { ...emptyCommunityForm(), name: "ab" }).name,
  ).not.toBe("");
});

test("entering with params { communityId } opens that community; a missing one falls back to the list", () => {
  const db = world();
  const s = openCommunity(db, 3, 1);
  expect(s.screen).toBe("communities");
  expect(s.communities.mode).toBe("page");
  expect(s.communities.header.title).toBe("Hikers");
  expect(s.communities.feed.cards.map((c) => c.id)).toEqual([2, 1]);
  expect(s.communities.feed.cards[0].where).toBe("in Hikers");
  expect(openCommunity(db, 3, 99).communities.mode).toBe("list");
});

test("Join and Leave; the owner cannot leave", () => {
  const db = world();
  let s = openCommunity(db, 5, 1);
  expect(s.communities.header.actions.map((a) => a.label)).toEqual(["Join"]);
  expect(s.communities.feed.composer).toBeNull();
  expect(s.communities.hint).toMatch(/Join/);
  s = send(s, "communities.header.action", "join");
  expect(s.db.communities[0].memberIds).toContain(5);
  expect(s.communities.header.actions.map((a) => a.label)).toEqual(["Leave"]);
  expect(s.communities.header.badges[0].label).toBe("Member");
  expect(s.communities.feed.composer).not.toBeNull();
  s = send(s, "communities.header.action", "leave");
  expect(s.db.communities[0].memberIds).not.toContain(5);
  // the owner has no Leave button and the rule refuses it
  const owner = openCommunity(db, 1, 1);
  expect(owner.communities.header.actions).toEqual([]);
  expect(leaveCommunity(db.communities[0], 1)).toBeNull();
  const after = send(owner, "communities.header.action", "leave");
  expect(after.db.communities[0].memberIds).toContain(1);
  expect(joinCommunity(db.communities[0], 3)).toBeNull();
  // leaving also drops the moderator and contact roles
  const left = leaveCommunity(db.communities[0], 2)!;
  expect(left.moderatorIds).toEqual([]);
  expect(left.contactIds).toEqual([1]);
});

test("the wall: members post with the community id; outsiders cannot; leaders delete any post", () => {
  const db = world();
  expect(canPost(db, 3, { kind: "community", communityId: 1 })).toBe(true);
  expect(canPost(db, 5, { kind: "community", communityId: 1 })).toBe(false);
  let s = openCommunity(db, 3, 1);
  s = send(s, "communities.composer.setText", undefined, {
    value: "Anyone for Sunday?",
  });
  s = send(s, "communities.composer.send");
  expect(s.db.posts.at(-1)).toMatchObject({
    authorId: 3,
    communityId: 1,
    wallId: 0,
    text: "Anyone for Sunday?",
  });
  expect(s.communities.feed.cards[0].text).toBe("Anyone for Sunday?");
  // an outsider's send does nothing
  const out = send(
    send(openCommunity(db, 5, 1), "communities.composer.setText", undefined, {
      value: "spam",
    }),
    "communities.composer.send",
  );
  expect(out.db.posts).toHaveLength(db.posts.length);
  // like, comment and repost work like on a user wall
  s = send(s, "communities.post.like", 1);
  expect(s.db.posts.find((p) => p.id === 1)?.likeIds).toEqual([3]);
  s = send(s, "communities.post.shareSend", 1);
  expect(s.db.posts.at(-1)).toMatchObject({
    kind: "repost",
    repostOf: 1,
    wallId: 3,
    communityId: 0,
  });
  // delete rules
  const p = db.posts[1]; // by Dan in community 1
  expect(canDeletePost(db, 4, p)).toBe(true);
  expect(canDeletePost(db, 1, p)).toBe(true); // owner
  expect(canDeletePost(db, 2, p)).toBe(true); // community moderator
  expect(canDeletePost(db, 6, p)).toBe(true); // site moderator
  expect(canDeletePost(db, 7, p)).toBe(true); // site admin
  expect(canDeletePost(db, 3, p)).toBe(false); // another member
  expect(
    send(openCommunity(db, 3, 1), "communities.post.remove", 2).db.posts,
  ).toHaveLength(db.posts.length);
  const gone = send(openCommunity(db, 2, 1), "communities.post.remove", 2);
  expect(gone.db.posts.map((x) => x.id)).toEqual([1, 3, 4]);
  expect(gone.db.comments.map((x) => x.id)).toEqual([1, 3]);
});

test("the Contacts card lists contactIds; Message goes to the messages with the user", () => {
  let s = openCommunity(world(), 3, 1);
  expect(
    s.communities.contacts.contacts.map((c) => [c.name, c.role, c.canMessage]),
  ).toEqual([
    ["Ann", "Administrator", true],
    ["Ben", "Moderator", true],
  ]);
  const m = send(s, "communities.contacts.message", 2);
  expect(m.screen).toBe("messages");
  s = send(s, "communities.contacts.open", 2);
  expect(s.screen).toBe("wall");
  expect(s.wall.header.title).toBe("Ben");
});

test("members: paged and searchable, owner first, then moderators", () => {
  const db = world();
  const big = community({
    memberIds: Array.from({ length: 25 }, (_, i) => 100 + i),
  });
  db.users.push(
    ...Array.from({ length: 25 }, (_, i) =>
      user(100 + i, `Member ${String(i).padStart(2, "0")}`),
    ),
  );
  db.communities = [big];
  let s = openCommunity(db, 1, 1);
  s = send(s, "communities.openTab", "members");
  expect(s.communities.members.members.map((m) => m.name).slice(0, 3)).toEqual([
    "Ann",
    "Ben",
    "Member 00",
  ]);
  expect(s.communities.memberPager).toMatchObject({ pages: 3, total: 27 });
  s = send(s, "communities.mpager.next");
  expect(s.communities.members.members[0].name).toBe("Member 08");
  s = send(s, "communities.setMemberQuery", undefined, { value: "member 2" });
  expect(s.communities.members.members.map((m) => m.name)).toEqual([
    "Member 20",
    "Member 21",
    "Member 22",
    "Member 23",
    "Member 24",
  ]);
  expect(s.communities.memberPage).toBe(1);
  expect(membersPage(db, 1, big, "", 99).page).toBe(3);
});

test("moderation: moderators and the owner remove members; only the owner promotes and demotes", () => {
  const db = world();
  const c = db.communities[0];
  expect(roleOf(c, 1)).toBe("owner");
  expect(removeMember(db, c, 2, 3)?.memberIds).not.toContain(3); // a moderator removes a member
  expect(removeMember(db, c, 2, 1)).toBeNull(); // nobody removes the owner
  expect(removeMember(db, c, 3, 4)).toBeNull(); // a member cannot
  expect(removeMember(db, c, 1, 1)).toBeNull(); // nor themselves
  expect(removeMember(db, { ...c, moderatorIds: [2, 3] }, 2, 3)).toBeNull(); // a moderator does not remove a moderator
  expect(
    removeMember(db, { ...c, moderatorIds: [2, 3] }, 1, 3)?.moderatorIds,
  ).toEqual([2]);
  expect(setModerator(db, c, 2, 3, true)).toBeNull(); // a moderator cannot promote
  expect(setModerator(db, c, 1, 3, true)?.moderatorIds).toEqual([2, 3]);
  expect(setModerator(db, c, 1, 2, false)?.moderatorIds).toEqual([]);
  expect(canManage(db, 7, c)).toBe(true);
  expect(canModerate(db, 2, c)).toBe(true);
  expect(canModerate(db, 3, c)).toBe(false);

  // through the screen, as the owner
  let s = openCommunity(db, 1, 1);
  s = send(s, "communities.openTab", "members");
  const row = (id: number) =>
    s.communities.members.members.find((m) => m.id === id)!;
  expect(row(3)).toMatchObject({
    canPromote: true,
    canRemove: true,
    canDemote: false,
  });
  expect(row(2)).toMatchObject({ canDemote: true, canPromote: false });
  expect(row(1)).toMatchObject({ canRemove: false, canMessage: false });
  s = send(s, "communities.members.promote", 3);
  expect(s.db.communities[0].moderatorIds).toEqual([2, 3]);
  expect(row(3).role).toBe("Moderator");
  s = send(s, "communities.members.demote", 3);
  expect(s.db.communities[0].moderatorIds).toEqual([2]);
  s = send(s, "communities.members.remove", 4);
  expect(s.db.communities[0].memberIds).not.toContain(4);
  expect(s.communities.pageTabs[1].label).toBe("Members (3)");
  // as a moderator: no promote buttons
  let m = send(openCommunity(db, 2, 1), "communities.openTab", "members");
  expect(m.communities.members.members.find((x) => x.id === 3)).toMatchObject({
    canRemove: true,
    canPromote: false,
  });
  expect(m.communities.pageTabs.map((t) => t.id)).toEqual(["wall", "members"]);
  m = send(m, "communities.members.promote", 3);
  expect(m.db.communities[0].moderatorIds).toEqual([2]);
});

test("settings are for the owner: name, description, wallpaper, contacts", () => {
  const db = world();
  expect(
    send(openCommunity(db, 3, 1), "communities.openTab", "settings").communities
      .pageTab,
  ).toBe("wall");
  let s = send(openCommunity(db, 1, 1), "communities.openTab", "settings");
  expect(s.communities.pageTab).toBe("settings");
  expect(s.communities.formView).toMatchObject({
    name: "Hikers",
    heading: "Settings",
  });
  s = send(s, "communities.form.setName", undefined, { value: "Bakers" });
  s = send(s, "communities.form.save");
  expect(s.communities.formView.errors.name).toMatch(/exists/);
  s = send(s, "communities.form.setName", undefined, {
    value: "Trail Friends",
  });
  s = send(s, "communities.form.setDescription", undefined, {
    value: "New words",
  });
  s = send(s, "communities.form.pickWallpaper", 1);
  s = send(s, "communities.form.save");
  expect(s.db.communities[0]).toMatchObject({
    name: "Trail Friends",
    description: "New words",
    wallpaper: PICTURES[1],
  });
  expect(s.communities.title).toBe("Trail Friends");
  // contacts
  s = send(s, "communities.setContactQuery", undefined, { value: "cl" });
  expect(s.communities.contactResults.map((r) => r.name)).toEqual(["Cleo"]);
  s = send(s, "communities.addContact", 3);
  expect(s.db.communities[0].contactIds).toEqual([1, 2, 3]);
  expect(s.communities.settingsContacts.map((c) => c.name)).toEqual([
    "Ann",
    "Ben",
    "Cleo",
  ]);
  s = send(s, "communities.removeContact", 2);
  expect(s.db.communities[0].contactIds).toEqual([1, 3]);
  // somebody who is not a member cannot be a contact
  expect(
    send(s, "communities.addContact", 5).db.communities[0].contactIds,
  ).toEqual([1, 3]);
});

test("deleting a community removes its posts and their comments (two clicks)", () => {
  const db = world();
  const r = communityRemoval(db, 1);
  expect(r).toEqual({
    communities: [1],
    posts: expect.arrayContaining([1, 2]),
    comments: expect.arrayContaining([1, 2]),
  });
  expect(r.posts).toHaveLength(2);
  expect(r.comments).toHaveLength(2);
  let s = send(openCommunity(db, 1, 1), "communities.openTab", "settings");
  s = send(s, "communities.deleteCommunity");
  expect(s.db.communities).toHaveLength(2); // the first click asks
  expect(s.communities.deleteLabel).toMatch(/again/);
  s = send(s, "communities.deleteCommunity");
  expect(s.db.communities.map((c) => c.id)).toEqual([2]);
  expect(s.db.posts.map((p) => p.id)).toEqual([3, 4]);
  expect(s.db.comments.map((c) => c.id)).toEqual([3]);
  expect(s.communities.mode).toBe("list");
  // only the owner
  const denied = send(
    send(openCommunity(db, 2, 1), "communities.deleteCommunity"),
    "communities.deleteCommunity",
  );
  expect(denied.db.communities).toHaveLength(2);
});

test("on the real sample data the list, a community wall and its tabs derive", () => {
  const db = seedDb();
  const c = db.communities[0];
  let s = openCommunity(db, c.ownerId, c.id);
  expect(s.communities.mode).toBe("page");
  expect(s.communities.header.title).toBe(c.name);
  expect(s.communities.contacts.contacts.length).toBe(c.contactIds.length);
  s = send(s, "communities.openTab", "members");
  expect(s.communities.members.members.length).toBeGreaterThan(0);
  s = send(s, "communities.openTab", "settings");
  expect(s.communities.formView.name).toBe(c.name);
  const list = send(s, "communities.back");
  expect(list.communities.cards.length).toBeGreaterThan(0);
});
