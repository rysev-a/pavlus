import { Component } from "@pavlus/client";
import view from "./callout.pavlus";

/** The four tones a callout comes in. */
export type CalloutTone = "note" | "tip" | "warning" | "danger";

/** What the template of a callout reads: the alert class and the icon of the tone. */
export interface CalloutProps {
  title: string;
  text: string;
  /** The `ui-alert-*` class of the tone. */
  alert: string;
  /** The icon class of the tone. */
  icon: string;
}

const LOOK: Record<CalloutTone, { alert: string; icon: string }> = {
  note: { alert: "ui-alert-info", icon: "k-icon-info" },
  tip: { alert: "ui-alert-success", icon: "k-icon-check" },
  warning: { alert: "ui-alert-warning", icon: "k-icon-alert" },
  danger: { alert: "ui-alert-danger", icon: "k-icon-x" },
};

/** Pure: the props of a callout, from its tone, title and text. */
export function calloutOf(
  tone: CalloutTone,
  title: string,
  text: string,
): CalloutProps {
  return { title, text, ...LOOK[tone] };
}

interface CalloutState {
  note: CalloutProps;
  tip: CalloutProps;
  warning: CalloutProps;
  danger: CalloutProps;
}

/** The page of the block: four tones, each with its own props. */
export class CalloutPage extends Component<CalloutState> {
  view = view;
}

export const initial: CalloutState = {
  note: calloutOf(
    "note",
    "Note",
    "Schemas are plain values: you can pass them around and compose them.",
  ),
  tip: calloutOf(
    "tip",
    "Tip",
    "Parse once at the edge of your program and keep the typed result.",
  ),
  warning: calloutOf(
    "warning",
    "Warning",
    "Transforms run after validation, so they never see invalid input.",
  ),
  danger: calloutOf(
    "danger",
    "Breaking change",
    "parseSync was removed in 2.0. Use parse, which is synchronous unless a rule is async.",
  ),
};

export const page = new CalloutPage();
