import type { Meta } from "../../registry.ts";

export const meta: Meta = {
  title: "Restaurant Admin",
  group: "Business Admin",
  description:
    "A restaurant back office: a floor plan of tables, a live kitchen board with timers, reservations to seat, menu management and the day's sales.",
  order: 1,
  // an evening dining room: dark, warm sunset red, an old-style serif and soft
  // rounded corners, like candlelight on a menu card
  look: {
    mode: "dark",
    palette: "sunset",
    font: "serif",
    style: "casual",
    ui: "md",
    text: "md",
    block: "md",
  },
};
