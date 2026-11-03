export interface StageIn {
  id: string;
  label: string;
  count: number;
}

export interface StageView {
  id: string;
  label: string;
  count: number;
  /** Bar width in percent of the widest stage (never below 6). */
  width: number;
  /** The share kept from the stage before, `62%`; empty for the first. */
  kept: string;
  /** How many were lost since the stage before. */
  lost: number;
  step: number;
}

export interface FunnelView {
  stages: StageView[];
  overall: string;
  summary: string;
}

/** Pure: a part of a whole as a rounded percentage (0 when the whole is 0). */
export function rate(part: number, whole: number): number {
  return whole <= 0 ? 0 : Math.round((part / whole) * 100);
}

/** Pure: the funnel; counts are what reached each stage, so they only go down. */
export function funnel(stages: StageIn[]): FunnelView {
  const top = Math.max(1, ...stages.map((s) => s.count));
  const views = stages.map((s, i): StageView => {
    const prev = i === 0 ? s.count : stages[i - 1].count;
    return {
      id: s.id,
      label: s.label,
      count: s.count,
      width: Math.max(6, rate(s.count, top)),
      kept: i === 0 ? "" : `${rate(s.count, prev)}%`,
      lost: i === 0 ? 0 : Math.max(0, prev - s.count),
      step: i,
    };
  });
  const first = stages[0]?.count ?? 0;
  const last = stages[stages.length - 1]?.count ?? 0;
  const overall = first === 0 ? "-" : `${rate(last, first)}%`;
  return {
    stages: views,
    overall,
    summary: `${last} of ${first} reached the last stage`,
  };
}

/**
 * Pure: counts that "reached" each stage from the stage each item is in now.
 * `order` lists the stage ids from first to last; an item in stage k counts
 * for stages 0..k.
 */
export function reached(order: string[], current: string[]): number[] {
  return order.map(
    (_, i) => current.filter((c) => order.indexOf(c) >= i).length,
  );
}
