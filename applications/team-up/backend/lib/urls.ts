/**
 * The addresses of the public lists. The original teamUP built them in
 * `routes.rs` (`users_href`, `toggle_href`, `sort_href`) and in
 * `public_startups.rs` (the catalog's query): the same order of the keys,
 * the same encoding, the same "a selected chip removes its value".
 */

/** The filters of a list: a key → the selected values (a key may repeat). */
export type Filters = Record<string, string[]>;

export const USERS_KEYS = ["labels", "cities", "status", "level"] as const;
export const USERS_SORT_KEY = "sort";

/** The order the keys are written in: the original's fixed order. */
const USERS_ORDER = ["labels", "cities", "status", "level", "sort"];

/**
 * The encoding of a query value: a space becomes `%20` and everything that is
 * not a letter, a digit or `-._~!$'()*` is percent-encoded (the original's
 * `QUERY_ENCODE_SET`).
 */
export function encodeValue(value: string): string {
  return encodeURIComponent(value).replace(/%24/g, "$");
}

/** The query of a filter set: `labels=A&labels=B&cities=Moscow&sort=updated`. */
export function buildQuery(filters: Filters, order?: string[]): string {
  const keys = order ?? Object.keys(filters);
  const parts: string[] = [];
  for (const key of keys) {
    const values = filters[key];
    if (!values || values.length === 0) continue;
    if (key === USERS_SORT_KEY) {
      parts.push(`${key}=${encodeValue(values[0])}`);
      continue;
    }
    for (const value of values) parts.push(`${key}=${encodeValue(value)}`);
  }
  return parts.join("&");
}

/** The address of a list with its filters. */
export function buildHref(
  path: string,
  filters: Filters,
  order?: string[],
): string {
  const query = buildQuery(filters, order);
  return query ? `${path}?${query}` : path;
}

/** The address of the members list (`/users?labels=…&cities=…`). */
export const usersHref = (filters: Filters): string =>
  buildHref("/users", filters, USERS_ORDER);

/**
 * The address of a chip's click: the value is added when it is not there and
 * removed when it is; the other filters and the sort stay.
 */
export function toggleHref(
  filters: Filters,
  key: string,
  value: string,
): string {
  const next: Filters = { ...filters };
  const values = next[key] ?? [];
  next[key] = values.includes(value)
    ? values.filter((v) => v !== value)
    : [...values, value];
  return usersHref(next);
}

/** The address of a sort chip: the sort is replaced, the filters stay. */
export function sortHref(filters: Filters, value: string): string {
  return usersHref({ ...filters, sort: [value] });
}

/** The address of the catalog (`/projects?kind=company&q=rust`). */
export function catalogHref(filters: Filters): string {
  const order = [
    "q",
    "domain",
    "kind",
    "mode",
    "role",
    "grade",
    "pay",
    "skill",
    "looking",
    "scope",
    "saved",
    "sort",
  ];
  const next: Filters = { ...filters };
  if (!next.q || next.q.length === 0) delete next.q;
  if (next.sort && next.sort.length === 1 && next.sort[0] === "")
    delete next.sort;
  return buildHref("/projects", next, order);
}

/** Splits the raw query into a filter set (repeated keys and CSV values). */
export function parseFilters(
  rawQuery: string | undefined,
  multi: readonly string[] = USERS_KEYS,
): Filters {
  const out: Filters = {};
  if (!rawQuery) return out;
  for (const pair of rawQuery.split("&")) {
    if (!pair) continue;
    const eq = pair.indexOf("=");
    const key = eq < 0 ? pair : pair.slice(0, eq);
    const value = eq < 0 ? "" : pair.slice(eq + 1);
    const decoded = safeDecode(value);
    if (multi.includes(key)) {
      // a repeated key and a CSV value are both accepted (old links)
      const values = decoded
        .split(",")
        .map((v) => v.trim())
        .filter(Boolean);
      out[key] = [...(out[key] ?? []), ...values];
    } else {
      out[key] = [decoded];
    }
  }
  return out;
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value.replace(/\+/g, " "));
  } catch {
    return value;
  }
}
