import { Component, type Effect, type Message } from "@pavlus/frontend";
import { storeEffector as store } from "@pavlus/frontend/plugins";
import {
  addAddress,
  type Contact,
  filterContacts,
  parseAddresses,
} from "../mail-list/mail.ts";
import { DEMO_CONTACTS } from "../mail-list/mail-demo.ts";
import { hueOf, initialsOf } from "../msg-basics/msg-basics.ts";
import view from "./contact-pop.pavlus";

export interface ContactRow {
  name: string;
  email: string;
  initials: string;
  hue: number;
  /** Already in the field the popover fills. */
  added: boolean;
}

/** Pure: the rows of the popover: contacts that match, marking those in the field. */
export function contactRows(
  contacts: Contact[],
  query: string,
  fieldText: string,
  me = "",
): ContactRow[] {
  const have = parseAddresses(fieldText).map((a) => a.toLowerCase());
  return filterContacts(contacts, query)
    .filter((c) => c.email !== me)
    .map((c) => ({
      name: c.name,
      email: c.email,
      initials: initialsOf(c.name),
      hue: hueOf(c.name),
      added: have.includes(c.email.toLowerCase()),
    }));
}

export interface ContactPopState {
  open: boolean;
  query: string;
  field: string;
  text: string;
  rows: ContactRow[];
}

export const initial: ContactPopState = {
  open: true,
  query: "",
  field: "To",
  text: "",
  rows: contactRows(DEMO_CONTACTS, "", ""),
};

export class ContactPopPage extends Component<ContactPopState> {
  view = view;

  "pop.setQuery"(msg: Message, s: ContactPopState): Effect[] {
    const query = msg.event?.value ?? "";
    return [
      store.set("query", query),
      store.set("rows", contactRows(DEMO_CONTACTS, query, s.text)),
    ];
  }

  "pop.pick"(msg: Message, s: ContactPopState): Effect[] {
    const text = addAddress(s.text, msg.payload as string);
    return [
      store.set("text", text),
      store.set("rows", contactRows(DEMO_CONTACTS, s.query, text)),
    ];
  }

  "pop.close"(): Effect[] {
    return [store.set("open", false)];
  }

  show(): Effect[] {
    return [store.set("open", true)];
  }
}

export const page = new ContactPopPage();
