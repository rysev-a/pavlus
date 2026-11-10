/**
 * The logic of a create / update form built from a list of field definitions:
 * the draft (what the inputs hold, as text), the view the part shows, the
 * validation, and the row the draft becomes. Pure: nothing here touches the
 * page or a database; `ctx` is whatever the options and rules need to look at.
 */

export type FieldKind =
  | "text"
  | "email"
  | "number"
  | "textarea"
  | "select"
  | "checks"
  | "switch"
  | "date"
  | "readonly"
  | "lines";

export interface LineDraft {
  productId: string;
  qty: string;
  price: string;
}

/** What the inputs hold: text for inputs and selects, ids for checks, a flag for a switch. */
export type DraftValue = string | boolean | string[] | LineDraft[];
export type Draft = Record<string, DraftValue>;

export interface Option {
  value: string;
  label: string;
}

export interface FieldDef<Ctx = unknown> {
  key: string;
  label: string;
  kind: FieldKind;
  required?: boolean;
  placeholder?: string;
  hint?: string;
  step?: string;
  min?: number;
  max?: number;
  rows?: number;
  /** ids are numbers: a select or a list of checks parses back to numbers */
  numeric?: boolean;
  /** the choices of a select, the checks, or the products of a `lines` field */
  options?: (ctx: Ctx) => Option[];
  /** a `lines` field: the unit price of a product, as text */
  priceOf?: (productId: string, ctx: Ctx) => string;
  /** the row's value as a draft value (default: by kind) */
  toDraft?: (row: Record<string, unknown>, ctx: Ctx) => DraftValue;
  /** the draft's value as the row's value (default: by kind) */
  fromDraft?: (value: DraftValue, draft: Draft, ctx: Ctx) => unknown;
  /** an error message for a value that is wrong in a way the kind does not know, else "" */
  validate?: (value: DraftValue, draft: Draft, ctx: Ctx) => string;
}

// ---- the view ----

export interface FieldView {
  key: string;
  label: string;
  kind: FieldKind;
  /** The kind flags the template branches on (the kinds in their order). */
  isTextarea: boolean;
  isSelect: boolean;
  isSwitch: boolean;
  isChecks: boolean;
  isLines: boolean;
  isReadonly: boolean;
  /** The `type` of the plain input (number, email or text). */
  type: string;
  value: string;
  checked: boolean;
  options: { value: string; label: string; selected: boolean }[];
  lines: {
    i: number;
    productId: string;
    qty: string;
    price: string;
    sum: string;
    options: { value: string; label: string; selected: boolean }[];
  }[];
  /** `3 of 100 chosen` for checks, the total for lines */
  count: string;
  error: string;
  /** The `data-invalid` and `aria-invalid` of the field (from `error`). */
  invalid: "true" | null;
  hint: string;
  /** The description under the field shows (a hint that is not a switch's). */
  hasDescription: boolean;
  placeholder: string;
  required: boolean;
  step: string;
  rows: number;
}

const str = (v: DraftValue | undefined): string =>
  typeof v === "string" ? v : "";
const ids = (v: DraftValue | undefined): string[] =>
  Array.isArray(v) && typeof v[0] !== "object" ? (v as string[]) : [];
const lineList = (v: DraftValue | undefined): LineDraft[] =>
  Array.isArray(v)
    ? (v as LineDraft[]).filter((x) => typeof x === "object")
    : [];

/** `1234.5` becomes `$1,234.50`. */
export function dollars(n: number): string {
  const [whole, cents] = Math.abs(n).toFixed(2).split(".");
  return `${n < 0 ? "-" : ""}$${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}.${cents}`;
}

const lineSum = (l: LineDraft): number =>
  (Number(l.qty) || 0) * (Number(l.price) || 0);

/** Pure: the fields as the part shows them. */
export function fieldsView<Ctx>(
  defs: FieldDef<Ctx>[],
  draft: Draft,
  errors: Record<string, string>,
  ctx: Ctx,
): FieldView[] {
  return defs.map((d) => {
    const options = d.options?.(ctx) ?? [];
    const value = draft[d.key];
    const chosen = new Set(ids(value));
    const lines = lineList(value);
    return {
      key: d.key,
      label: d.label,
      kind: d.kind,
      isTextarea: d.kind === "textarea",
      isSelect: d.kind === "select",
      isSwitch: d.kind === "switch",
      isChecks: d.kind === "checks",
      isLines: d.kind === "lines",
      isReadonly: d.kind === "readonly",
      type:
        d.kind === "number" ? "number" : d.kind === "email" ? "email" : "text",
      value: str(value),
      checked: value === true,
      options: options.map((o) => ({
        ...o,
        selected:
          d.kind === "checks" ? chosen.has(o.value) : o.value === str(value),
      })),
      lines: lines.map((l, i) => ({
        i,
        productId: l.productId,
        qty: l.qty,
        price: l.price,
        sum: dollars(lineSum(l)),
        options: options.map((o) => ({
          ...o,
          selected: o.value === l.productId,
        })),
      })),
      count:
        d.kind === "checks"
          ? `${chosen.size} of ${options.length} chosen`
          : d.kind === "lines"
            ? `Total ${dollars(lines.reduce((s, l) => s + lineSum(l), 0))}`
            : "",
      error: errors[d.key] ?? "",
      invalid: errors[d.key] ? "true" : null,
      hint: d.hint ?? "",
      hasDescription: Boolean(d.hint) && d.kind !== "switch",
      placeholder: d.placeholder ?? "",
      required: d.required === true,
      step: d.step ?? "1",
      rows: d.rows ?? 3,
    };
  });
}

// ---- row <-> draft ----

function defaultDraft<Ctx>(d: FieldDef<Ctx>, raw: unknown): DraftValue {
  switch (d.kind) {
    case "switch":
      return raw === true;
    case "checks":
      return Array.isArray(raw) ? raw.map(String) : [];
    case "lines":
      return Array.isArray(raw)
        ? (raw as { productId: number; qty: number; price: number }[]).map(
            (l) => ({
              productId: String(l.productId),
              qty: String(l.qty),
              price: String(l.price),
            }),
          )
        : [];
    default:
      return raw === undefined || raw === null ? "" : String(raw);
  }
}

/** Pure: the draft for a row (or for a new one: `row` is the defaults). */
export function draftOf<Ctx>(
  defs: FieldDef<Ctx>[],
  row: Record<string, unknown>,
  ctx: Ctx,
): Draft {
  const draft: Draft = {};
  for (const d of defs) {
    draft[d.key] = d.toDraft
      ? d.toDraft(row, ctx)
      : defaultDraft(d, row[d.key]);
  }
  return draft;
}

/** Pure: the row a valid draft stands for (fields that are not in the form keep `base`). */
export function rowOf<Ctx>(
  defs: FieldDef<Ctx>[],
  draft: Draft,
  base: Record<string, unknown>,
  ctx: Ctx,
): Record<string, unknown> {
  const row = { ...base };
  for (const d of defs) {
    if (d.kind === "readonly") continue;
    const v = draft[d.key];
    if (d.fromDraft) {
      row[d.key] = d.fromDraft(v, draft, ctx);
      continue;
    }
    switch (d.kind) {
      case "switch":
        row[d.key] = v === true;
        break;
      case "checks":
        row[d.key] = d.numeric ? ids(v).map(Number) : ids(v);
        break;
      case "lines":
        row[d.key] = lineList(v).map((l) => ({
          productId: Number(l.productId),
          qty: Number(l.qty),
          price: Number(l.price),
        }));
        break;
      case "number":
        row[d.key] = Number(str(v));
        break;
      case "select":
        row[d.key] = d.numeric ? Number(str(v)) : str(v);
        break;
      default:
        row[d.key] = str(v).trim();
    }
  }
  return row;
}

// ---- validation ----

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Pure: an error message per field that is wrong (a valid draft gives `{}`). */
export function validateDraft<Ctx>(
  defs: FieldDef<Ctx>[],
  draft: Draft,
  ctx: Ctx,
): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const d of defs) {
    const v = draft[d.key];
    let error = "";
    if (d.kind === "readonly" || d.kind === "switch") {
      // nothing to check
    } else if (d.kind === "lines") {
      const lines = lineList(v);
      if (lines.length === 0)
        error = `Add at least one ${d.label.toLowerCase()} line`;
      else {
        const options = new Set((d.options?.(ctx) ?? []).map((o) => o.value));
        lines.forEach((l, i) => {
          if (!error && !options.has(l.productId))
            error = `Line ${i + 1}: choose a product`;
          if (
            !error &&
            !(Number.isInteger(Number(l.qty)) && Number(l.qty) >= 1)
          )
            error = `Line ${i + 1}: the quantity is a whole number from 1`;
          if (!error && !(Number(l.price) >= 0 && l.price.trim() !== ""))
            error = `Line ${i + 1}: the price is a number`;
        });
      }
    } else if (d.kind === "checks") {
      if (d.required && ids(v).length === 0) error = `Choose at least one`;
    } else {
      const s = str(v).trim();
      if (d.required && s === "") error = `${d.label} is required`;
      else if (s !== "") {
        if (d.kind === "email" && !EMAIL.test(s))
          error = "That is not an email address";
        else if (d.kind === "number") {
          const n = Number(s);
          if (!Number.isFinite(n)) error = "That is not a number";
          else if (d.min !== undefined && n < d.min)
            error = `At least ${d.min}`;
          else if (d.max !== undefined && n > d.max) error = `At most ${d.max}`;
        } else if (d.kind === "select" && d.options) {
          if (!d.options(ctx).some((o) => o.value === s))
            error = `Choose one of the options`;
        } else if (d.kind === "date" && !/^\d{4}-\d{2}-\d{2}/.test(s))
          error = "Use the form 2026-03-14";
      }
    }
    if (!error && d.validate && v !== undefined)
      error = d.validate(v, draft, ctx);
    if (error) errors[d.key] = error;
  }
  return errors;
}

// ---- changes ----

/** Pure: a message of the form changes the draft. */
export function reduceDraft<Ctx>(
  defs: FieldDef<Ctx>[],
  draft: Draft,
  msg: string,
  payload: unknown,
  event: { value?: string; checked?: boolean } | undefined,
  ctx: Ctx,
): Draft {
  const next = { ...draft };
  const key = Array.isArray(payload)
    ? String(payload[0])
    : String(payload ?? "");
  const def = defs.find((d) => d.key === key);
  switch (msg) {
    case "change":
      next[key] = event?.value ?? "";
      break;
    case "toggle":
      next[key] = event?.checked === true;
      break;
    case "check": {
      const [, value] = payload as [string, string];
      const set = new Set(ids(draft[key]));
      if (event?.checked) set.add(value);
      else set.delete(value);
      next[key] = [...set];
      break;
    }
    case "checkAll":
      next[key] = (def?.options?.(ctx) ?? []).map((o) => o.value);
      break;
    case "checkNone":
      next[key] = [];
      break;
    case "lineAdd": {
      const first = def?.options?.(ctx)[0]?.value ?? "";
      next[key] = [
        ...lineList(draft[key]),
        {
          productId: first,
          qty: "1",
          price: def?.priceOf?.(first, ctx) ?? "0",
        },
      ];
      break;
    }
    case "lineRemove": {
      const [, i] = payload as [string, number];
      next[key] = lineList(draft[key]).filter((_, j) => j !== i);
      break;
    }
    case "lineSet": {
      const [, i, part] = payload as [
        string,
        number,
        "productId" | "qty" | "price",
      ];
      next[key] = lineList(draft[key]).map((l, j) => {
        if (j !== i) return l;
        const value = event?.value ?? "";
        return part === "productId"
          ? {
              ...l,
              productId: value,
              price: def?.priceOf?.(value, ctx) ?? l.price,
            }
          : { ...l, [part]: value };
      });
      break;
    }
  }
  return next;
}
