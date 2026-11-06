import { Component, type Effect, type Message } from "@pavlus/frontend";
import { patch } from "../admin-shell/shell.ts";
import view from "./contact-card.pavlus";
import { type Contact, type ContactView, contactViews } from "./contacts.ts";

const TODAY = "2026-11-03";

const LIST: Contact[] = [
  {
    id: "c1",
    name: "Helena Voss",
    role: "Head of Operations",
    company: "Northwind Logistics",
    email: "helena.voss@northwind.example",
    phone: "+1 415 555 0142",
    status: "prospect",
    tags: ["Decision maker", "Logistics"],
    last: "2026-11-02",
  },
  {
    id: "c2",
    name: "Marcus Oyelaran",
    role: "CTO",
    company: "Brightwave Media",
    email: "marcus@brightwave.example",
    phone: "+1 212 555 0198",
    status: "customer",
    tags: ["Champion"],
    last: "2026-10-21",
  },
  {
    id: "c3",
    name: "Sofia Lindgren",
    role: "Buyer",
    company: "Fernhill Grocers",
    email: "sofia@fernhill.example",
    phone: "+1 617 555 0107",
    status: "lead",
    tags: ["Retail", "Webinar"],
    last: "2026-09-12",
  },
];

export interface ContactCardState {
  contacts: ContactView[];
  first: ContactView[];
  none: ContactView[];
  message: string;
}

export const initial: ContactCardState = {
  contacts: contactViews(LIST, "", TODAY),
  first: contactViews(LIST.slice(0, 1), "", TODAY),
  none: [],
  message: "Click a card to select it.",
};

export class ContactCardPage extends Component<ContactCardState> {
  view = view;

  "grid.pick"(msg: Message): Effect[] {
    return patch({
      contacts: contactViews(LIST, msg.payload as string, TODAY),
      message: `Selected ${msg.payload as string}.`,
    });
  }
}

export const page = new ContactCardPage();
