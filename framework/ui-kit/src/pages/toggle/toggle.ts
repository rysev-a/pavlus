import { Component, type Effect, type Message } from "@pavlus/client";
import { storeEffector as store } from "@pavlus/client/plugins";
import view from "./toggle.pavlus";

export interface ToggleItem {
  id: string;
  label: string;
  on: boolean;
  /** What `aria-pressed` reads: "true" or "false". */
  pressedAttr: string;
}

export interface ToggleState {
  items: ToggleItem[];
  /** Derived: the labels that are on. */
  pressed: string;
  on: boolean;
  /** What `aria-pressed` reads: "true" or "false". */
  onAttr: string;
  /** What the text toggle reads: "on" or "off". */
  onLabel: string;
}

const pressedOf = (items: ToggleState["items"]): string =>
  items
    .filter((i) => i.on)
    .map((i) => i.label)
    .join(", ") || "none";

/** The items with their flags (a template reads paths, it does not branch on them). */
const itemsOf = (items: { id: string; label: string; on: boolean }[]) =>
  items.map((i) => ({ ...i, pressedAttr: i.on ? "true" : "false" }));

/** The text toggle: everything that follows from `on`. */
const textOf = (on: boolean) => ({
  on,
  onAttr: on ? "true" : "false",
  onLabel: on ? "on" : "off",
});

const items = itemsOf([
  { id: "bold", label: "Bold", on: false },
  { id: "italic", label: "Italic", on: true },
  { id: "underline", label: "Underline", on: false },
]);

export const initial: ToggleState = {
  items,
  pressed: pressedOf(items),
  ...textOf(false),
};

export class Toggle extends Component<ToggleState> {
  view = view;

  flip(msg: Message, state: ToggleState): Effect[] {
    const items = state.items.map((i) => {
      const on = i.id === msg.payload ? !i.on : i.on;
      return {
        id: i.id,
        label: i.label,
        on,
        pressedAttr: on ? "true" : "false",
      };
    });
    return [store.set("items", items), store.set("pressed", pressedOf(items))];
  }

  flipText(_msg: Message, state: ToggleState): Effect[] {
    return Object.entries(textOf(!state.on)).map(([k, v]) => store.set(k, v));
  }
}

export const page = new Toggle();
