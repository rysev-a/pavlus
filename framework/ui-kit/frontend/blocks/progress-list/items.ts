import { clampPct, loadTone, type Tone } from "../admin-shell/shell.ts";

export interface Item {
  id: string;
  label: string;
  /** The value as text: `64%`, `120 / 200`. */
  text: string;
  pct: number;
  tone: Tone;
  sub: string;
}

/** Pure: an item from a value and its limit; the tone follows the load unless given. */
export function item(
  id: string,
  label: string,
  value: number,
  max: number,
  opts: { tone?: Tone; text?: string; sub?: string; invert?: boolean } = {},
): Item {
  const pct = max <= 0 ? 0 : clampPct((value / max) * 100);
  const tone = opts.tone ?? (opts.invert ? loadTone(100 - pct) : loadTone(pct));
  return {
    id,
    label,
    pct,
    tone,
    text: opts.text ?? `${value} / ${max}`,
    sub: opts.sub ?? "",
  };
}
