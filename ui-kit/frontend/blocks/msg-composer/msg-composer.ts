import {
  Component,
  type Effect,
  type Message,
} from "@service-laboratory/pavlus";
import { storeEffector as store } from "@service-laboratory/pavlus/plugins";
import type { ChatFile } from "../conversation-list/chat.ts";
import {
  attachMenu,
  canSend,
  chipsOf,
  cleanDraft,
  type FileChip,
  isSendKey,
  type MenuItem,
  toggleChatFile,
} from "./composer.ts";
import view from "./msg-composer.pavlus";

export interface ComposerState {
  draft: string;
  files: ChatFile[];
  chips: FileChip[];
  menu: MenuItem[];
  menuOpen: boolean;
  emojiOpen: boolean;
  replyTo: { id: string; name: string; text: string } | null;
  canSend: boolean;
  sent: string[];
}

export const initial: ComposerState = {
  draft: "",
  files: [],
  chips: [],
  menu: attachMenu([]),
  menuOpen: false,
  emojiOpen: false,
  replyTo: {
    id: "x",
    name: "Lena Fischer",
    text: "Trailhead at 7:30 on Saturday?",
  },
  canSend: false,
  sent: [],
};

export class MsgComposerPage extends Component<ComposerState> {
  view = view;

  "mc.setDraft"(msg: Message, s: ComposerState): Effect[] {
    const draft = msg.event?.value ?? "";
    return [
      store.set("draft", draft),
      store.set("canSend", canSend(draft, s.files)),
    ];
  }

  "mc.key"(msg: Message, s: ComposerState): Effect[] {
    return isSendKey(msg.event?.key) ? this["mc.send"](msg, s) : [];
  }

  "mc.send"(_msg: Message, s: ComposerState): Effect[] {
    if (!canSend(s.draft, s.files)) return [];
    const text = cleanDraft(s.draft);
    const label = [text, ...s.files.map((f) => `📎 ${f.name}`)]
      .filter(Boolean)
      .join(" ");
    return [
      store.set("sent", [...s.sent, label]),
      store.set("draft", ""),
      store.set("files", []),
      store.set("chips", []),
      store.set("menu", attachMenu([])),
      store.set("canSend", false),
      store.set("replyTo", null),
    ];
  }

  "mc.emoji"(_msg: Message, s: ComposerState): Effect[] {
    return [store.set("emojiOpen", !s.emojiOpen)];
  }

  "mc.attachMenu"(_msg: Message, s: ComposerState): Effect[] {
    return [store.set("menuOpen", !s.menuOpen)];
  }

  "mc.attach"(msg: Message, s: ComposerState): Effect[] {
    return this._files(s, toggleChatFile(s.files, msg.payload as string));
  }

  "mc.removeAttach"(msg: Message, s: ComposerState): Effect[] {
    return this._files(
      s,
      s.files.filter((f) => f.id !== msg.payload),
    );
  }

  "mc.cancelReply"(): Effect[] {
    return [store.set("replyTo", null)];
  }

  _files(s: ComposerState, files: ChatFile[]): Effect[] {
    return [
      store.set("files", files),
      store.set("chips", chipsOf(files)),
      store.set("menu", attachMenu(files)),
      store.set("canSend", canSend(s.draft, files)),
    ];
  }
}

export const page = new MsgComposerPage();
