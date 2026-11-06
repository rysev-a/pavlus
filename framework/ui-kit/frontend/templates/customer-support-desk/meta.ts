import type { Meta } from "../../registry.ts";

export const meta: Meta = {
  title: "Customer Support Desk",
  group: "CRM & Sales",
  description:
    "A help desk: an inbox with status, priority and agent filters and live SLA countdowns, a ticket conversation with canned replies and a status change, a customer sidebar with history, and knowledge-base suggestions.",
  order: 2,
  // a dark violet console in a plain system face: a desk to sit at all day
  look: {
    mode: "dark",
    palette: "purple",
    font: "system",
    style: "default",
    ui: "md",
    text: "md",
    block: "md",
  },
};
