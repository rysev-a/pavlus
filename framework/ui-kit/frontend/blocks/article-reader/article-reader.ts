import { Component } from "@pavlus/frontend";
import view from "./article-reader.pavlus";

export const initial = {
  article: {
    id: 1,
    title: "Ten walls worth a detour",
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
    paragraphs: [
      "The old harbour has more paint than stone. I spent a weekend walking it with a thermos and a bad map.",
      "Start at the fish market: the first mural is on the east wall and it is best at sunrise.",
    ],
    likes: 12,
    liked: false,
    canEdit: true,
    canDelete: true,
  },
};

export class ArticleReaderPage extends Component<typeof initial> {
  view = view;
}
export const page = new ArticleReaderPage();
