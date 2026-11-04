import { Component } from "@service-laboratory/pavlus";
import view from "./community-card.pavlus";

export const initial = {
  community: {
    id: 1,
    name: "Hikers of the North",
    description: "Trails, maps and weekend plans for people who like their coffee on a ridge.",
    wallpaperStyle: "background: linear-gradient(135deg, hsl(120 70% 55%), hsl(160 70% 42%))",
    wallpaperGlyph: "🌲",
    members: "128 members",
    role: "Moderator",
    roleTone: "secondary",
  },
};

export class CommunityCardPage extends Component<typeof initial> {
  view = view;
}
export const page = new CommunityCardPage();
