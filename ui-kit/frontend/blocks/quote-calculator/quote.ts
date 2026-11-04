import { money } from "../admin-shell/shell.ts";
import { MODES, type Mode } from "../shipment-tracker/tracker.ts";

/** What the form holds, as typed. */
export interface QuoteForm {
  weight: string;
  volume: string;
  distance: string;
  mode: Mode;
  declared: string;
  insured: boolean;
  express: boolean;
}

export interface QuoteInput {
  /** kg */
  weight: number;
  /** m3 */
  volume: number;
  /** km */
  distance: number;
  mode: Mode;
  /** The value of the goods in euros, for the insurance. */
  declared: number;
  insured: boolean;
  express: boolean;
}

interface ModeRates {
  /** kg that one m3 counts for. */
  volumetric: number;
  /** euros per tonne and km. */
  perTonneKm: number;
  base: number;
  min: number;
  /** km covered in a day on the move. */
  kmPerDay: number;
  handlingDays: number;
  fuel: number;
}

export const RATES: Record<Mode, ModeRates> = {
  road: {
    volumetric: 333,
    perTonneKm: 0.11,
    base: 45,
    min: 90,
    kmPerDay: 650,
    handlingDays: 1,
    fuel: 0.08,
  },
  rail: {
    volumetric: 250,
    perTonneKm: 0.06,
    base: 60,
    min: 120,
    kmPerDay: 500,
    handlingDays: 2,
    fuel: 0.05,
  },
  sea: {
    volumetric: 1000,
    perTonneKm: 0.018,
    base: 120,
    min: 150,
    kmPerDay: 700,
    handlingDays: 4,
    fuel: 0.06,
  },
  air: {
    volumetric: 167,
    perTonneKm: 0.62,
    base: 85,
    min: 160,
    kmPerDay: 7000,
    handlingDays: 1,
    fuel: 0.14,
  },
};

export const EXPRESS_SHARE = 0.25;
export const INSURANCE_SHARE = 0.006;

export interface QuoteLine {
  label: string;
  value: string;
  strong: boolean;
}

export interface Quote {
  /** The weight the price is worked out from, kg. */
  chargeable: number;
  basis: "weight" | "volume";
  freight: number;
  fuel: number;
  insurance: number;
  express: number;
  total: number;
  totalText: string;
  days: number;
  lines: QuoteLine[];
  perKg: string;
}

const cents = (n: number): number => Math.round(n * 100) / 100;

/** Pure: kg to pay for: the real weight or the space taken, whichever is more. */
export function chargeableWeight(
  weight: number,
  volume: number,
  mode: Mode,
): { kg: number; basis: "weight" | "volume" } {
  const volumetric = volume * RATES[mode].volumetric;
  return volumetric > weight
    ? { kg: Math.round(volumetric), basis: "volume" }
    : { kg: weight, basis: "weight" };
}

/** Pure: the price and the time of a shipment. */
export function quote(input: QuoteInput): Quote {
  const r = RATES[input.mode];
  const { kg, basis } = chargeableWeight(
    input.weight,
    input.volume,
    input.mode,
  );
  const distanceCharge = (kg / 1000) * input.distance * r.perTonneKm;
  const freight = cents(Math.max(r.min, r.base + distanceCharge));
  const fuel = cents(freight * r.fuel);
  const express = input.express ? cents(freight * EXPRESS_SHARE) : 0;
  const insurance = input.insured ? cents(input.declared * INSURANCE_SHARE) : 0;
  const total = cents(freight + fuel + express + insurance);
  const travel = Math.ceil(input.distance / r.kmPerDay);
  const days = Math.max(1, travel + r.handlingDays - (input.express ? 1 : 0));
  const lines: QuoteLine[] = [
    {
      label: `Freight, ${kg.toLocaleString("en-US")} kg by ${basis}`,
      value: money(freight, "€"),
      strong: false,
    },
    {
      label: `Fuel surcharge, ${Math.round(r.fuel * 100)}%`,
      value: money(fuel, "€"),
      strong: false,
    },
  ];
  if (input.express) {
    lines.push({
      label: "Express handling, 25%",
      value: money(express, "€"),
      strong: false,
    });
  }
  if (input.insured) {
    lines.push({
      label: `Insurance, ${INSURANCE_SHARE * 100}% of ${money(input.declared, "€", 0)}`,
      value: money(insurance, "€"),
      strong: false,
    });
  }
  lines.push({ label: "Total", value: money(total, "€"), strong: true });
  return {
    chargeable: kg,
    basis,
    freight,
    fuel,
    insurance,
    express,
    total,
    totalText: money(total, "€"),
    days,
    lines,
    perKg: money(cents(total / Math.max(1, input.weight)), "€"),
  };
}

const num = (text: string): number =>
  text.trim() === "" ? Number.NaN : Number(text.replace(",", "."));

/** Pure: the input from the form, or the errors by field. */
export function parseForm(form: QuoteForm): {
  input: QuoteInput | null;
  errors: Record<string, string>;
} {
  const errors: Record<string, string> = {};
  const weight = num(form.weight);
  const volume = form.volume.trim() === "" ? 0 : num(form.volume);
  const distance = num(form.distance);
  const declared = form.insured ? num(form.declared) : 0;
  if (!Number.isFinite(weight) || weight <= 0) {
    errors.weight = "Enter the weight in kilograms.";
  } else if (weight > 30000) errors.weight = "A shipment is at most 30,000 kg.";
  else if (form.mode === "air" && weight > 5000) {
    errors.weight = "Air freight is limited to 5,000 kg.";
  }
  if (!Number.isFinite(volume) || volume < 0) {
    errors.volume = "The volume cannot be negative.";
  } else if (volume > 120) errors.volume = "At most 120 m3.";
  if (!Number.isFinite(distance) || distance <= 0) {
    errors.distance = "Enter the distance in kilometres.";
  } else if (distance > 20000) errors.distance = "At most 20,000 km.";
  else if (form.mode === "sea" && distance < 300) {
    errors.distance = "Sea routes start at 300 km.";
  } else if (form.mode === "road" && distance > 6000) {
    errors.distance = "Road routes are at most 6,000 km.";
  }
  if (form.insured && (!Number.isFinite(declared) || declared <= 0)) {
    errors.declared = "Enter the value of the goods to insure.";
  }
  if (Object.keys(errors).length > 0) return { input: null, errors };
  return {
    input: {
      weight,
      volume,
      distance,
      mode: form.mode,
      declared,
      insured: form.insured,
      express: form.express && (form.mode === "road" || form.mode === "air"),
    },
    errors,
  };
}

export interface ModeChoice {
  id: Mode;
  label: string;
  icon: string;
  active: boolean;
}

export const modeChoices = (active: Mode): ModeChoice[] =>
  MODES.map((m) => ({ ...m, active: m.id === active }));

/** Pure: everything the view shows for a form. */
export function quoteView(form: QuoteForm): {
  errors: Record<string, string>;
  quote: Quote | null;
  modes: ModeChoice[];
  canExpress: boolean;
} {
  const { input, errors } = parseForm(form);
  return {
    errors,
    quote: input ? quote(input) : null,
    modes: modeChoices(form.mode),
    canExpress: form.mode === "road" || form.mode === "air",
  };
}
