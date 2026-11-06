import type { Meta } from "../../registry.ts";

export const meta: Meta = {
  title: "Community Forum",
  group: "Social Networking",
  description:
    "A discussion board: categories, sortable thread list, nested replies with votes and an accepted answer, a new-thread form with live preview, reputation badges and moderator tools.",
  order: 4,
  // a sturdy reading room: light, forest green, slab letters, the standard soft corners
  look: {
    mode: "light",
    palette: "forest",
    font: "slab",
    style: "default",
    ui: "md",
    block: "md",
  },
};
