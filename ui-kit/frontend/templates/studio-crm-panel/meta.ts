import type { Meta } from "../../registry.ts";

export const meta: Meta = {
  title: "Studio CRM Panel",
  group: "Admin Panels & Dashboards",
  description:
    "A small studio's CRM: clients, projects with progress, a task board, a timeline of milestones and invoices.",
  order: 3,
  // a light indigo workspace in a plain sans face: tidy and professional
  look: {
    mode: "light",
    palette: "indigo",
    font: "sans",
    style: "default",
    ui: "md",
    text: "md",
    block: "md",
  },
};
