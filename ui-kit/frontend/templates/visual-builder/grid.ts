// The grid of a section: 12 columns, rows of a fixed height. Pure functions.
//
// Collision rule: PUSH DOWN. When an element is put on a cell that another
// element occupies, the other element (and, in a cascade, whatever it then
// overlaps) moves down to the first free row below. Nothing is rejected, so a
// drag always lands where the pointer is. Elements that do not collide stay.
//
// Every device (desktop, tablet, mobile) has its own layout. Until someone edits
// it, tablet = desktop, and mobile = the elements stacked full width in reading
// order. The first edit on a device stores a layout for every element of the
// section on that device.
import { type Bp, COLS, type El, type Rect, type Section } from "./model.ts";

export const MAX_ROWS = 80;

export const overlaps = (a: Rect, b: Rect): boolean =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

export function clampRect(r: Rect): Rect {
  const w = Math.min(COLS, Math.max(1, Math.round(r.w)));
  const h = Math.min(MAX_ROWS, Math.max(1, Math.round(r.h)));
  const x = Math.min(COLS - w, Math.max(0, Math.round(r.x)));
  const y = Math.min(MAX_ROWS - h, Math.max(0, Math.round(r.y)));
  return { x, y, w, h };
}

export type Layout = Record<string, Rect>;

const visibleOn = (e: El, bp: Bp): boolean => !e.hide[bp];

/** the elements stacked full width in reading order (the default mobile layout) */
export function stacked(elements: El[]): Layout {
  const sorted = [...elements].sort(
    (a, b) =>
      a.pos.desktop.y - b.pos.desktop.y || a.pos.desktop.x - b.pos.desktop.x,
  );
  const out: Layout = {};
  let y = 0;
  for (const e of sorted) {
    out[e.id] = { x: 0, y, w: COLS, h: e.pos.desktop.h };
    y += e.pos.desktop.h;
  }
  return out;
}

/** where every element (visible on `bp`) sits on that device */
export function layoutOf(section: Section, bp: Bp): Layout {
  const els = section.elements.filter((e) => visibleOn(e, bp));
  const auto = bp === "mobile" ? stacked(els) : null;
  const out: Layout = {};
  for (const e of els) {
    const own = bp === "desktop" ? e.pos.desktop : e.pos[bp];
    out[e.id] = clampRect(own ?? auto?.[e.id] ?? e.pos.desktop);
  }
  return out;
}

/** Stores a layout for `bp` (only the elements it names). */
export function withLayout(section: Section, bp: Bp, layout: Layout): Section {
  return {
    ...section,
    elements: section.elements.map((e) => {
      const r = layout[e.id];
      return r ? { ...e, pos: { ...e.pos, [bp]: r } } : e;
    }),
  };
}

/**
 * Pushes down whatever overlaps the fixed element `id` and, in a cascade,
 * what the pushed elements overlap. The rest keeps its place.
 */
export function resolve(layout: Layout, id: string): Layout {
  const fixed = layout[id];
  if (!fixed) return layout;
  const others = Object.keys(layout)
    .filter((k) => k !== id)
    .sort((a, b) => layout[a].y - layout[b].y || layout[a].x - layout[b].x);
  const placed: Rect[] = [fixed];
  const out: Layout = { [id]: fixed };
  for (const k of others) {
    let r = layout[k];
    for (;;) {
      const hit = placed.find((p) => overlaps(p, r));
      if (!hit) break;
      r = { ...r, y: hit.y + hit.h };
    }
    out[k] = r;
    placed.push(r);
  }
  return out;
}

/** The layout after `id` moved to (x, y); null when the element is not on `bp`. */
export function moveTo(
  section: Section,
  bp: Bp,
  id: string,
  x: number,
  y: number,
): Section | null {
  const layout = layoutOf(section, bp);
  const r = layout[id];
  if (!r) return null;
  layout[id] = clampRect({ ...r, x, y });
  return withLayout(section, bp, resolve(layout, id));
}

export function resizeTo(
  section: Section,
  bp: Bp,
  id: string,
  w: number,
  h: number,
): Section | null {
  const layout = layoutOf(section, bp);
  const r = layout[id];
  if (!r) return null;
  layout[id] = clampRect({ ...r, w, h });
  return withLayout(section, bp, resolve(layout, id));
}

export function setRect(
  section: Section,
  bp: Bp,
  id: string,
  rect: Partial<Rect>,
): Section | null {
  const layout = layoutOf(section, bp);
  const r = layout[id];
  if (!r) return null;
  layout[id] = clampRect({ ...r, ...rect });
  return withLayout(section, bp, resolve(layout, id));
}

export const nudge = (
  section: Section,
  bp: Bp,
  id: string,
  dx: number,
  dy: number,
): Section | null => {
  const r = layoutOf(section, bp)[id];
  return r ? moveTo(section, bp, id, r.x + dx, r.y + dy) : null;
};

/** The first free spot of size w x h, scanning rows from the top. */
export function freeSpot(
  layout: Layout,
  w: number,
  h: number,
): { x: number; y: number } {
  const cw = Math.min(COLS, w);
  const rects = Object.values(layout);
  for (let y = 0; y < MAX_ROWS; y++)
    for (let x = 0; x + cw <= COLS; x++)
      if (!rects.some((r) => overlaps(r, { x, y, w: cw, h }))) return { x, y };
  return { x: 0, y: rowsUsed(layout) };
}

export const rowsUsed = (layout: Layout): number =>
  Object.values(layout).reduce((m, r) => Math.max(m, r.y + r.h), 0);

/** How many rows a section shows: its minimum, or what its elements need. */
export function sectionRows(section: Section, bp: Bp): number {
  return Math.max(section.rows, rowsUsed(layoutOf(section, bp)), 1);
}

/** Adds an element; at (x, y) with push-down, or in the first free spot. */
export function addElement(
  section: Section,
  el: El,
  at?: { x: number; y: number },
): Section {
  const desktop = layoutOf(section, "desktop");
  const w = el.pos.desktop.w;
  const h = el.pos.desktop.h;
  const spot = at ?? freeSpot(desktop, w, h);
  const rect = clampRect({ x: spot.x, y: spot.y, w, h });
  const next: El = { ...el, pos: { desktop: rect } };
  let out: Section = { ...section, elements: [...section.elements, next] };
  // a tablet or mobile layout already stored for the section gets the new element too
  for (const bp of ["tablet", "mobile"] as const) {
    if (section.elements.some((e) => e.pos[bp])) {
      const l = layoutOf(out, bp);
      l[el.id] =
        bp === "mobile"
          ? { x: 0, y: rowsUsed(layoutOf(section, bp)), w: COLS, h }
          : rect;
      out = withLayout(out, bp, resolve(l, el.id));
    }
  }
  return at
    ? withLayout(out, "desktop", resolve(layoutOf(out, "desktop"), el.id))
    : out;
}
