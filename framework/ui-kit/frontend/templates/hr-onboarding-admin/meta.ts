import type { Meta } from "../../registry.ts";

export const meta: Meta = {
  title: "HR Onboarding Admin",
  group: "HR & People",
  description:
    "An admin for new employees: onboarding progress, a checklist per person, a 30-60-90 plan, documents, equipment, buddies, a welcome message and what the newcomer sees.",
  order: 1,
  // a warm rose in a bookish serif: people-first, friendly and calm
  look: {
    mode: "light",
    palette: "rose",
    font: "serif",
    style: "default",
    ui: "md",
    text: "md",
    block: "md",
  },
};
