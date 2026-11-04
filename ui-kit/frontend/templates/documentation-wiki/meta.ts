import type { Meta } from "../../registry.ts";

export const meta: Meta = {
  title: "Documentation Wiki",
  group: "Apps & Business Sites",
  description:
    "The docs of a small library: a menu with folding groups, search with highlights, headings, code, notes, a table of contents and previous / next links.",
  order: 4,
  // a plain light page in an old-style serif, flat and square like a manual
  look: {
    mode: "light",
    palette: "stone",
    font: "classical",
    style: "official",
    ui: "md",
    text: "md",
    block: "md",
  },
};
