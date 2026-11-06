import { Component } from "@pavlus/frontend";
import view from "./member-list.pavlus";

const av = (h: number) =>
  `background: linear-gradient(135deg, hsl(${h} 70% 55%), hsl(${h + 40} 70% 42%))`;

export const initial = {
  list: {
    empty: "Nobody here yet.",
    members: [
      {
        id: 1,
        name: "Ann Stone",
        avatarStyle: av(200),
        avatarText: "A",
        role: "Administrator",
        roleTone: "default",
        city: "Lisbon",
        canMessage: false,
        canPromote: false,
        canDemote: false,
        canRemove: false,
      },
      {
        id: 2,
        name: "Ben Reyes",
        avatarStyle: av(20),
        avatarText: "B",
        role: "Moderator",
        roleTone: "secondary",
        city: "Porto",
        canMessage: true,
        canPromote: false,
        canDemote: true,
        canRemove: true,
      },
      {
        id: 3,
        name: "Cleo Park",
        avatarStyle: av(120),
        avatarText: "C",
        role: "Member",
        roleTone: "outline",
        city: "Faro",
        canMessage: true,
        canPromote: true,
        canDemote: false,
        canRemove: true,
      },
    ],
  },
};

export class MemberListPage extends Component<typeof initial> {
  view = view;
}
export const page = new MemberListPage();
