import { Component } from "@pavlus/frontend";
import { type Item, item } from "./items.ts";
import view from "./progress-list.pavlus";

export interface ProgressListState {
  items: Item[];
}

export const initial: ProgressListState = {
  items: [
    item("conn", "Connections", 64, 200, { sub: "max_connections = 200" }),
    item("cache", "Cache hit ratio", 98, 100, {
      text: "98%",
      invert: true,
      sub: "Higher is better",
    }),
    item("disk", "Disk", 412, 500, { text: "412 GB of 500 GB" }),
    item("repl", "Replica lag", 9, 10, { text: "9 s", sub: "Alert at 10 s" }),
  ],
};

/** Only data: the page has no messages of its own. */
export class ProgressListPage extends Component<ProgressListState> {
  view = view;
}

export const page = new ProgressListPage();
