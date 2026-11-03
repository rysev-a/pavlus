import {
  Component,
  type Effect,
  type Message,
} from "@service-laboratory/pavlus";
import { storeEffector as store } from "@service-laboratory/pavlus/plugins";
import type { Chat } from "../chat-list/chat.ts";
import { DEMO_CHATS, DEMO_PEOPLE } from "../chat-list/chat-demo.ts";
import { type InfoView, infoView } from "./info.ts";
import view from "./chat-info-panel.pavlus";

export interface InfoState {
  chat: Chat;
  info: InfoView;
  note: string;
}

export const initial: InfoState = {
  chat: DEMO_CHATS[0],
  info: infoView(DEMO_CHATS[0], DEMO_PEOPLE),
  note: "",
};

export class ChatInfoPanelPage extends Component<InfoState> {
  view = view;

  "info.mute"(_msg: Message, s: InfoState): Effect[] {
    return this._chat({ ...s.chat, muted: !s.chat.muted });
  }

  "info.archive"(_msg: Message, s: InfoState): Effect[] {
    return this._chat({ ...s.chat, archived: !s.chat.archived });
  }

  "info.unpin"(msg: Message, s: InfoState): Effect[] {
    return this._chat({
      ...s.chat,
      messages: s.chat.messages.map((m) =>
        m.id === msg.payload ? { ...m, pinned: false } : m,
      ),
    });
  }

  "info.jump"(msg: Message): Effect[] {
    return [store.set("note", `Scroll to message ${msg.payload}`)];
  }

  "info.member"(msg: Message): Effect[] {
    return [store.set("note", `Open a chat with ${msg.payload}`)];
  }

  "info.leave"(): Effect[] {
    return [store.set("note", "You would leave the group here.")];
  }

  "info.close"(): Effect[] {
    return [store.set("note", "The panel closes.")];
  }

  _chat(chat: Chat): Effect[] {
    return [
      store.set("chat", chat),
      store.set("info", infoView(chat, DEMO_PEOPLE)),
    ];
  }
}

export const page = new ChatInfoPanelPage();
