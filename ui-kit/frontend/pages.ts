import type { Component, RouteSpec, Routing } from "@service-laboratory/pavlus";
import type { View } from "@service-laboratory/pavlus";
import { entries } from "./registry.ts";

/**
 * Adding a component is adding a folder to `pages/`:
 *
 * - `pages/<slug>/<slug>.pavlus`: the template. A page that is only a template
 *   needs nothing else.
 * - `pages/<slug>/<slug>.ts`: for a demo with state. Exports `page` (an
 *   instance of a class extending `Component`, whose `view` is the template)
 *   and `initial` (its state, kept under `state[<slug>]`).
 *
 * plus a line in `registry.ts` for the sidebar and the home page. The two
 * globs below find the files; nothing else lists the pages.
 */
const templates = import.meta.glob<{ default: View }>("./pages/*/*.pavlus", {
  eager: true,
});
const logic = import.meta.glob<{ page: Component; initial: unknown }>(
  "./pages/*/*.ts",
  { eager: true },
);

const path = (slug: string, ext: string) => `./pages/${slug}/${slug}.${ext}`;

/** The page of a slug: its component with state, or its bare template. */
export function pageOf(slug: string): RouteSpec | undefined {
  const mod = logic[path(slug, "ts")];
  if (mod) return { component: mod.page, key: slug };
  const tpl = templates[path(slug, "pavlus")];
  return tpl ? { view: tpl.default } : undefined;
}

/** The initial state of every page that has one, by slug. */
export function pageStates(): Record<string, unknown> {
  const states: Record<string, unknown> = {};
  for (const { slug } of entries) {
    const mod = logic[path(slug, "ts")];
    if (mod) states[slug] = mod.initial;
  }
  return states;
}

export const homeView = templates["./pages/home/home.pavlus"].default;
export const notFoundView =
  templates["./pages/not-found/not-found.pavlus"].default;

/** `/` home, `/<slug>` for every entry that has a page, `*` not found. */
export function routingOf<S>(
  home: RouteSpec<S>,
  notFound: RouteSpec<S>,
): Routing<S> {
  const routing: Routing<S> = { "/": home };
  for (const { slug } of entries) {
    const page = pageOf(slug);
    if (page) routing[`/${slug}`] = page;
  }
  routing["*"] = notFound;
  return routing;
}
