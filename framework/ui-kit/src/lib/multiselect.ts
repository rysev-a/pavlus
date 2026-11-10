/**
 * The pure part of the multi-select: which options a query leaves, what
 * clicking and the keys do to the selection and to the highlighted row.
 */
export interface Option {
  id: string;
  label: string;
  /** A second line under the label (an email, a team). */
  hint?: string;
  disabled?: boolean;
}

/** Whether the query is in the label or the hint, ignoring case and accents of spacing. */
export function matches(option: Option, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    option.label.toLowerCase().includes(q) ||
    (option.hint ?? "").toLowerCase().includes(q)
  );
}

export const isSelected = (selected: Option[], id: string): boolean =>
  selected.some((o) => o.id === id);

export interface Toggled {
  selected: Option[];
  /** The option could not be added: the limit is reached. */
  full: boolean;
}

/** Adds the option, or removes it when it is there; a limit `max` (0 = none) stops adding. */
export function toggle(
  selected: Option[],
  option: Option,
  max: number,
): Toggled {
  if (option.disabled) return { selected, full: false };
  if (isSelected(selected, option.id)) {
    return {
      selected: selected.filter((o) => o.id !== option.id),
      full: false,
    };
  }
  if (max > 0 && selected.length >= max) return { selected, full: true };
  return { selected: [...selected, option], full: false };
}

/** The highlighted row after an arrow key: it skips disabled rows and wraps around. */
export function moveActive(
  active: number,
  delta: 1 | -1,
  options: Option[],
): number {
  const n = options.length;
  if (n === 0) return -1;
  // from nothing: down goes to the first row, up to the last
  const base = active < 0 ? (delta > 0 ? -1 : 0) : active;
  for (let step = 1; step <= n; step++) {
    const i = (((base + delta * step) % n) + n) % n;
    if (!options[i].disabled) return i;
  }
  return -1;
}

/** The first row that can be picked. */
export const firstEnabled = (options: Option[]): number =>
  options.findIndex((o) => !o.disabled);

/** What a row of the menu needs to draw itself. */
export interface Row {
  id: string;
  label: string;
  hint: string;
  selected: boolean;
  active: boolean;
  disabled: boolean;
}

export function rowsOf(
  options: Option[],
  selected: Option[],
  active: number,
): Row[] {
  return options.map((o, i) => ({
    id: o.id,
    label: o.label,
    hint: o.hint ?? "",
    selected: isSelected(selected, o.id),
    active: i === active,
    disabled: Boolean(o.disabled),
  }));
}
