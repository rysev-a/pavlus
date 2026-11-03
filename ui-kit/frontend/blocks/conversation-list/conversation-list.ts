import {
  Component,
  type Effect,
  type Message,
} from "@service-laboratory/pavlus";
import { storeEffector as store } from "@service-laboratory/pavlus/plugins";
import {
  canSend,
  type ChatMessage,
  type ChatProps,
} from "../chat-thread/chat-thread.ts";
import { initialsOf } from "../feed-post/feed-post.ts";
import view from "./conversation-list.pavlus";

export interface Conversation {
  id: string;
  name: string;
  tone: number;
  preview: string;
  time: string;
  unread: number;
  online: boolean;
}

export interface ConversationRow extends Conversation {
  initials: string;
  active: boolean;
}

/** Pure: the conversations whose name or last message contain the query. */
export function searchConversations(
  list: Conversation[],
  query: string,
): Conversation[] {
  const q = query.trim().toLowerCase();
  if (q === "") return list;
  return list.filter((c) => `${c.name} ${c.preview}`.toLowerCase().includes(q));
}

/** Pure: opening a conversation reads it. */
export const openConversation = (
  list: Conversation[],
  id: string,
): Conversation[] => list.map((c) => (c.id === id ? { ...c, unread: 0 } : c));

/** Pure: how many messages are unread in all. */
export const totalUnread = (list: Conversation[]): number =>
  list.reduce((n, c) => n + c.unread, 0);

/** Pure: the props of the view. */
export function inboxProps(
  list: Conversation[],
  query: string,
  activeId: string,
  title = "Messages",
) {
  return {
    title,
    query,
    items: searchConversations(list, query).map<ConversationRow>((c) => ({
      ...c,
      initials: initialsOf(c.name),
      active: c.id === activeId,
    })),
  };
}

/** Pure: the conversations with one given a new preview and moved to the top. */
export function bumpConversation(
  list: Conversation[],
  id: string,
  preview: string,
): Conversation[] {
  const hit = list.find((c) => c.id === id);
  if (!hit) return list;
  return [
    { ...hit, preview, time: "now", unread: 0 },
    ...list.filter((c) => c.id !== id),
  ];
}

/** Pure: a conversation with a person, created (empty) when there is none. */
export function ensureConversation(
  list: Conversation[],
  messages: Record<string, ChatMessage[]>,
  person: { id: string; name: string; tone: number },
): { list: Conversation[]; messages: Record<string, ChatMessage[]> } {
  if (list.some((c) => c.id === person.id)) return { list, messages };
  return {
    list: [
      {
        id: person.id,
        name: person.name,
        tone: person.tone,
        preview: "No messages yet",
        time: "now",
        unread: 0,
        online: false,
      },
      ...list,
    ],
    messages: { ...messages, [person.id]: [] },
  };
}

/** Pure: the chat props of one conversation. */
export function chatOf(
  list: Conversation[],
  messages: Record<string, ChatMessage[]>,
  id: string,
  draft: string,
  typing: boolean,
): ChatProps {
  const c = list.find((x) => x.id === id);
  return {
    title: c?.name ?? "Nobody selected",
    subtitle: c ? (c.online ? "Active now" : "Away") : "",
    initials: initialsOf(c?.name ?? "?"),
    tone: c?.tone ?? 1,
    messages: messages[id] ?? [],
    draft,
    canSend: canSend(draft),
    typing,
  };
}

const START: Conversation[] = [
  {
    id: "v1",
    name: "Nina Alvarez",
    tone: 4,
    preview: "10:00 works. I will bring the chalk.",
    time: "09:15",
    unread: 2,
    online: true,
  },
  {
    id: "v2",
    name: "Dev Patel",
    tone: 2,
    preview: "Did you see the new build?",
    time: "Yesterday",
    unread: 0,
    online: false,
  },
  {
    id: "v3",
    name: "Climbing crew",
    tone: 5,
    preview: "Leo: who has the rope?",
    time: "Mon",
    unread: 5,
    online: false,
  },
];

export interface InboxState {
  list: Conversation[];
  query: string;
  activeId: string;
  openName: string;
  inbox: ReturnType<typeof inboxProps>;
}

export const initial: InboxState = {
  list: START,
  query: "",
  activeId: "v2",
  openName: "Dev Patel",
  inbox: inboxProps(START, "", "v2"),
};

export class ConversationListPage extends Component<InboxState> {
  view = view;

  "inbox.pick"(msg: Message, state: InboxState): Effect[] {
    const id = msg.payload as string;
    const list = openConversation(state.list, id);
    return [
      store.set("list", list),
      store.set("activeId", id),
      store.set("openName", list.find((c) => c.id === id)?.name ?? ""),
      store.set("inbox", inboxProps(list, state.query, id)),
    ];
  }

  "inbox.search"(msg: Message, state: InboxState): Effect[] {
    const query = msg.event?.value ?? "";
    return [
      store.set("query", query),
      store.set("inbox", inboxProps(state.list, query, state.activeId)),
    ];
  }
}

export const page = new ConversationListPage();
