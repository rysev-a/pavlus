import {
  Component,
  type Effect,
  type Message,
} from "@service-laboratory/pavlus";
import { storeEffector as store } from "@service-laboratory/pavlus/plugins";
import { initialsOf } from "../feed-post/feed-post.ts";
import view from "./people-list.pavlus";

export interface Person {
  id: string;
  name: string;
  tone: number;
  sub: string;
}

export interface PersonRow extends Person {
  initials: string;
  done: boolean;
  primaryLabel: string;
  secondaryLabel: string;
}

/**
 * Pure: the rows. `done` ids show `doneLabel` (a filled button), the others
 * `label`; `secondary` is the text of a second button, or "".
 */
export function personRows(
  people: Person[],
  done: string[],
  label: string,
  doneLabel: string,
  secondary = "",
): PersonRow[] {
  return people.map((p) => {
    const isDone = done.includes(p.id);
    return {
      ...p,
      initials: initialsOf(p.name),
      done: isDone,
      primaryLabel: isDone ? doneLabel : label,
      secondaryLabel: isDone ? "" : secondary,
    };
  });
}

const FOLLOW: Person[] = [
  { id: "p1", name: "Ines Moreau", tone: 1, sub: "Illustrator, Lyon" },
  { id: "p2", name: "Kofi Mensah", tone: 3, sub: "Follows Maya Ortiz" },
  { id: "p3", name: "Hana Sato", tone: 4, sub: "Street photographer" },
];

const INVITES: Person[] = [
  { id: "i1", name: "Rafael Duarte", tone: 2, sub: "Product designer at Lumo" },
  { id: "i2", name: "Aisha Khan", tone: 5, sub: "Data engineer, 4 mutual" },
];

export interface PeopleState {
  followed: string[];
  pending: string[];
  follow: { title: string; empty: string; people: PersonRow[] };
  invites: { title: string; empty: string; people: PersonRow[] };
  summary: string;
}

const sync = (followed: string[], pending: string[]) => ({
  follow: {
    title: "People to follow",
    empty: "",
    people: personRows(FOLLOW, followed, "Follow", "Following"),
  },
  invites: {
    title: "",
    empty: "No invitations left.",
    people: personRows(
      INVITES.filter((p) => !pending.includes(p.id)),
      [],
      "Accept",
      "Accepted",
      "Ignore",
    ),
  },
  summary: `${followed.length} followed, ${pending.length} of ${INVITES.length} invitations answered.`,
});

export const initial: PeopleState = {
  followed: ["p2"],
  pending: [],
  ...sync(["p2"], []),
};

export class PeopleListPage extends Component<PeopleState> {
  view = view;

  _show(state: PeopleState, followed: string[], pending: string[]): Effect[] {
    const next = sync(followed, pending);
    return [
      store.set("followed", followed),
      store.set("pending", pending),
      store.set("follow", next.follow),
      store.set("invites", next.invites),
      store.set("summary", next.summary),
    ];
  }

  "follow.primary"(msg: Message, state: PeopleState): Effect[] {
    const id = msg.payload as string;
    const followed = state.followed.includes(id)
      ? state.followed.filter((x) => x !== id)
      : [...state.followed, id];
    return this._show(state, followed, state.pending);
  }

  "invites.primary"(msg: Message, state: PeopleState): Effect[] {
    return this._show(state, state.followed, [
      ...state.pending,
      msg.payload as string,
    ]);
  }

  "invites.secondary"(msg: Message, state: PeopleState): Effect[] {
    return this._show(state, state.followed, [
      ...state.pending,
      msg.payload as string,
    ]);
  }
}

export const page = new PeopleListPage();
