import type { Tone } from "../admin-shell/shell.ts";

export type ApptKind = "inbound" | "outbound";
export type ApptStatus = "scheduled" | "arrived" | "done";

/** A truck at a dock door, for some hours. */
export interface Appt {
  id: string;
  dock: string;
  /** Index of the first hour on the grid. */
  start: number;
  /** How many hours the door is taken. */
  span: number;
  carrier: string;
  /** The order it brings or takes (`IN-1042`), or empty. */
  ref: string;
  kind: ApptKind;
  status: ApptStatus;
}

export interface DockDef {
  id: string;
  name: string;
  /** `Inbound`, `Outbound`, `Both`. */
  kind: string;
}

export interface Hour {
  i: number;
  label: string;
  now: boolean;
}

export interface Seg {
  key: string;
  kind: "free" | "appt";
  /** Free: the hour. */
  hour: number;
  /** Appointment: id, label and so on. */
  id: string;
  span: number;
  label: string;
  sub: string;
  tone: Tone;
}

export interface DockRow {
  id: string;
  name: string;
  kind: string;
  segs: Seg[];
}

/** Pure: the hours of the grid: `06:00`, `07:00`... The one at `now` is marked. */
export function hoursFrom(first: number, count: number, now: number): Hour[] {
  return Array.from({ length: count }, (_, i) => ({
    i,
    label: `${String(first + i).padStart(2, "0")}:00`,
    now: first + i === now,
  }));
}

/** Pure: do two appointments on one door overlap? */
export const overlaps = (
  a: { start: number; span: number },
  b: { start: number; span: number },
): boolean => a.start < b.start + b.span && b.start < a.start + a.span;

/**
 * Pure: would a new appointment clash with another one on the same door, or
 * run past the end of the grid? `ignore` is an appointment being moved.
 */
export function conflicts(
  appts: Appt[],
  dock: string,
  start: number,
  span: number,
  hours: number,
  ignore = "",
): boolean {
  if (start < 0 || span < 1 || start + span > hours) return true;
  return appts.some(
    (a) => a.dock === dock && a.id !== ignore && overlaps(a, { start, span }),
  );
}

/** Pure: the longest stay (up to `max` hours) that fits from an hour on a door. */
export function longestFit(
  appts: Appt[],
  dock: string,
  start: number,
  hours: number,
  max = 3,
): number {
  let span = 0;
  while (span < max && !conflicts(appts, dock, start, span + 1, hours)) span++;
  return span;
}

/** Pure: the first door that is free for the stay, or null. */
export function firstFreeDock(
  appts: Appt[],
  docks: DockDef[],
  start: number,
  span: number,
  hours: number,
): DockDef | null {
  return docks.find((d) => !conflicts(appts, d.id, start, span, hours)) ?? null;
}

/** Pure: how many hours of the grid are taken, in percent. */
export function usedPct(appts: Appt[], docks: number, hours: number): number {
  const total = docks * hours;
  if (total <= 0) return 0;
  const used = appts.reduce((n, a) => n + a.span, 0);
  return Math.min(100, Math.round((used / total) * 100));
}

const toneOf = (a: Appt): Tone =>
  a.status === "done" ? "muted" : a.kind === "inbound" ? "info" : "warning";

const STATUS_TEXT: Record<ApptStatus, string> = {
  scheduled: "Scheduled",
  arrived: "At the door",
  done: "Done",
};

/** Pure: the rows to draw: for each door, free hours and appointments in order. */
export function rowsOf(
  docks: DockDef[],
  appts: Appt[],
  hours: number,
): DockRow[] {
  return docks.map((dock) => {
    const mine = appts
      .filter((a) => a.dock === dock.id)
      .sort((a, b) => a.start - b.start);
    const segs: Seg[] = [];
    let at = 0;
    for (const a of mine) {
      for (; at < a.start; at++) {
        segs.push({
          key: `${dock.id}-f${at}`,
          kind: "free",
          hour: at,
          id: "",
          span: 1,
          label: "",
          sub: "",
          tone: "muted",
        });
      }
      segs.push({
        key: a.id,
        kind: "appt",
        hour: a.start,
        id: a.id,
        span: a.span,
        label: a.carrier,
        sub: `${a.ref || a.kind}, ${STATUS_TEXT[a.status]}`,
        tone: toneOf(a),
      });
      at = a.start + a.span;
    }
    for (; at < hours; at++) {
      segs.push({
        key: `${dock.id}-f${at}`,
        kind: "free",
        hour: at,
        id: "",
        span: 1,
        label: "",
        sub: "",
        tone: "muted",
      });
    }
    return { id: dock.id, name: dock.name, kind: dock.kind, segs };
  });
}
