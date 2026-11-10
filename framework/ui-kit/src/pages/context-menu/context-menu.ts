import { Component, type Effect, type Message } from "@pavlus/client";
import { storeEffector as store } from "@pavlus/client/plugins";
import view from "./context-menu.pavlus";

export interface ContextMenuState {
  shown: boolean;
  chosen: string;
  /** Derived from `chosen`. */
  chosenLabel: string;
}

/** The hint's label — one place decides the nothing-yet case. */
const labelOf = (chosen: string): string => chosen || "nothing";

export const initial: ContextMenuState = {
  shown: false,
  chosen: "",
  chosenLabel: labelOf(""),
};

export class ContextMenu extends Component<ContextMenuState> {
  view = view;

  open(): Effect[] {
    return [store.set("shown", true)];
  }

  close(): Effect[] {
    return [store.set("shown", false)];
  }

  choose(msg: Message): Effect[] {
    const chosen = msg.payload as string;
    return [
      store.set("chosen", chosen),
      store.set("chosenLabel", labelOf(chosen)),
      store.set("shown", false),
    ];
  }
}

export const page = new ContextMenu();
