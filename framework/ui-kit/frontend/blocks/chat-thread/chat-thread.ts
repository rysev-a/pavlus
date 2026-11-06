import { Component, type Effect, type Message } from "@pavlus/frontend";
import {
  storeEffector as store,
  timeEffector as time,
} from "@pavlus/frontend/plugins";
import view from "./chat-thread.pavlus";

export interface ChatMessage {
  id: string;
  mine: boolean;
  text: string;
  time: string;
}

/** Pure: can the draft be sent? */
export const canSend = (draft: string): boolean => draft.trim().length > 0;

/** Pure: the list with a new message at the end (an empty text changes nothing). */
export function appendMessage(
  list: ChatMessage[],
  text: string,
  mine: boolean,
  time: string,
  id: string,
): ChatMessage[] {
  const clean = text.trim();
  if (clean === "") return list;
  return [...list, { id, mine, text: clean, time }];
}

/** The answers a conversation partner gives, in turn. */
export const ANSWERS = [
  "Sounds good to me!",
  "Ha, I was just thinking the same.",
  "Give me ten minutes and I will send it over.",
  "Perfect, see you there.",
  "Can you say a bit more?",
];

/** Pure: the n-th canned answer (it wraps around). */
export const answerFor = (n: number): string =>
  ANSWERS[((n % ANSWERS.length) + ANSWERS.length) % ANSWERS.length] ?? "";

export interface ChatProps {
  title: string;
  subtitle: string;
  initials: string;
  tone: number;
  messages: ChatMessage[];
  draft: string;
  canSend: boolean;
  typing: boolean;
}

export interface ChatState {
  chat: ChatProps;
  nextId: number;
}

const START: ChatMessage[] = [
  {
    id: "c1",
    mine: false,
    text: "Are we still on for the climbing gym on Saturday?",
    time: "09:12",
  },
  { id: "c2", mine: true, text: "Yes! Morning session, 10:00?", time: "09:14" },
  {
    id: "c3",
    mine: false,
    text: "10:00 works. I will bring the chalk.",
    time: "09:15",
  },
];

export const initial: ChatState = {
  chat: {
    title: "Nina Alvarez",
    subtitle: "Active now",
    initials: "NA",
    tone: 4,
    messages: START,
    draft: "",
    canSend: false,
    typing: false,
  },
  nextId: 1,
};

export class ChatThreadPage extends Component<ChatState> {
  view = view;

  "chat.draft"(msg: Message, state: ChatState): Effect[] {
    const draft = msg.event?.value ?? "";
    return [
      store.set("chat", { ...state.chat, draft, canSend: canSend(draft) }),
    ];
  }

  "chat.send"(_msg: Message, state: ChatState): Effect[] {
    if (!canSend(state.chat.draft)) return [];
    return [
      store.set("chat", {
        ...state.chat,
        messages: appendMessage(
          state.chat.messages,
          state.chat.draft,
          true,
          "now",
          `m${state.nextId}`,
        ),
        draft: "",
        canSend: false,
        typing: true,
      }),
      store.set("nextId", state.nextId + 2),
      time.setTimeout("chat-reply", 1200, "answer"),
    ];
  }

  answer(_msg: Message, state: ChatState): Effect[] {
    return [
      store.set("chat", {
        ...state.chat,
        messages: appendMessage(
          state.chat.messages,
          answerFor(state.nextId),
          false,
          "now",
          `m${state.nextId - 1}`,
        ),
        typing: false,
      }),
    ];
  }
}

export const page = new ChatThreadPage();
