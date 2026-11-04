import type { Meta } from "../../registry.ts";

export const meta: Meta = {
  title: "Server & Infra Dashboard",
  group: "Admin Panels & Dashboards",
  description:
    "Servers with CPU, memory and disk, docker containers you can start, stop and restart, live logs, and the state of the database.",
  order: 2,
  // a dark terminal: green on near-black, square corners, monospace type
  look: {
    mode: "dark",
    palette: "green",
    font: "mono",
    style: "cs",
    ui: "md",
    text: "md",
    block: "md",
  },
};
