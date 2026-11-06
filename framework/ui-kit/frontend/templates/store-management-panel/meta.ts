import type { Meta } from "../../registry.ts";

export const meta: Meta = {
  title: "Store Management Panel",
  group: "Admin Panels & Dashboards",
  description:
    "A shop's back office: sales KPIs, an editable product table, warehouse stock with restock alerts and orders from new to delivered.",
  order: 4,
  // a light blue ledger: flat, square and in the system face, like an office tool
  look: {
    mode: "light",
    palette: "blue",
    font: "system",
    style: "official",
    ui: "md",
    text: "md",
    block: "md",
  },
};
