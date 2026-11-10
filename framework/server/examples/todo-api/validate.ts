// Validation as pure functions: untrusted input in, a typed value or a map of
// field errors out. No effects, no state; test them with plain `expect`.

export type Result<T> =
  | { ok: true; value: T }
  | { ok: false; errors: Record<string, string> };

const good = <T>(value: T): Result<T> => ({ ok: true, value });
const bad = (errors: Record<string, string>): Result<never> => ({
  ok: false,
  errors,
});

const isObject = (x: unknown): x is Record<string, unknown> =>
  typeof x === "object" && x !== null && !Array.isArray(x);

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface Credentials {
  email: string;
  password: string;
}

export function validateSignup(body: unknown): Result<Credentials> {
  if (!isObject(body)) return bad({ body: "expected a JSON object" });
  const errors: Record<string, string> = {};
  const email =
    typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!EMAIL.test(email) || email.length > 254)
    errors.email = "a valid email is required";
  const password = typeof body.password === "string" ? body.password : "";
  if (password.length < 8) errors.password = "at least 8 characters";
  else if (password.length > 200) errors.password = "at most 200 characters";
  return Object.keys(errors).length ? bad(errors) : good({ email, password });
}

export function validateLogin(body: unknown): Result<Credentials> {
  if (!isObject(body)) return bad({ body: "expected a JSON object" });
  const errors: Record<string, string> = {};
  const email =
    typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!email || email.length > 254) errors.email = "required";
  const password = typeof body.password === "string" ? body.password : "";
  if (!password || password.length > 200) errors.password = "required";
  return Object.keys(errors).length ? bad(errors) : good({ email, password });
}

/** A positive integer id from a path segment (`"12"`, not `"1e3"` or `"-1"`). */
export function validateId(raw: unknown): Result<number> {
  if (typeof raw !== "string" || !/^[1-9]\d{0,9}$/.test(raw))
    return bad({ id: "must be a positive integer" });
  const n = Number(raw);
  return n <= 2_147_483_647 ? good(n) : bad({ id: "out of range" });
}

export function validateTodoCreate(body: unknown): Result<{ title: string }> {
  if (!isObject(body)) return bad({ body: "expected a JSON object" });
  const title = typeof body.title === "string" ? body.title.trim() : "";
  if (!title) return bad({ title: "required" });
  if (title.length > 200) return bad({ title: "at most 200 characters" });
  return good({ title });
}

export interface TodoPatch {
  title?: string;
  done?: boolean;
}

export function validateTodoPatch(body: unknown): Result<TodoPatch> {
  if (!isObject(body)) return bad({ body: "expected a JSON object" });
  const errors: Record<string, string> = {};
  const patch: TodoPatch = {};
  if ("title" in body) {
    const t = typeof body.title === "string" ? body.title.trim() : "";
    if (!t || t.length > 200) errors.title = "1 to 200 characters";
    else patch.title = t;
  }
  if ("done" in body) {
    if (typeof body.done !== "boolean") errors.done = "must be a boolean";
    else patch.done = body.done;
  }
  if (Object.keys(errors).length) return bad(errors);
  if (Object.keys(patch).length === 0)
    return bad({ body: "give `title` and/or `done`" });
  return good(patch);
}

export function validateReorder(body: unknown): Result<{ ids: number[] }> {
  if (!isObject(body) || !Array.isArray(body.ids))
    return bad({ ids: "expected an array of todo ids" });
  const ids = body.ids;
  if (ids.length === 0 || ids.length > 500)
    return bad({ ids: "between 1 and 500 ids" });
  if (!ids.every((n) => Number.isInteger(n) && n > 0 && n <= 2_147_483_647))
    return bad({ ids: "ids must be positive integers" });
  if (new Set(ids).size !== ids.length) return bad({ ids: "duplicate ids" });
  return good({ ids: ids as number[] });
}

export function validateRoom(raw: unknown): Result<string> {
  const room = raw === undefined ? "general" : raw;
  return typeof room === "string" && /^[a-z0-9_-]{1,32}$/.test(room)
    ? good(room)
    : bad({ room: "1 to 32 chars of a-z 0-9 _ -" });
}

/** A chat frame: JSON `{"text": "..."}`. */
export function validateChat(data: unknown): Result<{ text: string }> {
  if (typeof data !== "string") return bad({ frame: "text frames only" });
  let v: unknown;
  try {
    v = JSON.parse(data);
  } catch {
    return bad({ frame: "not JSON" });
  }
  const text = isObject(v) && typeof v.text === "string" ? v.text.trim() : "";
  if (!text) return bad({ text: "required" });
  if (text.length > 1000) return bad({ text: "at most 1000 characters" });
  return good({ text });
}
