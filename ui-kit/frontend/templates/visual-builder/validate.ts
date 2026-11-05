// Validation of the fields of a Form element. Pure.
import type { FormField } from "./model.ts";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** The error message of one field ("" when the value is fine). */
export function validateField(f: FormField, value: unknown): string {
  const text = value === null || value === undefined ? "" : String(value);
  const custom = (fallback: string): string => f.message || fallback;
  if (f.type === "checkbox") {
    return f.required === "yes" && value !== true ? custom(`${f.label} is required`) : "";
  }
  if (text.trim() === "") return f.required === "yes" ? custom(`${f.label} is required`) : "";
  if (f.type === "email" && !EMAIL.test(text)) return custom("Enter a valid email");
  if (f.type === "number") {
    const n = Number(text);
    if (!Number.isFinite(n)) return custom("Enter a number");
    if (f.min !== "" && n < Number(f.min)) return custom(`Must be at least ${f.min}`);
    if (f.max !== "" && n > Number(f.max)) return custom(`Must be at most ${f.max}`);
  }
  if (f.minLength !== "" && text.length < Number(f.minLength))
    return custom(`At least ${f.minLength} characters`);
  if (f.maxLength !== "" && text.length > Number(f.maxLength))
    return custom(`At most ${f.maxLength} characters`);
  if (f.pattern !== "") {
    try {
      if (!new RegExp(f.pattern).test(text)) return custom(`${f.label} has the wrong format`);
    } catch {
      return "";
    }
  }
  return "";
}

/** The errors of the fields that fail, by field name. */
export function validateForm(
  fields: FormField[],
  values: Record<string, unknown> | null | undefined,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of fields) {
    const e = validateField(f, values?.[f.name]);
    if (e) out[f.name] = e;
  }
  return out;
}
