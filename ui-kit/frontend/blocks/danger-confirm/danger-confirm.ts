import {
  Component,
  type Effect,
  type Message,
} from "@service-laboratory/pavlus";
import { storeEffector as store } from "@service-laboratory/pavlus/plugins";
import {
  type ConfirmProps,
  askConfirm,
  closedConfirm,
  typeConfirm,
} from "./confirm.ts";
import view from "./danger-confirm.pavlus";

export interface DangerConfirmState {
  dialog: ConfirmProps;
  last: string;
}

export const initial: DangerConfirmState = {
  dialog: closedConfirm(),
  last: "Nothing confirmed yet.",
};

export class DangerConfirmPage extends Component<DangerConfirmState> {
  view = view;

  askDelete(): Effect[] {
    return [
      store.set(
        "dialog",
        askConfirm(
          "delete",
          "web-frontend-01",
          "Delete web-frontend-01?",
          "The machine, its disk and its snapshots are removed. This cannot be undone.",
          { confirmLabel: "Delete machine", expect: "web-frontend-01" },
        ),
      ),
    ];
  }

  askRestore(): Effect[] {
    return [
      store.set(
        "dialog",
        askConfirm(
          "restore",
          "weekly-auto",
          "Restore this snapshot?",
          "The machine reboots and goes back to how it was on 15 Nov, 03:00.",
          { confirmLabel: "Restore", danger: false },
        ),
      ),
    ];
  }

  "dialog.cancel"(): Effect[] {
    return [store.set("dialog", closedConfirm())];
  }

  "dialog.type"(msg: Message, s: DangerConfirmState): Effect[] {
    return [store.set("dialog", typeConfirm(s.dialog, msg.event?.value ?? ""))];
  }

  "dialog.confirm"(_msg: Message, s: DangerConfirmState): Effect[] {
    return [
      store.set("last", `Confirmed: ${s.dialog.kind} ${s.dialog.subject}`),
      store.set("dialog", closedConfirm()),
    ];
  }
}

export const page = new DangerConfirmPage();
