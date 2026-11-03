import {
  Component,
  type Children,
  type Effect,
  type Message,
} from "@service-laboratory/pavlus";
import { storeEffector as store } from "@service-laboratory/pavlus/plugins";
import {
  type ContactState,
  contactForm,
  contactState,
} from "../../blocks/contact-form/contact-form.ts";
import type { Feature } from "../../blocks/feature-grid/feature-grid.ts";
import type { Step } from "../../blocks/process-steps/process-steps.ts";
import type { NavLink } from "../../blocks/site-nav/site-nav.ts";
import type { Stat } from "../../blocks/stats-strip/stats-strip.ts";
import type { Quote } from "../../blocks/testimonials/testimonials.ts";
import view from "./dev-studio-website.pavlus";

export interface Project {
  id: string;
  title: string;
  client: string;
  category: "web" | "mobile" | "platform";
  summary: string;
  /** Gradient index 1-3 for the cover. */
  cover: number;
  emoji: string;
  results: { value: string; label: string }[];
  tags: string[];
}

export interface Member {
  name: string;
  role: string;
  initials: string;
  bio: string;
  tone: number;
}

export interface StackGroup {
  title: string;
  items: string[];
}

export const CATEGORIES = [
  { id: "all", label: "All work" },
  { id: "web", label: "Web" },
  { id: "mobile", label: "Mobile" },
  { id: "platform", label: "Platforms" },
];

/** Pure: the projects of one category ("all" shows every one). */
export function filterProjects(
  projects: Project[],
  category: string,
): Project[] {
  return category === "all"
    ? projects
    : projects.filter((p) => p.category === category);
}

export interface DevStudioState {
  nav: NavLink[];
  stats: Stat[];
  services: Feature[];
  stack: StackGroup[];
  steps: Step[];
  categories: typeof CATEGORIES;
  category: string;
  projects: Project[];
  shown: Project[];
  quotes: Quote[];
  team: Member[];
  contact: ContactState;
}

const projects: Project[] = [
  {
    id: "freight",
    title: "Freight tracking portal",
    client: "Baltic Cargo",
    category: "platform",
    summary:
      "A live view of 1,800 containers for dispatchers and customers, replacing a daily spreadsheet.",
    cover: 1,
    emoji: "🚢",
    results: [
      { value: "-42%", label: "support calls" },
      { value: "1.8k", label: "containers tracked" },
    ],
    tags: ["React", "Node.js", "PostgreSQL", "AWS"],
  },
  {
    id: "clinic",
    title: "Clinic booking app",
    client: "Healthpoint",
    category: "mobile",
    summary:
      "Appointments, reminders and video visits for 40 clinics, in one app for patients.",
    cover: 2,
    emoji: "🩺",
    results: [
      { value: "+31%", label: "booked visits" },
      { value: "4.8", label: "app store rating" },
    ],
    tags: ["React Native", "TypeScript", "Firebase"],
  },
  {
    id: "shop",
    title: "Headless storefront",
    client: "Oakline Furniture",
    category: "web",
    summary:
      "A fast storefront on a headless CMS; the same catalogue now feeds web, kiosks and email.",
    cover: 3,
    emoji: "🛋️",
    results: [
      { value: "+38%", label: "conversion" },
      { value: "0.9s", label: "largest paint" },
    ],
    tags: ["Next.js", "Shopify", "Vercel"],
  },
  {
    id: "ledger",
    title: "Invoice automation",
    client: "Finlo",
    category: "platform",
    summary:
      "An API and dashboard that reads, matches and approves supplier invoices without retyping.",
    cover: 1,
    emoji: "🧾",
    results: [
      { value: "12 h", label: "saved per week" },
      { value: "99.2%", label: "match accuracy" },
    ],
    tags: ["Go", "gRPC", "Kubernetes"],
  },
];

export const initial: DevStudioState = {
  nav: [
    { label: "Services", href: "#services" },
    { label: "Stack", href: "#stack" },
    { label: "Process", href: "#process" },
    { label: "Work", href: "#work" },
    { label: "Team", href: "#team" },
  ],
  stats: [
    { value: "60+", label: "products shipped" },
    { value: "9 yrs", label: "building software" },
    { value: "94%", label: "clients come back" },
    { value: "24", label: "engineers and designers" },
  ],
  services: [
    {
      icon: "layout",
      title: "Web applications",
      text: "Dashboards, portals and storefronts that load fast and stay maintainable.",
    },
    {
      icon: "phone",
      title: "Mobile apps",
      text: "iOS and Android from one codebase, with native feel where it matters.",
    },
    {
      icon: "link",
      title: "APIs and integrations",
      text: "Clean contracts between your systems, and the glue for the ones you cannot replace.",
    },
    {
      icon: "database",
      title: "Cloud and DevOps",
      text: "Pipelines, infrastructure as code and monitoring that wakes the right person.",
    },
    {
      icon: "pen",
      title: "Product design",
      text: "Research, flows and interfaces tested with real users before a line is written.",
    },
    {
      icon: "shield",
      title: "Support and audits",
      text: "Code reviews, security checks and a team on call after launch.",
    },
  ],
  stack: [
    {
      title: "Frontend",
      items: ["TypeScript", "React", "Next.js", "Vue", "Tailwind"],
    },
    { title: "Backend", items: ["Node.js", "Go", "Python", "GraphQL", "gRPC"] },
    { title: "Data", items: ["PostgreSQL", "Redis", "Kafka", "ClickHouse"] },
    {
      title: "Cloud",
      items: ["AWS", "Terraform", "Kubernetes", "GitHub Actions"],
    },
  ],
  steps: [
    {
      title: "Discovery",
      text: "Goals, users and constraints on one page. We say no to what does not matter.",
      note: "1 week",
    },
    {
      title: "Design and plan",
      text: "Clickable prototype, architecture sketch and a fixed-scope estimate.",
      note: "2 weeks",
    },
    {
      title: "Build",
      text: "Two-week sprints, a working demo every time, tests from day one.",
      note: "6-14 weeks",
    },
    {
      title: "Launch and care",
      text: "Staged rollout, monitoring and 30 days of fixes included.",
    },
  ],
  categories: CATEGORIES,
  category: "all",
  projects,
  shown: filterProjects(projects, "all"),
  quotes: [
    {
      quote:
        "They shipped in ten weeks what our last agency could not in a year, and the code is a pleasure to read.",
      name: "Jonas Weber",
      role: "CTO, Baltic Cargo",
      stars: 5,
      tone: 1,
    },
    {
      quote:
        "Honest estimates, no surprises. When something slipped they told us the same day and showed the fix.",
      name: "Amara Okafor",
      role: "COO, Healthpoint",
      stars: 5,
      tone: 4,
    },
  ],
  team: [
    {
      name: "Elena Vasquez",
      role: "Founder, engineering lead",
      initials: "EV",
      bio: "Fifteen years of distributed systems. Reviews every architecture.",
      tone: 1,
    },
    {
      name: "Kai Andersen",
      role: "Head of design",
      initials: "KA",
      bio: "Turns fuzzy briefs into flows people finish.",
      tone: 2,
    },
    {
      name: "Ravi Menon",
      role: "Senior full-stack engineer",
      initials: "RM",
      bio: "Type-safe APIs, boring databases, fast pages.",
      tone: 3,
    },
    {
      name: "Sofia Petrova",
      role: "Delivery manager",
      initials: "SP",
      bio: "Keeps scope honest and the Friday demo on time.",
      tone: 4,
    },
  ],
  contact: contactState({
    title: "Tell us about your project",
    intro:
      "Two or three sentences are enough. A senior engineer replies within a day.",
    topics: [
      "New product",
      "Rescue a project",
      "Team extension",
      "Audit or review",
    ],
    budgets: ["Not sure yet", "$15k - $50k", "$50k - $150k", "$150k +"],
    topic: "New product",
  }),
};

export class DevStudioWebsite extends Component<DevStudioState> {
  view = view;

  children: Children<DevStudioState> = {
    contact: { component: contactForm, key: "contact" },
  };

  setCategory(msg: Message, state: DevStudioState): Effect[] {
    const category = msg.payload as string;
    return [
      store.set("category", category),
      store.set("shown", filterProjects(state.projects, category)),
    ];
  }
}

export const page = new DevStudioWebsite();
