import type { Meta } from "../../registry.ts";

export const meta: Meta = {
  title: "Habit Tracker",
  group: "Personal Productivity",
  description:
    "A habit tracker: streaks, a week grid you check in with a click, a monthly heatmap of boxes, stats, a habit form, reminders and achievement badges.",
  order: 2,
  // a dark ocean-blue app with big round corners and a friendly rounded
  // face: it is used in the evening, on the phone, with a glowing heatmap
  look: {
    mode: "dark",
    palette: "ocean",
    font: "rounded",
    style: "casual",
    ui: "md",
    text: "md",
    block: "md",
  },
};
