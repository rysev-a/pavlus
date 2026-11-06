import { Component, type Effect, type Message } from "@pavlus/frontend";
import { storeEffector as store } from "@pavlus/frontend/plugins";
import { snippetOf } from "../mail-reader/thread.ts";
import { hueOf, initialsOf } from "../msg-basics/msg-basics.ts";
import {
  applyAction,
  dateLabel,
  type Mail,
  type Thread,
  TODAY,
  threadsOf,
  toggleIn,
  toggleStar,
} from "./mail.ts";
import { DEMO_CONTACTS, DEMO_MAILS, ME, nameOfIn } from "./mail-demo.ts";
import view from "./mail-list.pavlus";

export interface MailRow {
  id: string;
  from: string;
  initials: string;
  hue: number;
  subject: string;
  snippet: string;
  date: string;
  count: number;
  unread: boolean;
  starred: boolean;
  starIcon: string;
  selected: boolean;
  open: boolean;
  attachment: boolean;
  draft: boolean;
  labels: { name: string; hue: number }[];
}

/** Pure: who the row names: the sender, or `To: ...` in Sent and Drafts. */
export function senderLabel(
  m: Mail,
  me: string,
  nameOf: (email: string) => string,
): string {
  if (m.folder === "drafts") {
    return m.to.length > 0 ? `Draft to ${nameOf(m.to[0])}` : "Draft";
  }
  if (m.folder === "sent" || m.email === me) {
    return m.to.length > 0 ? `To: ${nameOf(m.to[0])}` : "To: nobody";
  }
  return m.from;
}

/** Pure: the rows of the list for some threads. */
export function rowsOf(
  threads: Thread[],
  selected: string[],
  openId: string,
  me: string,
  nameOf: (email: string) => string,
  today = TODAY,
): MailRow[] {
  return threads.map((t) => {
    const from = senderLabel(t.latest, me, nameOf);
    return {
      id: t.id,
      from,
      initials: initialsOf(t.latest.from),
      hue: hueOf(t.latest.from),
      subject: t.latest.subject,
      snippet: snippetOf(t.latest.body, 110),
      date: dateLabel(t.latest.day, t.latest.time, today),
      count: t.count,
      unread: t.unread > 0,
      starred: t.starred,
      starIcon: t.starred ? "k-mi-star-fill" : "k-mi-star",
      selected: selected.includes(t.id),
      open: openId === t.id,
      attachment: t.attachments,
      draft: t.latest.folder === "drafts",
      labels: t.labels.map((name) => ({ name, hue: hueOf(name) })),
    };
  });
}

export interface MailListState {
  mails: Mail[];
  selected: string[];
  openId: string;
  rows: MailRow[];
  none: MailRow[];
  emptyTitle: string;
}

const nameOf = nameOfIn(DEMO_CONTACTS);

const rowsFor = (
  mails: Mail[],
  selected: string[],
  openId: string,
): MailRow[] => rowsOf(threadsOf(mails, "inbox"), selected, openId, ME, nameOf);

export const initial: MailListState = {
  mails: DEMO_MAILS,
  selected: [],
  openId: "",
  rows: rowsFor(DEMO_MAILS, [], ""),
  none: [],
  emptyTitle: "Inbox zero",
};

export class MailListPage extends Component<MailListState> {
  view = view;

  "list.open"(msg: Message, s: MailListState): Effect[] {
    return this._set(s, s.mails, s.selected, msg.payload as string);
  }

  "list.check"(msg: Message, s: MailListState): Effect[] {
    return this._set(
      s,
      s.mails,
      toggleIn(s.selected, msg.payload as string),
      s.openId,
    );
  }

  "list.star"(msg: Message, s: MailListState): Effect[] {
    return this._set(
      s,
      toggleStar(s.mails, msg.payload as string),
      s.selected,
      s.openId,
    );
  }

  archiveSelected(_msg: Message, s: MailListState): Effect[] {
    return this._set(s, applyAction(s.mails, s.selected, "archive"), [], "");
  }

  reset(_msg: Message, s: MailListState): Effect[] {
    return this._set(s, DEMO_MAILS, [], "");
  }

  _set(
    _s: MailListState,
    mails: Mail[],
    selected: string[],
    openId: string,
  ): Effect[] {
    // opening a conversation reads it
    const read =
      openId && mails.some((m) => m.thread === openId && !m.read)
        ? applyAction(mails, [openId], "read")
        : mails;
    return [
      store.set("mails", read),
      store.set("selected", selected),
      store.set("openId", openId),
      store.set("rows", rowsFor(read, selected, openId)),
    ];
  }
}

export const page = new MailListPage();
