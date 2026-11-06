import { Component, type Effect, type Message } from "@pavlus/frontend";
import {
  storeEffector as store,
  timeEffector as time,
} from "@pavlus/frontend/plugins";
import view from "./countdown-timer.pavlus";

export type Tone = "ok" | "warn" | "danger";

export interface TimerProps {
  label: string;
  /** `04:09`. */
  clock: string;
  /** Time left, 0..100. */
  percent: number;
  tone: Tone;
  finished: boolean;
}

/** Pure: seconds → `mm:ss` (never negative; minutes may pass 59). */
export function formatClock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const mm = String(Math.floor(s / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return `${mm}:${ss}`;
}

/** Pure: how worried to look: a quarter left is a warning, a tenth is danger. */
export function toneOf(remaining: number, total: number): Tone {
  if (total <= 0) return "ok";
  if (remaining <= total * 0.1 || remaining <= 10) return "danger";
  if (remaining <= total * 0.25) return "warn";
  return "ok";
}

/** Pure: one second later. */
export const tick = (remaining: number): number => Math.max(0, remaining - 1);

/** Pure: what the view shows for a timer. */
export function timerProps(
  remaining: number,
  total: number,
  label = "Time left",
): TimerProps {
  return {
    label,
    clock: formatClock(remaining),
    percent: total <= 0 ? 0 : Math.round((remaining / total) * 100),
    tone: toneOf(remaining, total),
    finished: remaining <= 0,
  };
}

const TOTAL = 90;
const ID = "countdown:demo";

export interface CountdownState {
  total: number;
  remaining: number;
  running: boolean;
  timer: TimerProps;
}

export const initial: CountdownState = {
  total: TOTAL,
  remaining: TOTAL,
  running: false,
  timer: timerProps(TOTAL, TOTAL),
};

export class CountdownTimerPage extends Component<CountdownState> {
  view = view;

  start(_msg: Message, state: CountdownState): Effect[] {
    if (state.remaining <= 0) return [];
    return [store.set("running", true), time.setInterval(ID, 1000, "tick")];
  }

  pause(): Effect[] {
    return [store.set("running", false), time.cancel(ID)];
  }

  reset(_msg: Message, state: CountdownState): Effect[] {
    return [
      store.set("running", false),
      store.set("remaining", state.total),
      store.set("timer", timerProps(state.total, state.total)),
      time.cancel(ID),
    ];
  }

  tick(_msg: Message, state: CountdownState): Effect[] {
    const remaining = tick(state.remaining);
    return [
      store.set("remaining", remaining),
      store.set("timer", timerProps(remaining, state.total)),
      ...(remaining === 0
        ? [store.set("running", false), time.cancel(ID)]
        : []),
    ];
  }

  /** The timer lives in the time plugin: stop it when the page goes away. */
  leave(): Effect[] {
    return [store.set("running", false), time.cancel(ID)];
  }
}

export const page = new CountdownTimerPage();
