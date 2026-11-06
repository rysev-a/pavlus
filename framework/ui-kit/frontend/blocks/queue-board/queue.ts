import type { Tone } from "../admin-shell/shell.ts";

export type QStatus = "waiting" | "called" | "in" | "done";

/** The data: one person in the queue. `arrived` is minutes after midnight. */
export interface Ticket {
  id: string;
  number: number;
  name: string;
  reason: string;
  doctor: string;
  arrived: number;
  status: QStatus;
  urgent: boolean;
}

export interface QAction {
  id: "next" | "back";
  label: string;
  variant: "default" | "outline" | "ghost";
}

export interface QItem {
  id: string;
  ticket: string;
  name: string;
  reason: string;
  doctor: string;
  /** `12 min`, or the time it took. */
  wait: string;
  status: string;
  tone: Tone;
  urgent: boolean;
  actions: QAction[];
}

export interface Lane {
  id: string;
  label: string;
  tone: Tone;
  empty: string;
  count: number;
  items: QItem[];
}

const ORDER: QStatus[] = ["waiting", "called", "in", "done"];

export const STATUS_LABEL: Record<QStatus, string> = {
  waiting: "Waiting",
  called: "Called",
  in: "In consultation",
  done: "Finished",
};

const STATUS_TONE: Record<QStatus, Tone> = {
  waiting: "info",
  called: "warning",
  in: "success",
  done: "muted",
};

const NEXT_LABEL: Record<QStatus, string> = {
  waiting: "Call",
  called: "Start",
  in: "Finish",
  done: "",
};

/** Pure: the status after or before this one (the ends stay). */
export function step(status: QStatus, dir: "next" | "back"): QStatus {
  const i = ORDER.indexOf(status) + (dir === "next" ? 1 : -1);
  return ORDER[Math.max(0, Math.min(ORDER.length - 1, i))];
}

/** Pure: move one ticket a step. */
export function advance(
  list: Ticket[],
  id: string,
  dir: "next" | "back" = "next",
): Ticket[] {
  return list.map((t) =>
    t.id === id ? { ...t, status: step(t.status, dir) } : t,
  );
}

/** Pure: minutes waited (never negative). */
export const waited = (arrived: number, now: number): number =>
  Math.max(0, now - arrived);

/** Pure: `7 min` or `1 h 05`. */
export function waitLabel(min: number): string {
  if (min < 60) return `${min} min`;
  const m = min % 60;
  return `${Math.floor(min / 60)} h ${m < 10 ? "0" : ""}${m}`;
}

/** Pure: urgent first, then who came first. */
export function order(list: Ticket[]): Ticket[] {
  return [...list].sort(
    (a, b) =>
      Number(b.urgent) - Number(a.urgent) ||
      a.arrived - b.arrived ||
      a.number - b.number,
  );
}

/** Pure: the average wait of those who are not finished, in minutes. */
export function averageWait(list: Ticket[], now: number): number {
  const open = list.filter(
    (t) => t.status === "waiting" || t.status === "called",
  );
  if (open.length === 0) return 0;
  return Math.round(
    open.reduce((n, t) => n + waited(t.arrived, now), 0) / open.length,
  );
}

const pad = (n: number) => (n < 10 ? `00${n}` : n < 100 ? `0${n}` : String(n));

function itemOf(t: Ticket, now: number): QItem {
  const next = NEXT_LABEL[t.status];
  return {
    id: t.id,
    ticket: `A${pad(t.number)}`,
    name: t.name,
    reason: t.reason,
    doctor: t.doctor,
    wait: waitLabel(waited(t.arrived, now)),
    status: STATUS_LABEL[t.status],
    tone: STATUS_TONE[t.status],
    urgent: t.urgent && t.status !== "done",
    actions: [
      ...(next
        ? [{ id: "next" as const, label: next, variant: "default" as const }]
        : []),
      ...(t.status === "called"
        ? [{ id: "back" as const, label: "Undo", variant: "ghost" as const }]
        : []),
    ],
  };
}

/** Pure: the three lanes, each ordered, with counts. */
export function lanesOf(list: Ticket[], now: number): Lane[] {
  const lane = (
    id: string,
    label: string,
    tone: Tone,
    empty: string,
    statuses: QStatus[],
  ): Lane => {
    const items = order(list.filter((t) => statuses.includes(t.status))).map(
      (t) => itemOf(t, now),
    );
    return { id, label, tone, empty, count: items.length, items };
  };
  return [
    lane("waiting", "Waiting room", "info", "The waiting room is empty.", [
      "waiting",
      "called",
    ]),
    lane("in", "With the doctor", "success", "Nobody is being seen.", ["in"]),
    lane("done", "Finished", "muted", "Nobody has finished yet.", ["done"]),
  ];
}

/** Pure: the next ticket number. */
export const nextNumber = (list: Ticket[]): number =>
  Math.max(0, ...list.map((t) => t.number)) + 1;
