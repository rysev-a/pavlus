// The model of a messenger and the pure part of the conversation list:
// previews, sorting, search, tabs, unread counts and new chats. Days are plain
// strings (`2026-11-03`), so nothing reads a clock.
import { shortDay, TODAY, weekdayOf } from "../mail-list/mail.ts";
import { hueOf, initialsOf } from "../msg-basics/msg-basics.ts";

export type Delivery = "sending" | "sent" | "read";

export interface Reaction {
  emoji: string;
  /** Person ids. */
  by: string[];
}

export interface ChatFile {
  id: string;
  name: string;
  size: number;
}

export interface ChatMsg {
  id: string;
  /** A person id; `me` is the user. */
  from: string;
  text: string;
  day: string;
  time: string;
  /** Only the user's own messages have one. */
  state?: Delivery;
  /** The id of the message this one answers. */
  replyTo?: string;
  reactions: Reaction[];
  pinned: boolean;
  files: ChatFile[];
}

export interface Chat {
  id: string;
  kind: "direct" | "group";
  name: string;
  /** The icon of a group. */
  emoji: string;
  /** Person ids, `me` included. */
  members: string[];
  /** Who runs a group. */
  admins: string[];
  about: string;
  muted: boolean;
  archived: boolean;
  pinned: boolean;
  unread: number;
  messages: ChatMsg[];
  /** The person who is typing now, if any. */
  typing: string;
  /** What the other side answers, in turn (a script, no randomness). */
  replies: string[];
  replyIdx: number;
}

export interface Person {
  id: string;
  name: string;
  status: string;
  online: boolean;
}

export const ME = "me";
export { TODAY };

export type Tab = "all" | "unread" | "groups" | "archived";

export const TABS: { id: Tab; name: string }[] = [
  { id: "all", name: "All" },
  { id: "unread", name: "Unread" },
  { id: "groups", name: "Groups" },
  { id: "archived", name: "Archived" },
];

export const stampOf = (m: { day: string; time: string }): string =>
  `${m.day} ${m.time}`;

/** Pure: the newest message of a chat. */
export const lastOf = (c: Chat): ChatMsg | undefined =>
  c.messages.length > 0 ? c.messages[c.messages.length - 1] : undefined;

/** Pure: the time of the last message in the list: the hour, `Yesterday`, a weekday or a date. */
export function listTime(day: string, time: string, today = TODAY): string {
  if (day === today) return time;
  const [y, m, d] = today.split("-").map(Number);
  const prev = new Date(Date.UTC(y, m - 1, d - 1)).toISOString().slice(0, 10);
  if (day === prev) return "Yesterday";
  const age = Math.round(
    (Date.UTC(y, m - 1, d) - Date.parse(`${day}T00:00:00Z`)) / 86_400_000,
  );
  return age < 7 ? weekdayOf(day) : shortDay(day, today);
}

/** Pure: the label of a day divider in a chat. */
export function dayLabel(day: string, today = TODAY): string {
  const t = listTime(day, "00:00", today);
  if (day === today) return "Today";
  if (t === "Yesterday") return "Yesterday";
  return `${weekdayOf(day)}, ${shortDay(day, today)}`;
}

/** Pure: the line under a chat's name in the list. */
export function previewOf(
  c: Chat,
  nameOf: (id: string) => string,
): { text: string; typing: boolean } {
  if (c.typing) {
    return {
      text:
        c.kind === "group" ? `${nameOf(c.typing)} is typing...` : "typing...",
      typing: true,
    };
  }
  const m = lastOf(c);
  if (!m) return { text: "No messages yet", typing: false };
  const body = m.text || (m.files[0] ? `📎 ${m.files[0].name}` : "");
  const who =
    m.from === ME ? "You: " : c.kind === "group" ? `${nameOf(m.from)}: ` : "";
  return { text: who + body, typing: false };
}

/** Pure: the chats that match a search (name or any message) and a tab. */
export function filterChats(chats: Chat[], query: string, tab: Tab): Chat[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  return chats.filter((c) => {
    if (tab === "archived" ? !c.archived : c.archived) return false;
    if (tab === "unread" && c.unread === 0) return false;
    if (tab === "groups" && c.kind !== "group") return false;
    if (words.length === 0) return true;
    const hay =
      `${c.name} ${c.messages.map((m) => m.text).join(" ")}`.toLowerCase();
    return words.every((w) => hay.includes(w));
  });
}

/** Pure: pinned chats first, then the newest conversation first. */
export function sortChats(chats: Chat[]): Chat[] {
  const stamp = (c: Chat): string => {
    const m = lastOf(c);
    return m ? stampOf(m) : "";
  };
  return [...chats].sort(
    (a, b) =>
      Number(b.pinned) - Number(a.pinned) || stamp(b).localeCompare(stamp(a)),
  );
}

/** Pure: unread messages in chats that are not muted or archived (the badge on the app). */
export function unreadTotal(chats: Chat[]): number {
  return chats
    .filter((c) => !c.muted && !c.archived)
    .reduce((n, c) => n + c.unread, 0);
}

export interface ChatRow {
  id: string;
  name: string;
  initials: string;
  hue: number;
  emoji: string;
  preview: string;
  typing: boolean;
  time: string;
  unread: number;
  muted: boolean;
  pinned: boolean;
  online: boolean;
  active: boolean;
  group: boolean;
}

/** Pure: the rows of the list. */
export function rowsOf(
  chats: Chat[],
  activeId: string,
  nameOf: (id: string) => string,
  isOnline: (id: string) => boolean,
  today = TODAY,
): ChatRow[] {
  return chats.map((c) => {
    const last = lastOf(c);
    const p = previewOf(c, nameOf);
    const other = c.members.find((m) => m !== ME) ?? "";
    return {
      id: c.id,
      name: c.name,
      initials: initialsOf(c.name),
      hue: hueOf(c.name),
      emoji: c.kind === "group" ? c.emoji : "",
      preview: p.text,
      typing: p.typing,
      time: last ? listTime(last.day, last.time, today) : "",
      unread: c.unread,
      muted: c.muted,
      pinned: c.pinned,
      online: c.kind === "direct" && isOnline(other),
      active: c.id === activeId,
      group: c.kind === "group",
    };
  });
}

export interface TabItem {
  id: Tab;
  name: string;
  active: boolean;
  count: number;
}

/** Pure: the tabs with the number of chats each one shows (unread: unread messages). */
export function tabItems(chats: Chat[], current: Tab): TabItem[] {
  return TABS.map((t) => ({
    ...t,
    active: t.id === current,
    count:
      t.id === "unread"
        ? chats.filter((c) => !c.archived).reduce((n, c) => n + c.unread, 0)
        : 0,
  }));
}

// ---- new chats ----

export type NewMode = "direct" | "group";

/** Pure: why a new chat cannot be created yet (empty when it can). */
export function validateNewChat(
  mode: NewMode,
  picked: string[],
  name: string,
): string {
  if (mode === "direct") return picked.length === 1 ? "" : "Pick one person.";
  if (picked.length < 2) return "Pick at least two people for a group.";
  if (name.trim().length < 2) return "Give the group a name.";
  return "";
}

/** Pure: a new, empty chat. */
export function newChat(
  id: string,
  mode: NewMode,
  picked: string[],
  name: string,
  nameOf: (id: string) => string,
): Chat {
  return {
    id,
    kind: mode,
    name: mode === "direct" ? nameOf(picked[0]) : name.trim(),
    emoji: "💬",
    members: [ME, ...picked],
    admins: mode === "group" ? [ME] : [],
    about: mode === "group" ? "A new group." : "",
    muted: false,
    archived: false,
    pinned: false,
    unread: 0,
    messages: [],
    typing: "",
    replies: [
      "Hey, glad you started this chat!",
      "Sounds good to me.",
      "Let me check and get back to you.",
    ],
    replyIdx: 0,
  };
}

/** Pure: the direct chat with a person, if there is one. */
export const directWith = (chats: Chat[], person: string): Chat | undefined =>
  chats.find((c) => c.kind === "direct" && c.members.includes(person));
