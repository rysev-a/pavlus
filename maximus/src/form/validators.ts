/**
 * Validators: `(value, ctx) => message | undefined`, sync or async. Built-ins
 * skip empty values (use `required()` to demand one), so they compose.
 *
 * @module
 */
import { deepEqual, getAt, parsePath } from "./paths.ts";

/** What a validator can return: an error message (or several), or nothing when the value is fine. */
export type ValidationResult =
  string | readonly string[] | null | undefined | false | void;

export interface ValidatorContext<T = unknown> {
  /** The whole form data at the time of validation. */
  values: T;
  /** The path being validated. */
  path: string;
  /** Aborted when a newer validation of the same field starts (pass it to `fetch`). */
  signal: AbortSignal;
}

export type Validator<V = unknown, T = unknown> = (
  value: V,
  ctx: ValidatorContext<T>,
) => ValidationResult | Promise<ValidationResult>;

export function isEmpty(v: unknown): boolean {
  return (
    v === undefined ||
    v === null ||
    v === "" ||
    (typeof v === "number" && Number.isNaN(v)) ||
    (Array.isArray(v) && v.length === 0)
  );
}

/** Fails for empty values: `undefined`, `null`, blank strings, `[]`, `NaN` and `false` (an unchecked box). */
export function required(message = "This field is required"): Validator {
  return (v) => {
    if (isEmpty(v) || v === false || (typeof v === "string" && v.trim() === ""))
      return message;
  };
}

export function minLength(n: number, message?: string): Validator {
  return (v) => {
    if (isEmpty(v)) return;
    const len = (v as { length?: number }).length ?? String(v).length;
    if (len < n) return message ?? `Must be at least ${n} characters`;
  };
}

export function maxLength(n: number, message?: string): Validator {
  return (v) => {
    if (isEmpty(v)) return;
    const len = (v as { length?: number }).length ?? String(v).length;
    if (len > n) return message ?? `Must be at most ${n} characters`;
  };
}

export function pattern(re: RegExp, message = "Invalid format"): Validator {
  return (v) => {
    if (isEmpty(v)) return;
    re.lastIndex = 0;
    if (!re.test(String(v))) return message;
  };
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export function email(message = "Enter a valid email address"): Validator {
  return (v) => {
    if (isEmpty(v)) return;
    if (!EMAIL.test(String(v))) return message;
  };
}

export function min(n: number, message?: string): Validator {
  return (v) => {
    if (isEmpty(v)) return;
    if (!(Number(v) >= n)) return message ?? `Must be at least ${n}`;
  };
}

export function max(n: number, message?: string): Validator {
  return (v) => {
    if (isEmpty(v)) return;
    if (!(Number(v) <= n)) return message ?? `Must be at most ${n}`;
  };
}

/** The value must equal another field's value (e.g. password confirmation). Re-validate it when the other field changes. */
export function equalsField(path: string, message?: string): Validator {
  return (v, ctx) => {
    if (!deepEqual(v, getAt(ctx.values, parsePath(path))))
      return message ?? `Must match ${path}`;
  };
}

/** Normalise a validator result to a list of messages. */
export function toMessages(r: ValidationResult): string[] {
  if (r === undefined || r === null || r === false) return [];
  return typeof r === "string"
    ? r === ""
      ? []
      : [r]
    : r.filter((m) => m !== "");
}
