import { durationText } from "../week-calendar/dates.ts";
import { TONES } from "../week-calendar/week.ts";

export interface Category {
  id: string;
  name: string;
  tone: string;
}

export const MAX_NAME = 24;

/** Pure: what is wrong with a category name ("" when it is fine). */
export function validateName(
  name: string,
  cats: Category[],
  exceptId = "",
): string {
  const n = name.trim();
  if (n === "") return "Give the category a name.";
  if (n.length > MAX_NAME) return `Keep it under ${MAX_NAME} letters.`;
  const taken = cats.some(
    (c) => c.id !== exceptId && c.name.toLowerCase() === n.toLowerCase(),
  );
  return taken ? "There is a category with this name." : "";
}

/** Pure: an id from a name that no category has yet (`Deep work` becomes `deep-work`). */
export function idFor(name: string, cats: Category[]): string {
  const base =
    name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "cat";
  let id = base;
  let n = 2;
  while (cats.some((c) => c.id === id)) id = `${base}-${n++}`;
  return id;
}

/** Pure: the tone after this one in the list (wraps around). */
export function nextTone(tone: string): string {
  const i = (TONES as readonly string[]).indexOf(tone);
  return TONES[(i + 1) % TONES.length];
}

/** Pure: the tone that the fewest categories use (the first on a tie). */
export function freshTone(cats: Category[]): string {
  let best: string = TONES[0];
  let least = Number.POSITIVE_INFINITY;
  for (const tone of TONES) {
    const used = cats.filter((c) => c.tone === tone).length;
    if (used < least) {
      least = used;
      best = tone;
    }
  }
  return best;
}

export function addCategory(
  cats: Category[],
  name: string,
  tone: string,
): Category[] {
  return [...cats, { id: idFor(name, cats), name: name.trim(), tone }];
}

export const recolor = (cats: Category[], id: string): Category[] =>
  cats.map((c) => (c.id === id ? { ...c, tone: nextTone(c.tone) } : c));

export const rename = (
  cats: Category[],
  id: string,
  name: string,
): Category[] => cats.map((c) => (c.id === id ? { ...c, name } : c));

/** Pure: a category can go when nothing is logged in it and it is not the last. */
export function canRemove(
  cats: Category[],
  id: string,
  minutes: Record<string, number>,
): boolean {
  return cats.length > 1 && (minutes[id] ?? 0) === 0;
}

export const removeCategory = (
  cats: Category[],
  id: string,
  minutes: Record<string, number>,
): Category[] =>
  canRemove(cats, id, minutes) ? cats.filter((c) => c.id !== id) : cats;

export interface Draft {
  name: string;
  tone: string;
  error: string;
}

export interface CategoryRow {
  id: string;
  name: string;
  tone: string;
  used: string;
  removable: boolean;
  error: string;
}

export interface CategoryView {
  rows: CategoryRow[];
  draft: Draft;
  tones: { tone: string; on: boolean }[];
}

/** Pure: the props of the view. `errors` holds a rename error by category id. */
export function categoryView(
  cats: Category[],
  minutes: Record<string, number>,
  draft: Draft,
  errors: Record<string, string> = {},
): CategoryView {
  return {
    rows: cats.map((c) => ({
      id: c.id,
      name: c.name,
      tone: c.tone,
      used: (minutes[c.id] ?? 0) > 0 ? durationText(minutes[c.id]) : "unused",
      removable: canRemove(cats, c.id, minutes),
      error: errors[c.id] ?? "",
    })),
    draft,
    tones: TONES.map((tone) => ({ tone, on: tone === draft.tone })),
  };
}
