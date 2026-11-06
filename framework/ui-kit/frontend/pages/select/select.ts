import { Component, type Effect, type Message } from "@pavlus/frontend";
import { storeEffector as store } from "@pavlus/frontend/plugins";
import view from "./select.pavlus";

export interface SelectState {
  open: boolean;
  value: string;
  options: string[];
}

export const initial: SelectState = {
  open: false,
  value: "",
  options: ["Apple", "Banana", "Blueberry", "Grapes", "Pineapple"],
};

export class Select extends Component<SelectState> {
  view = view;

  toggle(_msg: Message, state: SelectState): Effect[] {
    return [store.set("open", !state.open)];
  }

  close(): Effect[] {
    return [store.set("open", false)];
  }

  choose(msg: Message): Effect[] {
    return [store.set("value", msg.payload), store.set("open", false)];
  }
}

export const page = new Select();
