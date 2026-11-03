import {
  Component,
  type Effect,
  type Message,
} from "@service-laboratory/pavlus";
import { storeEffector as store } from "@service-laboratory/pavlus/plugins";
import view from "./carousel.pavlus";

export interface CarouselState {
  slides: { title: string; text: string }[];
  index: number;
  /** Derived from `index`. */
  slide: { title: string; text: string };
}

const slides = [
  {
    title: "Pure functions",
    text: "The application takes a message and the state and returns effects.",
  },
  {
    title: "Plugins",
    text: "DOM, HTTP, time, storage and routing live in plugins.",
  },
  {
    title: "Compiled templates",
    text: "A template becomes two pure functions: render and diff.",
  },
  {
    title: "Patches are data",
    text: "diff returns the DOM changes as plain objects.",
  },
];

export const initial: CarouselState = { slides, index: 0, slide: slides[0] };

export class Carousel extends Component<CarouselState> {
  view = view;

  prev(_msg: Message, state: CarouselState): Effect[] {
    return this._go(state, state.index - 1);
  }

  next(_msg: Message, state: CarouselState): Effect[] {
    return this._go(state, state.index + 1);
  }

  _go(state: CarouselState, to: number): Effect[] {
    const index = Math.min(Math.max(to, 0), state.slides.length - 1);
    return [store.set("index", index), store.set("slide", state.slides[index])];
  }
}

export const page = new Carousel();
