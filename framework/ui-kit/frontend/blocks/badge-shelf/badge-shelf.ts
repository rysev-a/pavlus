import { Component } from "@pavlus/frontend";
import view from "./badge-shelf.pavlus";
import { type Badge, badgeList } from "./badges.ts";

export interface ShelfState {
  badges: Badge[];
}

export const initial: ShelfState = {
  badges: badgeList({
    bestStreak: 9,
    totalChecks: 64,
    habits: 4,
    perfectWeeks: 0,
    rate30: 71,
  }),
};

/** Only data: the page has no messages of its own. */
export class ShelfPage extends Component<ShelfState> {
  view = view;
}

export const page = new ShelfPage();
