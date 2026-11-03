import {
  Component,
  type Effect,
  type Message,
} from "@service-laboratory/pavlus";
import { storeEffector as store } from "@service-laboratory/pavlus/plugins";
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
}

export const initial: CommandState = {
  query: "",
  groups: ALL,
  empty: false,
  last: "",
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
    return [store.set("last", msg.payload)];
  }
}

export const page = new Command();
