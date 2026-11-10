import { Component, type Effect, type Message } from "@pavlus/client";
import { storeEffector as store } from "@pavlus/client/plugins";
import view from "./select.pavlus";

/** A fruit, with its flag ready: a template reads paths, it does not compare them (see philosophy.md). */
export interface Item {
  label: string;
  selected: boolean;
  /** What `aria-selected` reads: "true" or "false". */
  selAttr: string;
}

export interface SelectState {
  open: boolean;
  /** What `aria-expanded` reads: "true" or "false". */
  expanded: string;
  value: string;
  /** What the button reads: the value, or the placeholder. */
  buttonLabel: string;
  /** What the hint reads: the value, or "nothing". */
  valueLabel: string;
  options: Item[];
}

const FRUITS = ["Apple", "Banana", "Blueberry", "Grapes", "Pineapple"];

/** Pure: the options with their flags for the chosen value. */
const itemsOf = (value: string): Item[] =>
  FRUITS.map((label) => ({
    label,
    selected: label === value,
    selAttr: label === value ? "true" : "false",
  }));

/** Pure: everything on screen that follows from open and the value. */
const apply = (open: boolean, value: string): SelectState => ({
  open,
  expanded: open ? "true" : "false",
  value,
  buttonLabel: value || "Select a fruit",
  valueLabel: value || "nothing",
  options: itemsOf(value),
});

/** Every field of a state as one `store.set` per field. */
const sets = (s: SelectState): Effect[] =>
  Object.entries(s).map(([k, v]) => store.set(k, v));

export const initial: SelectState = apply(false, "");

export class Select extends Component<SelectState> {
  view = view;

  toggle(_msg: Message, state: SelectState): Effect[] {
    return sets(apply(!state.open, state.value));
  }

  close(_msg: Message, state: SelectState): Effect[] {
    return sets(apply(false, state.value));
  }

  choose(msg: Message, _state: SelectState): Effect[] {
    return sets(apply(false, String(msg.payload)));
  }
}

export const page = new Select();
