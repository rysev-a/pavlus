// STUB of the "messages" module: replace it (keep the exported names: `MessagesState`, `messagesModule`).
import type { Module } from "../../core.ts";

export interface MessagesState {
  title: string;
}

export const messagesModule: Module<MessagesState> = {
  key: "messages",
  screens: ["messages"],
  initial: () => ({ title: "Messages" }),
  derive: (state) => state.messages,
  handlers: {},
};
