// Operations on pages and sections of the model. Pure.
import {
  type El,
  type Model,
  type Page,
  type Section,
  addPage,
  findSection,
  newId,
} from "./model.ts";

export function mapPage(m: Model, id: string, fn: (p: Page) => Page): Model {
  return { ...m, pages: m.pages.map((p) => (p.id === id ? fn(p) : p)) };
}

export const slugOf = (name: string): string =>
  "/" +
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

/** a slug nobody else uses */
export function uniqueSlug(m: Model, wanted: string, except = ""): string {
  const base = wanted.startsWith("/") ? wanted : "/" + wanted;
  let slug = base;
  for (let i = 2; m.pages.some((p) => p.slug === slug && p.id !== except); i++)
    slug = `${base}-${i}`;
  return slug;
}

export function newPage(m: Model, name: string): { model: Model; id: string } {
  return addPage(
    m,
    name,
    uniqueSlug(m, slugOf(name) === "/" ? "/page" : slugOf(name)),
  );
}

export function deletePage(m: Model, id: string): Model {
  return m.pages.length <= 1
    ? m
    : { ...m, pages: m.pages.filter((p) => p.id !== id) };
}

export function addSectionTo(
  m: Model,
  pageId: string,
  section: Section,
  at?: number,
): Model {
  return mapPage(m, pageId, (p) => {
    const list = p.sections.slice();
    list.splice(at ?? list.length, 0, section);
    return { ...p, sections: list };
  });
}

export function moveSection(m: Model, id: string, by: -1 | 1): Model {
  const f = findSection(m, id);
  if (!f) return m;
  return mapPage(m, f.page.id, (p) => {
    const i = p.sections.findIndex((s) => s.id === id);
    const j = i + by;
    if (j < 0 || j >= p.sections.length) return p;
    const list = p.sections.slice();
    [list[i], list[j]] = [list[j], list[i]];
    return { ...p, sections: list };
  });
}

export function deleteSection(m: Model, id: string): Model {
  const f = findSection(m, id);
  return f
    ? mapPage(m, f.page.id, (p) => ({
        ...p,
        sections: p.sections.filter((s) => s.id !== id),
      }))
    : m;
}

/** A copy of the section (new ids for it and its elements) right after it. */
export function duplicateSection(
  m: Model,
  id: string,
): { model: Model; id: string } | null {
  const f = findSection(m, id);
  if (!f) return null;
  let model = m;
  const nid = newId(model, "s");
  model = nid.model;
  const copy: Section = JSON.parse(JSON.stringify(f.section));
  copy.id = nid.id;
  copy.name = `${copy.name} copy`;
  copy.elements = copy.elements.map((e: El) => {
    const n = newId(model, "e");
    model = n.model;
    return { ...e, id: n.id };
  });
  const at = f.page.sections.findIndex((s) => s.id === id) + 1;
  return { model: addSectionTo(model, f.page.id, copy, at), id: copy.id };
}
