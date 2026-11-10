import type { NavGroup } from "../../registry.ts";

/**
 * The props of the home page: the nav with every card's `href` ready — a
 * template reads paths, it does not build them (see philosophy.md).
 */
export function homeProps(s: { nav: NavGroup[]; root: string; count: number }) {
  return {
    nav: s.nav.map((group) => ({
      ...group,
      items: group.items.map((item) => ({ ...item, href: s.root + item.path })),
    })),
    count: s.count,
  };
}
