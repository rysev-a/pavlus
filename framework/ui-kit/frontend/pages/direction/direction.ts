import { Component, type Effect, type Message } from "@pavlus/frontend";
import { storeEffector as store } from "@pavlus/frontend/plugins";
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
