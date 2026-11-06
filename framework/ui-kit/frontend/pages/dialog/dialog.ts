import { Component, type Effect } from "@pavlus/frontend";
import { storeEffector as store } from "@pavlus/frontend/plugins";
import view from "./dialog.pavlus";

export interface OverlayState {
  open: boolean;
  /** For the sheet: the edge it slides in from. */
  side: "right" | "left" | "top" | "bottom";
}

export const initial: OverlayState = { open: false, side: "right" };

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
