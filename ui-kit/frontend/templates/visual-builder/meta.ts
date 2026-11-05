import type { Meta } from "../../registry.ts";

export const meta: Meta = {
  title: "Visual Builder",
  group: "Special Web Tools",
  description:
    "A visual app builder in the spirit of Tilda: pages made of sections on a 12-column grid, elements you add by click or drag, a state editor the elements subscribe to, events with action chains (set, toggle, push, remove, HTTP, navigate), forms with validation, tables, charts, desktop / tablet / mobile layouts, a Preview that runs the model (with a mock server), a Diagram of the whole app that you can edit, and a generator of pavlus code.",
  order: 20,
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
