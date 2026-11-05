import { Component } from "@service-laboratory/pavlus";
import view from "./blog-card.pavlus";

export const initial = {
  article: {
    id: 1,
    title: "Ten walls worth a detour",
    excerpt:
      "A short walk through the murals of the old harbour, with notes on who painted what and when to go for the light.",
    coverStyle:
      "background: linear-gradient(135deg, hsl(20 70% 55%), hsl(340 70% 42%))",
    coverGlyph: "🎨",
    authorId: 2,
    authorName: "Ann Stone",
    avatarStyle:
      "background: linear-gradient(135deg, hsl(200 70% 55%), hsl(240 70% 42%))",
    avatarText: "A",
    when: "Nov 2, 18:40",
    tags: ["art", "travel"],
    likes: 12,
    liked: true,
  },
};

export class BlogCardPage extends Component<typeof initial> {
  view = view;
}
export const page = new BlogCardPage();
