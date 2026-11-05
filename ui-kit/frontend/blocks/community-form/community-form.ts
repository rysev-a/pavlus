import { Component } from "@service-laboratory/pavlus";
import view from "./community-form.pavlus";

const cover = (
  i: number,
  a: number,
  b: number,
  glyph: string,
  selected = false,
) => ({
  i,
  style: `background: linear-gradient(135deg, hsl(${a} 70% 55%), hsl(${b} 70% 42%))`,
  glyph,
  selected,
});

export const initial = {
  form: {
    heading: "Create a community",
    saveLabel: "Create",
    name: "",
    description: "",
    canCancel: true,
    errors: { name: "The name needs at least 3 letters", description: "" },
    covers: [
      cover(0, 20, 340, "🌅", true),
      cover(1, 200, 240, "🌊"),
      cover(2, 120, 160, "🌲"),
      cover(3, 320, 280, "🌸"),
    ],
  },
};

export class CommunityFormPage extends Component<typeof initial> {
  view = view;
}
export const page = new CommunityFormPage();
