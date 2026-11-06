import type { Meta } from "../../registry.ts";

export const meta: Meta = {
  title: "SaaS Analytics Admin",
  group: "Business Admin",
  description:
    "A subscription business dashboard: MRR, ARR and churn, a revenue chart, cohort retention, customers with a detail sheet, subscriptions by status, feature flags and an audit log.",
  order: 1,
  // dark and magenta-leaning with a system face and the default style: the
  // night-mode analytics tools investors look at
  look: {
    mode: "dark",
    palette: "fuchsia",
    font: "system",
    style: "default",
    ui: "md",
    text: "md",
    block: "md",
  },
};
