import type { Meta } from "../../registry.ts";

export const meta: Meta = {
  title: "Sales CRM Pipeline",
  group: "CRM & Sales",
  description:
    "A sales team's CRM: a deal pipeline from lead to won with a weighted forecast, a deal sheet with contact, notes and timeline, contacts, a rep leaderboard and a forecast chart.",
  order: 1,
  // a cool ocean blue in a geometric face: crisp numbers for a sales floor
  look: {
    mode: "light",
    palette: "ocean",
    font: "geometric",
    style: "default",
    ui: "md",
    text: "md",
    block: "md",
  },
};
