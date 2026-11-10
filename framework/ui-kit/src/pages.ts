import type { Component, RouteSpec, Routing, View } from "@pavlus/client";
import { allEntries, type Entry } from "./registry.ts";

/**
 * Adding a page is adding a folder. Components live in `pages/<slug>/`,
 * blocks in `blocks/<slug>/`, templates in `templates/<slug>/`:
 *
 * - `<slug>.pavlus`: the template. A page that is only a template needs
 *   nothing else.
 * - `<slug>.ts`: for a page with state. Exports `page` (an instance of a class
 *   extending `Component`, whose `view` is the template) and `initial` (its
 *   state, kept under `state[<key>]`).
 * - `meta.ts` (blocks and templates): `export const meta` with the title,
 *   group and description; a template adds its `look`. Components are listed
 *   in `registry.ts`.
 *
 * The two globs below find the files; nothing else lists the pages.
 */
const templates = import.meta.glob<{ default: View }>(
  "./{pages,blocks,templates}/*/*.pavlus",
  { eager: true },
);
const logic = import.meta.glob<{ page: Component; initial: unknown }>(
  "./{pages,blocks,templates}/*/*.ts",
  { eager: true },
);

const file = (e: Entry, ext: string) => `./${e.dir}/${e.slug}.${ext}`;

/** The state key of an entry: its slug, prefixed for blocks and templates. */
export const keyOf = (e: Entry): string =>
  e.section === "components" ? e.slug : `${e.section}-${e.slug}`;

/** The page of an entry: its component with state, or its bare template. */
export function pageOf(e: Entry): RouteSpec | undefined {
  const mod = logic[file(e, "ts")];
  if (mod?.page) return { component: mod.page, key: keyOf(e) };
  const tpl = templates[file(e, "pavlus")];
  return tpl ? { view: tpl.default } : undefined;
}

/** The initial state of every page that has one, by key. */
export function pageStates(): Record<string, unknown> {
  const states: Record<string, unknown> = {};
  for (const e of allEntries) {
    const mod = logic[file(e, "ts")];
    if (mod && "initial" in mod) states[keyOf(e)] = mod.initial;
  }
  return states;
}

const view = (path: string): View => templates[path].default;

export const homeView = view("./pages/home/home.pavlus");
export const notFoundView = view("./pages/not-found/not-found.pavlus");
export const indexView = view("./pages/index-page/index-page.pavlus");
export const themingView = view("./pages/theming/theming.pavlus");

/** The routes: the static pages, then `/<slug>`, `/blocks/<slug>`, `/templates/<slug>`. */
export function routingOf<S>(fixed: Record<string, RouteSpec<S>>): Routing<S> {
  const routing: Routing<S> = { ...fixed };
  for (const e of allEntries) {
    const page = pageOf(e);
    if (page) routing[e.path] = page;
  }
  return routing;
}
