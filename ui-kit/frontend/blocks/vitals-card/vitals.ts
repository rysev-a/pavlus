import type { Tone } from "../admin-shell/shell.ts";

export type VState = "low" | "normal" | "high";

/** What a vital sign is: its unit, the normal range and the scale of the gauge. */
export interface VitalDef {
  id: string;
  label: string;
  unit: string;
  /** The normal range. */
  low: number;
  high: number;
  /** The ends of the gauge. */
  min: number;
  max: number;
}

export interface Vital {
  id: string;
  label: string;
  value: string;
  unit: string;
  range: string;
  state: VState;
  flag: string;
  tone: Tone;
  /** The marker, 0 to 100 percent of the gauge. */
  pos: number;
  /** The normal band, percent of the gauge. */
  bandLeft: number;
  bandWidth: number;
}

export const DEFS: Record<string, VitalDef> = {
  hr: {
    id: "hr",
    label: "Heart rate",
    unit: "bpm",
    low: 60,
    high: 100,
    min: 30,
    max: 150,
  },
  temp: {
    id: "temp",
    label: "Temperature",
    unit: "°C",
    low: 36.1,
    high: 37.2,
    min: 34,
    max: 41,
  },
  spo2: {
    id: "spo2",
    label: "Oxygen (SpO2)",
    unit: "%",
    low: 95,
    high: 100,
    min: 80,
    max: 100,
  },
  rr: {
    id: "rr",
    label: "Breathing",
    unit: "/min",
    low: 12,
    high: 20,
    min: 4,
    max: 36,
  },
  sys: {
    id: "sys",
    label: "Systolic",
    unit: "mmHg",
    low: 90,
    high: 120,
    min: 60,
    max: 200,
  },
  dia: {
    id: "dia",
    label: "Diastolic",
    unit: "mmHg",
    low: 60,
    high: 80,
    min: 40,
    max: 120,
  },
  bmi: {
    id: "bmi",
    label: "BMI",
    unit: "kg/m²",
    low: 18.5,
    high: 24.9,
    min: 12,
    max: 40,
  },
};

/** Pure: where a value sits against the normal range. */
export function classify(value: number, low: number, high: number): VState {
  if (value < low) return "low";
  if (value > high) return "high";
  return "normal";
}

const clampPct = (n: number): number => Math.max(0, Math.min(100, n));
const round1 = (n: number): number => Math.round(n * 10) / 10;

/**
 * Pure: the tone of a reading. Normal is green; outside the range is amber;
 * further out than a quarter of the range's width is red.
 */
export function toneOf(value: number, low: number, high: number): Tone {
  const state = classify(value, low, high);
  if (state === "normal") return "success";
  const width = Math.max(high - low, 1);
  const away = state === "low" ? low - value : value - high;
  return away > width * 0.25 ? "destructive" : "warning";
}

const FLAG: Record<VState, string> = {
  low: "Low",
  normal: "Normal",
  high: "High",
};

/** Pure: one vital sign from a value. */
export function vital(def: VitalDef, value: number): Vital {
  const span = def.max - def.min;
  const state = classify(value, def.low, def.high);
  return {
    id: def.id,
    label: def.label,
    value: String(round1(value)),
    unit: def.unit,
    range: `${def.low}–${def.high}`,
    state,
    flag: FLAG[state],
    tone: toneOf(value, def.low, def.high),
    pos: clampPct(((value - def.min) / span) * 100),
    bandLeft: clampPct(((def.low - def.min) / span) * 100),
    bandWidth: clampPct(((def.high - def.low) / span) * 100),
  };
}

const WORSE: Tone[] = ["success", "warning", "destructive"];

/** Pure: blood pressure as one vital: `128/82`, flagged by the worse of the two numbers. */
export function bloodPressure(sys: number, dia: number): Vital {
  const s = vital(DEFS.sys, sys);
  const d = vital(DEFS.dia, dia);
  const worse = WORSE.indexOf(d.tone) > WORSE.indexOf(s.tone) ? d : s;
  return {
    ...worse,
    id: "bp",
    label: "Blood pressure",
    value: `${sys}/${dia}`,
    unit: "mmHg",
    range: "90–120 / 60–80",
  };
}

/** Pure: body mass index, one decimal. */
export function bmi(kg: number, cm: number): number {
  if (cm <= 0) return 0;
  const m = cm / 100;
  return round1(kg / (m * m));
}

/** Pure: a reading of the standard set, in the order a nurse writes it. */
export function readings(r: {
  sys: number;
  dia: number;
  hr: number;
  temp: number;
  spo2: number;
  rr: number;
}): Vital[] {
  return [
    bloodPressure(r.sys, r.dia),
    vital(DEFS.hr, r.hr),
    vital(DEFS.temp, r.temp),
    vital(DEFS.spo2, r.spo2),
    vital(DEFS.rr, r.rr),
  ];
}

/** Pure: how many readings are outside the normal range. */
export const flagged = (items: Vital[]): number =>
  items.filter((v) => v.state !== "normal").length;
