import type { Meta } from "../../registry.ts";

export const meta: Meta = {
  title: "Personal Time Planner",
  group: "Personal Productivity",
  description:
    "One person's planner for work, study, sport, family, sleep and errands: a week calendar of coloured blocks, today's agenda, a timer, time summaries, goals, quick tasks and categories.",
  order: 1,
  // fresh mint with round, soft corners and a rounded face: a calm personal notebook
  look: {
    mode: "light",
    palette: "mint",
    font: "rounded",
    style: "casual",
    ui: "md",
    text: "md",
    block: "md",
  },
};
