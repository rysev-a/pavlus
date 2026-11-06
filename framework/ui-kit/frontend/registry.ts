import type { LookPreset } from "./theming.ts";

/** The sections of the top menu. */
export type Section =
  | "components"
  | "blocks"
  | "templates"
  | "theming"
  | "docs"
  | "engine";

/** One page of the kit: a component, a block or a template. */
export interface Entry {
  /** The folder name: `button`, `shop-cart`... */
  slug: string;
  title: string;
  group: string;
  description: string;
  section: "components" | "blocks" | "templates";
  /** The route: `/button`, `/blocks/shop-cart`, `/templates/pet-shop`. */
  path: string;
  /** Where its source is, under `frontend/`: `pages/button`. */
  dir: string;
  /** A template's own look, applied while its page is open. */
  look?: LookPreset;
  /** Position inside its group. */
  order?: number;
}

const e = (
  group: string,
  slug: string,
  title: string,
  description: string,
): Entry => ({
  slug,
  title,
  group,
  description,
  section: "components",
  path: `/${slug}`,
  dir: `pages/${slug}`,
});

export const entries: Entry[] = [
  e(
    "Actions",
    "button",
    "Button",
    "Displays a button or a link that looks like one.",
  ),
  e(
    "Actions",
    "button-group",
    "Button Group",
    "A container that groups related buttons together.",
  ),
  e("Actions", "toggle", "Toggle", "A two-state button that can be on or off."),
  e(
    "Actions",
    "toggle-group",
    "Toggle Group",
    "A set of two-state buttons, one or several of which can be on.",
  ),

  e(
    "Forms",
    "checkbox",
    "Checkbox",
    "A control that lets the user toggle between checked and not checked.",
  ),
  e(
    "Forms",
    "combobox",
    "Combobox",
    "An input with a filterable list of suggestions.",
  ),
  e(
    "Forms",
    "date-picker",
    "Date Picker",
    "A date field with a calendar in a popover.",
  ),
  e(
    "Forms",
    "field",
    "Field",
    "Label, control, helper text and error, laid out as a form row.",
  ),
  e("Forms", "input", "Input", "A text field."),
  e(
    "Forms",
    "input-group",
    "Input Group",
    "Add icons, text or buttons to the sides of an input.",
  ),
  e(
    "Forms",
    "input-otp",
    "Input OTP",
    "A one-time password field with a slot for each digit.",
  ),
  e("Forms", "label", "Label", "Renders an accessible label for a control."),
  e(
    "Forms",
    "multi-select",
    "Multi Select",
    "Pick several options from a list: synchronous or loaded asynchronously, with search, chips and a limit.",
  ),
  e(
    "Forms",
    "native-select",
    "Native Select",
    "A styled select that uses the browser's own menu.",
  ),
  e(
    "Forms",
    "radio-group",
    "Radio Group",
    "A set of options where only one can be chosen.",
  ),
  e(
    "Forms",
    "select",
    "Select",
    "A button that opens a list of options to choose from.",
  ),
  e(
    "Forms",
    "slider",
    "Slider",
    "An input where the user picks a value from a range.",
  ),
  e("Forms", "switch", "Switch", "A control that toggles between on and off."),
  e("Forms", "textarea", "Textarea", "A multi-line text field."),

  e(
    "Data display",
    "avatar",
    "Avatar",
    "An image element with a fallback for the user's initials.",
  ),
  e(
    "Data display",
    "badge",
    "Badge",
    "A small label for status, counts and categories.",
  ),
  e("Data display", "calendar", "Calendar", "A month grid to pick a date."),
  e(
    "Data display",
    "range-calendar",
    "Range Calendar",
    "A calendar for a range of dates: two months, a hover preview, quick ranges, and a date range picker.",
  ),
  e(
    "Data display",
    "card",
    "Card",
    "A container with a header, content and footer.",
  ),
  e("Data display", "carousel", "Carousel", "Slides you can step through."),
  e(
    "Data display",
    "chart",
    "Chart",
    "Bar and area charts that follow the theme's chart colors.",
  ),
  e(
    "Data display",
    "data-table",
    "Data Table",
    "A table with search, sorting, row selection and paging.",
  ),
  e(
    "Data display",
    "empty",
    "Empty",
    "What to show when there is nothing to show.",
  ),
  e(
    "Data display",
    "item",
    "Item",
    "A flexible row with media, title, description and actions.",
  ),
  e("Data display", "kbd", "Kbd", "Displays a keyboard key or a shortcut."),
  e("Data display", "progress", "Progress", "Shows how far a task has got."),
  e(
    "Data display",
    "skeleton",
    "Skeleton",
    "A placeholder while content loads.",
  ),
  e("Data display", "spinner", "Spinner", "Shows that something is loading."),
  e("Data display", "table", "Table", "A responsive table."),
  e(
    "Data display",
    "typography",
    "Typography",
    "Headings, paragraphs, lists, quotes and inline styles.",
  ),

  e("Feedback", "alert", "Alert", "Calls attention to a message."),
  e("Feedback", "sonner", "Sonner", "A stack of toasts, the newest in front."),

  e("Navigation", "breadcrumb", "Breadcrumb", "The path to the current page."),
  e(
    "Navigation",
    "command",
    "Command",
    "A palette that filters a list of commands as you type.",
  ),
  e(
    "Navigation",
    "context-menu",
    "Context Menu",
    "A menu of actions for an area.",
  ),
  e(
    "Navigation",
    "dropdown-menu",
    "Dropdown Menu",
    "A menu that opens from a button.",
  ),
  e(
    "Navigation",
    "menubar",
    "Menubar",
    "A bar of menus, like a desktop application's.",
  ),
  e(
    "Navigation",
    "navigation-menu",
    "Navigation Menu",
    "Links and panels of links for a site's header.",
  ),
  e(
    "Navigation",
    "pagination",
    "Pagination",
    "Moves between pages of content.",
  ),
  e(
    "Navigation",
    "sidebar",
    "Sidebar",
    "The side navigation of an application shell.",
  ),
  e(
    "Navigation",
    "tabs",
    "Tabs",
    "Layered sections of content, one shown at a time.",
  ),

  e(
    "Overlays",
    "alert-dialog",
    "Alert Dialog",
    "A modal that asks for confirmation.",
  ),
  e(
    "Overlays",
    "dialog",
    "Dialog",
    "A window over the page that needs a decision or input.",
  ),
  e("Overlays", "drawer", "Drawer", "A panel that slides up from the bottom."),
  e(
    "Overlays",
    "hover-card",
    "Hover Card",
    "A preview that appears when you hover a link.",
  ),
  e("Overlays", "popover", "Popover", "A floating panel next to its trigger."),
  e(
    "Overlays",
    "sheet",
    "Sheet",
    "A panel that slides in from the edge of the screen.",
  ),
  e(
    "Overlays",
    "tooltip",
    "Tooltip",
    "A short hint that appears on hover or focus.",
  ),

  e("Layout", "accordion", "Accordion", "Sections that expand and collapse."),
  e(
    "Layout",
    "aspect-ratio",
    "Aspect Ratio",
    "Keeps content in a fixed ratio.",
  ),
  e(
    "Layout",
    "collapsible",
    "Collapsible",
    "One section that expands and collapses.",
  ),
  e(
    "Layout",
    "direction",
    "Direction",
    "Left-to-right and right-to-left layouts.",
  ),
  e(
    "Layout",
    "resizable",
    "Resizable",
    "Panels whose sizes the user can change.",
  ),
  e(
    "Layout",
    "scroll-area",
    "Scroll Area",
    "A scrollable region with a styled scrollbar.",
  ),
  e("Layout", "separator", "Separator", "A line between sections of content."),
];

export interface NavItem {
  path: string;
  title: string;
  description: string;
}
export interface NavGroup {
  title: string;
  items: NavItem[];
}

/** The sidebar: the entries grouped in the order they are declared. */
export function navOf(list: Entry[]): NavGroup[] {
  const groups: NavGroup[] = [];
  for (const entry of list) {
    let group = groups.find((g) => g.title === entry.group);
    if (!group) groups.push((group = { title: entry.group, items: [] }));
    group.items.push({
      path: entry.path,
      title: entry.title,
      description: entry.description,
    });
  }
  return groups;
}

/**
 * What a block or a template says about itself: `meta.ts` in its folder
 * exports `meta`. Adding one is adding the folder; nothing else lists it.
 */
export interface Meta {
  title: string;
  group: string;
  description: string;
  /** Position inside its group (default: by title). */
  order?: number;
  /** Templates: the look applied while the page is open. */
  look?: LookPreset;
}

const blockMetas = import.meta.glob<{ meta: Meta }>("./blocks/*/meta.ts", {
  eager: true,
});
const templateMetas = import.meta.glob<{ meta: Meta }>(
  "./templates/*/meta.ts",
  {
    eager: true,
  },
);

function collect(
  metas: Record<string, { meta: Meta }>,
  section: "blocks" | "templates",
  groups: string[],
): Entry[] {
  const list = Object.entries(metas).map(([file, { meta }]): Entry => {
    const slug = file.split("/")[2];
    return {
      slug,
      title: meta.title,
      group: meta.group,
      description: meta.description,
      section,
      path: `/${section}/${slug}`,
      dir: `${section}/${slug}`,
      look: meta.look,
      order: meta.order,
    };
  });
  const rank = (g: string) => {
    const i = groups.indexOf(g);
    return i < 0 ? groups.length : i;
  };
  const order = (x: Entry) => x.order ?? 1000;
  return list.sort(
    (a, b) =>
      rank(a.group) - rank(b.group) ||
      a.group.localeCompare(b.group) ||
      order(a) - order(b) ||
      a.title.localeCompare(b.title),
  );
}

export const BLOCK_GROUPS = [
  "Authentication",
  "Payments",
  "Profile",
  "Media",
  "Travel",
  "Shop",
  "Site sections",
  "Dashboard",
  "Tools",
  "Social",
  "Messaging",
  "Personal",
  "Logistics",
  "Learning",
];

export const TEMPLATE_GROUPS = [
  "Personal & Portfolio",
  "Shops",
  "Admin Panels & Dashboards",
  "Apps & Business Sites",
  "Special Web Tools",
  "CRM & Sales",
  "Business Admin",
  "Social Networking",
  "Messaging",
  "Logistics",
  "HR & People",
  "Personal Productivity",
  "Learning",
];

export const blocks: Entry[] = collect(blockMetas, "blocks", BLOCK_GROUPS);
export const templates: Entry[] = collect(
  templateMetas,
  "templates",
  TEMPLATE_GROUPS,
);

/** Every page that has an `Entry`. */
export const allEntries: Entry[] = [...entries, ...blocks, ...templates];

export const MENU: { path: string; title: string; section: Section }[] = [
  { path: "/", title: "Components", section: "components" },
  { path: "/blocks", title: "Blocks", section: "blocks" },
  { path: "/templates", title: "Templates", section: "templates" },
  { path: "/theming", title: "Theming", section: "theming" },
  { path: "/docs/overview", title: "Docs", section: "docs" },
  { path: "/engine", title: "Template engine", section: "engine" },
];

/** Which section a route belongs to. */
export function sectionOf(path: string): Section {
  if (path === "/blocks" || path.startsWith("/blocks/")) return "blocks";
  if (path === "/templates" || path.startsWith("/templates/"))
    return "templates";
  if (path === "/theming") return "theming";
  if (path === "/engine") return "engine";
  if (path === "/docs" || path.startsWith("/docs/")) return "docs";
  return "components";
}

/** The sidebar of a section (Theming has none). */
export function navFor(section: Section): NavGroup[] {
  switch (section) {
    case "components":
      return navOf(entries);
    case "blocks":
      return navOf(blocks);
    case "templates":
      return navOf(templates);
    default:
      return [];
  }
}
