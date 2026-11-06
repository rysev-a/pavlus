import { Component, type Effect, type Message } from "@pavlus/frontend";
import {
  storeEffector as store,
  timeEffector as time,
} from "@pavlus/frontend/plugins";
import { type Chat, ME } from "../chat-list/chat.ts";
import {
  DEMO_CHATS,
  DEMO_PEOPLE,
  msg,
  nameOfIn,
} from "../chat-list/chat-demo.ts";
import { addMinutes } from "../mail-list/mail.ts";
import {
  groupMessages,
  nextDelivery,
  QUICK_REACTIONS,
  type Row,
  toggleReaction,
} from "./messages.ts";
import view from "./msg-bubbles.pavlus";

const nameOf = nameOfIn(DEMO_PEOPLE);
const hike = DEMO_CHATS[0];

export interface BubblesState {
  chat: Chat;
  rows: Row[];
  typing: string;
  menuId: string;
  quick: string[];
  sent: number;
  note: string;
}

const rowsOf = (chat: Chat, menuId: string): Row[] =>
  groupMessages(chat, nameOf, menuId);

export const initial: BubblesState = {
  chat: hike,
  rows: rowsOf(hike, ""),
  typing: "",
  menuId: "",
  quick: QUICK_REACTIONS,
  sent: 0,
  note: "",
};

export class MsgBubblesPage extends Component<BubblesState> {
  view = view;

  "bub.menu"(msg: Message, s: BubblesState): Effect[] {
    const menuId = s.menuId === msg.payload ? "" : (msg.payload as string);
    return [
      store.set("menuId", menuId),
      store.set("rows", rowsOf(s.chat, menuId)),
    ];
  }

  "bub.react"(msg: Message, s: BubblesState): Effect[] {
    const [id, emoji] = msg.payload as [string, string];
    return this._chat(s, {
      ...s.chat,
      messages: s.chat.messages.map((m) =>
        m.id === id
          ? { ...m, reactions: toggleReaction(m.reactions, emoji, ME) }
          : m,
      ),
    });
  }

  "bub.pin"(msg: Message, s: BubblesState): Effect[] {
    return this._chat(s, {
      ...s.chat,
      messages: s.chat.messages.map((m) =>
        m.id === msg.payload ? { ...m, pinned: !m.pinned } : m,
      ),
    });
  }

  "bub.reply"(msg: Message, s: BubblesState): Effect[] {
    const m = s.chat.messages.find((x) => x.id === msg.payload);
    return [store.set("note", m ? `Replying to ${nameOf(m.from)}` : "")];
  }

  "bub.jump"(msg: Message): Effect[] {
    return [store.set("note", `The quoted message is ${msg.payload}`)];
  }

  /** Send a message to watch it go from sending to sent to read. */
  sendOne(_msg: Message, s: BubblesState): Effect[] {
    const id = `n${s.sent + 1}`;
    const mine = msg(
      id,
      ME,
      "Sounds like a plan!",
      "2026-11-03",
      addMinutes("09:41", s.sent),
      { state: "sending" },
    );
    return [
      store.set("sent", s.sent + 1),
      ...this._chat(s, { ...s.chat, messages: [...s.chat.messages, mine] }),
      time.setTimeout(`bub-step-${id}`, 800, "step", id),
    ];
  }

  step(msgIn: Message, s: BubblesState): Effect[] {
    const id = msgIn.payload as string;
    const found = s.chat.messages.find((m) => m.id === id);
    if (!found?.state || found.state === "read") return [];
    const state = nextDelivery(found.state);
    return [
      ...this._chat(s, {
        ...s.chat,
        messages: s.chat.messages.map((m) =>
          m.id === id ? { ...m, state } : m,
        ),
      }),
      ...(state === "sent"
        ? [time.setTimeout(`bub-step-${id}`, 1500, "step", id)]
        : []),
    ];
  }

  toggleTyping(_msg: Message, s: BubblesState): Effect[] {
    return [store.set("typing", s.typing ? "" : "Lena is typing...")];
  }

  leave(_msg: Message, s: BubblesState): Effect[] {
    return s.chat.messages.map((m) => time.cancel(`bub-step-${m.id}`));
  }

  _chat(s: BubblesState, chat: Chat): Effect[] {
    return [store.set("chat", chat), store.set("rows", rowsOf(chat, s.menuId))];
  }
}

export const page = new MsgBubblesPage();
