import type { Meta } from "../../registry.ts";

export const meta: Meta = {
  title: "Virtual Machines Admin Panel",
  group: "Business Admin",
  description:
    "A cloud console for your own virtual machines: start, stop, reboot and delete with transitional states, a creation wizard with a live price, metrics, a console, snapshots, firewall rules, volumes, the monthly bill and SSH keys.",
  order: 1,
  // a sober cloud console: cool slate on a dark ground, the default soft corners,
  // small controls so a table of machines stays dense
  look: {
    mode: "dark",
    palette: "slate",
    font: "system",
    style: "default",
    ui: "sm",
    text: "md",
    block: "md",
  },
};
