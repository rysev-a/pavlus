import {
  type Children,
  Component,
  type Effect,
  type Message,
} from "@service-laboratory/pavlus";
import {
  domEffector as dom,
  storeEffector as store,
  timeEffector as time,
} from "@service-laboratory/pavlus/plugins";
import view from "./view.pavlus";
import pageView from "./project-grid.pavlus";

export interface Project {
  key: string;
  title: string;
  summary: string;
  category: string;
  year: string;
  tags: string[];
  /** 0-7: which gradient the cover uses. */
  tone: number;
  /** 0-2: which wireframe is drawn on the cover. */
  layout: number;
  emoji: string;
  /** The detail window. */
  description: string;
  role: string;
  tools: string[];
  link: string;
  linkLabel: string;
}

export interface Category {
  id: string;
  label: string;
  count: number;
}

export const ALL = "all";

export interface ProjectGridState {
  heading: string;
  projects: Project[];
  categories: Category[];
  filter: string;
  /** Derived: the projects of `filter`. */
  shown: Project[];
  /** The project whose window is open, or null. */
  current: Project | null;
  showFilters: boolean;
  /** Cards open a detail window. */
  details: boolean;
}

/** Pure: "All" and every category in the order it first appears, with counts. */
export function categoriesOf(projects: Project[]): Category[] {
  const list: Category[] = [{ id: ALL, label: "All", count: projects.length }];
  for (const project of projects) {
    const found = list.find((c) => c.id === project.category);
    if (found) found.count += 1;
    else list.push({ id: project.category, label: project.category, count: 1 });
  }
  return list;
}

/** Pure: the projects of a category (`all` keeps every one). */
export function filterProjects(projects: Project[], filter: string): Project[] {
  return filter === ALL
    ? projects
    : projects.filter((p) => p.category === filter);
}

/** Pure: a project by key, or null. */
export function findProject(projects: Project[], key: string): Project | null {
  return projects.find((p) => p.key === key) ?? null;
}

/** Pure: the whole state of a grid from its projects. */
export function projectGridState(
  projects: Project[],
  options: { heading?: string; filters?: boolean; details?: boolean } = {},
): ProjectGridState {
  return {
    heading: options.heading ?? "",
    projects,
    categories: categoriesOf(projects),
    filter: ALL,
    shown: projects,
    current: null,
    showFilters: options.filters ?? true,
    details: options.details ?? true,
  };
}

export class ProjectGrid extends Component<ProjectGridState> {
  view = view;

  filter(msg: Message, state: ProjectGridState): Effect[] {
    const filter = msg.payload as string;
    return [
      store.set("filter", filter),
      store.set("shown", filterProjects(state.projects, filter)),
    ];
  }

  open(msg: Message, state: ProjectGridState): Effect[] {
    const project = findProject(state.projects, msg.payload as string);
    if (!project) return [];
    // the window is in the DOM after this render: focus it on the next tick
    return [
      store.set("current", project),
      time.setTimeout("pg-focus", 0, "focusDetail"),
    ];
  }

  focusDetail(): Effect[] {
    return [dom.focus("#pg-detail")];
  }

  close(): Effect[] {
    return [store.set("current", null)];
  }

  /** Escape closes the window. */
  key(msg: Message): Effect[] {
    return msg.event?.key === "Escape" ? [store.set("current", null)] : [];
  }
}

export const part = new ProjectGrid();

const demo: Project[] = [
  {
    key: "atlas",
    title: "Atlas Banking",
    summary: "A calmer mobile bank: one screen for money in, money out.",
    category: "Product",
    year: "2026",
    tags: ["iOS", "Fintech"],
    tone: 0,
    layout: 0,
    emoji: "🏦",
    description:
      "Atlas replaces the usual pile of tabs with a single timeline. We tested six prototypes with 40 customers and kept the one people could use without a tutorial.",
    role: "Lead designer",
    tools: ["Figma", "Principle", "Maze"],
    link: "https://example.com/atlas",
    linkLabel: "Open prototype",
  },
  {
    key: "fern",
    title: "Fern Botanicals",
    summary: "Brand and shop for a small plant nursery.",
    category: "Brand",
    year: "2025",
    tags: ["Identity", "Web"],
    tone: 2,
    layout: 1,
    emoji: "🌿",
    description:
      "A hand-drawn wordmark, a leaf-green palette and a shop that explains how to keep each plant alive.",
    role: "Brand and web design",
    tools: ["Illustrator", "Figma", "Webflow"],
    link: "https://example.com/fern",
    linkLabel: "Visit the site",
  },
  {
    key: "pulse",
    title: "Pulse Dashboard",
    summary: "A clinic dashboard that shows only what needs attention.",
    category: "Product",
    year: "2025",
    tags: ["Web app", "Health"],
    tone: 5,
    layout: 2,
    emoji: "📈",
    description:
      "Nurses told us the old dashboard had 60 numbers on one screen. Pulse shows five, and the rest one tap away.",
    role: "Product designer",
    tools: ["Figma", "Storybook"],
    link: "https://example.com/pulse",
    linkLabel: "Open prototype",
  },
];

export interface ProjectGridPageState {
  grid: ProjectGridState;
  plain: ProjectGridState;
}

export const initial: ProjectGridPageState = {
  grid: projectGridState(demo, { heading: "Selected work" }),
  plain: projectGridState(demo.slice(0, 2), { filters: false, details: false }),
};

/** The demo page: the same part twice, with and without filters and windows. */
export class ProjectGridPage extends Component<ProjectGridPageState> {
  view = pageView;

  children: Children<ProjectGridPageState> = {
    grid: { component: part, key: "grid" },
    plain: { component: part, key: "plain" },
  };
}

export const page = new ProjectGridPage();
