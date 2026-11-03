import {
  Component,
  type Effect,
  type Message,
} from "@service-laboratory/pavlus";
import { storeEffector as store } from "@service-laboratory/pavlus/plugins";
import {
  type Chat,
  type ChatRow,
  filterChats,
  rowsOf,
  sortChats,
  type Tab,
  tabItems,
  type TabItem,
} from "./chat.ts";
import { DEMO_CHATS, DEMO_PEOPLE, nameOfIn, onlineIn } from "./chat-demo.ts";
import view from "./conversation-list.pavlus";

export interface ListState {
  chats: Chat[];
  query: string;
  tab: Tab;
  activeId: string;
  rows: ChatRow[];
  tabs: TabItem[];
  emptyText: string;
}

const derive = (chats: Chat[], query: string, tab: Tab, activeId: string) => ({
  rows: rowsOf(
    sortChats(filterChats(chats, query, tab)),
    activeId,
    nameOfIn(DEMO_PEOPLE),
    onlineIn(DEMO_PEOPLE),
  ),
  tabs: tabItems(chats, tab),
  emptyText: query
    ? `No chats match "${query}".`
    : tab === "archived"
      ? "No archived chats."
      : "Nothing here yet.",
});

export const initial: ListState = {
  chats: DEMO_CHATS,
  query: "",
  tab: "all",
  activeId: "hike",
  ...derive(DEMO_CHATS, "", "all", "hike"),
};

export class ConversationListPage extends Component<ListState> {
  view = view;

  "cl.open"(msg: Message, s: ListState): Effect[] {
    const id = msg.payload as string;
    // opening a chat reads it
    const chats = s.chats.map((c) => (c.id === id ? { ...c, unread: 0 } : c));
    return this._show(s, { chats, activeId: id });
  }

  "cl.setQuery"(msg: Message, s: ListState): Effect[] {
    return this._show(s, { query: msg.event?.value ?? "" });
  }

  "cl.tab"(msg: Message, s: ListState): Effect[] {
    return this._show(s, { tab: msg.payload as Tab });
  }

  "cl.newChat"(): Effect[] {
    return [];
  }

  _show(s: ListState, patch: Partial<ListState>): Effect[] {
    const next = { ...s, ...patch };
    const d = derive(next.chats, next.query, next.tab, next.activeId);
    return [
      ...(Object.keys(patch) as (keyof ListState)[]).map((k) =>
        store.set(k, patch[k]),
      ),
      store.set("rows", d.rows),
      store.set("tabs", d.tabs),
      store.set("emptyText", d.emptyText),
    ];
  }
}

export const page = new ConversationListPage();
