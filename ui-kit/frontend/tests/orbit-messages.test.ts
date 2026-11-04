import { expect, test } from "vitest";
import {
  applyUpdate,
  initialState,
} from "../templates/orbit-social/orbit-social.ts";
import type { OrbitState } from "../templates/orbit-social/core.ts";
import {
  messagesModule,
  messageIndex,
  PAGE_SIZE,
  type MessagesState,
} from "../templates/orbit-social/modules/messages/index.ts";
import {
  emptyDb,
  NOW,
  type Conversation,
  type Db,
  type Message,
  type User,
} from "../templates/orbit-social/schema.ts";

const user = (id: number, name: string): User => ({
  id,
  name,
  email: `u${id}@example.com`,
  passwordHash: "",
  role: "user",
  status: "active",
  avatar: `grad:${id * 40}:${id * 40 + 30}:${name.charAt(0)}`,
  about: "",
  city: "Lisbon",
  birthday: "1990-01-01",
  website: "",
  phone: "",
  interests: [],
  createdAt: "2025-01-01T10:00:00",
  lastSeen: NOW,
});

const msg = (
  id: number,
  conversationId: number,
  authorId: number,
  text: string,
  minute = id,
): Message => ({
  id,
  conversationId,
  authorId,
  text,
  createdAt: `2026-11-03T10:${String(minute % 60).padStart(2, "0")}:00`,
});

function world(): Db {
  const db = emptyDb();
  db.users = [
    user(1, "Me Myself"),
    user(2, "Ann Stone"),
    user(3, "Ben Reyes"),
    user(4, "Cara Diaz"),
    user(5, "Dan Wu"),
    user(6, "Anna Bell"),
  ];
  db.friends = [
    {
      id: 1,
      userId: 1,
      friendId: 3,
      status: "accepted",
      since: "2025-01-01T00:00:00",
    },
  ];
  db.conversations = [
    {
      id: 1,
      kind: "dm",
      title: "",
      memberIds: [1, 2],
      createdAt: "2026-10-01T10:00:00",
    },
    {
      id: 2,
      kind: "chat",
      title: "Hikers",
      memberIds: [1, 3, 4],
      createdAt: "2026-10-02T10:00:00",
    },
    {
      id: 3,
      kind: "dm",
      title: "",
      memberIds: [3, 4],
      createdAt: "2026-10-02T10:00:00",
    },
    {
      id: 4,
      kind: "chat",
      title: "Others",
      memberIds: [4, 1],
      createdAt: "2026-10-03T10:00:00",
    },
  ];
  db.messages = [
    msg(1, 1, 2, "hello there"),
    msg(2, 1, 1, "hi Ann"),
    msg(3, 2, 3, "trail map?", 5),
    msg(4, 3, 3, "secret", 6),
  ];
  return db;
}

function ready(db = world(), me = 1): OrbitState {
  const s = {
    ...initialState(),
    db,
    me,
    status: "ready" as const,
    screen: "messages" as const,
  };
  return applyUpdate(s, "messages", {}).state;
}

/** Runs a handler of the module and applies its update. */
function run(
  state: OrbitState,
  name: string,
  payload?: unknown,
  event?: { value?: string; key?: string },
): OrbitState {
  const h = messagesModule.handlers[name];
  if (!h) throw new Error(`no handler ${name}`);
  const u = h(payload, event as never, state);
  return u ? applyUpdate(state, "messages", u).state : state;
}

function enter(
  state: OrbitState,
  params?: Record<string, unknown>,
): OrbitState {
  const u = messagesModule.enter!(params, state);
  return u ? applyUpdate(state, "messages", u).state : state;
}

const m = (s: OrbitState): MessagesState => s.messages;
const typed = (s: OrbitState, text: string): OrbitState =>
  run(s, "setDraft", undefined, { value: text });

test("the list holds only my conversations, newest message first", () => {
  const s = ready();
  expect(m(s).rows.map((r) => r.id)).toEqual([2, 1, 4]);
  expect(m(s).rows[1].title).toBe("Ann Stone");
  expect(m(s).rows[1].preview).toBe("You: hi Ann");
  expect(m(s).rows[0].title).toBe("Hikers");
  expect(m(s).rows[0].preview).toBe("Ben: trail map?");
  expect(m(s).rows[0].stack).toHaveLength(3);
  expect(m(s).rows[0].time).toBe("Nov 3, 10:05");
});

test("an empty conversation sorts by its creation time and has a placeholder", () => {
  const db = world();
  db.conversations.push({
    id: 5,
    kind: "dm",
    title: "",
    memberIds: [1, 5],
    createdAt: "2026-11-04T09:00:00",
  });
  const s = ready(db);
  expect(m(s).rows[0].id).toBe(5);
  expect(m(s).rows[0].preview).toBe("No messages yet");
});

test("search matches the title, the person and the last message", () => {
  let s = ready();
  s = run(s, "setQuery", undefined, { value: "hik" });
  expect(m(s).rows.map((r) => r.id)).toEqual([2]);
  s = run(s, "setQuery", undefined, { value: "ann" });
  expect(m(s).rows.map((r) => r.id)).toEqual([1]);
  s = run(s, "setQuery", undefined, { value: "HI ANN" });
  expect(m(s).rows.map((r) => r.id)).toEqual([1]);
  s = run(s, "setQuery", undefined, { value: "zzz" });
  expect(m(s).rows).toEqual([]);
});

test("opening a conversation shows its thread; foreign conversations are refused", () => {
  let s = run(ready(), "openConv", 1);
  expect(m(s).thread?.title).toBe("Ann Stone");
  expect(m(s).thread?.messages.map((x) => [x.text, x.mine])).toEqual([
    ["hello there", false],
    ["hi Ann", true],
  ]);
  expect(m(s).pane).toBe("thread");
  expect(m(s).rows.find((r) => r.active)?.id).toBe(1);
  s = run(s, "openConv", 3);
  expect(m(s).thread?.id).toBe(1);
  s = run(s, "back");
  expect(m(s).pane).toBe("list");
});

test("send stamps the clock, clears the draft and moves the conversation up", () => {
  let s = run(ready(), "openConv", 1);
  s = typed(s, "  how are you?  ");
  expect(m(s).canSend).toBe(true);
  const before = s.now;
  s = run(s, "send");
  const last = s.db.messages[s.db.messages.length - 1];
  expect(last).toMatchObject({
    conversationId: 1,
    authorId: 1,
    text: "how are you?",
    createdAt: before,
  });
  expect(last.id).toBe(5);
  expect(m(s).draft).toBe("");
  expect(m(s).thread?.messages.at(-1)?.text).toBe("how are you?");
  expect(m(s).rows[0].id).toBe(1);
  expect(s.now).not.toBe(before);
});

test("an empty draft sends nothing; Enter sends, other keys do not", () => {
  let s = run(ready(), "openConv", 1);
  const count = s.db.messages.length;
  s = run(s, "send");
  expect(s.db.messages).toHaveLength(count);
  s = typed(s, "x");
  s = run(s, "keyDraft", undefined, { key: "a" });
  expect(s.db.messages).toHaveLength(count);
  s = run(s, "keyDraft", undefined, { key: "Enter" });
  expect(s.db.messages).toHaveLength(count + 1);
  expect(m(s).canSend).toBe(false);
});

test("delete removes only my own messages", () => {
  let s = run(ready(), "openConv", 1);
  const other = run(s, "deleteMessage", 1);
  expect(other.db.messages.some((x) => x.id === 1)).toBe(true);
  s = run(s, "deleteMessage", 2);
  expect(s.db.messages.some((x) => x.id === 2)).toBe(false);
  expect(m(s).thread?.messages).toHaveLength(1);
});

test("new dm: an existing dialogue is opened, not duplicated; a new one is created", () => {
  let s = ready();
  const n = s.db.conversations.length;
  s = run(s, "openDmPanel");
  s = run(s, "startDm", 2);
  expect(s.db.conversations).toHaveLength(n);
  expect(m(s).convId).toBe(1);
  expect(m(s).panel).toBe("");
  s = run(s, "openDmPanel");
  s = run(s, "startDm", 5);
  expect(s.db.conversations).toHaveLength(n + 1);
  const c = s.db.conversations.at(-1)!;
  expect(c).toMatchObject({ kind: "dm", memberIds: [1, 5] });
  expect(m(s).convId).toBe(c.id);
  s = run(s, "startDm", 5);
  expect(s.db.conversations).toHaveLength(n + 1);
  // not with myself, not with a ghost
  expect(run(s, "startDm", 1).db.conversations).toHaveLength(n + 1);
  expect(run(s, "startDm", 99).db.conversations).toHaveLength(n + 1);
});

test("dm user search: the first 8, friends first, no myself", () => {
  const db = world();
  for (let i = 7; i < 40; i++) db.users.push(user(i, `Zed ${i}`));
  let s = ready(db);
  s = run(s, "openDmPanel");
  expect(m(s).dmResults).toHaveLength(8);
  expect(m(s).dmResults[0].name).toBe("Ben Reyes");
  expect(m(s).dmResults.some((p) => p.id === 1)).toBe(false);
  s = run(s, "setDmQuery", undefined, { value: "ann" });
  expect(m(s).dmResults.map((p) => p.name)).toEqual(["Ann Stone", "Anna Bell"]);
  s = run(s, "setDmQuery", undefined, { value: "zed" });
  expect(m(s).dmResults).toHaveLength(8);
});

test("new chat needs a title and at least two other people", () => {
  let s = ready();
  const n = s.db.conversations.length;
  s = run(s, "openChatPanel");
  s = run(s, "createChat");
  expect(m(s).chatError).toMatch(/title/i);
  s = run(s, "setChatTitle", undefined, { value: "  Picnic " });
  s = run(s, "togglePick", 2);
  s = run(s, "createChat");
  expect(m(s).chatError).toMatch(/at least 2/);
  expect(m(s).chatNeed).toBe("Pick 1 more person");
  expect(s.db.conversations).toHaveLength(n);
  s = run(s, "togglePick", 1); // myself counts as nobody
  s = run(s, "createChat");
  expect(s.db.conversations).toHaveLength(n);
  s = run(s, "togglePick", 3);
  s = run(s, "togglePick", 3); // picked twice = not picked
  s = run(s, "createChat");
  expect(s.db.conversations).toHaveLength(n);
  s = run(s, "togglePick", 3);
  s = run(s, "togglePick", 4);
  s = run(s, "createChat");
  expect(s.db.conversations).toHaveLength(n + 1);
  const c = s.db.conversations.at(-1)!;
  expect(c).toMatchObject({
    kind: "chat",
    title: "Picnic",
    memberIds: [1, 2, 3, 4],
  });
  expect(c.createdAt).not.toBe("");
  expect(m(s).convId).toBe(c.id);
  expect(m(s).panel).toBe("");
});

test("only the creator renames, adds and removes members", () => {
  let s = run(ready(), "openConv", 2);
  expect(m(s).thread?.isCreator).toBe(true);
  s = run(s, "toggleInfo");
  expect(
    m(s).thread?.members.map((x) => [x.id, x.creator, x.canRemove]),
  ).toEqual([
    [1, true, false],
    [3, false, true],
    [4, false, true],
  ]);
  s = run(s, "startRename");
  s = run(s, "setRenameTitle", undefined, { value: " Trail crew " });
  s = run(s, "saveRename");
  expect(s.db.conversations.find((c) => c.id === 2)?.title).toBe("Trail crew");
  expect(m(s).renaming).toBe(false);
  s = run(s, "startRename");
  s = run(s, "setRenameTitle", undefined, { value: "   " });
  expect(
    run(s, "saveRename").db.conversations.find((c) => c.id === 2)?.title,
  ).toBe("Trail crew");
  // add: search excludes members
  s = run(s, "setAddQuery", undefined, { value: "a" });
  expect(m(s).thread?.addResults.map((p) => p.id)).toEqual([2, 6, 5]);
  s = run(s, "addMember", 2);
  s = run(s, "addMember", 2);
  expect(s.db.conversations.find((c) => c.id === 2)?.memberIds).toEqual([
    1, 3, 4, 2,
  ]);
  s = run(s, "removeMember", 3);
  expect(s.db.conversations.find((c) => c.id === 2)?.memberIds).toEqual([
    1, 4, 2,
  ]);
  expect(
    run(s, "removeMember", 1).db.conversations.find((c) => c.id === 2)
      ?.memberIds,
  ).toEqual([1, 4, 2]);

  // a plain member can do none of it
  let t = run(ready(world(), 3), "openConv", 2);
  expect(m(t).thread?.isCreator).toBe(false);
  t = run(t, "toggleInfo");
  expect(m(t).thread?.addResults).toEqual([]);
  expect(m(t).thread?.members.every((x) => !x.canRemove)).toBe(true);
  for (const [name, payload] of [
    ["startRename"],
    ["saveRename"],
    ["addMember", 5],
    ["removeMember", 4],
  ] as [string, number?][]) {
    const after = run(t, name, payload);
    expect(after.db.conversations).toBe(t.db.conversations);
  }
});

test("dialogues have no members to change", () => {
  const s = run(ready(), "openConv", 1);
  expect(run(s, "addMember", 5).db.conversations).toBe(s.db.conversations);
  expect(run(s, "leave").db.conversations).toBe(s.db.conversations);
});

test("leaving: a member goes out; the creator role passes on; the last one deletes the chat", () => {
  let s = run(ready(world(), 3), "openConv", 2);
  s = run(s, "leave");
  expect(s.db.conversations.find((c) => c.id === 2)?.memberIds).toEqual([1, 4]);
  expect(m(s).convId).toBe(0);
  expect(m(s).rows.some((r) => r.id === 2)).toBe(false);

  // the creator leaves: the next member becomes the creator
  let c = run(ready(), "openConv", 2);
  c = run(c, "leave");
  expect(c.db.conversations.find((x) => x.id === 2)?.memberIds).toEqual([3, 4]);

  // the last member leaves: the chat and its messages are removed
  const db = world();
  db.conversations[1] = { ...db.conversations[1], memberIds: [1] };
  let l = run(ready(db), "openConv", 2);
  l = run(l, "leave");
  expect(l.db.conversations.some((x) => x.id === 2)).toBe(false);
  expect(l.db.messages.some((x) => x.conversationId === 2)).toBe(false);
  expect(l.db.messages.some((x) => x.conversationId === 1)).toBe(true);
});

test("messages come in pages of 30", () => {
  const db = world();
  for (let i = 10; i < 80; i++)
    db.messages.push(msg(i, 1, i % 2 ? 1 : 2, `m${i}`, i % 60));
  // minutes wrap: make creation times strictly increasing
  db.messages.forEach(
    (x, i) =>
      (x.createdAt = `2026-11-03T${String(10 + Math.floor(i / 60)).padStart(2, "0")}:${String(i % 60).padStart(2, "0")}:00`),
  );
  let s = run(ready(db), "openConv", 1);
  const total = db.messages.filter((x) => x.conversationId === 1).length;
  expect(total).toBe(72);
  expect(m(s).thread?.messages).toHaveLength(PAGE_SIZE);
  expect(m(s).thread?.hasMore).toBe(true);
  expect(m(s).thread?.earlier).toBe(total - PAGE_SIZE);
  expect(m(s).thread?.messages.at(-1)?.text).toBe("m79");
  s = run(s, "loadEarlier");
  expect(m(s).thread?.messages).toHaveLength(60);
  s = run(s, "loadEarlier");
  expect(m(s).thread?.messages).toHaveLength(total);
  expect(m(s).thread?.hasMore).toBe(false);
  // reopening starts again at one page
  expect(m(run(s, "openConv", 2)).pages).toBe(1);
});

test("the message index is cached per array and rebuilt after a change", () => {
  const s = run(ready(), "openConv", 1);
  expect(messageIndex(s.db.messages)).toBe(messageIndex(s.db.messages));
  const t = run(typed(s, "again"), "send");
  expect(t.db.messages).not.toBe(s.db.messages);
  expect(messageIndex(t.db.messages).get(1)).toHaveLength(3);
  expect(messageIndex(s.db.messages).get(1)).toHaveLength(2);
});

test("enter with a conversation id opens it, and only if I am in it", () => {
  let s = enter(ready(), { conversationId: 2 });
  expect(m(s).thread?.id).toBe(2);
  expect(m(s).pane).toBe("thread");
  s = enter(ready(), { conversationId: 3 });
  expect(m(s).thread).toBeNull();
});

test("enter with a user id opens the existing dialogue", () => {
  const s = enter(ready(), { userId: 2 });
  expect(m(s).thread?.id).toBe(1);
  expect(s.db.conversations).toHaveLength(4);
});

test("enter with a user id without a dialogue creates it on the first send only", () => {
  let s = enter(ready(), { userId: 5 });
  expect(m(s).thread).toMatchObject({ pending: true, title: "Dan Wu", id: 0 });
  expect(s.db.conversations).toHaveLength(4);
  expect(m(s).rows.some((r) => r.title === "Dan Wu")).toBe(false);
  expect(m(run(s, "send")).thread?.pending).toBe(true);
  s = typed(s, "hey Dan");
  expect(m(s).canSend).toBe(true);
  s = run(s, "keyDraft", undefined, { key: "Enter" });
  expect(s.db.conversations).toHaveLength(5);
  expect(s.db.conversations[4]).toMatchObject({
    kind: "dm",
    memberIds: [1, 5],
  });
  expect(m(s).thread).toMatchObject({
    pending: false,
    id: s.db.conversations[4].id,
  });
  expect(m(s).thread?.messages.map((x) => x.text)).toEqual(["hey Dan"]);
  // sending again never makes a second dialogue
  s = run(typed(s, "again"), "send");
  expect(s.db.conversations).toHaveLength(5);
  expect(
    s.db.messages.filter((x) => x.conversationId === s.db.conversations[4].id),
  ).toHaveLength(2);
});

test("enter with a user id does not duplicate a dialogue created in between", () => {
  let s = enter(ready(), { userId: 5 });
  s = {
    ...s,
    db: {
      ...s.db,
      conversations: [
        ...s.db.conversations,
        { id: 9, kind: "dm", title: "", memberIds: [5, 1], createdAt: NOW },
      ],
    },
  };
  s = run(typed(s, "hi"), "send");
  expect(s.db.conversations).toHaveLength(5);
  expect(s.db.messages.at(-1)?.conversationId).toBe(9);
});

test("enter with myself or a ghost opens nothing", () => {
  expect(m(enter(ready(), { userId: 1 })).thread).toBeNull();
  expect(m(enter(ready(), { userId: 99 })).thread).toBeNull();
});

test("a plain visit keeps the open thread but shows the list on small screens", () => {
  let s = run(ready(), "openConv", 1);
  s = enter(s);
  expect(m(s).pane).toBe("list");
  expect(m(s).thread?.id).toBe(1);
});

test("a deleted author or a missing user does not break the view", () => {
  const db = world();
  db.messages.push(msg(9, 2, 77, "ghost"));
  db.conversations.push({
    id: 7,
    kind: "dm",
    title: "",
    memberIds: [1, 88],
    createdAt: NOW,
  });
  const s = run(ready(db), "openConv", 2);
  expect(m(s).thread?.messages.at(-1)?.name).toBe("Deleted user");
  expect(m(ready(db)).rows.some((r) => r.title === "Deleted user")).toBe(true);
});

test("a large database stays fast", () => {
  const db = world();
  for (let c = 10; c < 1210; c++)
    db.conversations.push({
      id: c,
      kind: "dm",
      title: "",
      memberIds: [c % 3 === 0 ? 1 : 3, 4],
      createdAt: NOW,
    });
  for (let i = 100; i < 12100; i++)
    db.messages.push(msg(i, 10 + (i % 1200), 4, `t${i}`, i % 60));
  const s = ready(db);
  const t0 = performance.now();
  let x = run(s, "openConv", 12);
  for (let i = 0; i < 20; i++)
    x = run(x, "setDraft", undefined, { value: `a${i}` });
  expect(performance.now() - t0).toBeLessThan(2000);
  expect(m(x).rows.length).toBeLessThanOrEqual(40);
  expect(m(x).moreRows).toBe(true);
  expect(m(run(x, "moreRows")).rows.length).toBeGreaterThan(40);
});
