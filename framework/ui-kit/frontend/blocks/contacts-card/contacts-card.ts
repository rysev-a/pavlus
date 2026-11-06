import { Component } from "@pavlus/frontend";
import view from "./contacts-card.pavlus";

const av = (h: number) =>
  `background: linear-gradient(135deg, hsl(${h} 70% 55%), hsl(${h + 40} 70% 42%))`;

export const initial = {
  contacts: {
    title: "Contacts",
    empty: "No contacts yet.",
    contacts: [
      {
        id: 1,
        name: "Ann Stone",
        avatarStyle: av(200),
        avatarText: "A",
        role: "Administrator",
        canMessage: false,
      },
      {
        id: 2,
        name: "Ben Reyes",
        avatarStyle: av(20),
        avatarText: "B",
        role: "Moderator",
        canMessage: true,
      },
    ],
  },
};

export class ContactsCardPage extends Component<typeof initial> {
  view = view;
}
export const page = new ContactsCardPage();
