/**
 * The report dialog: a member reports a person, a project or a message and
 * the moderators answer in the queue (the queue is the backend's — this is
 * only the form).
 *
 * The dialog is a child of the page that shows it (`+ReportDialog#report` in
 * the member page and in the public project page): a keyless child, so it
 * sees the page's whole state and its messages arrive as `report.…`. The page
 * opens it (`send("report", "open", …)`); the dialog owns the rest — the
 * reason, the details, the cancel, the submit.
 *
 * The texts of the form are the original's English literals; the backend
 * translates what it answers, so the error line shows the backend's own text.
 */
import { Component, type Effect, type Message } from "@pavlus/frontend";
import {
  httpEffector as http,
  storeEffector as store,
} from "@pavlus/frontend/plugins";
import { DomPlugin } from "@pavlus/frontend/plugins/dom";
import type { ReportSlice } from "../state.ts";
import view from "./report.pavlus";

/** What the dialog reads from the page that shows it. */
export interface ReportState {
  report: ReportSlice;
}

export class ReportDialog extends Component<ReportState> {
  view = view;

  /** The page opened the dialog: it says what is reported. */
  open(msg: Message, s: ReportState): Effect[] {
    const what =
      (msg.payload as {
        kind?: string;
        target?: string;
        title?: string;
      }) ?? {};
    return [
      store.set(
        "report",
        {
          ...s.report,
          open: true,
          kind: what.kind ?? "person",
          target: what.target ?? "",
          title: what.title ?? "Report",
          reason: "spam",
          details: "",
          error: "",
          done: false,
        },
        { onSuccess: "paint" },
      ),
    ];
  }

  /** The cancel button: the dialog closes, the report is forgotten. */
  cancel(_msg: Message, s: ReportState): Effect[] {
    return [
      store.set("report", { ...s.report, open: false }, { onSuccess: "paint" }),
    ];
  }

  /** The reason of the select. */
  setReason(msg: Message, s: ReportState): Effect[] {
    return [
      store.set("report.reason", msg.event?.value ?? "spam", {
        onSuccess: "paint",
      }),
    ];
  }

  /** The details of the textarea. */
  setDetails(msg: Message, s: ReportState): Effect[] {
    return [
      store.set("report.details", msg.event?.value ?? "", {
        onSuccess: "paint",
      }),
    ];
  }

  /** "Send the report": the backend takes it or answers why not. */
  submit(_msg: Message, s: ReportState): Effect[] {
    const report = s.report;
    if (!report.open || report.done) return [];
    return [
      http.request({
        id: "report",
        method: "POST",
        url: "/api/reports",
        body: {
          kind: report.kind,
          target: report.target,
          reason: report.reason,
          details: report.details.trim(),
        },
        onSuccess: "sent",
        onError: "failed",
      }),
    ];
  }

  /** The report is in the queue: the dialog says thanks. */
  sent(_msg: Message, s: ReportState): Effect[] {
    return [
      store.set(
        "report",
        { ...s.report, done: true, error: "" },
        { onSuccess: "paint" },
      ),
    ];
  }

  /** The backend refused: its own text (already translated) goes into the dialog. */
  failed(msg: Message, s: ReportState): Effect[] {
    const payload = msg.payload as {
      status?: number;
      error?: string;
      data?: { error?: string };
    };
    const text = payload.data?.error ?? payload.error ?? "";
    return [
      store.set(
        "report",
        { ...s.report, done: false, error: text },
        { onSuccess: "paint" },
      ),
    ];
  }

  /** The Escape key closes the dialog (as in the original). */
  onKey(msg: Message, s: ReportState): Effect[] {
    if (msg.event?.key !== "Escape") return [];
    return [
      store.set("report", { ...s.report, open: false }, { onSuccess: "paint" }),
    ];
  }

  /** The dialog's own change: it diffs itself and hands the patches over. */
  paint(msg: Message): Effect[] {
    const { prev, next } = msg.payload as {
      prev: ReportState;
      next: ReportState;
    };
    const effects: Effect[] = [DomPlugin.update(view.diff(prev, next))];
    // the dialog has just opened: the reason takes the focus (as in the original)
    if (!prev.report.open && next.report.open) {
      effects.push(DomPlugin.focus("[data-testid=report-reason]"));
    }
    return effects;
  }
}
