import type { Meta } from "../../registry.ts";

export const meta: Meta = {
  title: "Phone Retail CRM",
  group: "CRM & Sales",
  description:
    "A phone retailer's CRM with a real database in your browser (IndexedDB): users, roles, permissions, sessions, the phone catalogue, 50 shops on a map, 500 orders, sales statistics and a budget. Every list is a data table, every item has a create / update form; export, import and reset live in Settings.",
  order: 6,
  // a clean light workspace: blue, plain sans, a business tool
  look: {
    mode: "light",
    palette: "blue",
    font: "sans",
    style: "default",
    ui: "md",
    text: "md",
    block: "md",
  },
};
