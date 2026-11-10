import { Component } from "@pavlus/client";
import view from "./scroll-area.pavlus";

export interface ScrollAreaState {
  tags: string[];
}

export const initial: ScrollAreaState = {
  tags: Array.from({ length: 30 }, (_, i) => `v1.2.0-beta.${30 - i}`),
};

/** Only data: the page has no messages of its own. */
export class ScrollArea extends Component<ScrollAreaState> {
  view = view;
}

export const page = new ScrollArea();
