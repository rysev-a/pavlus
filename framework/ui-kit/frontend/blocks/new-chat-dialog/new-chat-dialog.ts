import { Component, type Effect, type Message } from "@pavlus/frontend";
import { storeEffector as store } from "@pavlus/frontend/plugins";
import type { NewMode } from "../chat-list/chat.ts";
import { DEMO_PEOPLE } from "../chat-list/chat-demo.ts";
import {
  changeMode,
  type DialogView,
  dialogView,
  pickPerson,
} from "./new-chat.ts";
import view from "./new-chat-dialog.pavlus";

export interface DialogState {
  open: boolean;
  mode: NewMode;
  name: string;
  query: string;
  picked: string[];
  showError: boolean;
  dialog: DialogView;
  result: string;
}

export const initial: DialogState = {
  open: false,
  mode: "group",
  name: "",
  query: "",
  picked: [],
  showError: false,
  dialog: dialogView(DEMO_PEOPLE, "group", [], "", ""),
  result: "",
};

export class NewChatDialogPage extends Component<DialogState> {
  view = view;

  show(_msg: Message, s: DialogState): Effect[] {
    return this._set(s, { open: true, showError: false, result: "" });
  }

  "ncd.close"(_msg: Message, s: DialogState): Effect[] {
    return this._set(s, { open: false });
  }

  "ncd.setMode"(msg: Message, s: DialogState): Effect[] {
    const mode = msg.payload as NewMode;
    return this._set(s, {
      mode,
      picked: changeMode(mode, s.picked),
      showError: false,
    });
  }

  "ncd.setName"(msg: Message, s: DialogState): Effect[] {
    return this._set(s, { name: msg.event?.value ?? "" });
  }

  "ncd.setQuery"(msg: Message, s: DialogState): Effect[] {
    return this._set(s, { query: msg.event?.value ?? "" });
  }

  "ncd.toggle"(msg: Message, s: DialogState): Effect[] {
    return this._set(s, {
      picked: pickPerson(s.mode, s.picked, msg.payload as string),
      showError: false,
    });
  }

  "ncd.create"(_msg: Message, s: DialogState): Effect[] {
    if (!s.dialog.canCreate) return this._set(s, { showError: true });
    return this._set(s, {
      open: false,
      result:
        s.mode === "group"
          ? `Created the group "${s.name.trim()}" with ${s.picked.length} people.`
          : "Started a direct chat.",
      picked: [],
      name: "",
    });
  }

  _set(s: DialogState, patch: Partial<DialogState>): Effect[] {
    const next = { ...s, ...patch };
    const dialog = dialogView(
      DEMO_PEOPLE,
      next.mode,
      next.picked,
      next.name,
      next.query,
    );
    return [
      ...(Object.keys(patch) as (keyof DialogState)[]).map((k) =>
        store.set(k, patch[k]),
      ),
      store.set("dialog", dialog),
    ];
  }
}

export const page = new NewChatDialogPage();
