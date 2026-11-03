import {
  Component,
  type Effect,
  type Message,
} from "@service-laboratory/pavlus";
import { storeEffector as store } from "@service-laboratory/pavlus/plugins";
import view from "./time-slots.pavlus";

/** When a person works: weekdays (0 = Sunday), hours, a break, the slot step. */
export interface Schedule {
  /** Working weekdays, 0 = Sunday ... 6 = Saturday. */
  days: number[];
  /** `HH:MM`. */
  open: string;
  close: string;
  breakFrom?: string;
  breakTo?: string;
  /** Minutes between two slot starts. */
  step: number;
}

/** A stretch of the day that is already taken. */
export interface Busy {
  /** `HH:MM`. */
  start: string;
  /** Minutes. */
  duration: number;
}

export interface Slot {
  time: string;
  /** `2:30 PM`. */
  label: string;
  taken: boolean;
  selected: boolean;
}

/** Pure: `"09:30"` → 570. */
export function toMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

const pad = (n: number): string => String(n).padStart(2, "0");

/** Pure: 570 → `"09:30"`. */
export const fromMinutes = (minutes: number): string =>
  `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;

/** Pure: `"14:30"` → `"2:30 PM"`. */
export function clock12(time: string): string {
  const [h, m] = time.split(":").map(Number);
  return `${h % 12 === 0 ? 12 : h % 12}:${pad(m)} ${h < 12 ? "AM" : "PM"}`;
}

/** Pure: the weekday of an ISO date, 0 = Sunday (no clock involved). */
export function weekdayOf(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** Pure: does the person work on this date? */
export const worksOn = (schedule: Schedule, iso: string): boolean =>
  schedule.days.includes(weekdayOf(iso));

/** Pure: do the stretches [a, a+la) and [b, b+lb) share any minute? */
export const overlaps = (
  a: number,
  la: number,
  b: number,
  lb: number,
): boolean => a < b + lb && b < a + la;

/**
 * Pure: the start times of a day for a service that lasts `duration` minutes:
 * every `step` minutes, the whole service inside the working hours and not
 * across the break. A day off has none.
 */
export function slotTimes(
  schedule: Schedule,
  iso: string,
  duration: number,
): string[] {
  if (!worksOn(schedule, iso)) return [];
  const open = toMinutes(schedule.open);
  const close = toMinutes(schedule.close);
  const times: string[] = [];
  for (let t = open; t + duration <= close; t += schedule.step) {
    if (
      schedule.breakFrom &&
      schedule.breakTo &&
      overlaps(
        t,
        duration,
        toMinutes(schedule.breakFrom),
        toMinutes(schedule.breakTo) - toMinutes(schedule.breakFrom),
      )
    ) {
      continue;
    }
    times.push(fromMinutes(t));
  }
  return times;
}

/** Pure: a small deterministic hash, so "already taken" does not need a random. */
export function hashOf(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Pure: the stretches of a day that other clients have taken, derived from the
 * person and the date: about one half hour in three is gone, always the same.
 */
export function takenBy(schedule: Schedule, who: string, iso: string): Busy[] {
  const busy: Busy[] = [];
  const open = toMinutes(schedule.open);
  const close = toMinutes(schedule.close);
  for (let t = open; t + 30 <= close; t += 30) {
    if (hashOf(`${who}|${iso}|${t}`) % 3 === 0) {
      busy.push({ start: fromMinutes(t), duration: 30 });
    }
  }
  return busy;
}

/** Pure: is a service of `duration` minutes starting at `time` blocked? */
export function isBusy(time: string, duration: number, busy: Busy[]): boolean {
  const t = toMinutes(time);
  return busy.some((b) =>
    overlaps(t, duration, toMinutes(b.start), b.duration),
  );
}

/** Pure: the buttons of the grid: every start time with taken / selected. */
export function slotStates(
  times: string[],
  duration: number,
  busy: Busy[],
  selected: string,
): Slot[] {
  return times.map((time) => ({
    time,
    label: clock12(time),
    taken: isBusy(time, duration, busy),
    selected: time === selected,
  }));
}

/** Pure: `30` → `30 min`, `90` → `1 h 30 min`. */
export function durationLabel(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h === 0 ? `${m} min` : m === 0 ? `${h} h` : `${h} h ${m} min`;
}

export interface TimeSlotsPageState {
  slots: Slot[];
  selected: string;
  empty: string;
  sunday: Slot[];
}

const SCHEDULE: Schedule = {
  days: [1, 2, 3, 4, 5, 6],
  open: "09:00",
  close: "18:00",
  breakFrom: "13:00",
  breakTo: "14:00",
  step: 30,
};
const DAY = "2026-11-04";
const DURATION = 45;

const demo = (selected: string): Slot[] =>
  slotStates(
    slotTimes(SCHEDULE, DAY, DURATION),
    DURATION,
    takenBy(SCHEDULE, "marco", DAY),
    selected,
  );

export const initial: TimeSlotsPageState = {
  slots: demo("10:30"),
  selected: "10:30",
  empty: "No free times on this day.",
  sunday: [],
};

export class TimeSlotsPage extends Component<TimeSlotsPageState> {
  view = view;

  "slots.pick"(msg: Message): Effect[] {
    const time = msg.payload as string;
    return [store.set("selected", time), store.set("slots", demo(time))];
  }
}

export const page = new TimeSlotsPage();
