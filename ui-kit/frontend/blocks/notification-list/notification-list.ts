import {
  Component,
  type Effect,
  type Message,
} from "@service-laboratory/pavlus";
import { storeEffector as store } from "@service-laboratory/pavlus/plugins";
import { initialsOf } from "../feed-post/feed-post.ts";
import view from "./notification-list.pavlus";

export interface Note {
  id: string;
  name: string;
  tone: number;
  glyph: string;
  text: string;
  ago: string;
  unread: boolean;
}

export interface NoteRow extends Note {
  initials: string;
}

export interface NotesProps {
  title: string;
  unread: number;
  items: NoteRow[];
}

/** Pure: how many are unread. */
export const unreadCount = (list: Note[]): number =>
  list.filter((n) => n.unread).length;

/** Pure: one notification read. */
export const readNote = (list: Note[], id: string): Note[] =>
  list.map((n) => (n.id === id ? { ...n, unread: false } : n));

/** Pure: all of them read. */
export const readAllNotes = (list: Note[]): Note[] =>
  list.map((n) => ({ ...n, unread: false }));

/** Pure: the props of the view. */
export function notesProps(list: Note[], title = "Notifications"): NotesProps {
  return {
    title,
    unread: unreadCount(list),
    items: list.map((n) => ({ ...n, initials: initialsOf(n.name) })),
  };
}

const START: Note[] = [
  {
    id: "n1",
    name: "Ines Moreau",
    tone: 1,
    glyph: "heart",
    text: "liked your photo.",
    ago: "5m",
    unread: true,
  },
  {
    id: "n2",
    name: "Kofi Mensah",
    tone: 3,
    glyph: "user",
    text: "started following you.",
    ago: "1h",
    unread: true,
  },
  {
    id: "n3",
    name: "Hana Sato",
    tone: 4,
    glyph: "message",
    text: 'replied: "Love the colors here."',
    ago: "3h",
    unread: false,
  },
];

export interface NotesState {
  list: Note[];
  notes: NotesProps;
}

export const initial: NotesState = {
  list: START,
  notes: notesProps(START),
};

export class NotificationListPage extends Component<NotesState> {
  view = view;

  _show(list: Note[]): Effect[] {
    return [store.set("list", list), store.set("notes", notesProps(list))];
  }

  "notes.open"(msg: Message, state: NotesState): Effect[] {
    return this._show(readNote(state.list, msg.payload as string));
  }

  "notes.readAll"(_msg: Message, state: NotesState): Effect[] {
    return this._show(readAllNotes(state.list));
  }
}

export const page = new NotificationListPage();
