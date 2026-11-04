import type { Meta } from "../../registry.ts";

export const meta: Meta = {
  title: "Warehouse Logistics",
  group: "Logistics",
  description:
    "A warehouse control panel: a map of zones, aisles and bays, inbound and outbound orders, pick lists with progress, a dock schedule, stock alerts and a movement log.",
  order: 1,
  // a loading-dock floor: light, safety amber, a slab face and the square,
  // flat shapes of the technical style, like stencilled markings
  look: {
    mode: "light",
    palette: "amber",
    font: "slab",
    style: "cs",
    ui: "md",
    text: "md",
    block: "md",
  },
};
