/**
 * The chat page (`/chat`): the inbox on the left, the open thread on the
 * right. The inbox and the history load over http; the live part is a ws —
 * `enter` loads the inbox and connects, `chat.frame` is every inbound frame
 * (the server's `welcome` marks the connection live; a `message` appends to
 * the open thread and bumps the inbox' unread), and the composer sends over
 * the same ws. `meId` arrives as a prop from the shell's routing.
 */
import { Component, type Effect, type Message } from "@pavlus/frontend";
import {
  httpEffector as http,
  storeEffector as store,
  wsEffector,
} from "@pavlus/frontend/plugins";
import { DomPlugin } from "@pavlus/frontend/plugins/dom";
import type { AppState, ChatMessage, Thread } from "../state.ts";
import view from "./chat.pavlus";

/** The page's slice: what the outlet hands it (state.chat). */
export type ChatSlice = AppState["chat"];

export class ChatPage extends Component<ChatSlice> {
  view = view;

  /** The signed-in user's id (a routing prop): which messages are mine. */
  declare meId: number;

  paint(msg: Message): Effect[] {
    const { prev, next } = msg.payload as {
      prev: ChatSlice;
      next: ChatSlice;
    };
    return [DomPlugin.update(view.diff(prev, next))];
  }

  enter(): Effect[] {
    // the ws url from the page's own origin ("" under the server render —
    // the connect effect is inert there; the browser connects on hydration)
    const origin =
      typeof location === "undefined"
        ? ""
        : `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}`;
    return [
      store.set("live", "connecting", { onSuccess: "paint" }),
      http.request({
        id: "threads",
        url: "/api/chat/threads",
        onSuccess: "threads.loaded",
        onError: "threads.failed",
      }),
      wsEffector.connect({
        id: "chat",
        url: `${origin}/ws`,
        onMessage: "chat.frame",
      }),
    ];
  }

  /** Leave the page: the ws goes with it. */
  leave(): Effect[] {
    return [wsEffector.close("chat")];
  }

  "threads.loaded"(msg: Message): Effect[] {
    const threads = (msg.payload as { data: Thread[] }).data;
    return [store.set("threads", threads, { onSuccess: "paint" })];
  }

  "threads.failed"(): Effect[] {
    return [];
  }

  /** Every inbound ws frame (the plugin parses JSON for us). */
  "chat.frame"(msg: Message, s: ChatSlice): Effect[] {
    const frame = msg.payload as {
      type?: string;
      threadId?: number;
      message?: ChatMessage;
    };
    if (frame.type === "welcome")
      return [store.set("live", "live", { onSuccess: "paint" })];
    if (frame.type === "message" && frame.message) {
      const m = frame.message;
      const inOpen = m.threadId === s.open;
      const messages = inOpen ? [...s.messages, m] : s.messages;
      const threads = inOpen
        ? s.threads
        : s.threads.map((t) =>
            t.id === m.threadId ? { ...t, unread: t.unread + 1 } : t,
          );
      return [
        store.set("messages", messages, { onSuccess: "paint" }),
        store.set("threads", threads, { onSuccess: "paint" }),
      ];
    }
    return [];
  }

  /** The inbox' click: open the thread (its history over http), join live. */
  openThread(msg: Message, s: ChatSlice): Effect[] {
    const id = Number((msg.payload as { id?: number }).id);
    const title = s.threads.find((t) => t.id === id)?.title ?? "";
    const effects: Effect[] = [
      store.set("open", id, { onSuccess: "paint" }),
      store.set("openTitle", title, { onSuccess: "paint" }),
      store.set("messages", [], { onSuccess: "paint" }),
      http.request({
        id: `thread-${id}`,
        url: `/api/chat/threads/${id}`,
        onSuccess: "thread.loaded",
        onError: "threads.failed",
      }),
    ];
    if (s.live === "live")
      effects.push(wsEffector.send("chat", { type: "join", threadId: id }));
    return effects;
  }

  "thread.loaded"(msg: Message): Effect[] {
    const thread = (msg.payload as { data: { messages: ChatMessage[] } }).data;
    return [
      store.set("messages", thread.messages ?? [], { onSuccess: "paint" }),
    ];
  }

  /** The composer's input. */
  setDraft(msg: Message): Effect[] {
    return [store.set("draft", msg.event?.value ?? "", { onSuccess: "paint" })];
  }

  /** Send: over the ws when live, over http as the fallback. */
  send(_msg: Message, s: ChatSlice): Effect[] {
    const body = s.draft.trim();
    if (!body || s.open === 0) return [];
    const effects: Effect[] = [store.set("draft", "", { onSuccess: "paint" })];
    if (s.live === "live") {
      effects.push(
        wsEffector.send("chat", {
          type: "send",
          threadId: s.open,
          body,
        }),
      );
    } else {
      effects.push(
        http.request({
          id: `send-${s.open}`,
          method: "POST",
          url: `/api/chat/threads/${s.open}/send`,
          body: { body },
          onSuccess: "sent.http",
          onError: "threads.failed",
        }),
      );
    }
    return effects;
  }

  /** The http fallback's answer: the message, appended like a frame. */
  "sent.http"(msg: Message, s: ChatSlice): Effect[] {
    const m = (msg.payload as { data: ChatMessage }).data;
    return [store.set("messages", [...s.messages, m], { onSuccess: "paint" })];
  }
}
