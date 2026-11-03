import type { Meta } from "../../registry.ts";

export const meta: Meta = {
  title: "Clinic Admin",
  group: "Business Admin",
  description:
    "A clinic front desk: a day schedule per doctor, a waiting-room queue, patients with a record (vitals, notes, prescriptions), billing and lab results.",
  order: 3,
  // light, cool ocean blue with a rounded face and the default style: calm,
  // clean and soft, like a waiting room
  look: {
    mode: "light",
    palette: "ocean",
    font: "rounded",
    style: "default",
    ui: "md",
    text: "md",
    block: "md",
  },
};
