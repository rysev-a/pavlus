import { Component, type Effect, type Message } from "@pavlus/frontend";
import { storeEffector as store } from "@pavlus/frontend/plugins";
import { type Emoji, pickerView, pushRecent } from "./emoji.ts";
import view from "./emoji-picker.pavlus";

export interface PickerState {
  group: string;
  query: string;
  recentIds: string[];
  tabs: ReturnType<typeof pickerView>["tabs"];
  emojis: Emoji[];
  title: string;
  recent: Emoji[];
  text: string;
}

const first = pickerView("smileys", "", ["👍", "🎉"]);

export const initial: PickerState = {
  group: "smileys",
  query: "",
  recentIds: ["👍", "🎉"],
  ...first,
  text: "",
};

export class EmojiPickerPage extends Component<PickerState> {
  view = view;

  "ep.pick"(msg: Message, s: PickerState): Effect[] {
    const recentIds = pushRecent(s.recentIds, msg.payload as string);
    const v = pickerView(s.group, s.query, recentIds);
    return [
      store.set("text", s.text + (msg.payload as string)),
      store.set("recentIds", recentIds),
      store.set("recent", v.recent),
    ];
  }

  "ep.tab"(msg: Message, s: PickerState): Effect[] {
    return this._show(s, msg.payload as string, "");
  }

  "ep.setQuery"(msg: Message, s: PickerState): Effect[] {
    return this._show(s, s.group, msg.event?.value ?? "");
  }

  clear(): Effect[] {
    return [store.set("text", "")];
  }

  _show(s: PickerState, group: string, query: string): Effect[] {
    const v = pickerView(group, query, s.recentIds);
    return [
      store.set("group", group),
      store.set("query", query),
      store.set("tabs", v.tabs),
      store.set("emojis", v.emojis),
      store.set("title", v.title),
      store.set("recent", v.recent),
    ];
  }
}

export const page = new EmojiPickerPage();
