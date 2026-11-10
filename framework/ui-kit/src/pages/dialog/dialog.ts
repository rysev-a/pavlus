import { Component, type Effect } from "@pavlus/client";
import { storeEffector as store } from "@pavlus/client/plugins";
import view from "./dialog.pavlus";

export interface OverlayState {
  open: boolean;
  /** For the sheet: the edge it slides in from. */
  side: "right" | "left" | "top" | "bottom";
  /** What the sheet's classes read of `side` (no comparisons in templates). */
  fromLeft: boolean;
  fromTop: boolean;
  fromBottom: boolean;
}

/** The side as the sheet's classes read it: one flag per edge. */
export function edgesOf(side: OverlayState["side"]) {
  return {
    fromLeft: side === "left",
    fromTop: side === "top",
    fromBottom: side === "bottom",
  };
}

export const initial: OverlayState = {
  open: false,
  side: "right",
  ...edgesOf("right"),
};

/** Shared by the dialog, the alert dialog, the sheet and the drawer. */
export class Dialog extends Component<OverlayState> {
  view = view;

  show(): Effect[] {
    return [store.set("open", true)];
  }

  hide(): Effect[] {
    return [store.set("open", false)];
  }
}

export const page = new Dialog();
