import { type Children, Component } from "@service-laboratory/pavlus";
import type { LinkItem } from "../../blocks/link-list/link-list.ts";
import {
  type Project,
  part as projectGrid,
  type ProjectGridState,
  projectGridState,
} from "../../blocks/project-grid/project-grid.ts";
import type { NavLink } from "../../blocks/site-nav/site-nav.ts";
import { type FullItem, withLists } from "../../blocks/timeline/timeline.ts";
import view from "./designer-portfolio.pavlus";

export interface DesignerPortfolioState {
  brand: string;
  nav: NavLink[];
  headline: string;
  bio: string;
  numbers: { value: string; label: string }[];
  projects: ProjectGridState;
  aboutTitle: string;
  about: string[];
  services: string[];
  recognition: FullItem[];
  contacts: LinkItem[];
}

const work: Project[] = [
  {
    key: "atlas",
    title: "Atlas Banking",
    summary: "A calmer mobile bank: one screen for money in and out.",
    category: "Product design",
    year: "2026",
    tags: ["iOS", "Fintech"],
    tone: 0,
    layout: 0,
    emoji: "🏦",
    description:
      "Atlas replaces the usual pile of tabs with one timeline. We tested six prototypes with forty customers and kept the one people could use without a tutorial. Onboarding completion went from 54% to 81%.",
    role: "Lead designer",
    tools: ["Figma", "Principle", "Maze"],
    link: "https://example.com/prototype/atlas",
    linkLabel: "Open prototype",
  },
  {
    key: "fern",
    title: "Fern Botanicals",
    summary: "Identity and shop for a small plant nursery.",
    category: "Branding",
    year: "2025",
    tags: ["Identity", "Packaging"],
    tone: 2,
    layout: 1,
    emoji: "🌿",
    description:
      "A hand-drawn wordmark, a leaf-green palette and pots that carry care instructions on the underside. The nursery sold out its spring stock in nine days.",
    role: "Brand design",
    tools: ["Illustrator", "Procreate", "Figma"],
    link: "https://example.com/prototype/fern",
    linkLabel: "Open prototype",
  },
  {
    key: "northlight",
    title: "Northlight Studio",
    summary: "A website for an architecture office that lets the photos talk.",
    category: "Web",
    year: "2025",
    tags: ["Website", "Editorial"],
    tone: 7,
    layout: 1,
    emoji: "🏛️",
    description:
      "Full-bleed project pages, a calm grid and almost no chrome. Built with the studio's own photographers, shipped as a static site that scores 100 on every Lighthouse check.",
    role: "Design and front end",
    tools: ["Figma", "Webflow", "Lighthouse"],
    link: "https://example.com/prototype/northlight",
    linkLabel: "Open prototype",
  },
  {
    key: "pulse",
    title: "Pulse Dashboard",
    summary: "A clinic dashboard that shows only what needs attention.",
    category: "Product design",
    year: "2024",
    tags: ["Web app", "Health"],
    tone: 5,
    layout: 2,
    emoji: "📈",
    description:
      "Nurses told us the old dashboard had sixty numbers on one screen. Pulse shows five, and the rest are one tap away. Response time to urgent cases dropped by a quarter.",
    role: "Product designer",
    tools: ["Figma", "Storybook", "Hotjar"],
    link: "https://example.com/prototype/pulse",
    linkLabel: "Open prototype",
  },
  {
    key: "tide",
    title: "Tide Coffee",
    summary: "Labels, bags and a menu for a roastery by the harbour.",
    category: "Branding",
    year: "2024",
    tags: ["Packaging", "Print"],
    tone: 4,
    layout: 0,
    emoji: "☕",
    description:
      "Every origin gets its own colour from the same gradient, so the shelf reads like a sunrise. Printed on uncoated stock in two spot inks.",
    role: "Brand and packaging",
    tools: ["Illustrator", "InDesign"],
    link: "https://example.com/prototype/tide",
    linkLabel: "Open prototype",
  },
  {
    key: "wander",
    title: "Wander Maps",
    summary: "A hiking app with maps you can read at a glance.",
    category: "Product design",
    year: "2023",
    tags: ["Android", "Maps"],
    tone: 3,
    layout: 2,
    emoji: "🥾",
    description:
      "Trail difficulty is drawn as texture instead of colour, so it works in bright sun and for colour-blind hikers. Rated 4.8 by 12,000 users.",
    role: "Product designer",
    tools: ["Figma", "ProtoPie"],
    link: "https://example.com/prototype/wander",
    linkLabel: "Open prototype",
  },
  {
    key: "moth",
    title: "The Moth Atlas",
    summary: "Forty illustrated plates for a natural history book.",
    category: "Illustration",
    year: "2023",
    tags: ["Print", "Book"],
    tone: 6,
    layout: 1,
    emoji: "🦋",
    description:
      "Gouache and ink, scanned at 1200 dpi and colour-matched to the printer's proofs. The book is in its third printing.",
    role: "Illustrator",
    tools: ["Gouache", "Ink", "Photoshop"],
    link: "https://example.com/prototype/moth",
    linkLabel: "View the plates",
  },
  {
    key: "kiosk",
    title: "Kiosk City Guide",
    summary: "Touch screens for tourists, tested in six languages.",
    category: "Web",
    year: "2022",
    tags: ["Kiosk", "i18n"],
    tone: 1,
    layout: 2,
    emoji: "🗺️",
    description:
      "A guide built for fingers and bright sunlight: big targets, short words and no keyboard. It runs on 40 screens around the old town.",
    role: "Design and prototyping",
    tools: ["Figma", "Framer"],
    link: "https://example.com/prototype/kiosk",
    linkLabel: "Open prototype",
  },
];

export const initial: DesignerPortfolioState = {
  brand: "Elena Marsh",
  nav: [
    { label: "Work", href: "#work" },
    { label: "About", href: "#about" },
    { label: "Contact", href: "#contact" },
  ],
  headline: "Design that earns its place on the screen.",
  bio: "I design products, brands and websites for teams who care about the details. Twelve years in, still sketching on paper first.",
  numbers: [
    { value: "12", label: "years of practice" },
    { value: "60+", label: "projects shipped" },
    { value: "4", label: "design awards" },
  ],
  projects: projectGridState(work, { heading: "Selected work" }),
  aboutTitle: "Quiet interfaces, loud ideas.",
  about: [
    "I started in print, drawing posters for a theatre, and moved to screens when I realised an interface is a poster someone has to use. I work with founders and product teams, usually from the first sketch to the shipped release.",
    "My process is simple: talk to the people who will use it, sketch badly and quickly, test with real users, then polish what survived.",
  ],
  services: [
    "Product design",
    "Brand identity",
    "Websites",
    "Design systems",
    "Illustration",
    "Workshops",
  ],
  recognition: withLists([
    {
      key: "r3",
      period: "2025",
      title: "Gold, Nordic Design Awards",
      org: "Atlas Banking",
    },
    {
      key: "r2",
      period: "2023",
      title: "Illustration of the year",
      org: "The Moth Atlas, Copenhagen Book Fair",
    },
    {
      key: "r1",
      period: "2019 - now",
      title: "Independent studio",
      org: "Clients: Atlas, Fern, Northlight, Tide",
    },
  ]),
  contacts: [
    {
      title: "elena@marsh.studio",
      note: "New projects and press",
      href: "mailto:elena@marsh.studio",
    },
    {
      title: "Dribbble",
      note: "Process shots and experiments",
      href: "https://dribbble.com/",
    },
    {
      title: "Read.cv",
      note: "Full work history",
      href: "https://read.cv/",
    },
  ],
};

/** The work is a child with its own filter and detail window. */
export class DesignerPortfolio extends Component<DesignerPortfolioState> {
  view = view;

  children: Children<DesignerPortfolioState> = {
    projects: { component: projectGrid, key: "projects" },
  };
}

export const page = new DesignerPortfolio();
