import { type Children, Component } from "@pavlus/frontend";
import type { LinkItem } from "../../blocks/link-list/link-list.ts";
import {
  type Project,
  type ProjectGridState,
  part as projectGrid,
  projectGridState,
} from "../../blocks/project-grid/project-grid.ts";
import {
  type Language,
  type Skill,
  skill,
} from "../../blocks/resume/resume.ts";
import type { NavLink } from "../../blocks/site-nav/site-nav.ts";
import { type FullItem, withLists } from "../../blocks/timeline/timeline.ts";
import view from "./developer-resume-landing.pavlus";

export interface DeveloperLandingState {
  brand: string;
  /** The PDF, under the base path the site is served from. */
  pdfHref: string;
  nav: NavLink[];
  headline: string;
  bio: string;
  facts: { label: string; value: string }[];
  skills: Skill[];
  stackGroups: { title: string; items: string[] }[];
  experience: FullItem[];
  education: FullItem[];
  languages: Language[];
  projects: ProjectGridState;
  contacts: LinkItem[];
}

const projects: Project[] = [
  {
    key: "lattice",
    title: "Lattice",
    summary:
      "A tiny state machine library for TypeScript, with no runtime dependencies.",
    category: "Open source",
    year: "2025",
    tags: ["TypeScript", "Library"],
    tone: 2,
    layout: 1,
    emoji: "🧩",
    description:
      "Lattice describes a state machine as plain data and gives you a pure transition function. It is 1.4 kB gzipped, has 100% test coverage and 2.1k stars on GitHub. Teams use it for checkout flows, wizards and game logic.",
    role: "Author and maintainer",
    tools: ["TypeScript", "Vitest", "tsup"],
    link: "https://github.com/",
    linkLabel: "View on GitHub",
  },
  {
    key: "pulse",
    title: "Pulse Board",
    summary: "A realtime operations dashboard that keeps working offline.",
    category: "Work",
    year: "2024",
    tags: ["React", "WebSockets"],
    tone: 5,
    layout: 2,
    emoji: "📡",
    description:
      "Pulse Board streams metrics over WebSockets and keeps the last hour in IndexedDB, so a flaky train Wi-Fi does not blank the screen. It runs in three companies and shows 400 live series without dropping a frame.",
    role: "Tech lead",
    tools: ["React", "Go", "PostgreSQL", "WebSockets"],
    link: "https://example.com/pulse",
    linkLabel: "See the case study",
  },
  {
    key: "tidepool",
    title: "Tidepool",
    summary: "A command-line log analyser that reads 1 GB in four seconds.",
    category: "Open source",
    year: "2024",
    tags: ["Rust", "CLI"],
    tone: 7,
    layout: 0,
    emoji: "🌊",
    description:
      "Tidepool groups log lines by pattern, draws a histogram in the terminal and points at the first line where the error rate changed. Written in Rust, installed with one command.",
    role: "Author",
    tools: ["Rust", "clap", "criterion"],
    link: "https://github.com/",
    linkLabel: "View on GitHub",
  },
  {
    key: "quill",
    title: "Quill Billing API",
    summary: "The invoicing service behind a payments platform.",
    category: "Work",
    year: "2023",
    tags: ["Node.js", "PostgreSQL"],
    tone: 1,
    layout: 1,
    emoji: "🧾",
    description:
      "Quill issues 2 million invoices a month. I designed the ledger model, the idempotent retry layer and the migration of 80 million rows with zero downtime.",
    role: "Staff engineer",
    tools: ["Node.js", "PostgreSQL", "Kafka"],
    link: "https://example.com/quill",
    linkLabel: "Read the write-up",
  },
  {
    key: "bakeoff",
    title: "Bake-off",
    summary: "A weekend app where friends rate each other's sourdough.",
    category: "Side project",
    year: "2025",
    tags: ["PWA", "Fun"],
    tone: 3,
    layout: 2,
    emoji: "🥖",
    description:
      "Born from a group chat. Bake-off is a PWA with photo upload, blind scoring and a leaderboard. 300 bakers, zero marketing.",
    role: "Everything",
    tools: ["Svelte", "Cloudflare Workers"],
    link: "https://example.com/bakeoff",
    linkLabel: "Try it",
  },
  {
    key: "dotfiles",
    title: "Dotfiles Doctor",
    summary: "Checks your shell setup and says what is slowing it down.",
    category: "Side project",
    year: "2023",
    tags: ["Shell", "Tooling"],
    tone: 4,
    layout: 0,
    emoji: "🩺",
    description:
      "A script that times every line of your shell startup and suggests what to lazy-load. Median saving reported by users: 340 ms per new terminal.",
    role: "Author",
    tools: ["Bash", "Go"],
    link: "https://github.com/",
    linkLabel: "View on GitHub",
  },
];

export const initial: DeveloperLandingState = {
  brand: "Daniel Voss",
  pdfHref: import.meta.env.BASE_URL + "developer-resume.pdf",
  nav: [
    { label: "Stack", href: "#stack" },
    { label: "Experience", href: "#experience" },
    { label: "Projects", href: "#projects" },
    { label: "Contact", href: "#contact" },
  ],
  headline: "I build reliable web software.",
  bio: "Senior full-stack developer in Berlin. Nine years of payments, dashboards and developer tools: TypeScript on both sides of the wire, business logic in small pure functions, and tests you can read.",
  facts: [
    { label: "name", value: "Daniel Voss" },
    { label: "role", value: "Staff engineer" },
    { label: "based", value: "Berlin, remote friendly" },
    { label: "focus", value: "TypeScript, Go, Postgres" },
    { label: "status", value: "open to offers" },
  ],
  skills: [
    skill("TypeScript", 95),
    skill("Node.js", 90),
    skill("React", 85),
    skill("PostgreSQL", 82),
    skill("Go", 68),
    skill("Rust", 42),
  ],
  stackGroups: [
    {
      title: "Languages",
      items: ["TypeScript", "JavaScript", "Go", "SQL", "Rust"],
    },
    {
      title: "Frontend",
      items: ["React", "Vite", "CSS", "Accessibility", "Design systems"],
    },
    {
      title: "Backend",
      items: ["Node.js", "PostgreSQL", "Redis", "Kafka", "REST", "WebSockets"],
    },
    {
      title: "Tooling",
      items: ["Docker", "GitHub Actions", "Kubernetes", "OpenTelemetry"],
    },
  ],
  experience: withLists([
    {
      key: "e3",
      period: "2023 - now",
      title: "Staff engineer",
      org: "Northwind Labs, Berlin",
      points: [
        "Led the move of the checkout to a typed, pure-function core used by 1,200 merchants.",
        "Cut the bundle by 38% and the time to interactive to 1.4 s.",
        "Mentor for six engineers; owner of the engineering handbook.",
      ],
      tags: ["TypeScript", "Go", "PostgreSQL"],
    },
    {
      key: "e2",
      period: "2020 - 2023",
      title: "Senior engineer",
      org: "Brightside, remote",
      points: [
        "Built the streaming pipeline and the dashboard used by 40,000 merchants.",
        "Introduced contract tests between services: incidents down by a third.",
      ],
      tags: ["React", "Node.js", "Kafka"],
    },
    {
      key: "e1",
      period: "2017 - 2020",
      title: "Software engineer",
      org: "Pixel Barn, Berlin",
      text: "Shipped more than twenty sites and web apps for local businesses, from design to deployment.",
      tags: ["JavaScript", "PHP"],
    },
  ]),
  education: withLists([
    {
      key: "d1",
      period: "2011 - 2015",
      title: "BSc Computer Science",
      org: "TU Berlin",
    },
  ]),
  languages: [
    { name: "German", level: "Native" },
    { name: "English", level: "Fluent" },
    { name: "Spanish", level: "Conversational" },
  ],
  projects: projectGridState(projects, {
    filters: true,
    details: true,
  }),
  contacts: [
    {
      title: "daniel@voss.dev",
      note: "Email, best way to reach me",
      href: "mailto:daniel@voss.dev",
    },
    {
      title: "GitHub",
      note: "Code and experiments",
      href: "https://github.com/",
    },
    {
      title: "LinkedIn",
      note: "Work history and recommendations",
      href: "https://linkedin.com/",
    },
  ],
};

/** The projects are a child with its own filter and detail window. */
export class DeveloperLanding extends Component<DeveloperLandingState> {
  view = view;

  children: Children<DeveloperLandingState> = {
    projects: { component: projectGrid, key: "projects" },
  };
}

export const page = new DeveloperLanding();
