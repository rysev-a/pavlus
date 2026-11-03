import {
  Component,
  type Effect,
  type Message,
} from "@service-laboratory/pavlus";
import { storeEffector as store } from "@service-laboratory/pavlus/plugins";
import view from "./direction.pavlus";

export interface DirectionState {
  dir: "ltr" | "rtl";
}

export const initial: DirectionState = { dir: "ltr" };

export class Direction extends Component<DirectionState> {
  view = view;

  set(msg: Message): Effect[] {
    return [store.set("dir", msg.payload)];
  }
}

export const page = new Direction();
