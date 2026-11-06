import { Component, type Effect, type Message } from "@pavlus/frontend";
import { storeEffector as store } from "@pavlus/frontend/plugins";
import { toggleIn, type View } from "../mail-list/mail.ts";
import {
  DEMO_CONTACTS,
  DEMO_MAILS,
  ME,
  nameOfIn,
} from "../mail-list/mail-demo.ts";
import view from "./mail-reader.pavlus";
import { defaultExpanded, type ReaderThread, threadView } from "./thread.ts";

export interface ReaderAction {
  id: string;
  name: string;
  icon: string;
}

/** Pure: the buttons of the reading pane's toolbar for a view. */
export function readerActions(view: View, starred: boolean): ReaderAction[] {
  if (view === "trash") {
    return [
      { id: "restore", name: "Restore", icon: "k-mi-refresh" },
      { id: "delete", name: "Delete forever", icon: "k-mi-trash" },
    ];
  }
  if (view === "spam") {
    return [
      { id: "restore", name: "Not spam", icon: "k-mi-inbox" },
      { id: "trash", name: "Delete", icon: "k-mi-trash" },
    ];
  }
  return [
    { id: "archive", name: "Archive", icon: "k-mi-archive" },
    { id: "trash", name: "Delete", icon: "k-mi-trash" },
    { id: "spam", name: "Report spam", icon: "k-mi-spam" },
    { id: "unread", name: "Mark unread", icon: "k-mi-mail-open" },
    {
      id: "star",
      name: starred ? "Remove the star" : "Star",
      icon: starred ? "k-mi-star-fill" : "k-mi-star",
    },
  ];
}

export interface ReaderState {
  expanded: string[];
  thread: ReaderThread | null;
  actions: ReaderAction[];
  none: null;
  last: string;
}

const nameOf = nameOfIn(DEMO_CONTACTS);
const thread = threadView(
  DEMO_MAILS,
  "dt1",
  ME,
  defaultExpanded(DEMO_MAILS, "dt1"),
  nameOf,
);

export const initial: ReaderState = {
  expanded: defaultExpanded(DEMO_MAILS, "dt1"),
  thread,
  actions: readerActions("inbox", thread?.starred ?? false),
  none: null,
  last: "",
};

export class MailReaderPage extends Component<ReaderState> {
  view = view;

  "read.toggle"(msg: Message, s: ReaderState): Effect[] {
    const expanded = toggleIn(s.expanded, msg.payload as string);
    return [
      store.set("expanded", expanded),
      store.set("thread", threadView(DEMO_MAILS, "dt1", ME, expanded, nameOf)),
    ];
  }

  "read.act"(msg: Message): Effect[] {
    return [store.set("last", `Toolbar: ${msg.payload}`)];
  }

  "read.reply"(msg: Message): Effect[] {
    return [store.set("last", `Reply to ${msg.payload}`)];
  }

  "read.replyAll"(msg: Message): Effect[] {
    return [store.set("last", `Reply all to ${msg.payload}`)];
  }

  "read.forward"(msg: Message): Effect[] {
    return [store.set("last", `Forward ${msg.payload}`)];
  }
}

export const page = new MailReaderPage();
