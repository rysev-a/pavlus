import { Component, type Effect, type Message } from "@pavlus/frontend";
import { storeEffector as store } from "@pavlus/frontend/plugins";
import view from "./credit-card.pavlus";

export type Brand = "visa" | "mastercard" | "amex" | "unknown";
export type Errors = Record<string, string>;
export type Field = "number" | "name" | "expiry" | "cvc";

/** Pure: only the digits of a text. */
export const digitsOf = (text: string): string => text.replace(/\D/g, "");

/** Pure: the brand from the first digits of the number. */
export function brandOf(number: string): Brand {
  const d = digitsOf(number);
  if (/^3[47]/.test(d)) return "amex";
  if (/^4/.test(d)) return "visa";
  const two = Number(d.slice(0, 2));
  const four = Number(d.slice(0, 4));
  if (
    (d.length >= 2 && two >= 51 && two <= 55) ||
    (d.length >= 4 && four >= 2221 && four <= 2720)
  )
    return "mastercard";
  return "unknown";
}

/** Pure: how many digits the number has (Amex 15, others 16). */
export const lengthOf = (brand: Brand): number => (brand === "amex" ? 15 : 16);

/** Pure: how many digits the security code has. */
export const cvcLengthOf = (brand: Brand): number => (brand === "amex" ? 4 : 3);

/** Pure: the number grouped as the card prints it: 4-4-4-4, Amex 4-6-5. */
export function formatNumber(text: string): string {
  const brand = brandOf(text);
  const d = digitsOf(text).slice(0, lengthOf(brand));
  const groups =
    brand === "amex"
      ? [d.slice(0, 4), d.slice(4, 10), d.slice(10, 15)]
      : [d.slice(0, 4), d.slice(4, 8), d.slice(8, 12), d.slice(12, 16)];
  return groups.filter(Boolean).join(" ");
}

/** Pure: an expiry typed as digits becomes `MM/YY`; a first digit above 1 gets a 0. */
export function formatExpiry(text: string): string {
  let d = digitsOf(text).slice(0, 4);
  if (d.length >= 1 && Number(d[0]) > 1) d = "0" + d.slice(0, 3);
  if (d.length >= 2 && Number(d.slice(0, 2)) > 12) d = "12" + d.slice(2);
  return d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d;
}

/** Pure: the Luhn checksum of a number. */
export function luhn(number: string): boolean {
  const d = digitsOf(number);
  if (d.length < 12) return false;
  let sum = 0;
  for (let i = 0; i < d.length; i++) {
    let n = Number(d[d.length - 1 - i]);
    if (i % 2 === 1) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
  }
  return sum % 10 === 0;
}

export interface CardInput {
  number: string;
  name: string;
  expiry: string;
  cvc: string;
}

/** Pure: what is wrong with one field, or "". `today` is `[year, month]`. */
export function fieldError(
  field: Field,
  input: CardInput,
  today: [number, number] = [2026, 11],
): string {
  const brand = brandOf(input.number);
  switch (field) {
    case "number": {
      const d = digitsOf(input.number);
      if (!d) return "Enter the card number.";
      if (d.length < lengthOf(brand)) return "The card number is too short.";
      return luhn(d) ? "" : "This card number is not valid.";
    }
    case "name":
      return /\p{L}{2,}/u.test(input.name) && input.name.trim().includes(" ")
        ? ""
        : "Enter the name as printed on the card.";
    case "expiry": {
      const m = /^(\d{2})\/(\d{2})$/.exec(input.expiry);
      if (!m) return "Use the MM/YY format.";
      const month = Number(m[1]);
      const year = 2000 + Number(m[2]);
      if (month < 1 || month > 12) return "The month must be 01 to 12.";
      if (year < today[0] || (year === today[0] && month < today[1]))
        return "This card has expired.";
      return "";
    }
    case "cvc":
      return digitsOf(input.cvc).length === cvcLengthOf(brand)
        ? ""
        : `The code has ${cvcLengthOf(brand)} digits.`;
  }
}

const FIELDS: Field[] = ["number", "name", "expiry", "cvc"];

/** Pure: the errors of the whole form, by field. */
export function validate(input: CardInput, today?: [number, number]): Errors {
  const errors: Errors = {};
  for (const f of FIELDS) {
    const e = fieldError(f, input, today);
    if (e) errors[f] = e;
  }
  return errors;
}

/** Pure: the text a field shows after typing. */
export function formatField(field: Field, text: string, brand: Brand): string {
  switch (field) {
    case "number":
      return formatNumber(text);
    case "expiry":
      return formatExpiry(text);
    case "cvc":
      return digitsOf(text).slice(0, cvcLengthOf(brand));
    case "name":
      return text.replace(/[^\p{L}\s.'-]/gu, "").slice(0, 26);
  }
}

export interface Preview {
  brand: Brand;
  brandLabel: string;
  /** What the card shows: placeholders fill the missing characters. */
  shownNumber: string;
  shownName: string;
  shownExpiry: string;
  shownCvc: string;
}

export interface CreditCardState extends CardInput, Preview {
  focus: Field | "";
  errors: Errors;
  paid: boolean;
  amount: string;
}

const LABEL: Record<Brand, string> = {
  visa: "VISA",
  mastercard: "Mastercard",
  amex: "AMEX",
  unknown: "",
};

/** Pure: the preview texts derived from the form. */
export function preview(input: CardInput): Preview {
  const brand = brandOf(input.number);
  const mask = brand === "amex" ? "#### ###### #####" : "#### #### #### ####";
  const typed = formatNumber(input.number);
  const size = cvcLengthOf(brand);
  return {
    brand,
    brandLabel: LABEL[brand],
    shownNumber: typed + mask.slice(typed.length).replace(/#/g, "•"),
    shownName: input.name.trim() ? input.name.toUpperCase() : "FULL NAME",
    shownExpiry: input.expiry + "MM/YY".slice(input.expiry.length),
    shownCvc: "•".repeat(input.cvc.length).padEnd(size, "·"),
  };
}

const derived = (input: CardInput): Effect[] =>
  Object.entries(preview(input)).map(([k, v]) => store.set(k, v));

export const initial: CreditCardState = {
  number: "",
  name: "",
  expiry: "",
  cvc: "",
  focus: "",
  errors: {},
  paid: false,
  amount: "$149.00",
  ...preview({ number: "", name: "", expiry: "", cvc: "" }),
};

export class CreditCard extends Component<CreditCardState> {
  view = view;

  /** `setField("number")`: the template names the field. */
  setField(msg: Message, state: CreditCardState): Effect[] {
    const field = msg.payload as Field;
    const typed = String(msg.event?.value ?? "");
    const brand = brandOf(field === "number" ? typed : state.number);
    const text = formatField(field, typed, brand);
    const next: CardInput = {
      number: state.number,
      name: state.name,
      expiry: state.expiry,
      cvc: state.cvc,
      [field]: text,
    };
    // A change of brand can shorten the code: trim it to the new length.
    if (field === "number") {
      next.cvc = state.cvc.slice(0, cvcLengthOf(brandOf(text)));
    }
    const effects: Effect[] = [
      store.set(field, text),
      store.set("paid", false),
      ...derived(next),
    ];
    if (field === "number") effects.push(store.set("cvc", next.cvc));
    // Once a field has an error, keep it up to date while the user types.
    if (state.errors[field] !== undefined) {
      const rest = { ...state.errors };
      const err = fieldError(field, next);
      if (err) rest[field] = err;
      else delete rest[field];
      effects.push(store.set("errors", rest));
    }
    return effects;
  }

  focusField(msg: Message): Effect[] {
    return [store.set("focus", msg.payload as Field)];
  }

  blurField(msg: Message, state: CreditCardState): Effect[] {
    const field = msg.payload as Field;
    const err = fieldError(field, state);
    const errors = { ...state.errors };
    if (err) errors[field] = err;
    else delete errors[field];
    return [
      store.set("focus", state.focus === field ? "" : state.focus),
      store.set("errors", errors),
    ];
  }

  pay(_msg: Message, state: CreditCardState): Effect[] {
    const errors = validate(state);
    return [
      store.set("errors", errors),
      store.set("paid", Object.keys(errors).length === 0),
    ];
  }

  again(): Effect[] {
    return [
      store.set("number", ""),
      store.set("name", ""),
      store.set("expiry", ""),
      store.set("cvc", ""),
      store.set("errors", {}),
      store.set("paid", false),
      ...derived({ number: "", name: "", expiry: "", cvc: "" }),
    ];
  }
}

export const page = new CreditCard();
