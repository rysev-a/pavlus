import { type Effect, type Message } from "@pavlus/frontend";
import { storeEffector as store } from "@pavlus/frontend/plugins";
import { Dialog, initial, type OverlayState } from "../dialog/dialog.ts";
import view from "./sheet.pavlus";

export { initial };

/** The dialog's logic, plus the side the sheet comes from. */
export class Sheet extends Dialog {
  override view = view;

  /** `open(side)`: the template's button names the edge. */
  open(msg: Message): Effect[] {
    return [
      store.set("side", msg.payload as OverlayState["side"]),
      store.set("open", true),
    ];
  }
}

export const page = new Sheet();
