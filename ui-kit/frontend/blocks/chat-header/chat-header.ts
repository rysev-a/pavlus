import {
  Component,
  type Effect,
  type Message,
} from "@service-laboratory/pavlus";
import { storeEffector as store } from "@service-laboratory/pavlus/plugins";
import { type Chat, ME, stampOf } from "../conversation-list/chat.ts";
import {
  DEMO_CHATS,
  DEMO_PEOPLE,
  nameOfIn,
  onlineIn,
} from "../conversation-list/chat-demo.ts";
import { hueOf, initialsOf } from "../msg-basics/msg-basics.ts";
import view from "./chat-header.pavlus";

export interface HeaderView {
  title: string;
  subtitle: string;
  /** The subtitle is a live state (typing, online). */
  live: boolean;
  initials: string;
  hue: number;
  emoji: string;
  online: boolean;
  muted: boolean;
  muteIcon: string;
  pinned: { id: string; text: string; count: number } | null;
}

/** Pure: the newest pinned message of a chat and how many are pinned. */
export function pinnedBanner(
  chat: Chat,
): { id: string; text: string; count: number } | null {
  const pins = chat.messages.filter((m) => m.pinned);
  if (pins.length === 0) return null;
  const newest = [...pins].sort((a, b) =>
    stampOf(b).localeCompare(stampOf(a)),
  )[0];
  const text = newest.text || newest.files[0]?.name || "";
  return {
    id: newest.id,
    text: text.length > 90 ? `${text.slice(0, 89).trimEnd()}…` : text,
    count: pins.length,
  };
}

/** Pure: what the header of a chat shows. */
export function headerView(
  chat: Chat,
  nameOf: (id: string) => string,
  isOnline: (id: string) => boolean,
  statusOf: (id: string) => string = () => "",
): HeaderView {
  const others = chat.members.filter((m) => m !== ME);
  const other = others[0] ?? "";
  let subtitle: string;
  let live = false;
  if (chat.typing) {
    subtitle =
      chat.kind === "group"
        ? `${nameOf(chat.typing)} is typing...`
        : "typing...";
    live = true;
  } else if (chat.kind === "direct") {
    live = isOnline(other);
    subtitle = live ? "online" : statusOf(other) || "last seen recently";
  } else {
    const online = others.filter(isOnline).length;
    subtitle = `${chat.members.length} members${online > 0 ? `, ${online} online` : ""}`;
  }
  return {
    title: chat.name,
    subtitle,
    live,
    initials: initialsOf(chat.name),
    hue: hueOf(chat.name),
    emoji: chat.kind === "group" ? chat.emoji : "",
    online: chat.kind === "direct" && isOnline(other),
    muted: chat.muted,
    muteIcon: chat.muted ? "k-mi-bell-off" : "k-icon-bell",
    pinned: pinnedBanner(chat),
  };
}

export interface HeaderState {
  chat: Chat;
  header: HeaderView;
  note: string;
}

const nameOf = nameOfIn(DEMO_PEOPLE);
const online = onlineIn(DEMO_PEOPLE);

export const initial: HeaderState = {
  chat: DEMO_CHATS[0],
  header: headerView(DEMO_CHATS[0], nameOf, online),
  note: "",
};

export class ChatHeaderPage extends Component<HeaderState> {
  view = view;

  "head.mute"(_msg: Message, s: HeaderState): Effect[] {
    return this._chat({ ...s.chat, muted: !s.chat.muted });
  }

  "head.infoPane"(): Effect[] {
    return [store.set("note", "The info opens as a pane on small screens.")];
  }

  "head.info"(): Effect[] {
    return [store.set("note", "The info panel opens here.")];
  }

  "head.back"(): Effect[] {
    return [store.set("note", "Back to the list on small screens.")];
  }

  "head.jump"(msg: Message): Effect[] {
    return [store.set("note", `Scroll to message ${msg.payload}`)];
  }

  typing(_msg: Message, s: HeaderState): Effect[] {
    return this._chat({ ...s.chat, typing: s.chat.typing ? "" : "amira" });
  }

  switchChat(msg: Message): Effect[] {
    const chat = DEMO_CHATS.find((c) => c.id === msg.payload) ?? DEMO_CHATS[0];
    return this._chat(chat);
  }

  _chat(chat: Chat): Effect[] {
    return [
      store.set("chat", chat),
      store.set("header", headerView(chat, nameOf, online)),
    ];
  }
}

export const page = new ChatHeaderPage();
