import {
  Component,
  type Effect,
  type Message,
} from "@service-laboratory/pavlus";
import { storeEffector as store } from "@service-laboratory/pavlus/plugins";
import view from "./context-menu.pavlus";

export interface ContextMenuState {
  shown: boolean;
  chosen: string;
}

export const initial: ContextMenuState = { shown: false, chosen: "" };

export class ContextMenu extends Component<ContextMenuState> {
  view = view;

  open(): Effect[] {
    return [store.set("shown", true)];
  }

  close(): Effect[] {
    return [store.set("shown", false)];
  }

  choose(msg: Message): Effect[] {
    return [store.set("chosen", msg.payload), store.set("shown", false)];
  }
}

export const page = new ContextMenu();
