import {
  Component,
  type Effect,
  type Message,
} from "@service-laboratory/pavlus";
import { storeEffector as store } from "@service-laboratory/pavlus/plugins";
import view from "./toggle.pavlus";

export interface ToggleState {
  items: { id: string; label: string; on: boolean }[];
  /** Derived: the labels that are on. */
  pressed: string;
  on: boolean;
}

const pressedOf = (items: ToggleState["items"]): string =>
  items
    .filter((i) => i.on)
    .map((i) => i.label)
    .join(", ") || "none";

const items = [
  { id: "bold", label: "Bold", on: false },
  { id: "italic", label: "Italic", on: true },
  { id: "underline", label: "Underline", on: false },
];

export const initial: ToggleState = {
  items,
  pressed: pressedOf(items),
  on: false,
};

export class Toggle extends Component<ToggleState> {
  view = view;

  flip(msg: Message, state: ToggleState): Effect[] {
    const next = state.items.map((i) =>
      i.id === msg.payload ? { ...i, on: !i.on } : i,
    );
    return [store.set("items", next), store.set("pressed", pressedOf(next))];
  }

  flipText(_msg: Message, state: ToggleState): Effect[] {
    return [store.set("on", !state.on)];
  }
}

export const page = new Toggle();
