import { Component, type Effect, type Message } from "@pavlus/client";
import { storeEffector as store } from "@pavlus/client/plugins";
import view from "./resizable.pavlus";

export interface ResizableState {
  first: number;
  /** Derived: what is left of 100. */
  second: number;
}

export const initial: ResizableState = { first: 50, second: 50 };

export class Resizable extends Component<ResizableState> {
  view = view;

  resize(msg: Message): Effect[] {
    const first = Math.min(80, Math.max(20, Number(msg.event?.value ?? 50)));
    return [store.set("first", first), store.set("second", 100 - first)];
  }
}

export const page = new Resizable();
