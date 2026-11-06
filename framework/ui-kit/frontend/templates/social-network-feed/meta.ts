import type { Meta } from "../../registry.ts";

export const meta: Meta = {
  title: "Social Network Feed",
  group: "Social Networking",
  description:
    "A social app: a feed with stories, a composer, likes and comment threads, people to follow, trends, alerts, profiles and direct messages.",
  order: 1,
  // a friendly daytime feed: light, sky blue, rounded letters, soft default corners
  look: {
    mode: "light",
    palette: "sky",
    font: "rounded",
    style: "default",
    ui: "md",
    block: "md",
  },
};
