/**
 * The dialog of an application (the original's `ApplyDialog`): the opening to
 * apply to, the profession to apply with and the message. It is a child of the
 * page that shows it (`+ApplyDialog#apply`): a keyless child, so it sees the
 * page's whole state and its messages arrive as `apply.…`.
 *
 * The page opens it (`send("apply", "open", …)`); the dialog owns the rest —
 * the opening, the profession, the message, the cancel and the send. After a
 * successful send the dialog closes itself, and the page (its own
 * `apply.sent` handler) asks its lists again.
 *
 * The professions of the member and the texts of the dialog come from the
 * backend: the translation lives there.
 */
import { Component, type Effect, type Message } from "@pavlus/frontend";
import {
  httpEffector as http,
  storeEffector as store,
} from "@pavlus/frontend/plugins";
import { DomPlugin } from "@pavlus/frontend/plugins/dom";
import type { ApplySlice, DialogSlot } from "../state.ts";
import view from "./apply-dialog.pavlus";

/** What the dialog reads from the page that shows it. */
export interface ApplyState {
  apply: ApplySlice;
}

/** What the page tells the dialog when it opens it. */
export interface ApplyOpen {
  mode?: string;
  id?: number;
  slotId?: number;
  slots?: DialogSlot[];
  title?: string;
  profession?: string;
  message?: string;
}

export class ApplyDialog extends Component<ApplyState> {
  view = view;

  /** The page opened the dialog: what the application is about. */
  open(msg: Message, s: ApplyState): Effect[] {
    const what = (msg.payload ?? {}) as ApplyOpen;
    return [
      store.set(
        "apply",
        {
          ...s.apply,
          open: true,
          mode: what.mode ?? "new",
          id: what.id ?? 0,
          slotId: what.slotId ?? 0,
          slots: what.slots ?? [],
          title: what.title ?? "",
          profession: what.profession ?? "",
          message: what.message ?? "",
          busy: false,
          error: "",
          loaded: false,
          sent: false,
        },
        { onSuccess: "paint" },
      ),
      // my professions and the texts of the dialog
      http.request({
        id: "apply.options",
        url: "/api/apply/options",
        onSuccess: "options.loaded",
        onError: "options.failed",
      }),
    ];
  }

  /** The professions of the member and the texts are here. */
  "options.loaded"(msg: Message, s: ApplyState): Effect[] {
    const data = msg.payload as {
      data: {
        professions: { professionId: number; slug: string; title: string }[];
        strings: Record<string, string>;
      };
    };
    const list = data.data.professions ?? [];
    // the profession of the slot is preselected when the member has it
    const wanted = s.apply.slots.find((x) => x.id === s.apply.slotId);
    const profession =
      s.apply.profession ||
      wanted?.profession ||
      list.find((p) => p.slug === wanted?.profession)?.slug ||
      list[0]?.slug ||
      "";
    const chosen = list.find((p) => p.slug === profession);
    return [
      store.set("apply.professions", list, { onSuccess: "paint" }),
      store.set("apply.strings", data.data.strings ?? {}, {
        onSuccess: "paint",
      }),
      store.set("apply.profession", profession, { onSuccess: "paint" }),
      store.set("apply.professionId", chosen?.professionId ?? 0, {
        onSuccess: "paint",
      }),
      store.set("apply.loaded", true, { onSuccess: "paint" }),
    ];
  }

  "options.failed"(msg: Message, s: ApplyState): Effect[] {
    return [store.set("apply.loaded", true, { onSuccess: "paint" })];
  }

  /** The opening of the application. */
  setSlot(msg: Message, s: ApplyState): Effect[] {
    const id = Number(msg.event?.value ?? 0);
    const slot = s.apply.slots.find((x) => x.id === id);
    const effects: Effect[] = [
      store.set("apply.slotId", id, { onSuccess: "paint" }),
    ];
    // a different opening: the profession of that kind is preselected
    if (slot && s.apply.professions.some((p) => p.slug === slot.profession)) {
      effects.push(
        store.set("apply.profession", slot.profession, { onSuccess: "paint" }),
        store.set(
          "apply.professionId",
          s.apply.professions.find((p) => p.slug === slot.profession)
            ?.professionId ?? 0,
          { onSuccess: "paint" },
        ),
      );
    }
    return effects;
  }

  /** The profession to apply with. */
  setProfession(msg: Message, s: ApplyState): Effect[] {
    const slug = String(msg.event?.value ?? "");
    return [
      store.set("apply.profession", slug, { onSuccess: "paint" }),
      store.set(
        "apply.professionId",
        s.apply.professions.find((p) => p.slug === slug)?.professionId ?? 0,
        { onSuccess: "paint" },
      ),
    ];
  }

  /** The message of the application. */
  setMessage(msg: Message, s: ApplyState): Effect[] {
    return [
      store.set("apply.message", msg.event?.value ?? "", {
        onSuccess: "paint",
      }),
    ];
  }

  /** The cancel button: the dialog closes, nothing is sent. */
  cancel(_msg: Message, s: ApplyState): Effect[] {
    return [
      store.set(
        "apply",
        { ...s.apply, open: false, busy: false },
        {
          onSuccess: "paint",
        },
      ),
    ];
  }

  /** "Send the application" (or "Save" in the change mode). */
  send(_msg: Message, s: ApplyState): Effect[] {
    const apply = s.apply;
    if (apply.busy) return [];
    const body = {
      message: apply.message.trim(),
      professionId: apply.professionId || null,
    };
    const editing = apply.mode === "edit";
    return [
      store.set("apply.busy", true, { onSuccess: "paint" }),
      store.set("apply.error", "", { onSuccess: "paint" }),
      http.request({
        id: "apply.send",
        method: editing ? "PUT" : "POST",
        url: editing
          ? `/api/applications/${apply.id}`
          : `/api/slots/${apply.slotId}/apply`,
        body,
        onSuccess: "sent",
        onError: "failed",
      }),
    ];
  }

  /** The application is sent: the dialog closes, the page reloads. */
  sent(_msg: Message, s: ApplyState): Effect[] {
    return [
      store.set(
        "apply",
        { ...s.apply, open: false, busy: false, sent: true },
        { onSuccess: "paint" },
      ),
    ];
  }

  /** The backend refused: its own text goes into the dialog. */
  failed(msg: Message, s: ApplyState): Effect[] {
    const payload = msg.payload as {
      error?: string;
      data?: { error?: string };
    };
    const text = payload.data?.error ?? payload.error ?? "";
    return [
      store.set("apply.busy", false, { onSuccess: "paint" }),
      store.set("apply.error", text, { onSuccess: "paint" }),
    ];
  }

  /** A click inside the modal: it must not close the dialog. */
  noop(): Effect[] {
    return [];
  }

  /** The dialog's own change: it diffs itself and hands the patches over. */
  paint(msg: Message): Effect[] {
    const { prev, next } = msg.payload as {
      prev: ApplyState;
      next: ApplyState;
    };
    return [DomPlugin.update(view.diff(prev, next))];
  }
}
