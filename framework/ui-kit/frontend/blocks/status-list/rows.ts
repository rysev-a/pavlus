import type { Tone } from "../admin-shell/shell.ts";
import { loadTone } from "../admin-shell/shell.ts";

export interface Fact {
  label: string;
  value: string;
}

export interface Meter {
  label: string;
  text: string;
  pct: number;
  tone: Tone;
}

export interface ListAction {
  id: string;
  label: string;
  icon: string;
  variant: "outline" | "default" | "ghost" | "secondary" | "destructive";
  disabled: boolean;
}

export interface Choice {
  label: string;
  options: { value: string; label: string; selected: boolean }[];
}

export interface StatusRow {
  id: string;
  name: string;
  sub: string;
  /** The text of the pill, and its tone (also the colour of the dot). */
  status: string;
  tone: Tone;
  facts: Fact[];
  meters: Meter[];
  actions: ListAction[];
  /** A select in the row (assign someone), or null. */
  choose: Choice | null;
  /** Dim the row (it is done). */
  done: boolean;
}

/** Pure: a meter whose colour follows the load (green, amber, red). */
export function loadMeter(label: string, pct: number, text = ""): Meter {
  return { label, pct, text: text || `${pct}%`, tone: loadTone(pct) };
}

export function listAction(
  id: string,
  label: string,
  opts: Partial<Omit<ListAction, "id" | "label">> = {},
): ListAction {
  return { icon: "", variant: "outline", disabled: false, ...opts, id, label };
}

/** Pure: a row with the optional parts filled in. */
export function statusRow(
  id: string,
  name: string,
  status: string,
  tone: Tone,
  rest: Partial<Omit<StatusRow, "id" | "name" | "status" | "tone">> = {},
): StatusRow {
  return {
    sub: "",
    facts: [],
    meters: [],
    actions: [],
    choose: null,
    done: false,
    ...rest,
    id,
    name,
    status,
    tone,
  };
}

/** Pure: a select's options with one chosen. */
export function choice(
  label: string,
  values: string[],
  selected: string,
  placeholder = "Unassigned",
): Choice {
  return {
    label,
    options: [
      { value: "", label: placeholder, selected: selected === "" },
      ...values.map((v) => ({ value: v, label: v, selected: v === selected })),
    ],
  };
}
