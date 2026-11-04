import { Component } from "@service-laboratory/pavlus";
import view from "./post-comments.pavlus";

export const initial = {
  thread: {
    postId: 1,
    draft: "",
    canSend: false,
    me: "A",
    comments: [
      { id: 1, authorId: 3, name: "Ben Reyes", avatarStyle: "background: linear-gradient(135deg, hsl(20 70% 55%), hsl(340 70% 42%))", avatarText: "B", text: "Love it!", when: "10:20", canDelete: false },
      { id: 2, authorId: 2, name: "Ann Stone", avatarStyle: "background: linear-gradient(135deg, hsl(200 70% 55%), hsl(240 70% 42%))", avatarText: "A", text: "Thanks, it took a week.", when: "10:25", canDelete: true },
    ],
  },
};

export class PostCommentsPage extends Component<typeof initial> {
  view = view;
}
export const page = new PostCommentsPage();
