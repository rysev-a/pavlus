import {
  Component,
  type Effect,
  type Message,
} from "@service-laboratory/pavlus";
import { storeEffector as store } from "@service-laboratory/pavlus/plugins";
import view from "./pick-list.pavlus";

export interface Choice {
  id: string;
  label: string;
  emoji: string;
  count: number | string;
}

export interface ChoiceRow extends Choice {
  active: boolean;
}

/** Pure: the rows, with the picked one active. */
export const choiceRows = (list: Choice[], active: string): ChoiceRow[] =>
  list.map((c) => ({ ...c, active: c.id === active }));

/** Pure: the props of the view. */
export const picksProps = (
  list: Choice[],
  active: string,
  title = "",
  chips = false,
) => ({ title, chips, items: choiceRows(list, active) });

const CHOICES: Choice[] = [
  { id: "all", label: "Everything", emoji: "✨", count: 42 },
  { id: "news", label: "Announcements", emoji: "📣", count: 6 },
  { id: "help", label: "Help", emoji: "🛟", count: 19 },
  { id: "show", label: "Show and tell", emoji: "🎨", count: 17 },
];

export interface PickState {
  active: string;
  cats: ReturnType<typeof picksProps>;
  chips: ReturnType<typeof picksProps>;
  picked: string;
}

const sync = (active: string) => ({
  active,
  cats: picksProps(CHOICES, active, "Categories"),
  chips: picksProps(CHOICES, active, "", true),
  picked: CHOICES.find((c) => c.id === active)?.label ?? "",
});

export const initial: PickState = sync("all");

export class PickListPage extends Component<PickState> {
  view = view;

  _pick(msg: Message): Effect[] {
    const next = sync(msg.payload as string);
    return (Object.keys(next) as (keyof PickState)[]).map((k) =>
      store.set(k, next[k]),
    );
  }

  "cats.pick"(msg: Message): Effect[] {
    return this._pick(msg);
  }

  "chips.pick"(msg: Message): Effect[] {
    return this._pick(msg);
  }
}

export const page = new PickListPage();
