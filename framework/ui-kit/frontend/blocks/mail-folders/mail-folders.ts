import { Component, type Effect, type Message } from "@pavlus/frontend";
import { storeEffector as store } from "@pavlus/frontend/plugins";
import {
  type Count,
  folderCounts,
  labelCounts,
  type Mail,
  type View,
} from "../mail-list/mail.ts";
import { DEMO_MAILS } from "../mail-list/mail-demo.ts";
import { hueOf } from "../msg-basics/msg-basics.ts";
import view from "./mail-folders.pavlus";

export interface FolderItem {
  id: View;
  name: string;
  icon: string;
  /** Shown next to the name; 0 hides it. */
  count: number;
  active: boolean;
}

export interface LabelItem {
  id: string;
  name: string;
  hue: number;
  count: number;
  active: boolean;
}

export interface Shortcut {
  id: string;
  key: string;
  name: string;
}

export const FOLDERS: {
  id: View;
  name: string;
  icon: string;
  /** What the number beside the name counts. */
  counts: "unread" | "total" | "none";
}[] = [
  { id: "inbox", name: "Inbox", icon: "k-mi-inbox", counts: "unread" },
  { id: "starred", name: "Starred", icon: "k-mi-star", counts: "unread" },
  { id: "sent", name: "Sent", icon: "k-mi-send", counts: "none" },
  { id: "drafts", name: "Drafts", icon: "k-mi-file", counts: "total" },
  { id: "archive", name: "Archive", icon: "k-mi-archive", counts: "none" },
  { id: "spam", name: "Spam", icon: "k-mi-spam", counts: "unread" },
  { id: "trash", name: "Trash", icon: "k-mi-trash", counts: "none" },
];

export const SHORTCUTS: Shortcut[] = [
  { id: "compose", key: "C", name: "Compose" },
  { id: "search", key: "/", name: "Search" },
  { id: "reply", key: "R", name: "Reply" },
  { id: "replyAll", key: "A", name: "Reply all" },
  { id: "forward", key: "F", name: "Forward" },
  { id: "archive", key: "E", name: "Archive" },
  { id: "trash", key: "#", name: "Delete" },
  { id: "next", key: "J", name: "Next" },
  { id: "prev", key: "K", name: "Previous" },
];

/** Pure: the folders of the sidebar with their counts and the active one. */
export function folderItems(
  counts: Record<string, Count>,
  current: View,
): FolderItem[] {
  return FOLDERS.map((f) => {
    const c = counts[f.id] ?? { unread: 0, total: 0 };
    return {
      id: f.id,
      name: f.name,
      icon: f.icon,
      count:
        f.counts === "unread" ? c.unread : f.counts === "total" ? c.total : 0,
      active: current === f.id,
    };
  });
}

/** Pure: the labels of the sidebar with their unread counts. */
export function labelItems(
  labels: string[],
  counts: Record<string, number>,
  current: View,
): LabelItem[] {
  return labels.map((name) => ({
    id: `label:${name}`,
    name,
    hue: hueOf(name),
    count: counts[name] ?? 0,
    active: current === `label:${name}`,
  }));
}

export const DEMO_LABELS = ["Work", "Design", "Finance"];

export interface FoldersState {
  mails: Mail[];
  current: View;
  folders: FolderItem[];
  labels: LabelItem[];
  shortcuts: Shortcut[];
  last: string;
}

const derive = (mails: Mail[], current: View) => ({
  folders: folderItems(folderCounts(mails), current),
  labels: labelItems(DEMO_LABELS, labelCounts(mails, DEMO_LABELS), current),
});

export const initial: FoldersState = {
  mails: DEMO_MAILS,
  current: "inbox",
  ...derive(DEMO_MAILS, "inbox"),
  shortcuts: SHORTCUTS,
  last: "",
};

export class MailFoldersPage extends Component<FoldersState> {
  view = view;

  "nav.go"(msg: Message, s: FoldersState): Effect[] {
    const current = msg.payload as View;
    const d = derive(s.mails, current);
    return [
      store.set("current", current),
      store.set("folders", d.folders),
      store.set("labels", d.labels),
    ];
  }

  "nav.compose"(): Effect[] {
    return [store.set("last", "Compose a new message")];
  }

  "nav.shortcut"(msg: Message): Effect[] {
    const s = SHORTCUTS.find((x) => x.id === msg.payload);
    return [store.set("last", s ? `${s.name} (${s.key})` : "")];
  }
}

export const page = new MailFoldersPage();
