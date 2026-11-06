import type { Meta } from "../../registry.ts";

export const meta: Meta = {
  title: "Live Journal Diary",
  group: "Personal Productivity",
  description:
    "A modern diary in the spirit of LiveJournal: a feed with mood, music and place, an editor with a live preview, a calendar archive, tags, comments, friends, a profile and a reading mode.",
  order: 1,
  // an editorial look: a serif face, large calm type, roomy blocks and a
  // berry accent on white paper, like a good magazine
  look: {
    mode: "light",
    palette: "berry",
    font: "serif",
    style: "default",
    ui: "md",
    text: "lg",
    block: "lg",
  },
};
