import { daysBetween, shortDate } from "../month-archive/dates.ts";

export type StopKind = "origin" | "port" | "hub" | "customs" | "destination";

export interface Stop {
  id: string;
  place: string;
  kind: StopKind;
  /** The planned date, `2026-11-05`. */
  planned: string;
  /** The date it really happened, or empty while it has not. */
  actual: string;
  note: string;
}

export type StopState = "done" | "current" | "next";

export interface StopView {
  id: string;
  place: string;
  kindText: string;
  icon: string;
  state: StopState;
  /** `Planned Nov 5` */
  plannedText: string;
  /** `Arrived Nov 6`, or `Expected Nov 9`. */
  actualText: string;
  delay: number;
  /** `1 day late`, `on time`, `2 days early`, or empty. */
  delayText: string;
  tone: "success" | "warning" | "destructive" | "muted";
  note: string;
}

const KINDS: Record<StopKind, { text: string; icon: string }> = {
  origin: { text: "Pick-up", icon: "📦" },
  port: { text: "Port", icon: "⚓" },
  hub: { text: "Hub", icon: "🏭" },
  customs: { text: "Customs", icon: "🛂" },
  destination: { text: "Delivery", icon: "🏁" },
};

/** Pure: days a stop ran late (negative: early). */
export const delayDays = (planned: string, actual: string): number =>
  daysBetween(planned, actual);

/** Pure: `1 day late`, `on time`, `3 days early`. */
export function delayText(delay: number): string {
  if (delay === 0) return "on time";
  const n = Math.abs(delay);
  return `${n} ${n === 1 ? "day" : "days"} ${delay > 0 ? "late" : "early"}`;
}

/**
 * Pure: the stops as the timeline shows them. `reached` is the index of the
 * last stop the cargo has got to (-1: it has not left); the stop it is at is
 * "current" unless `delivered`.
 */
export function stopViews(
  stops: Stop[],
  reached: number,
  delivered: boolean,
): StopView[] {
  return stops.map((s, i) => {
    const state: StopState =
      i < reached || (i === reached && delivered)
        ? "done"
        : i === reached
          ? "current"
          : "next";
    const happened = state !== "next" && s.actual !== "";
    const delay = happened ? delayDays(s.planned, s.actual) : 0;
    return {
      id: s.id,
      place: s.place,
      kindText: KINDS[s.kind].text,
      icon: KINDS[s.kind].icon,
      state,
      plannedText: `Planned ${shortDate(s.planned)}`,
      actualText: happened
        ? `${state === "current" ? "Here since" : "Done"} ${shortDate(s.actual)}`
        : `Expected ${shortDate(s.actual || s.planned)}`,
      delay,
      delayText: happened ? delayText(delay) : "",
      tone: !happened
        ? "muted"
        : delay > 1
          ? "destructive"
          : delay > 0
            ? "warning"
            : "success",
      note: s.note,
    };
  });
}

/** Pure: how far along the route the cargo is, in percent. */
export function routeProgress(stopCount: number, reached: number): number {
  if (stopCount <= 1) return 0;
  return Math.max(
    0,
    Math.min(100, Math.round((Math.max(reached, 0) / (stopCount - 1)) * 100)),
  );
}
