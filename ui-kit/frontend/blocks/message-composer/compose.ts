/** A merge field in a message: `{first_name}`. */
export const FIELDS = [
  "first_name",
  "start_date",
  "manager",
  "buddy",
  "office",
] as const;

export type Values = Record<string, string>;

export interface MessageTemplate {
  id: string;
  label: string;
  subject: string;
  body: string;
}

const TOKEN = /\{([a-z_]+)\}/g;

/** Pure: the text with every known field replaced (unknown ones are kept). */
export function fill(text: string, values: Values): string {
  return text.replace(TOKEN, (whole, key: string) =>
    key in values ? values[key] : whole,
  );
}

/** Pure: the fields in the text that no value exists for. */
export function unknownFields(text: string, values: Values): string[] {
  const found = new Set<string>();
  for (const m of text.matchAll(TOKEN)) {
    if (!(m[1] in values)) found.add(`{${m[1]}}`);
  }
  return [...found];
}

/** Pure: the text with a field added at the end (on a new line if it is not empty). */
export function insertField(body: string, field: string): string {
  const token = `{${field}}`;
  if (body === "") return token;
  return /\s$/.test(body) ? `${body}${token}` : `${body} ${token}`;
}

export interface Errors {
  subject: string;
  body: string;
}

export function validateMessage(
  subject: string,
  body: string,
  values: Values,
): Errors {
  const unknown = unknownFields(`${subject}\n${body}`, values);
  return {
    subject: subject.trim() === "" ? "Write a subject." : "",
    body:
      body.trim().length < 20
        ? "The message is too short (at least 20 letters)."
        : unknown.length > 0
          ? `Unknown field: ${unknown.join(", ")}.`
          : "",
  };
}

export const isClean = (e: Errors): boolean => !e.subject && !e.body;

export interface ComposerView {
  subject: string;
  body: string;
  errors: Errors;
  fields: string[];
  templates: { id: string; label: string; active: boolean }[];
  previewSubject: string;
  previewBody: string;
  to: string;
  sent: string;
}

/** Pure: the props of the view. */
export function composerView(
  templates: MessageTemplate[],
  active: string,
  subject: string,
  body: string,
  values: Values,
  to: string,
  errors: Errors = { subject: "", body: "" },
  sent = "",
): ComposerView {
  return {
    subject,
    body,
    errors,
    fields: FIELDS.map((f) => `{${f}}`),
    templates: templates.map((t) => ({
      id: t.id,
      label: t.label,
      active: t.id === active,
    })),
    previewSubject: fill(subject, values),
    previewBody: fill(body, values),
    to,
    sent,
  };
}
