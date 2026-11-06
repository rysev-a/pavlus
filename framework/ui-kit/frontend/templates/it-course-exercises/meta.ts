import type { Meta } from "../../registry.ts";

export const meta: Meta = {
  title: "Interactive IT Course",
  group: "Learning",
  description:
    "A course on Linux and Git: an outline with progress, lessons with theory, exercises of four kinds (choice, gaps, order and a real terminal), hints that cost XP, levels, a streak and a certificate.",
  order: 1,
  // a friendly textbook: soft mint on a light page, a slab serif for the
  // reading and a roomy block scale, so a long lesson is easy on the eye
  look: {
    mode: "light",
    palette: "mint",
    font: "slab",
    style: "default",
    ui: "md",
    text: "md",
    block: "md",
  },
};
