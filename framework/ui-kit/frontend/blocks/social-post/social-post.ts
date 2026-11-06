import { Component } from "@pavlus/frontend";
import view from "./social-post.pavlus";

const base = {
  authorId: 2,
  authorName: "Ann Stone",
  avatarStyle:
    "background: linear-gradient(135deg, hsl(200 70% 55%), hsl(240 70% 42%))",
  avatarText: "A",
  when: "10:15",
  where: "",
  kind: "text",
  text: "",
  hasText: false,
  song: null,
  hasImage: false,
  imageStyle: "",
  imageGlyph: "",
  url: "",
  linkTitle: "",
  likes: 3,
  liked: false,
  commentCount: 2,
  canDelete: false,
  open: false,
  sharing: false,
  shareText: "",
  hasOriginal: false,
  originalGone: false,
  original: null,
};

const original = {
  id: 1,
  authorId: 3,
  authorName: "Ben Reyes",
  avatarStyle:
    "background: linear-gradient(135deg, hsl(20 70% 55%), hsl(340 70% 42%))",
  avatarText: "B",
  when: "Nov 2, 18:40",
  where: "",
  kind: "picture",
  text: "Sunrise over the bay",
  hasText: true,
  song: null,
  hasImage: true,
  imageStyle:
    "background: linear-gradient(135deg, hsl(20 70% 55%), hsl(340 70% 42%))",
  imageGlyph: "🌅",
  url: "",
  linkTitle: "",
};

export const initial = {
  posts: [
    {
      ...base,
      id: 1,
      kind: "text",
      text: "Finally finished the mural on Dock Street.",
      hasText: true,
      liked: true,
      canDelete: true,
    },
    {
      ...base,
      id: 2,
      kind: "music",
      song: {
        id: 5,
        title: "Blue Hours",
        artist: "The Night Owls",
        album: "Low Light",
        duration: "3:42",
      },
    },
    {
      ...base,
      id: 3,
      kind: "link",
      url: "https://example.com/post",
      linkTitle: "A good read about walls",
      where: "on Ben's wall",
    },
    {
      ...base,
      id: 4,
      kind: "repost",
      text: "Worth another look.",
      hasText: true,
      hasOriginal: true,
      original,
      sharing: true,
    },
  ],
};

export class SocialPostPage extends Component<typeof initial> {
  view = view;
}
export const page = new SocialPostPage();
