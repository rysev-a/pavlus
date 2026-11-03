export interface Filter {
  id: string;
  label: string;
  count: number;
  active: boolean;
}

export interface ToolbarAction {
  id: string;
  label: string;
  icon: string;
  variant: "default" | "outline" | "secondary";
}

/** Pure: filters from `[id, label]` pairs; the count is how many items pass each. */
export function filtersOf<T>(
  defs: [string, string][],
  active: string,
  items: T[],
  passes: (item: T, id: string) => boolean,
): Filter[] {
  return defs.map(([id, label]) => ({
    id,
    label,
    active: id === active,
    count:
      id === "all" ? items.length : items.filter((i) => passes(i, id)).length,
  }));
}

/** Pure: the items that pass a filter (`all` passes everything) and a text query. */
export function applyFilter<T>(
  items: T[],
  active: string,
  query: string,
  passes: (item: T, id: string) => boolean,
  text: (item: T) => string,
): T[] {
  const q = query.trim().toLowerCase();
  return items.filter(
    (i) =>
      (active === "all" || passes(i, active)) &&
      (!q || text(i).toLowerCase().includes(q)),
  );
}

export const toolbarAction = (
  id: string,
  label: string,
  icon = "k-icon-plus",
  variant: ToolbarAction["variant"] = "default",
): ToolbarAction => ({ id, label, icon, variant });
