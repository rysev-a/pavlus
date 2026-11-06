import { Component } from "@pavlus/frontend";
import view from "./social-header.pavlus";

export const initial = {
  wall: {
    coverStyle:
      "background: linear-gradient(135deg, hsl(200 70% 55%), hsl(240 70% 42%))",
    avatarStyle:
      "background: linear-gradient(135deg, hsl(200 70% 55%), hsl(240 70% 42%))",
    avatarText: "A",
    title: "Ann Stone",
    subtitle: "Lisbon",
    about: "I paint walls and write about it.",
    badges: [] as { label: string; tone: string }[],
    stats: [
      { label: "friends", value: "42" },
      { label: "posts", value: "18" },
    ],
    actions: [
      { id: "message", label: "Message", variant: "outline", disabled: false },
      {
        id: "friend",
        label: "Add friend",
        variant: "default",
        disabled: false,
      },
    ],
  },
  community: {
    coverStyle:
      "background: linear-gradient(135deg, hsl(120 70% 55%), hsl(160 70% 42%))",
    avatarStyle:
      "background: linear-gradient(135deg, hsl(120 70% 55%), hsl(160 70% 42%))",
    avatarText: "🌲",
    title: "Hikers of the North",
    subtitle: "128 members",
    about: "Trails, maps and weekend plans.",
    badges: [{ label: "Moderator", tone: "secondary" }],
    stats: [] as { label: string; value: string }[],
    actions: [
      { id: "leave", label: "Leave", variant: "outline", disabled: false },
    ],
  },
};

export class SocialHeaderPage extends Component<typeof initial> {
  view = view;
}
export const page = new SocialHeaderPage();
