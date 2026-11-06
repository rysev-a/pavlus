import type { Tone } from "../admin-shell/shell.ts";

export type TableStatus = "free" | "seated" | "ordered" | "paying";
export type Shape = "round" | "square" | "wide";

/** Where a table is on the plan: a cell of a grid, and how many it covers. */
export interface TableDef {
  id: string;
  label: string;
  seats: number;
  col: number;
  row: number;
  w: number;
  h: number;
  shape: Shape;
}

/** What is going on at a table right now. */
export interface TableState {
  id: string;
  status: TableStatus;
  guests: number;
  /** The clock (seconds) when the guests sat down. */
  since: number;
}

export interface TableView extends TableDef {
  status: TableStatus;
  tone: Tone;
  /** `Free`, `Seated`... */
  statusLabel: string;
  /** `4 guests`, or `4 seats`. */
  sub: string;
  /** How long they have been there: `12 min`, or empty for a free table. */
  time: string;
  selected: boolean;
}

export interface Legend {
  status: TableStatus;
  label: string;
  tone: Tone;
  count: number;
}

export const STATUSES: { id: TableStatus; label: string; tone: Tone }[] = [
  { id: "free", label: "Free", tone: "muted" },
  { id: "seated", label: "Seated", tone: "info" },
  { id: "ordered", label: "Ordered", tone: "warning" },
  { id: "paying", label: "Paying", tone: "success" },
];

const META = new Map(STATUSES.map((s) => [s.id, s]));

/** Pure: the step after a status; a table that has paid is free again. */
export function nextStatus(status: TableStatus): TableStatus {
  const i = STATUSES.findIndex((s) => s.id === status);
  return STATUSES[(i + 1) % STATUSES.length].id;
}

/** Pure: whole minutes between two clock readings (seconds). */
export const minutesSince = (clock: number, since: number): number =>
  Math.max(0, Math.floor((clock - since) / 60));

/** Pure: the second line of a table. */
export function subOf(def: TableDef, state: TableState): string {
  if (state.status === "free") return `${def.seats} seats`;
  return `${state.guests} ${state.guests === 1 ? "guest" : "guests"}`;
}

/** Pure: the third line of a table: how long it has been taken. */
export function timeOf(state: TableState, clock: number): string {
  return state.status === "free"
    ? ""
    : `${minutesSince(clock, state.since)} min`;
}

/** Pure: the tables ready to draw. */
export function tablesOf(
  defs: TableDef[],
  states: TableState[],
  selected: string,
  clock: number,
): TableView[] {
  return defs.map((def) => {
    const state = states.find((s) => s.id === def.id) ?? {
      id: def.id,
      status: "free" as TableStatus,
      guests: 0,
      since: clock,
    };
    const meta = META.get(state.status) ?? STATUSES[0];
    return {
      ...def,
      status: state.status,
      tone: meta.tone,
      statusLabel: meta.label,
      sub: subOf(def, state),
      time: timeOf(state, clock),
      selected: def.id === selected,
    };
  });
}

/** Pure: the legend, with how many tables are in each status. */
export function legendOf(states: TableState[]): Legend[] {
  return STATUSES.map((s) => ({
    status: s.id,
    label: s.label,
    tone: s.tone,
    count: states.filter((t) => t.status === s.id).length,
  }));
}

/** Pure: seats taken, and seats on the whole plan. */
export function seatsUsed(
  defs: TableDef[],
  states: TableState[],
): { used: number; total: number } {
  const total = defs.reduce((n, d) => n + d.seats, 0);
  const used = states
    .filter((s) => s.status !== "free")
    .reduce((n, s) => n + s.guests, 0);
  return { used, total };
}

/** Pure: the first free table with at least `size` seats (the smallest that fits). */
export function firstFree(
  defs: TableDef[],
  states: TableState[],
  size: number,
): TableDef | null {
  const free = defs.filter(
    (d) =>
      d.seats >= size &&
      (states.find((s) => s.id === d.id)?.status ?? "free") === "free",
  );
  free.sort((a, b) => a.seats - b.seats);
  return free[0] ?? null;
}

/** Pure: the states with one table changed. */
export function withTable(
  states: TableState[],
  id: string,
  change: Partial<TableState>,
): TableState[] {
  return states.map((s) => (s.id === id ? { ...s, ...change } : s));
}
