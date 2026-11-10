/** The clock the time plugin runs on; tests inject a fake one. */
export interface Clock {
  now(): number;
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

export const systemClock: Clock = {
  now: () => Date.now(),
  setTimeout: (fn, ms) => {
    const h = globalThis.setTimeout(fn, ms);
    return h;
  },
  clearTimeout: (h) =>
    globalThis.clearTimeout(h as ReturnType<typeof setTimeout>),
};

export interface FakeClock extends Clock {
  /** Moves time forward, firing due timers in order. */
  advance(ms: number): void;
  pending(): number;
}

export function createFakeClock(start = 0): FakeClock {
  let t = start;
  let seq = 0;
  const timers = new Map<number, { at: number; fn: () => void }>();
  return {
    now: () => t,
    setTimeout(fn, ms) {
      const id = ++seq;
      timers.set(id, { at: t + Math.max(0, ms), fn });
      return id;
    },
    clearTimeout(h) {
      timers.delete(h as number);
    },
    advance(ms) {
      const end = t + ms;
      for (;;) {
        let best: [number, { at: number; fn: () => void }] | undefined;
        for (const e of timers)
          if (e[1].at <= end && (!best || e[1].at < best[1].at)) best = e;
        if (!best) break;
        timers.delete(best[0]);
        t = Math.max(t, best[1].at);
        best[1].fn();
      }
      t = end;
    },
    pending: () => timers.size,
  };
}
