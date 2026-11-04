import type { Meta } from "../../registry.ts";

export const meta: Meta = {
  title: "Developer Resume Landing Page",
  group: "Personal & Portfolio",
  description:
    "A one-page resume site for a developer: bio, tech stack, experience, projects, contact and a PDF to download.",
  order: 1,
  // a terminal at night: dark, green on black, monospace, dashed `cs` borders
  look: {
    mode: "dark",
    palette: "emerald",
    font: "mono",
    style: "cs",
    ui: "md",
    text: "sm",
    block: "md",
  },
};
