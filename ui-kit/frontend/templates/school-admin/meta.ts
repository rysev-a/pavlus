import type { Meta } from "../../registry.ts";

export const meta: Meta = {
  title: "School Admin",
  group: "Business Admin",
  description:
    "A school office: students, classes with a weekly timetable, a daily attendance register, a gradebook with averages and a distribution, teachers and announcements.",
  order: 2,
  // light, forest green and a slab serif with the casual (rounded) style: the
  // friendly look of a school noticeboard
  look: {
    mode: "light",
    palette: "forest",
    font: "slab",
    style: "casual",
    ui: "md",
    text: "md",
    block: "md",
  },
};
