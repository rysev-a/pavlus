import type { Meta } from "../../registry.ts";

export const meta: Meta = {
  title: "Gym Membership Admin",
  group: "Business Admin",
  description:
    "A gym back office: members with plans and expiry dates, a check-in desk with a capacity meter, a class schedule with bookings and waitlists, trainers, payments and plan prices.",
  order: 2,
  // a night-time training floor: dark, a lime accent like gym signage, a
  // geometric face and the default shape language
  look: {
    mode: "dark",
    palette: "lime",
    font: "geometric",
    style: "default",
    ui: "md",
    text: "md",
    block: "md",
  },
};
