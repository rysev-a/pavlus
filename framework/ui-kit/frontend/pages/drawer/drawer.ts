import { type Effect } from "@pavlus/frontend";
import { storeEffector as store } from "@pavlus/frontend/plugins";
import { Dialog, type OverlayState } from "../dialog/dialog.ts";
import view from "./drawer.pavlus";

export interface DrawerState extends OverlayState {
  goal: number;
}

export const initial: DrawerState = { open: false, side: "bottom", goal: 350 };

export class Drawer extends Dialog {
  override view = view;

  less(_msg: unknown, state: DrawerState): Effect[] {
    return [store.set("goal", Math.max(200, state.goal - 10))];
  }

  more(_msg: unknown, state: DrawerState): Effect[] {
    return [store.set("goal", Math.min(400, state.goal + 10))];
  }
}

export const page = new Drawer();
