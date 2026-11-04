/**
 * Orbit, the "messages" screen: one-to-one dialogues (`kind: "dm"`) and group
 * chats (`kind: "chat"`).
 *
 * The slice holds the UI state (which conversation is open, the draft, the
 * search boxes, the side panel) and the view props `derive` computes from the
 * database: the conversation list (sorted by the last message) and the open thread.
 * Messages are indexed once per `db.messages` array (`messageIndex`), so a render
 * never scans the 12000 rows.
 */
import {
  byId,
  nextId,
  type Handler,
  type Module,
  type OrbitState,
  type Update,
  when,
} from "../../core.ts";
import { glyphOf, initialsOf, pictureStyle } from "../../pictures.ts";
import type { Conversation, Db, Message, User } from "../../schema.ts";

export const PAGE_SIZE = 30;
export const ROWS_STEP = 40;
export const RESULTS = 8;
export const MAX_TEXT = 2000;
export const MAX_TITLE = 60;

/** An avatar: the inline style of a picture and the text drawn on it. */
export interface Av {
  id: number;
  pic: string;
  glyph: string;
}

export interface ConvRow {
  id: number;
  kind: "dm" | "chat";
  isChat: boolean;
  title: string;
  preview: string;
  time: string;
  active: boolean;
  pic: string;
  glyph: string;
  stack: Av[];
}

export interface ThreadMessage {
  id: number;
  mine: boolean;
  showAuthor: boolean;
  name: string;
  pic: string;
  glyph: string;
  text: string;
  time: string;
}

export interface PersonRow {
  id: number;
  name: string;
  sub: string;
  pic: string;
  glyph: string;
  picked: boolean;
}

export interface MemberRow {
  id: number;
  name: string;
  pic: string;
  glyph: string;
  creator: boolean;
  you: boolean;
  canRemove: boolean;
}

export interface Thread {
  id: number;
  /** a dialogue that exists only in the view until the first message is sent */
  pending: boolean;
  isChat: boolean;
  title: string;
  subtitle: string;
  pic: string;
  glyph: string;
  stack: Av[];
  count: number;
  messages: ThreadMessage[];
  hasMore: boolean;
  earlier: number;
  isCreator: boolean;
  members: MemberRow[];
  addResults: PersonRow[];
}

export interface MessagesState {
  // ---- UI state ----
  convId: number;
  /** a user whose dialogue does not exist yet (it is created on the first send) */
  pendingUserId: number;
  pane: "list" | "thread";
  query: string;
  rowLimit: number;
  draft: string;
  pages: number;
  info: boolean;
  renaming: boolean;
  renameTitle: string;
  addQuery: string;
  panel: "" | "dm" | "chat";
  dmQuery: string;
  chatTitle: string;
  chatQuery: string;
  chatPicked: number[];
  chatError: string;
  // ---- derived view props ----
  rows: ConvRow[];
  rowTotal: number;
  moreRows: boolean;
  thread: Thread | null;
  canSend: boolean;
  dmResults: PersonRow[];
  chatResults: PersonRow[];
  chatPickedRows: PersonRow[];
  chatNeed: string;
}

// ---- indexes ----

const msgIndexes = new WeakMap<Message[], Map<number, Message[]>>();

/** `conversationId -> messages` (oldest first), cached for as long as the array lives. */
export function messageIndex(messages: Message[]): Map<number, Message[]> {
  let map = msgIndexes.get(messages);
  if (!map) {
    map = new Map();
    for (const m of messages) {
      const list = map.get(m.conversationId);
      if (list) list.push(m);
      else map.set(m.conversationId, [m]);
    }
    for (const list of map.values())
      list.sort((a, b) =>
        a.createdAt < b.createdAt
          ? -1
          : a.createdAt > b.createdAt
            ? 1
            : a.id - b.id,
      );
    msgIndexes.set(messages, map);
  }
  return map;
}

/** The newest message of a conversation, if any. */
export function lastMessage(
  db: Db,
  conversationId: number,
): Message | undefined {
  const list = messageIndex(db.messages).get(conversationId);
  return list ? list[list.length - 1] : undefined;
}

// ---- small pure helpers ----

const picOf = (u: User | undefined): { pic: string; glyph: string } => {
  const a = avatarOf(u);
  return { pic: a.pic, glyph: a.glyph };
};
const avatarOf = (u: User | undefined): Av =>
  u
    ? {
        id: u.id,
        pic: pictureStyle(u.avatar),
        glyph: glyphOf(u.avatar) || initialsOf(u.name),
      }
    : { id: 0, pic: "background: var(--muted)", glyph: "?" };
const nameOf = (u: User | undefined): string => u?.name ?? "Deleted user";

/** The other member of a dialogue. */
export const otherOf = (c: Conversation, me: number): number =>
  c.memberIds.find((id) => id !== me) ?? 0;

/** The dialogue between two users, if there is one. */
export function findDm(db: Db, a: number, b: number): Conversation | undefined {
  return db.conversations.find(
    (c) =>
      c.kind === "dm" && c.memberIds.includes(a) && c.memberIds.includes(b),
  );
}

export function titleOf(
  c: Conversation,
  me: number,
  users: Map<number, User>,
): string {
  if (c.kind === "chat") return c.title || "Untitled chat";
  return nameOf(users.get(otherOf(c, me)));
}

/** The ids of my accepted friends. */
export function friendIds(db: Db, me: number): number[] {
  const out = new Set<number>();
  for (const f of db.friends) {
    if (f.status !== "accepted") continue;
    if (f.userId === me) out.add(f.friendId);
    else if (f.friendId === me) out.add(f.userId);
  }
  return [...out];
}

/**
 * The first `limit` active users matching `query` (by name), never `exclude`.
 * With no query my friends come first.
 */
export function findUsers(
  db: Db,
  me: number,
  query: string,
  exclude: Set<number>,
  limit = RESULTS,
): User[] {
  const q = query.trim().toLowerCase();
  const users = byId(db.users);
  const ok = (u: User | undefined): u is User =>
    !!u && u.status === "active" && u.id !== me && !exclude.has(u.id);
  const out: User[] = [];
  const seen = new Set<number>();
  const add = (u: User): void => {
    if (out.length < limit && !seen.has(u.id)) {
      seen.add(u.id);
      out.push(u);
    }
  };
  if (!q) {
    for (const id of friendIds(db, me)) {
      const u = users.get(id);
      if (ok(u)) add(u);
      if (out.length >= limit) return out;
    }
  } else {
    // names that start with the query first, then names that contain it
    for (const u of db.users)
      if (ok(u) && u.name.toLowerCase().startsWith(q)) add(u);
  }
  for (const u of db.users) {
    if (out.length >= limit) break;
    if (ok(u) && (!q || u.name.toLowerCase().includes(q))) add(u);
  }
  return out;
}

const person = (u: User, sub: string, picked = false): PersonRow => ({
  id: u.id,
  name: u.name,
  sub,
  ...picOf(u),
  picked,
});

const cityOf = (u: User): string => u.city || "Orbit member";

/** Am I a member of this conversation? */
const isMember = (c: Conversation | undefined, me: number): c is Conversation =>
  !!c && c.memberIds.includes(me);

// ---- derive ----

function conversationRows(
  state: OrbitState,
  s: MessagesState,
  thread: number,
): { rows: ConvRow[]; total: number } {
  const { db, me } = state;
  const users = byId(db.users);
  const index = messageIndex(db.messages);
  const q = s.query.trim().toLowerCase();
  const items: {
    c: Conversation;
    title: string;
    last: Message | undefined;
    at: string;
  }[] = [];
  for (const c of db.conversations) {
    if (!c.memberIds.includes(me)) continue;
    const list = index.get(c.id);
    const last = list ? list[list.length - 1] : undefined;
    const title = titleOf(c, me, users);
    if (
      q &&
      !title.toLowerCase().includes(q) &&
      !(last && last.text.toLowerCase().includes(q))
    )
      continue;
    items.push({ c, title, last, at: last ? last.createdAt : c.createdAt });
  }
  items.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : b.c.id - a.c.id));
  const rows = items
    .slice(0, s.rowLimit)
    .map(({ c, title, last, at }): ConvRow => {
      const other = users.get(otherOf(c, me));
      const first =
        c.kind === "dm" ? avatarOf(other) : { id: 0, pic: "", glyph: "" };
      const who = last
        ? last.authorId === me
          ? "You: "
          : c.kind === "chat"
            ? `${nameOf(users.get(last.authorId)).split(" ")[0]}: `
            : ""
        : "";
      return {
        id: c.id,
        kind: c.kind,
        isChat: c.kind === "chat",
        title,
        preview: last ? who + last.text : "No messages yet",
        time: when(at, state.now),
        active: c.id === thread,
        pic: first.pic,
        glyph: first.glyph,
        stack:
          c.kind === "chat"
            ? c.memberIds.slice(0, 3).map((id) => avatarOf(users.get(id)))
            : [],
      };
    });
  return { rows, total: items.length };
}

function buildThread(state: OrbitState, s: MessagesState): Thread | null {
  const { db, me } = state;
  const users = byId(db.users);
  if (s.convId) {
    const c = byId(db.conversations).get(s.convId);
    if (!isMember(c, me)) return null;
    const list = messageIndex(db.messages).get(c.id) ?? [];
    const shown = list.slice(Math.max(0, list.length - s.pages * PAGE_SIZE));
    const isChat = c.kind === "chat";
    const other = users.get(otherOf(c, me));
    const head = isChat ? { id: 0, pic: "", glyph: "" } : avatarOf(other);
    const isCreator = isChat && c.memberIds[0] === me;
    const messages = shown.map((m): ThreadMessage => {
      const mine = m.authorId === me;
      const author = users.get(m.authorId);
      return {
        id: m.id,
        mine,
        showAuthor: isChat && !mine,
        name: nameOf(author),
        ...picOf(author),
        text: m.text,
        time: when(m.createdAt, state.now),
      };
    });
    const members: MemberRow[] = isChat
      ? c.memberIds.slice(0, 60).map((id) => ({
          id,
          name: nameOf(users.get(id)),
          ...picOf(users.get(id)),
          creator: id === c.memberIds[0],
          you: id === me,
          canRemove: isCreator && id !== me,
        }))
      : [];
    const addResults =
      isChat && isCreator && s.info
        ? findUsers(db, me, s.addQuery, new Set(c.memberIds)).map((u) =>
            person(u, cityOf(u)),
          )
        : [];
    return {
      id: c.id,
      pending: false,
      isChat,
      title: titleOf(c, me, users),
      subtitle: isChat ? `${c.memberIds.length} members` : "Direct message",
      pic: head.pic,
      glyph: head.glyph,
      stack: isChat
        ? c.memberIds.slice(0, 3).map((id) => avatarOf(users.get(id)))
        : [],
      count: c.memberIds.length,
      messages,
      hasMore: list.length > shown.length,
      earlier: list.length - shown.length,
      isCreator,
      members,
      addResults,
    };
  }
  if (s.pendingUserId) {
    const other = users.get(s.pendingUserId);
    if (!other) return null;
    const av = avatarOf(other);
    return {
      id: 0,
      pending: true,
      isChat: false,
      title: other.name,
      subtitle: "Direct message",
      pic: av.pic,
      glyph: av.glyph,
      stack: [],
      count: 2,
      messages: [],
      hasMore: false,
      earlier: 0,
      isCreator: false,
      members: [],
      addResults: [],
    };
  }
  return null;
}

export function derive(state: OrbitState): MessagesState {
  const s = state.messages;
  const { db, me } = state;
  const thread = buildThread(state, s);
  const { rows, total } = conversationRows(state, s, thread ? thread.id : 0);
  const picked = new Set(s.chatPicked);
  const users = byId(db.users);
  const dmResults =
    s.panel === "dm"
      ? findUsers(db, me, s.dmQuery, new Set()).map((u) => person(u, cityOf(u)))
      : [];
  const chatResults =
    s.panel === "chat"
      ? findUsers(db, me, s.chatQuery, new Set()).map((u) =>
          person(u, cityOf(u), picked.has(u.id)),
        )
      : [];
  const chatPickedRows =
    s.panel === "chat"
      ? s.chatPicked
          .map((id) => users.get(id))
          .filter((u): u is User => !!u)
          .map((u) => person(u, cityOf(u), true))
      : [];
  const need = 2 - s.chatPicked.length;
  return {
    ...s,
    pane: thread ? s.pane : "list",
    rows,
    rowTotal: total,
    moreRows: total > rows.length,
    thread,
    canSend: s.draft.trim().length > 0 && !!thread,
    dmResults,
    chatResults,
    chatPickedRows,
    chatNeed:
      need > 0
        ? `Pick ${need} more ${need === 1 ? "person" : "people"}`
        : `${s.chatPicked.length} people picked`,
  };
}

// ---- handlers ----

const slice = (state: OrbitState): MessagesState => state.messages;

/** The slice patch that opens a conversation. */
const openPatch = (id: number): Partial<MessagesState> => ({
  convId: id,
  pendingUserId: 0,
  pane: "thread",
  pages: 1,
  info: false,
  renaming: false,
  renameTitle: "",
  addQuery: "",
  draft: "",
  panel: "",
});

/** Open the dialogue with a user: the existing one, or a pending one (created on the first send). */
function openDm(state: OrbitState, userId: number, create: boolean): Update {
  const { db, me } = state;
  if (userId === me) return { notice: "You cannot message yourself" };
  const user = byId(db.users).get(userId);
  if (!user) return { notice: "That user does not exist" };
  const existing = findDm(db, me, userId);
  if (existing) return { slice: openPatch(existing.id) };
  if (!create) return { slice: { ...openPatch(0), pendingUserId: userId } };
  const c: Conversation = {
    id: nextId(db.conversations),
    kind: "dm",
    title: "",
    memberIds: [me, userId],
    createdAt: state.now,
  };
  return { put: { conversations: [c] }, slice: openPatch(c.id) };
}

const inputValue = (event: { value?: string } | undefined): string =>
  event?.value ?? "";

function send(state: OrbitState): Update | void {
  const s = slice(state);
  const { db, me } = state;
  const text = s.draft.trim().slice(0, MAX_TEXT);
  if (!text) return;
  let convId = s.convId;
  const put: { conversations?: Conversation[]; messages?: Message[] } = {};
  if (convId) {
    if (!isMember(byId(db.conversations).get(convId), me))
      return { notice: "You are not in this conversation" };
  } else if (s.pendingUserId) {
    const existing = findDm(db, me, s.pendingUserId);
    if (existing) convId = existing.id;
    else {
      if (!byId(db.users).get(s.pendingUserId))
        return { notice: "That user does not exist" };
      convId = nextId(db.conversations);
      put.conversations = [
        {
          id: convId,
          kind: "dm",
          title: "",
          memberIds: [me, s.pendingUserId],
          createdAt: state.now,
        },
      ];
    }
  } else return;
  put.messages = [
    {
      id: nextId(db.messages),
      conversationId: convId,
      authorId: me,
      text,
      createdAt: state.now,
    },
  ];
  return {
    put,
    slice: { convId, pendingUserId: 0, draft: "", pages: Math.max(1, s.pages) },
  };
}

/** The conversation I may act on as a chat creator, or an error notice. */
function ownChat(state: OrbitState): { c: Conversation } | { notice: string } {
  const c = byId(state.db.conversations).get(slice(state).convId);
  if (!c || c.kind !== "chat" || !isMember(c, state.me))
    return { notice: "Open a chat first" };
  if (c.memberIds[0] !== state.me)
    return { notice: "Only the creator of the chat can do that" };
  return { c };
}

const handlers: Record<string, Handler> = {
  openConv(payload, _e, state) {
    const c = byId(state.db.conversations).get(Number(payload));
    if (!isMember(c, state.me))
      return { notice: "That conversation is not available" };
    return { slice: openPatch(c.id) };
  },
  back: () => ({ slice: { pane: "list" } }),
  setQuery: (_p, e) => ({
    slice: { query: inputValue(e), rowLimit: ROWS_STEP },
  }),
  moreRows: (_p, _e, state) => ({
    slice: { rowLimit: slice(state).rowLimit + ROWS_STEP },
  }),

  setDraft: (_p, e) => ({ slice: { draft: inputValue(e) } }),
  /** keydown of the composer: Enter sends */
  keyDraft: (_p, e, state) => (e?.key === "Enter" ? send(state) : undefined),
  send: (_p, _e, state) => send(state),

  deleteMessage(payload, _e, state) {
    const m = byId(state.db.messages).get(Number(payload));
    if (!m || m.authorId !== state.me)
      return { notice: "You can delete only your own messages" };
    return { remove: { messages: [m.id] } };
  },
  loadEarlier: (_p, _e, state) => ({
    slice: { pages: slice(state).pages + 1 },
  }),

  // ---- chat info ----
  toggleInfo: (_p, _e, state) => ({
    slice: { info: !slice(state).info, addQuery: "", renaming: false },
  }),
  startRename(_p, _e, state) {
    const r = ownChat(state);
    if ("notice" in r) return { notice: r.notice };
    return { slice: { renaming: true, renameTitle: r.c.title } };
  },
  setRenameTitle: (_p, e) => ({ slice: { renameTitle: inputValue(e) } }),
  cancelRename: () => ({ slice: { renaming: false } }),
  saveRename(_p, _e, state) {
    const r = ownChat(state);
    if ("notice" in r) return { notice: r.notice };
    const title = slice(state).renameTitle.trim().slice(0, MAX_TITLE);
    if (!title) return { notice: "The chat needs a title" };
    return {
      put: { conversations: [{ ...r.c, title }] },
      slice: { renaming: false },
      notice: "Chat renamed",
    };
  },
  setAddQuery: (_p, e) => ({ slice: { addQuery: inputValue(e) } }),
  addMember(payload, _e, state) {
    const r = ownChat(state);
    if ("notice" in r) return { notice: r.notice };
    const id = Number(payload);
    const u = byId(state.db.users).get(id);
    if (!u || u.status !== "active")
      return { notice: "That user does not exist" };
    if (r.c.memberIds.includes(id))
      return { notice: `${u.name} is already in the chat` };
    return {
      put: { conversations: [{ ...r.c, memberIds: [...r.c.memberIds, id] }] },
      notice: `${u.name} added`,
    };
  },
  removeMember(payload, _e, state) {
    const r = ownChat(state);
    if ("notice" in r) return { notice: r.notice };
    const id = Number(payload);
    if (id === state.me) return { notice: "Use Leave to go out of the chat" };
    if (!r.c.memberIds.includes(id)) return;
    return {
      put: {
        conversations: [
          { ...r.c, memberIds: r.c.memberIds.filter((m) => m !== id) },
        ],
      },
      notice: "Member removed",
    };
  },
  leave(_p, _e, state) {
    const { me, db } = state;
    const c = byId(db.conversations).get(slice(state).convId);
    if (!c || c.kind !== "chat" || !isMember(c, me))
      return { notice: "Only chats can be left" };
    const closed = {
      convId: 0,
      pane: "list" as const,
      info: false,
      renaming: false,
      draft: "",
    };
    const rest = c.memberIds.filter((m) => m !== me);
    if (rest.length === 0) {
      const ids = (messageIndex(db.messages).get(c.id) ?? []).map((m) => m.id);
      return {
        remove: { conversations: [c.id], messages: ids },
        slice: closed,
        notice: "The chat was deleted",
      };
    }
    return {
      put: { conversations: [{ ...c, memberIds: rest }] },
      slice: closed,
      notice: "You left the chat",
    };
  },

  // ---- new message / new chat ----
  openDmPanel: () => ({ slice: { panel: "dm", dmQuery: "", pane: "list" } }),
  openChatPanel: () => ({
    slice: {
      panel: "chat",
      chatTitle: "",
      chatQuery: "",
      chatPicked: [],
      chatError: "",
      pane: "list",
    },
  }),
  closePanel: () => ({ slice: { panel: "" } }),
  setDmQuery: (_p, e) => ({ slice: { dmQuery: inputValue(e) } }),
  startDm: (payload, _e, state) => openDm(state, Number(payload), true),
  setChatTitle: (_p, e) => ({
    slice: { chatTitle: inputValue(e), chatError: "" },
  }),
  setChatQuery: (_p, e) => ({ slice: { chatQuery: inputValue(e) } }),
  togglePick(payload, _e, state) {
    const id = Number(payload);
    const picked = slice(state).chatPicked;
    return {
      slice: {
        chatPicked: picked.includes(id)
          ? picked.filter((x) => x !== id)
          : [...picked, id],
        chatError: "",
      },
    };
  },
  createChat(_p, _e, state) {
    const s = slice(state);
    const { db, me } = state;
    const title = s.chatTitle.trim().slice(0, MAX_TITLE);
    const users = byId(db.users);
    const picked = [...new Set(s.chatPicked)].filter(
      (id) => id !== me && users.get(id)?.status === "active",
    );
    if (!title) return { slice: { chatError: "Give the chat a title" } };
    if (picked.length < 2)
      return { slice: { chatError: "Pick at least 2 other people" } };
    const c: Conversation = {
      id: nextId(db.conversations),
      kind: "chat",
      title,
      memberIds: [me, ...picked],
      createdAt: state.now,
    };
    return {
      put: { conversations: [c] },
      slice: {
        ...openPatch(c.id),
        chatTitle: "",
        chatPicked: [],
        chatError: "",
      },
      notice: "Chat created",
    };
  },
};

export const messagesModule: Module<MessagesState> = {
  key: "messages",
  screens: ["messages"],
  initial: () => ({
    convId: 0,
    pendingUserId: 0,
    pane: "list",
    query: "",
    rowLimit: ROWS_STEP,
    draft: "",
    pages: 1,
    info: false,
    renaming: false,
    renameTitle: "",
    addQuery: "",
    panel: "",
    dmQuery: "",
    chatTitle: "",
    chatQuery: "",
    chatPicked: [],
    chatError: "",
    rows: [],
    rowTotal: 0,
    moreRows: false,
    thread: null,
    canSend: false,
    dmResults: [],
    chatResults: [],
    chatPickedRows: [],
    chatNeed: "",
  }),
  derive,
  enter(params, state) {
    const p = params ?? {};
    if (typeof p.userId === "number") return openDm(state, p.userId, false);
    if (typeof p.conversationId === "number") {
      const c = byId(state.db.conversations).get(p.conversationId);
      if (isMember(c, state.me)) return { slice: openPatch(c.id) };
    }
    // a plain visit: the list, with the open thread kept when it is still mine
    const s = state.messages;
    const c = s.convId ? byId(state.db.conversations).get(s.convId) : undefined;
    return {
      slice: {
        pane: "list",
        panel: "",
        ...(s.convId && !isMember(c, state.me) ? { convId: 0 } : {}),
      },
    };
  },
  handlers,
};
