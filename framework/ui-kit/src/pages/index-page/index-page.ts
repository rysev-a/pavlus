import type { NavGroup } from "../../registry.ts";

/**
 * The props of an index page (`/blocks`, `/templates`): the heading, the intro
 * and the nav with every card's `href` ready — a template reads paths, it does
 * not build them (see philosophy.md).
 */
export function indexProps(
  s: { nav: NavGroup[]; root: string },
  heading: string,
  intro: string,
) {
  return {
    heading,
    intro,
    nav: s.nav.map((group) => ({
      ...group,
      items: group.items.map((item) => ({ ...item, href: s.root + item.path })),
    })),
  };
}
