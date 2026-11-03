import type { Meta } from "../../registry.ts";

export const meta: Meta = {
  title: "Rules table",
  group: "Dashboard",
  description:
    "Firewall rules in a table with a form to add one: action, protocol, port or range, source network. Validated, with a warning for ports opened to the world.",
  order: 23,
};
