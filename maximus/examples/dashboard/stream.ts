import { batch, effect, onCleanup, signal } from "../../src/mod.ts";
import type { Slice } from "./charts.ts";

export interface Sale {
  id: number;
  region: string;
  category: string;
  amount: number;
  at: number;
}

export const regions = ["North", "South", "East", "West"] as const;
export const categories = ["Tea", "Coffee", "Gear"] as const;

/** A small deterministic PRNG so runs (and tests) are repeatable. */
export function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface Feed {
  sales: () => readonly Sale[];
  perTick: () => readonly number[];
  byRegion: () => Slice[];
  byCategory: () => Slice[];
  running: () => boolean;
  intervalMs: () => number;
  setRunning(on: boolean): void;
  setInterval(ms: number): void;
  /** Produce one tick of sales now (the timer calls this). */
  tick(): void;
  reset(): void;
}

/**
 * A live feed of sales. Call it under an owner: the timer is stopped by
 * `onCleanup` when the dashboard is unmounted, and re-armed whenever the
 * speed or the running flag changes.
 */
export function createFeed(
  options: {
    seed?: number;
    keep?: number;
    span?: number;
    start?: boolean;
  } = {},
): Feed {
  const keep = options.keep ?? 60;
  const span = options.span ?? 40;
  const rand = rng(options.seed ?? 7);
  const sales = signal<readonly Sale[]>([]);
  const perTick = signal<readonly number[]>([]);
  const totals = signal({
    region: Object.fromEntries(regions.map((r) => [r, 0])) as Record<
      string,
      number
    >,
    category: Object.fromEntries(categories.map((c) => [c, 0])) as Record<
      string,
      number
    >,
  });
  const running = signal(options.start ?? true);
  const intervalMs = signal(1000);
  let nextId = 1;

  const tick = (): void => {
    const n = 1 + Math.floor(rand() * 3);
    const made: Sale[] = [];
    for (let i = 0; i < n; i++)
      made.push({
        id: nextId++,
        region: regions[Math.floor(rand() * regions.length)]!,
        category: categories[Math.floor(rand() * categories.length)]!,
        amount: Math.round(10 + rand() * 90),
        at: Date.now(),
      });
    batch(() => {
      sales.update((s) => [...made.reverse(), ...s].slice(0, keep));
      perTick.update((p) =>
        [...p, made.reduce((a, m) => a + m.amount, 0)].slice(-span),
      );
      totals.update((t) => {
        const region = { ...t.region };
        const category = { ...t.category };
        for (const m of made) {
          region[m.region]! += m.amount;
          category[m.category]! += m.amount;
        }
        return { region, category };
      });
    });
  };

  // The timer lives in an effect: onCleanup runs before every re-run (speed or pause changed)
  // and when the owner is disposed, so a closed dashboard leaves no interval behind.
  effect(() => {
    const ms = running() ? intervalMs() : 0;
    if (ms <= 0) return;
    const timer = setInterval(tick, ms);
    onCleanup(() => clearInterval(timer));
  });

  return {
    sales,
    perTick,
    byRegion: () =>
      regions.map((key) => ({ key, value: totals().region[key]! })),
    byCategory: () =>
      categories.map((key) => ({ key, value: totals().category[key]! })),
    running,
    intervalMs,
    setRunning: (on) => running.set(on),
    setInterval: (ms) => intervalMs.set(ms),
    tick,
    reset() {
      batch(() => {
        sales.set([]);
        perTick.set([]);
        totals.set({
          region: Object.fromEntries(regions.map((r) => [r, 0])),
          category: Object.fromEntries(categories.map((c) => [c, 0])),
        });
      });
    },
  };
}
