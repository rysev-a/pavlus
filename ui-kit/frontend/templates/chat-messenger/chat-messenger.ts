// A messenger: a list of chats, a conversation with bubbles, a composer with
// emoji and attachments, delivery states (sending, sent, read) and a typing
// indicator driven by the time plugin, reactions, replies, pinned messages, a
// group info panel and a new-chat dialog. Every block is a stateless view; the
// state is the `core` object and `derive(core)` recomputes what they show.
import {
  Component,
  type Effect,
  type Message,
} from "@service-laboratory/pavlus";
import {
  domEffector as dom,
  storeEffector as store,
  timeEffector as time,
} from "@service-laboratory/pavlus/plugins";
import {
  headerView,
  type HeaderView,
} from "../../blocks/chat-header/chat-header.ts";
import { infoView, type InfoView } from "../../blocks/chat-info-panel/info.ts";
import {
  type Chat,
  type ChatFile,
  type ChatMsg,
  type ChatRow,
  directWith,
  filterChats,
  ME,
  type NewMode,
  newChat,
  rowsOf,
  sortChats,
  type Tab,
  tabItems,
  type TabItem,
  TODAY,
  unreadTotal,
} from "../../blocks/chat-list/chat.ts";
import {
  type PickerView,
  pickerView,
  pushRecent,
} from "../../blocks/emoji-picker/emoji.ts";
import { addMinutes } from "../../blocks/mail-list/mail.ts";
import {
  attachMenu,
  canSend,
  chipsOf,
  cleanDraft,
  type FileChip,
  isSendKey,
  type MenuItem,
  toggleChatFile,
} from "../../blocks/msg-composer/composer.ts";
import {
  groupMessages,
  nextDelivery,
  QUICK_REACTIONS,
  type Row,
  toggleReaction,
} from "../../blocks/msg-bubbles/messages.ts";
import {
  changeMode,
  type DialogView,
  dialogView,
  pickPerson,
} from "../../blocks/new-chat-dialog/new-chat.ts";
import { CHATS, PEOPLE } from "./chat-data.ts";
import view from "./chat-messenger.pavlus";

export type Pane = "list" | "chat" | "info";

export interface NewChatState {
  open: boolean;
  mode: NewMode;
  name: string;
  query: string;
  picked: string[];
  showError: boolean;
}

export interface Core {
  chats: Chat[];
  activeId: string;
  query: string;
  tab: Tab;
  /** Small screens show one pane at a time. */
  pane: Pane;
  infoOpen: boolean;
  /** An unsent message per chat. */
  drafts: Record<string, string>;
  files: ChatFile[];
  /** The message being answered. */
  replyTo: string;
  /** The message whose quick reaction bar is open. */
  reactFor: string;
  emojiOpen: boolean;
  menuOpen: boolean;
  emojiGroup: string;
  emojiQuery: string;
  recent: string[];
  dialog: NewChatState;
  /** Minutes since 09:41: the clock of the messages the user writes. */
  clock: number;
  nextId: number;
  toast: string;
  /** The message from the background chat has arrived. */
  bgDone: boolean;
}

export interface Derived {
  rows: ChatRow[];
  tabs: TabItem[];
  emptyText: string;
  header: HeaderView | null;
  messageRows: Row[];
  typingLine: string;
  info: InfoView | null;
  draft: string;
  placeholder: string;
  replyBanner: { id: string; name: string; text: string } | null;
  chips: FileChip[];
  attachItems: MenuItem[];
  sendable: boolean;
  picker: PickerView;
  dialogUi: DialogView;
  unreadAll: number;
  hasChat: boolean;
}

export const nameOf = (id: string): string =>
  id === ME ? "You" : (PEOPLE.find((p) => p.id === id)?.name ?? id);
const isOnline = (id: string): boolean =>
  PEOPLE.find((p) => p.id === id)?.online ?? false;
const statusOf = (id: string): string =>
  PEOPLE.find((p) => p.id === id)?.status ?? "";

/** Pure: the time the user's next message gets. */
export const stampTime = (clock: number): string => addMinutes("09:41", clock);

/** Pure: a chat with one more message at the end. */
export const appendMessage = (c: Chat, msg: ChatMsg): Chat => ({
  ...c,
  messages: [...c.messages, msg],
});

/** Pure: a chat with the delivery state of one of the user's messages changed. */
export function setDelivery(
  c: Chat,
  id: string,
  state: "sending" | "sent" | "read",
): Chat {
  return {
    ...c,
    messages: c.messages.map((m) => (m.id === id ? { ...m, state } : m)),
  };
}

/** Pure: everything the user sent in the chat has been read (`sent` goes to `read`). */
export function markOwnRead(c: Chat): Chat {
  return {
    ...c,
    messages: c.messages.map((m) =>
      m.from === ME && m.state === "sent"
        ? { ...m, state: nextDelivery("sent") }
        : m,
    ),
  };
}

/** Pure: who answers next: the other members in turn. */
export function responderOf(c: Chat): string {
  const others = c.members.filter((p) => p !== ME);
  return others.length === 0 ? "" : others[c.replyIdx % others.length];
}

/** Pure: the next scripted line of a chat. */
export function nextReply(c: Chat): string {
  return c.replies.length === 0 ? "" : c.replies[c.replyIdx % c.replies.length];
}

/** Pure: the answer arrives: typing stops, the user's messages are read, a message is added. */
export function receiveReply(
  c: Chat,
  id: string,
  clock: number,
  visible: boolean,
): Chat {
  const who = responderOf(c);
  const read = markOwnRead(c);
  if (!who) return { ...read, typing: "" };
  const msg: ChatMsg = {
    id,
    from: who,
    text: nextReply(c),
    day: TODAY,
    time: stampTime(clock),
    reactions: [],
    pinned: false,
    files: [],
  };
  return {
    ...appendMessage(read, msg),
    typing: "",
    replyIdx: c.replyIdx + 1,
    unread: visible ? 0 : c.unread + 1,
  };
}

/** Pure: unpin or pin, react, or any change to one message. */
export function mapMessage(
  c: Chat,
  id: string,
  fn: (m: ChatMsg) => ChatMsg,
): Chat {
  return { ...c, messages: c.messages.map((m) => (m.id === id ? fn(m) : m)) };
}

export function derive(s: Core): Derived {
  const active = s.chats.find((c) => c.id === s.activeId);
  const visible = sortChats(filterChats(s.chats, s.query, s.tab));
  const draft = s.drafts[s.activeId] ?? "";
  const quoted = active?.messages.find((m) => m.id === s.replyTo);
  const empty = s.query
    ? `No chats match "${s.query}".`
    : s.tab === "archived"
      ? "No archived chats."
      : s.tab === "unread"
        ? "You are all caught up."
        : "Start a chat with the pencil button.";
  return {
    rows: rowsOf(visible, s.activeId, nameOf, isOnline),
    tabs: tabItems(s.chats, s.tab),
    emptyText: empty,
    header: active ? headerView(active, nameOf, isOnline, statusOf) : null,
    messageRows: active ? groupMessages(active, nameOf, s.reactFor) : [],
    typingLine: active?.typing ? `${nameOf(active.typing)} is typing...` : "",
    info: active ? infoView(active, PEOPLE) : null,
    draft,
    placeholder: active ? `Message ${active.name}` : "Select a chat",
    replyBanner: quoted
      ? {
          id: quoted.id,
          name: nameOf(quoted.from),
          text: quoted.text || quoted.files[0]?.name || "",
        }
      : null,
    chips: chipsOf(s.files),
    attachItems: attachMenu(s.files),
    sendable: !!active && canSend(draft, s.files),
    picker: pickerView(s.emojiGroup, s.emojiQuery, s.recent),
    dialogUi: dialogView(
      PEOPLE,
      s.dialog.mode,
      s.dialog.picked,
      s.dialog.name,
      s.dialog.query,
    ),
    unreadAll: unreadTotal(s.chats),
    hasChat: !!active,
  };
}

const core: Core = {
  chats: CHATS,
  activeId: "hike",
  query: "",
  tab: "all",
  pane: "list",
  infoOpen: true,
  drafts: {},
  files: [],
  replyTo: "",
  reactFor: "",
  emojiOpen: false,
  menuOpen: false,
  emojiGroup: "smileys",
  emojiQuery: "",
  recent: ["👍", "😂", "🎉"],
  dialog: {
    open: false,
    mode: "direct",
    name: "",
    query: "",
    picked: [],
    showError: false,
  },
  clock: 0,
  nextId: 100,
  toast: "",
  bgDone: false,
};

export interface ChatState extends Core, Derived {
  quick: string[];
}

export const initial: ChatState = {
  ...core,
  ...derive(core),
  quick: QUICK_REACTIONS,
};

const CORE_KEYS = Object.keys(core) as (keyof Core)[];
const coreOf = (state: ChatState): Core => {
  const c: Record<string, unknown> = {};
  for (const k of CORE_KEYS) c[k] = state[k];
  return c as unknown as Core;
};

const TOAST = "cm-toast";

export class ChatMessenger extends Component<ChatState> {
  view = view;

  /** A message arrives from a chat the user is not looking at. */
  enter(_msg: Message, s: ChatState): Effect[] {
    return s.bgDone ? [] : [time.setTimeout("cm-bg", 9000, "background")];
  }

  background(_msg: Message, s: ChatState): Effect[] {
    const team = s.chats.find((c) => c.id === "team");
    if (!team || s.bgDone) return [];
    const visible = s.activeId === "team" && s.pane !== "list";
    const msg: ChatMsg = {
      id: `c${s.nextId}`,
      from: "noah",
      text: "Heads up: the sync moved to the big room.",
      day: TODAY,
      time: stampTime(s.clock),
      reactions: [],
      pinned: false,
      files: [],
    };
    const next: Chat = {
      ...appendMessage(team, msg),
      unread: visible ? 0 : team.unread + 1,
    };
    return this._commit(s, {
      chats: s.chats.map((c) => (c.id === "team" ? next : c)),
      nextId: s.nextId + 1,
      clock: s.clock + 1,
      bgDone: true,
    });
  }

  // ---- the list ----
  "cl.open"(msg: Message, s: ChatState): Effect[] {
    return this._openChat(s, msg.payload as string, s.chats);
  }

  "cl.setQuery"(msg: Message, s: ChatState): Effect[] {
    return this._commit(s, { query: msg.event?.value ?? "" });
  }

  "cl.tab"(msg: Message, s: ChatState): Effect[] {
    return this._commit(s, { tab: msg.payload as Tab });
  }

  "cl.newChat"(_msg: Message, s: ChatState): Effect[] {
    return this._commit(s, {
      dialog: {
        open: true,
        mode: "direct",
        name: "",
        query: "",
        picked: [],
        showError: false,
      },
    });
  }

  // ---- the header ----
  "head.back"(_msg: Message, s: ChatState): Effect[] {
    return this._commit(s, { pane: "list" });
  }

  /** Wide screens: show or hide the third column. */
  "head.info"(_msg: Message, s: ChatState): Effect[] {
    return this._commit(s, { infoOpen: !s.infoOpen });
  }

  /** Small screens: the info is a pane of its own. */
  "head.infoPane"(_msg: Message, s: ChatState): Effect[] {
    return this._commit(s, { infoOpen: true, pane: "info" });
  }

  "head.mute"(_msg: Message, s: ChatState): Effect[] {
    return this._chat(s, (c) => ({ ...c, muted: !c.muted }));
  }

  "head.jump"(msg: Message): Effect[] {
    return [dom.focus(`#msg-${msg.payload as string}`)];
  }

  // ---- the bubbles ----
  "bub.menu"(msg: Message, s: ChatState): Effect[] {
    const id = msg.payload as string;
    return this._commit(s, { reactFor: s.reactFor === id ? "" : id });
  }

  "bub.react"(msg: Message, s: ChatState): Effect[] {
    const [id, emoji] = msg.payload as [string, string];
    return this._chat(
      s,
      (c) =>
        mapMessage(c, id, (m) => ({
          ...m,
          reactions: toggleReaction(m.reactions, emoji, ME),
        })),
      { reactFor: "" },
    );
  }

  "bub.pin"(msg: Message, s: ChatState): Effect[] {
    return this._chat(s, (c) =>
      mapMessage(c, msg.payload as string, (m) => ({
        ...m,
        pinned: !m.pinned,
      })),
    );
  }

  "bub.reply"(msg: Message, s: ChatState): Effect[] {
    return [
      ...this._commit(s, { replyTo: msg.payload as string, reactFor: "" }),
      time.setTimeout("cm-focus", 0, "focusInput"),
    ];
  }

  "bub.jump"(msg: Message): Effect[] {
    return [dom.focus(`#msg-${msg.payload as string}`)];
  }

  focusInput(): Effect[] {
    return [dom.focus("#k-mc-input")];
  }

  // ---- the composer ----
  "mc.setDraft"(msg: Message, s: ChatState): Effect[] {
    const value = msg.event?.value ?? "";
    const drafts = { ...s.drafts, [s.activeId]: value };
    return [
      store.set("drafts", drafts),
      store.set("draft", value),
      store.set("sendable", !!s.hasChat && canSend(value, s.files)),
    ];
  }

  "mc.key"(msg: Message, s: ChatState): Effect[] {
    return isSendKey(msg.event?.key) ? this["mc.send"](msg, s) : [];
  }

  /** Send: the message is `sending`, then `sent`, then `read` when the answer comes. */
  "mc.send"(_msg: Message, s: ChatState): Effect[] {
    const chat = s.chats.find((c) => c.id === s.activeId);
    if (!chat || !canSend(s.draft, s.files)) return [];
    const id = `c${s.nextId}`;
    const msg: ChatMsg = {
      id,
      from: ME,
      text: cleanDraft(s.draft),
      day: TODAY,
      time: stampTime(s.clock),
      state: "sending",
      replyTo: s.replyTo || undefined,
      reactions: [],
      pinned: false,
      files: s.files,
    };
    const next: Chat = { ...appendMessage(chat, msg), archived: false };
    return [
      ...this._commit(s, {
        chats: s.chats.map((c) => (c.id === chat.id ? next : c)),
        drafts: { ...s.drafts, [chat.id]: "" },
        files: [],
        replyTo: "",
        emojiOpen: false,
        menuOpen: false,
        nextId: s.nextId + 1,
        clock: s.clock + 1,
      }),
      time.setTimeout(`cm-sent-${id}`, 700, "delivered", [chat.id, id]),
    ];
  }

  delivered(msg: Message, s: ChatState): Effect[] {
    const [chatId, id] = msg.payload as [string, string];
    const chat = s.chats.find((c) => c.id === chatId);
    if (!chat) return [];
    return [
      ...this._commit(s, {
        chats: s.chats.map((c) =>
          c.id === chatId ? setDelivery(c, id, "sent") : c,
        ),
      }),
      time.setTimeout(`cm-typing-${chatId}`, 900, "typingOn", chatId),
    ];
  }

  typingOn(msg: Message, s: ChatState): Effect[] {
    const chatId = msg.payload as string;
    const chat = s.chats.find((c) => c.id === chatId);
    if (!chat) return [];
    return [
      ...this._commit(s, {
        chats: s.chats.map((c) =>
          c.id === chatId ? { ...c, typing: responderOf(c) } : c,
        ),
      }),
      time.setTimeout(`cm-reply-${chatId}`, 2200, "replyIn", chatId),
    ];
  }

  replyIn(msg: Message, s: ChatState): Effect[] {
    const chatId = msg.payload as string;
    const chat = s.chats.find((c) => c.id === chatId);
    if (!chat) return [];
    const visible = s.activeId === chatId && s.pane !== "list";
    const next = receiveReply(chat, `c${s.nextId}`, s.clock, visible);
    return this._commit(s, {
      chats: s.chats.map((c) => (c.id === chatId ? next : c)),
      nextId: s.nextId + 1,
      clock: s.clock + 1,
    });
  }

  "mc.emoji"(_msg: Message, s: ChatState): Effect[] {
    return this._commit(s, { emojiOpen: !s.emojiOpen, menuOpen: false });
  }

  "mc.attachMenu"(_msg: Message, s: ChatState): Effect[] {
    return this._commit(s, { menuOpen: !s.menuOpen, emojiOpen: false });
  }

  "mc.attach"(msg: Message, s: ChatState): Effect[] {
    return this._commit(s, {
      files: toggleChatFile(s.files, msg.payload as string),
    });
  }

  "mc.removeAttach"(msg: Message, s: ChatState): Effect[] {
    return this._commit(s, {
      files: s.files.filter((f) => f.id !== msg.payload),
    });
  }

  "mc.cancelReply"(_msg: Message, s: ChatState): Effect[] {
    return this._commit(s, { replyTo: "" });
  }

  // ---- the emoji picker ----
  "ep.pick"(msg: Message, s: ChatState): Effect[] {
    const emoji = msg.payload as string;
    return this._commit(s, {
      drafts: { ...s.drafts, [s.activeId]: s.draft + emoji },
      recent: pushRecent(s.recent, emoji),
    });
  }

  "ep.tab"(msg: Message, s: ChatState): Effect[] {
    return this._commit(s, {
      emojiGroup: msg.payload as string,
      emojiQuery: "",
    });
  }

  "ep.setQuery"(msg: Message, s: ChatState): Effect[] {
    return this._commit(s, { emojiQuery: msg.event?.value ?? "" });
  }

  // ---- the info panel ----
  "info.close"(_msg: Message, s: ChatState): Effect[] {
    return this._commit(s, { infoOpen: false, pane: "chat" });
  }

  "info.mute"(_msg: Message, s: ChatState): Effect[] {
    return this._chat(s, (c) => ({ ...c, muted: !c.muted }));
  }

  /** Archiving moves the chat to the Archived tab and leaves it. */
  "info.archive"(_msg: Message, s: ChatState): Effect[] {
    const chat = s.chats.find((c) => c.id === s.activeId);
    if (!chat) return [];
    const archived = !chat.archived;
    const chats = s.chats.map((c) =>
      c.id === chat.id ? { ...c, archived } : c,
    );
    return [
      ...this._commit(s, {
        chats,
        activeId: archived ? "" : chat.id,
        pane: archived ? "list" : s.pane,
        toast: archived ? `${chat.name} was archived` : "",
      }),
      ...(archived ? [time.setTimeout(TOAST, 4000, "toastGone")] : []),
    ];
  }

  "info.unpin"(msg: Message, s: ChatState): Effect[] {
    return this._chat(s, (c) =>
      mapMessage(c, msg.payload as string, (m) => ({ ...m, pinned: false })),
    );
  }

  "info.jump"(msg: Message, s: ChatState): Effect[] {
    return [
      ...this._commit(s, { pane: "chat" }),
      time.setTimeout("cm-jump", 0, "jumpTo", msg.payload),
    ];
  }

  jumpTo(msg: Message): Effect[] {
    return [dom.focus(`#msg-${msg.payload as string}`)];
  }

  /** A member: open the direct chat with them, or start one. */
  "info.member"(msg: Message, s: ChatState): Effect[] {
    const person = msg.payload as string;
    if (person === ME) return [];
    const found = directWith(s.chats, person);
    if (found) return this._openChat(s, found.id, s.chats);
    const created = newChat(`n${s.nextId}`, "direct", [person], "", nameOf);
    return this._openChat(s, created.id, [created, ...s.chats], {
      nextId: s.nextId + 1,
    });
  }

  "info.leave"(_msg: Message, s: ChatState): Effect[] {
    const chat = s.chats.find((c) => c.id === s.activeId);
    if (!chat) return [];
    return [
      ...this._commit(s, {
        chats: s.chats.filter((c) => c.id !== chat.id),
        activeId: "",
        pane: "list",
        toast: `You left ${chat.name}`,
      }),
      time.setTimeout(TOAST, 4000, "toastGone"),
    ];
  }

  // ---- the new chat dialog ----
  "ncd.close"(_msg: Message, s: ChatState): Effect[] {
    return this._dialog(s, { open: false });
  }

  "ncd.setMode"(msg: Message, s: ChatState): Effect[] {
    const mode = msg.payload as NewMode;
    return this._dialog(s, {
      mode,
      picked: changeMode(mode, s.dialog.picked),
      showError: false,
    });
  }

  "ncd.setName"(msg: Message, s: ChatState): Effect[] {
    return this._dialog(s, { name: msg.event?.value ?? "" });
  }

  "ncd.setQuery"(msg: Message, s: ChatState): Effect[] {
    return this._dialog(s, { query: msg.event?.value ?? "" });
  }

  "ncd.toggle"(msg: Message, s: ChatState): Effect[] {
    return this._dialog(s, {
      picked: pickPerson(s.dialog.mode, s.dialog.picked, msg.payload as string),
      showError: false,
    });
  }

  "ncd.create"(_msg: Message, s: ChatState): Effect[] {
    if (!s.dialogUi.canCreate) return this._dialog(s, { showError: true });
    const d = s.dialog;
    const closed = {
      ...d,
      open: false,
      picked: [],
      name: "",
      query: "",
      showError: false,
    };
    if (d.mode === "direct") {
      const found = directWith(s.chats, d.picked[0]);
      if (found)
        return this._openChat(s, found.id, s.chats, { dialog: closed });
    }
    const created = newChat(`n${s.nextId}`, d.mode, d.picked, d.name, nameOf);
    return this._openChat(s, created.id, [created, ...s.chats], {
      dialog: closed,
      nextId: s.nextId + 1,
      tab: "all",
      query: "",
    });
  }

  // ---- the snackbar ----
  dismissToast(_msg: Message, s: ChatState): Effect[] {
    return this._commit(s, { toast: "" }, [time.cancel(TOAST)]);
  }

  toastGone(_msg: Message, s: ChatState): Effect[] {
    return this._commit(s, { toast: "" });
  }

  leave(_msg: Message, s: ChatState): Effect[] {
    return [
      time.cancel("cm-bg"),
      time.cancel(TOAST),
      time.cancel("cm-focus"),
      time.cancel("cm-jump"),
      ...s.chats.flatMap((c) => [
        time.cancel(`cm-typing-${c.id}`),
        time.cancel(`cm-reply-${c.id}`),
        ...c.messages
          .filter((m) => m.state === "sending")
          .map((m) => time.cancel(`cm-sent-${m.id}`)),
      ]),
    ];
  }

  // ---- helpers ----
  /** Opening a chat reads it, shows it and drops what belonged to the last one. */
  _openChat(
    s: ChatState,
    id: string,
    chats: Chat[],
    patch: Partial<Core> = {},
  ): Effect[] {
    return this._commit(s, {
      chats: chats.map((c) => (c.id === id ? { ...c, unread: 0 } : c)),
      activeId: id,
      pane: "chat",
      files: [],
      replyTo: "",
      reactFor: "",
      emojiOpen: false,
      menuOpen: false,
      ...patch,
    });
  }

  /** Change the active chat. */
  _chat(
    s: ChatState,
    fn: (c: Chat) => Chat,
    patch: Partial<Core> = {},
  ): Effect[] {
    return this._commit(s, {
      chats: s.chats.map((c) => (c.id === s.activeId ? fn(c) : c)),
      ...patch,
    });
  }

  _dialog(s: ChatState, patch: Partial<NewChatState>): Effect[] {
    return this._commit(s, { dialog: { ...s.dialog, ...patch } });
  }

  _commit(
    state: ChatState,
    patch: Partial<Core>,
    extra: Effect[] = [],
  ): Effect[] {
    const next: Core = { ...coreOf(state), ...patch };
    const derived = derive(next);
    return [
      ...(Object.keys(patch) as (keyof Core)[]).map((k) =>
        store.set(k, patch[k]),
      ),
      ...(Object.keys(derived) as (keyof Derived)[]).map((k) =>
        store.set(k, derived[k]),
      ),
      ...extra,
    ];
  }
}

export const page = new ChatMessenger();
