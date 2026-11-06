import { Dialog, initial } from "../dialog/dialog.ts";
import view from "./alert-dialog.pavlus";

export { initial };

/** The dialog's logic; the alert dialog cannot be dismissed by the scrim. */
export class AlertDialog extends Dialog {
  override view = view;
}

export const page = new AlertDialog();
