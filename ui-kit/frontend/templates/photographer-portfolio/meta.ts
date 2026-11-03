import type { Meta } from "../../registry.ts";

export const meta: Meta = {
  title: "Photographer Portfolio",
  group: "Personal & Portfolio",
  description:
    "A gallery with categories and a lightbox, plus a booking calendar for sessions.",
  order: 3,
  // a darkroom: dark graphite, an old-style serif, quiet formal corners
  look: {
    mode: "dark",
    palette: "graphite",
    font: "classical",
    style: "official",
    ui: "md",
    text: "md",
    block: "md",
  },
};
