import { Component, type Effect, type Message } from "@pavlus/client";
import { storeEffector as store } from "@pavlus/client/plugins";
import view from "./command.pavlus";

interface Item {
  id: string;
  label: string;
  icon: string;
  shortcut: string;
}
interface Group {
  heading: string;
  items: Item[];
}

const ALL: Group[] = [
  {
    heading: "Suggestions",
    items: [
      { id: "calendar", label: "Calendar", icon: "calendar", shortcut: "" },
      { id: "search", label: "Search", icon: "search", shortcut: "" },
    ],
  },
  {
    heading: "Settings",
    items: [
      { id: "profile", label: "Profile", icon: "user", shortcut: "⌘P" },
      { id: "mail", label: "Mail", icon: "mail", shortcut: "⌘B" },
      { id: "settings", label: "Settings", icon: "settings", shortcut: "⌘S" },
    ],
  },
];

/** Pure: the groups with the items that match, without the groups left empty. */
export function filter(query: string): Group[] {
  const q = query.trim().toLowerCase();
  return ALL.map((g) => ({
    ...g,
    items: g.items.filter((i) => i.label.toLowerCase().includes(q)),
  })).filter((g) => g.items.length > 0);
}

export interface CommandState {
  query: string;
  groups: Group[];
  empty: boolean;
  last: string;
  /** Derived from `last`. */
  lastLabel: string;
}

/** The hint's label — one place decides the none-yet case. */
const labelOf = (last: string): string => last || "none";

export const initial: CommandState = {
  query: "",
  groups: ALL,
  empty: false,
  last: "",
  lastLabel: labelOf(""),
};

export class Command extends Component<CommandState> {
  view = view;

  search(msg: Message): Effect[] {
    const query = msg.event?.value ?? "";
    const groups = filter(query);
    return [
      store.set("query", query),
      store.set("groups", groups),
      store.set("empty", groups.length === 0),
    ];
  }

  run(msg: Message): Effect[] {
    const last = msg.payload as string;
    return [store.set("last", last), store.set("lastLabel", labelOf(last))];
  }
}

export const page = new Command();
