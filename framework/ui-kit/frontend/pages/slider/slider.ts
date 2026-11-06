import { Component, type Effect, type Message } from "@pavlus/frontend";
import { storeEffector as store } from "@pavlus/frontend/plugins";
import view from "./slider.pavlus";

export interface SliderState {
  value: number;
}

export const initial: SliderState = { value: 40 };

export class Slider extends Component<SliderState> {
  view = view;

  change(msg: Message): Effect[] {
    return [store.set("value", Number(msg.event?.value ?? 0))];
  }
}

export const page = new Slider();
