import type { Meta } from "../../registry.ts";

export const meta: Meta = {
  title: "Chat Messenger",
  group: "Messaging",
  description:
    "A messenger: chats with unread badges and search, bubbles grouped by day and sender, an emoji picker, attachments, delivery ticks and a typing indicator, reactions, replies, pinned messages, a group info panel and a new-chat dialog.",
  order: 2,
  // an evening chat: dark purple with big soft corners and a round friendly font, like a messenger on a phone
  look: {
    mode: "dark",
    palette: "purple",
    font: "rounded",
    style: "casual",
    ui: "md",
    block: "md",
  },
};
