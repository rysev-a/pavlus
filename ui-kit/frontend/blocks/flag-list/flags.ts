import type { Tone } from "../admin-shell/shell.ts";

export type Env = "prod" | "staging" | "dev";

/** The data: one feature flag. `rollout` is the percentage of users that get it. */
export interface Flag {
  id: string;
  name: string;
  key: string;
  desc: string;
  on: boolean;
  rollout: number;
  env: Env;
  owner: string;
}

export interface RolloutOption {
  value: string;
  label: string;
  selected: boolean;
}

export interface FlagRow {
  id: string;
  name: string;
  key: string;
  desc: string;
  on: boolean;
  owner: string;
  env: string;
  envTone: Tone;
  /** `37% of users`, `Off`, `Everyone`. */
  state: string;
  rolloutPct: number;
  options: RolloutOption[];
}

export const STEPS = [0, 10, 25, 50, 100];

const ENV: Record<Env, [string, Tone]> = {
  prod: ["Production", "destructive"],
  staging: ["Staging", "warning"],
  dev: ["Development", "info"],
};

/** Pure: the sentence that says who sees the feature. */
export function stateOf(flag: Pick<Flag, "on" | "rollout">): string {
  if (!flag.on) return "Off";
  if (flag.rollout >= 100) return "Everyone";
  if (flag.rollout <= 0) return "Nobody yet";
  return `${flag.rollout}% of users`;
}

/** Pure: the select options; an odd rollout value gets an option of its own. */
export function optionsOf(rollout: number): RolloutOption[] {
  const values = STEPS.includes(rollout)
    ? STEPS
    : [...STEPS, rollout].sort((a, b) => a - b);
  return values.map((v) => ({
    value: String(v),
    label: `${v}%`,
    selected: v === rollout,
  }));
}

/** Pure: the rows to show. */
export function flagRows(flags: Flag[]): FlagRow[] {
  return flags.map((f) => ({
    id: f.id,
    name: f.name,
    key: f.key,
    desc: f.desc,
    on: f.on,
    owner: f.owner,
    env: ENV[f.env][0],
    envTone: ENV[f.env][1],
    state: stateOf(f),
    rolloutPct: f.on ? f.rollout : 0,
    options: optionsOf(f.rollout),
  }));
}

/** Pure: switch a flag on or off. */
export function toggleFlag(flags: Flag[], id: string): Flag[] {
  return flags.map((f) => (f.id === id ? { ...f, on: !f.on } : f));
}

/** Pure: change the rollout (kept between 0 and 100; setting it above 0 does not turn the flag on). */
export function setRollout(flags: Flag[], id: string, value: number): Flag[] {
  const rollout = Math.max(0, Math.min(100, Math.round(value) || 0));
  return flags.map((f) => (f.id === id ? { ...f, rollout } : f));
}

/** Pure: how many flags are on. */
export const enabled = (flags: Flag[]): number =>
  flags.filter((f) => f.on).length;
