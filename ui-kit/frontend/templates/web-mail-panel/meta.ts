import type { Meta } from "../../registry.ts";

export const meta: Meta = {
  title: "Web Mail Panel",
  group: "Messaging",
  description:
    "A webmail client: folders and labels with unread counts, a searchable list with filters and bulk actions, threads in a reading pane, replies and forwards, a compose window with drafts and a contacts popover.",
  order: 1,
  // a work inbox: light and quiet, cool slate, the system font, hard-edged "official" style and snug sizes so a lot of mail fits
  look: {
    mode: "light",
    palette: "slate",
    font: "system",
    style: "official",
    ui: "sm",
    text: "sm",
    block: "sm",
  },
};
