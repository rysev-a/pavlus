import type { Tone } from "../admin-shell/shell.ts";

export type FieldKind =
  | "text"
  | "number"
  | "date"
  | "email"
  | "select"
  | "textarea";

export interface Option {
  value: string;
  label: string;
  selected: boolean;
}

export interface Field {
  id: string;
  label: string;
  kind: FieldKind;
  value: string;
  placeholder: string;
  hint: string;
  error: string;
  options: Option[];
}

export interface Detail {
  label: string;
  value: string;
  /** A tone makes the value a pill. */
  tone: Tone | "";
}

export interface SheetButton {
  id: string;
  label: string;
  variant: "default" | "outline" | "destructive" | "secondary";
}

/** Pure: a form field. */
export function field(
  id: string,
  label: string,
  value: string | number,
  opts: Partial<Omit<Field, "id" | "label" | "value">> = {},
): Field {
  return {
    kind: "text",
    placeholder: "",
    hint: "",
    error: "",
    options: [],
    ...opts,
    id,
    label,
    value: String(value),
  };
}

/** Pure: a select field from `[value, label]` pairs. */
export function selectField(
  id: string,
  label: string,
  value: string,
  choices: [string, string][],
  hint = "",
): Field {
  return field(id, label, value, {
    kind: "select",
    hint,
    options: choices.map(([v, l]) => ({
      value: v,
      label: l,
      selected: v === value,
    })),
  });
}

export const detail = (
  label: string,
  value: string | number,
  tone: Tone | "" = "",
): Detail => ({ label, value: String(value), tone });

export const button = (
  id: string,
  label: string,
  variant: SheetButton["variant"] = "default",
): SheetButton => ({ id, label, variant });

/** Pure: the draft values as an object, by field id. */
export function valuesOf(fields: Field[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of fields) out[f.id] = f.value;
  return out;
}

/** Pure: the fields with one value changed (a select keeps its options in step). */
export function withValue(fields: Field[], id: string, value: string): Field[] {
  return fields.map((f) =>
    f.id !== id
      ? f
      : {
          ...f,
          value,
          error: "",
          options: f.options.map((o) => ({
            ...o,
            selected: o.value === value,
          })),
        },
  );
}

/** Pure: the fields with errors set by id (a field not named has none). */
export function withErrors(
  fields: Field[],
  errors: Record<string, string>,
): Field[] {
  return fields.map((f) => ({ ...f, error: errors[f.id] ?? "" }));
}

/** Pure: do the errors say the form is fine? */
export const isValid = (errors: Record<string, string>): boolean =>
  Object.keys(errors).length === 0;

/** Pure: a positive number in a text field, or null. */
export function positive(text: string, allowZero = false): number | null {
  const n = Number(text);
  if (text.trim() === "" || !Number.isFinite(n)) return null;
  return n > 0 || (allowZero && n === 0) ? n : null;
}
