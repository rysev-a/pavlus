import { Component, type Effect, type Message } from "@pavlus/client";
import { storeEffector as store } from "@pavlus/client/plugins";
import view from "./carousel.pavlus";

export interface CarouselState {
  slides: { title: string; text: string }[];
  index: number;
  /** Derived from `index` — see `derive`. */
  slide: { title: string; text: string };
  atStart: boolean;
  atEnd: boolean;
  position: string;
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

/** Everything that follows from the index — the one place. */
function derive(
  index: number,
  slides: CarouselState["slides"],
): Omit<CarouselState, "slides" | "index"> {
  return {
    slide: slides[index],
    atStart: index === 0,
    atEnd: index === slides.length - 1,
    position: `${index + 1} / ${slides.length}`,
  };
}

export const initial: CarouselState = {
  slides,
  index: 0,
  ...derive(0, slides),
};

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
    return [
      store.set("index", index),
      ...Object.entries(derive(index, state.slides)).map(([k, v]) =>
        store.set(k, v),
      ),
    ];
  }
}

export const page = new Carousel();
