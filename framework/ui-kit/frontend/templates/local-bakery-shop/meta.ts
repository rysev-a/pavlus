import type { Meta } from "../../registry.ts";

export const meta: Meta = {
  title: "Local Bakery Shop",
  group: "Shops",
  description:
    "A neighbourhood bakery: favourites, the menu by category, opening hours, and an order form with pickup times, courier fee by distance and table booking.",
  order: 2,
  // warm peach and big round corners with an old-style serif: a cozy shop window
  look: {
    mode: "light",
    palette: "peach",
    font: "classical",
    style: "casual",
  },
};
