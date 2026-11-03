// The messages of a chat as the bubbles show them: grouped by day and by
// sender, with delivery states, reactions and quoted replies. Pure.
import { formatSize } from "../mail-list/mail.ts";
import {
  type Chat,
  type ChatMsg,
  dayLabel,
  type Delivery,
  ME,
  type Reaction,
  TODAY,
} from "../conversation-list/chat.ts";
import { hueOf, initialsOf } from "../msg-basics/msg-basics.ts";

export const QUICK_REACTIONS = ["👍", "❤️", "😂", "😮", "😢", "🙏"];

/** Messages of one sender closer than this (minutes) share a group. */
export const GROUP_GAP = 5;

/** Pure: `sending` → `sent` → `read`; `read` stays. */
export function nextDelivery(state: Delivery): Delivery {
  return state === "sending" ? "sent" : "read";
}

export function deliveryLabel(state: Delivery | undefined): string {
  if (state === "sending") return "Sending...";
  if (state === "sent") return "Sent";
  if (state === "read") return "Read";
  return "";
}

/** The icon class of a delivery state (a clock, one tick, two ticks). */
export function deliveryIcon(state: Delivery | undefined): string {
  if (state === "sending") return "k-mi-clock";
  if (state === "sent") return "k-icon-check";
  if (state === "read") return "k-mi-check-check";
  return "";
}

const minutesOf = (time: string): number => {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
};

/** Pure: do two messages belong to the same group of bubbles? */
export function sameGroup(a: ChatMsg, b: ChatMsg): boolean {
  return (
    a.from === b.from &&
    a.day === b.day &&
    minutesOf(b.time) - minutesOf(a.time) <= GROUP_GAP
  );
}

/** Pure: add or remove a person's reaction to a message. */
export function toggleReaction(
  reactions: Reaction[],
  emoji: string,
  who: string,
): Reaction[] {
  const found = reactions.find((r) => r.emoji === emoji);
  if (!found) return [...reactions, { emoji, by: [who] }];
  const by = found.by.includes(who)
    ? found.by.filter((p) => p !== who)
    : [...found.by, who];
  return reactions
    .map((r) => (r.emoji === emoji ? { ...r, by } : r))
    .filter((r) => r.by.length > 0);
}

export interface BubbleReaction {
  emoji: string;
  count: number;
  mine: boolean;
  title: string;
}

/** Pure: the chips under a bubble. */
export function reactionChips(
  reactions: Reaction[],
  nameOf: (id: string) => string,
): BubbleReaction[] {
  return reactions.map((r) => ({
    emoji: r.emoji,
    count: r.by.length,
    mine: r.by.includes(ME),
    title: r.by.map((p) => (p === ME ? "You" : nameOf(p))).join(", "),
  }));
}

export interface Bubble {
  id: string;
  text: string;
  time: string;
  own: boolean;
  state: string;
  stateIcon: string;
  stateLabel: string;
  reply: { id: string; name: string; text: string } | null;
  reactions: BubbleReaction[];
  pinned: boolean;
  files: { id: string; name: string; sizeLabel: string }[];
  first: boolean;
  last: boolean;
  /** The quick-reaction bar is open on this bubble. */
  menu: boolean;
}

export interface DayRow {
  kind: "day";
  id: string;
  label: string;
}

export interface GroupRow {
  kind: "group";
  id: string;
  own: boolean;
  name: string;
  initials: string;
  hue: number;
  /** Show the sender's name above the bubbles (other people in a group chat). */
  showName: boolean;
  bubbles: Bubble[];
}

export type Row = DayRow | GroupRow;

const clip = (text: string, max = 70): string =>
  text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;

/** Pure: the rows of the conversation: day dividers and groups of bubbles. */
export function groupMessages(
  chat: Pick<Chat, "kind" | "messages">,
  nameOf: (id: string) => string,
  menuId = "",
  today = TODAY,
): Row[] {
  const rows: Row[] = [];
  let prev: ChatMsg | undefined;
  let current: GroupRow | undefined;
  for (const m of chat.messages) {
    if (!prev || prev.day !== m.day) {
      rows.push({
        kind: "day",
        id: `day-${m.day}`,
        label: dayLabel(m.day, today),
      });
      current = undefined;
    }
    if (!current || !prev || !sameGroup(prev, m)) {
      const name = m.from === ME ? "You" : nameOf(m.from);
      current = {
        kind: "group",
        id: `g-${m.id}`,
        own: m.from === ME,
        name,
        initials: initialsOf(name),
        hue: hueOf(name),
        showName: chat.kind === "group" && m.from !== ME,
        bubbles: [],
      };
      rows.push(current);
    }
    const quoted = m.replyTo
      ? chat.messages.find((x) => x.id === m.replyTo)
      : undefined;
    current.bubbles.push({
      id: m.id,
      text: m.text,
      time: m.time,
      own: m.from === ME,
      state: m.state ?? "",
      stateIcon: deliveryIcon(m.state),
      stateLabel: deliveryLabel(m.state),
      reply: quoted
        ? {
            id: quoted.id,
            name: quoted.from === ME ? "You" : nameOf(quoted.from),
            text: clip(quoted.text || quoted.files[0]?.name || ""),
          }
        : null,
      reactions: reactionChips(m.reactions, nameOf),
      pinned: m.pinned,
      files: m.files.map((f) => ({
        id: f.id,
        name: f.name,
        sizeLabel: formatSize(f.size),
      })),
      first: false,
      last: false,
      menu: menuId === m.id,
    });
    prev = m;
  }
  for (const r of rows) {
    if (r.kind === "group") {
      r.bubbles[0].first = true;
      r.bubbles[r.bubbles.length - 1].last = true;
    }
  }
  return rows;
}

/** Pure: `Lena is typing...`, or nothing. */
export function typingText(
  who: string,
  nameOf: (id: string) => string,
): string {
  return who ? `${nameOf(who)} is typing...` : "";
}
