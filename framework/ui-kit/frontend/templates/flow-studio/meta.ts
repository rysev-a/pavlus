import type { Meta } from "../../registry.ts";

export const meta: Meta = {
  title: "Flow Studio",
  group: "Special Web Tools",
  description:
    "Design the frontend and the backend of an app as swimlanes (Browser, App, Plugins, Externals) of messages and effects, then Run it: tokens with a request id travel along the edges with a step debugger, injected faults, cancellation and concurrent requests. Sequence, Catalog, Timeline and Checks views, a @pavlus/backend skeleton with scenario tests, and an import of Visual Builder projects. Modules: a named piece of the design with input and output ports, a body of its own and a place in a library; open one with a double click.",
  order: 21,
  // a dev tool: dark, square-ish, with a monospace accent
  look: {
    mode: "dark",
    palette: "blue",
    font: "sans",
    style: "default",
    ui: "md",
    text: "md",
    block: "md",
  },
};
