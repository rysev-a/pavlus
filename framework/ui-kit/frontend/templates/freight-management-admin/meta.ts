import type { Meta } from "../../registry.ts";

export const meta: Meta = {
  title: "Freight Management Admin",
  group: "Logistics",
  description:
    "A freight forwarder's back office: shipments with filters, a detail with route stops, documents and charges, carrier rates, a tracking board, a quote calculator, invoices and customs paperwork.",
  order: 1,
  // an industrial look: a cool slate palette, a slab-serif face and square
  // corners, like waybills and stamped crates; dense text for the tables
  look: {
    mode: "light",
    palette: "slate",
    font: "slab",
    style: "official",
    ui: "sm",
    text: "sm",
    block: "md",
  },
};
