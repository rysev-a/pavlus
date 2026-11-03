import { Component, type Effect } from "@service-laboratory/pavlus";
import { storeEffector as store } from "@service-laboratory/pavlus/plugins";
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
