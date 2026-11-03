import type { Tone } from "../admin-shell/shell.ts";
import { pad2 } from "../admin-shell/shell.ts";

export type Stage = "new" | "cooking" | "ready" | "served";

export interface Line {
  qty: number;
  name: string;
  /** `no onions`, or empty. */
  note: string;
}

/** A kitchen ticket. Times are readings of the clock, in seconds. */
export interface Ticket {
  id: string;
  /** `Table 7`, `Takeaway`... */
  title: string;
  who: string;
  lines: Line[];
  stage: Stage;
  placedAt: number;
  /** When it was served; the timer stops there. */
  doneAt: number | null;
}

export interface TicketView {
  id: string;
  title: string;
  sub: string;
  lines: { id: string; text: string; note: string }[];
  /** `07:42`. */
  timer: string;
  /** green, amber or red for a ticket that waits too long. */
  tone: Tone;
  /** How far the target time is used up, 0 to 100. */
  pct: number;
  /** The button: `Start cooking`, `Ready`, `Serve`; empty when served. */
  next: string;
  stage: Stage;
}

export interface ColumnView {
  id: Stage;
  title: string;
  count: number;
  tickets: TicketView[];
}

export const STAGES: { id: Stage; title: string; next: string }[] = [
  { id: "new", title: "New", next: "Start cooking" },
  { id: "cooking", title: "Cooking", next: "Mark ready" },
  { id: "ready", title: "Ready", next: "Serve" },
  { id: "served", title: "Served", next: "" },
];

/** The time a kitchen aims at, in seconds (the ticket turns amber at 70%). */
export const TARGET = 15 * 60;

/** Pure: the seconds a ticket has waited, or waited in total once served. */
export const elapsed = (t: Ticket, clock: number): number =>
  Math.max(0, (t.doneAt ?? clock) - t.placedAt);

/** Pure: `7 * 60 + 5` seconds as `07:05`. */
export function timerText(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${pad2(Math.floor(s / 60))}:${pad2(s % 60)}`;
}

/** Pure: how a wait looks against the target. */
export function urgency(seconds: number, target = TARGET): Tone {
  if (seconds >= target) return "destructive";
  if (seconds >= target * 0.7) return "warning";
  return "success";
}

/** Pure: the stage after this one; the last stage stays. */
export function nextStage(stage: Stage): Stage {
  const i = STAGES.findIndex((s) => s.id === stage);
  return STAGES[Math.min(STAGES.length - 1, i + 1)].id;
}

/** Pure: a ticket moved on; being served stops its timer. */
export function advanceTicket(t: Ticket, clock: number): Ticket {
  const stage = nextStage(t.stage);
  if (stage === t.stage) return t;
  return { ...t, stage, doneAt: stage === "served" ? clock : null };
}

/** Pure: the list with one ticket moved on. */
export function advance(
  tickets: Ticket[],
  id: string,
  clock: number,
): Ticket[] {
  return tickets.map((t) => (t.id === id ? advanceTicket(t, clock) : t));
}

/** Pure: the average wait of the tickets still open, in seconds (0 if none). */
export function averageWait(tickets: Ticket[], clock: number): number {
  const open = tickets.filter((t) => t.stage !== "served");
  if (open.length === 0) return 0;
  return Math.round(
    open.reduce((n, t) => n + elapsed(t, clock), 0) / open.length,
  );
}

/** Pure: how many open tickets are past the target. */
export const lateCount = (tickets: Ticket[], clock: number): number =>
  tickets.filter((t) => t.stage !== "served" && elapsed(t, clock) >= TARGET)
    .length;

const viewOf = (t: Ticket, clock: number): TicketView => {
  const seconds = elapsed(t, clock);
  const served = t.stage === "served";
  return {
    id: t.id,
    title: t.title,
    sub: `${t.id.toUpperCase()}, ${t.who}`,
    lines: t.lines.map((l, i) => ({
      id: `${t.id}-${i}`,
      text: `${l.qty} x ${l.name}`,
      note: l.note,
    })),
    timer: timerText(seconds),
    tone: served ? "muted" : urgency(seconds),
    pct: Math.min(100, Math.round((seconds / TARGET) * 100)),
    next: STAGES.find((s) => s.id === t.stage)?.next ?? "",
    stage: t.stage,
  };
};

/** Pure: the board: a column per stage, the oldest ticket first (served: newest first). */
export function boardOf(tickets: Ticket[], clock: number): ColumnView[] {
  return STAGES.map((stage) => {
    const list = tickets
      .filter((t) => t.stage === stage.id)
      .sort((a, b) =>
        stage.id === "served"
          ? (b.doneAt ?? 0) - (a.doneAt ?? 0)
          : a.placedAt - b.placedAt,
      );
    return {
      id: stage.id,
      title: stage.title,
      count: list.length,
      tickets: list.map((t) => viewOf(t, clock)),
    };
  });
}
