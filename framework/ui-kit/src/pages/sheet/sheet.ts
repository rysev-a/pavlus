import { type Effect, type Message } from "@pavlus/client";
import { storeEffector as store } from "@pavlus/client/plugins";
import {
  Dialog,
  edgesOf,
  initial,
  type OverlayState,
} from "../dialog/dialog.ts";
import view from "./sheet.pavlus";

export { initial };

/** The dialog's logic, plus the side the sheet comes from. */
export class Sheet extends Dialog {
  override view = view;

  /** `open(side)`: the template's button names the edge. */
  open(msg: Message): Effect[] {
    const side = msg.payload as OverlayState["side"];
    return [
      store.set("side", side),
      ...Object.entries(edgesOf(side)).map(([k, v]) => store.set(k, v)),
      store.set("open", true),
    ];
  }
}

export const page = new Sheet();
