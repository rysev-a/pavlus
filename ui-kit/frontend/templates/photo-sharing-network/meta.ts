import type { Meta } from "../../registry.ts";

export const meta: Meta = {
  title: "Photo Sharing Network",
  group: "Social Networking",
  description:
    "A photo app: a masonry feed with Explore and Following, likes and saves, albums, a photo page with comments, hashtag pages and an upload form.",
  order: 2,
  // pictures glow on a dark page: dark mode, fuchsia accents, round tiles, clean geometric type
  look: {
    mode: "dark",
    palette: "fuchsia",
    font: "geometric",
    style: "casual",
    ui: "md",
    block: "md",
  },
};
