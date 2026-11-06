import { Component, type Effect, type Message } from "@pavlus/frontend";
import { storeEffector as store } from "@pavlus/frontend/plugins";
import {
  type CardData,
  cardOf,
  LABELS,
  matchScore,
  type Profile,
} from "../../blocks/profile-card/profile-card.ts";
import type { NavLink } from "../../blocks/site-nav/site-nav.ts";
import {
  type Chip,
  chipsOf,
  SKILLS,
  toggleSkill,
} from "../../blocks/skill-filter/skill-filter.ts";
import view from "./team-matcher-service.pavlus";

export type Tab = "people" | "projects" | "sent";

export interface Project {
  id: string;
  title: string;
  owner: string;
  emoji: string;
  summary: string;
  /** The skill ids the project needs. */
  needs: string[];
  /** How many people are still wanted. */
  seats: number;
  commitment: string;
}

export interface ProjectCard extends Omit<Project, "needs"> {
  needs: { label: string; hit: boolean }[];
  /** How much of what the project needs the selected skills cover; null when nothing is selected. */
  fit: number | null;
  interested: boolean;
}

export interface SentItem {
  key: string;
  kind: "invite" | "request";
  title: string;
  note: string;
  /** The message that takes it back: `card.invite` or `project.toggle`, with `id`. */
  id: string;
}

export const PEOPLE: Profile[] = [
  {
    id: "p1",
    name: "Nora Lindqvist",
    role: "Frontend engineer",
    location: "Stockholm, SE",
    bio: "Design systems and accessible interfaces. Happiest when a form just works.",
    skills: ["ts", "react", "design"],
    availability: "open",
    tone: 1,
  },
  {
    id: "p2",
    name: "Diego Marín",
    role: "Backend developer",
    location: "Valencia, ES",
    bio: "APIs, queues and databases that do not wake you up at night.",
    skills: ["node", "go", "devops", "ts"],
    availability: "part",
    tone: 2,
  },
  {
    id: "p3",
    name: "Aiko Tanaka",
    role: "ML engineer",
    location: "Osaka, JP",
    bio: "Turning messy data into small models that ship.",
    skills: ["python", "ml", "rust"],
    availability: "busy",
    tone: 4,
  },
  {
    id: "p4",
    name: "Marcus Bell",
    role: "Full-stack developer",
    location: "Austin, US",
    bio: "Prototypes in a weekend, production in a month. Loves a tight feedback loop.",
    skills: ["ts", "react", "node", "devops"],
    availability: "open",
    tone: 3,
  },
  {
    id: "p5",
    name: "Zainab Hassan",
    role: "Product designer",
    location: "Cairo, EG",
    bio: "Research-led UI for tools people use all day. Ships Figma and CSS.",
    skills: ["design", "react", "ts"],
    availability: "open",
    tone: 5,
  },
  {
    id: "p6",
    name: "Lukas Novak",
    role: "Systems programmer",
    location: "Prague, CZ",
    bio: "Rust and Go for the parts that must be fast and correct.",
    skills: ["rust", "go", "devops"],
    availability: "part",
    tone: 1,
  },
  {
    id: "p7",
    name: "Priya Raman",
    role: "Data scientist",
    location: "Bengaluru, IN",
    bio: "Forecasting, recommendations and dashboards that explain themselves.",
    skills: ["python", "ml", "ts"],
    availability: "open",
    tone: 2,
  },
  {
    id: "p8",
    name: "Tomás Ferreira",
    role: "Platform engineer",
    location: "Porto, PT",
    bio: "Kubernetes without the drama: pipelines, observability, cost control.",
    skills: ["devops", "go", "python", "node"],
    availability: "busy",
    tone: 4,
  },
];

export const PROJECTS: Project[] = [
  {
    id: "j1",
    title: "Bookshelf club",
    owner: "Mina K.",
    emoji: "📚",
    summary:
      "A social reading app: shared shelves, reading streaks and a weekly pick for friends.",
    needs: ["react", "ts", "design"],
    seats: 2,
    commitment: "6 hours a week, unpaid, 3 months",
  },
  {
    id: "j2",
    title: "Trailmap API",
    owner: "Oskar L.",
    emoji: "🥾",
    summary:
      "An open API of hiking routes with offline tiles. The backend is half done and needs friends.",
    needs: ["go", "devops", "node"],
    seats: 1,
    commitment: "Evenings, revenue share",
  },
  {
    id: "j3",
    title: "Plant doctor",
    owner: "Hana S.",
    emoji: "🪴",
    summary:
      "Take a photo of a sick plant, get a diagnosis and a care plan. Needs a model and an app.",
    needs: ["python", "ml", "react"],
    seats: 3,
    commitment: "8 hours a week, small grant",
  },
  {
    id: "j4",
    title: "Tiny terminal",
    owner: "Jules B.",
    emoji: "⌨️",
    summary:
      "A fast, friendly terminal emulator written in Rust. Looking for people who enjoy the details.",
    needs: ["rust", "design"],
    seats: 1,
    commitment: "Open source, flexible",
  },
];

/** Pure: the share of what a project needs that the selected skills cover; null with nothing selected. */
export function projectFit(needs: string[], selected: string[]): number | null {
  const wanted = [...new Set(needs)];
  if (selected.length === 0 || wanted.length === 0) return null;
  const have = new Set(selected);
  return Math.round(
    (wanted.filter((n) => have.has(n)).length / wanted.length) * 100,
  );
}

/** Pure: people by match score (best first), then by who is free, then by name. */
export function rankPeople(
  people: Profile[],
  selected: string[],
  onlyOpen: boolean,
  query: string,
): Profile[] {
  const q = query.trim().toLowerCase();
  const free = { open: 0, part: 1, busy: 2 } as const;
  return people
    .filter((p) => !onlyOpen || p.availability !== "busy")
    .filter(
      (p) =>
        !q ||
        p.name.toLowerCase().includes(q) ||
        p.role.toLowerCase().includes(q),
    )
    .map((p) => ({ p, score: matchScore(p.skills, selected) ?? 0 }))
    .sort(
      (a, b) =>
        b.score - a.score ||
        free[a.p.availability] - free[b.p.availability] ||
        a.p.name.localeCompare(b.p.name),
    )
    .map((x) => x.p);
}

/** Pure: projects, the ones that fit the selected skills best first. */
export function rankProjects(
  projects: Project[],
  selected: string[],
  interestedIds: string[],
): ProjectCard[] {
  return projects
    .map((p) => ({
      ...p,
      needs: p.needs.map((id) => ({
        label: LABELS[id] ?? id,
        hit: selected.includes(id),
      })),
      fit: projectFit(p.needs, selected),
      interested: interestedIds.includes(p.id),
    }))
    .sort((a, b) => (b.fit ?? 0) - (a.fit ?? 0));
}

/** Pure: the sent list: invites to people, then requests to join projects. */
export function sentList(
  people: Profile[],
  projects: Project[],
  invitedIds: string[],
  interestedIds: string[],
): SentItem[] {
  return [
    ...invitedIds.flatMap((id) => {
      const p = people.find((x) => x.id === id);
      return p
        ? [
            {
              key: `invite-${id}`,
              kind: "invite" as const,
              title: p.name,
              note: `Invite to work together · ${p.role}`,
              id,
            },
          ]
        : [];
    }),
    ...interestedIds.flatMap((id) => {
      const j = projects.find((x) => x.id === id);
      return j
        ? [
            {
              key: `request-${id}`,
              kind: "request" as const,
              title: j.title,
              note: `Request to join · ${j.owner}`,
              id,
            },
          ]
        : [];
    }),
  ];
}

export interface MatcherState {
  nav: NavLink[];
  skills: typeof SKILLS;
  selected: string[];
  onlyOpen: boolean;
  query: string;
  tab: Tab;
  invitedIds: string[];
  interestedIds: string[];
  // derived
  chips: Chip[];
  cards: CardData[];
  projects: ProjectCard[];
  sent: SentItem[];
}

type Inputs = Pick<
  MatcherState,
  "selected" | "onlyOpen" | "query" | "invitedIds" | "interestedIds"
>;

/** Pure: everything that follows from the inputs. */
export function derive(
  s: Inputs,
): Pick<MatcherState, "chips" | "cards" | "projects" | "sent"> {
  const counts: Record<string, number> = {};
  for (const p of PEOPLE)
    for (const id of p.skills) counts[id] = (counts[id] ?? 0) + 1;
  return {
    chips: chipsOf(SKILLS, s.selected, counts),
    cards: rankPeople(PEOPLE, s.selected, s.onlyOpen, s.query).map((p) =>
      cardOf(p, LABELS, s.selected, s.invitedIds.includes(p.id)),
    ),
    projects: rankProjects(PROJECTS, s.selected, s.interestedIds),
    sent: sentList(PEOPLE, PROJECTS, s.invitedIds, s.interestedIds),
  };
}

const base: Inputs = {
  selected: ["ts", "react"],
  onlyOpen: false,
  query: "",
  invitedIds: ["p4"],
  interestedIds: [],
};

export const initial: MatcherState = {
  nav: [
    { label: "Find people", href: "#people" },
    { label: "Projects", href: "#people" },
  ],
  skills: SKILLS,
  tab: "people",
  ...base,
  ...derive(base),
};

const replace = (patch: Partial<MatcherState>): Effect[] =>
  Object.entries(patch).map(([k, v]) => store.set(k, v));

const toggleId = (list: string[], id: string): string[] =>
  list.includes(id) ? list.filter((x) => x !== id) : [...list, id];

export class TeamMatcherService extends Component<MatcherState> {
  view = view;

  "filter.toggle"(msg: Message, s: MatcherState): Effect[] {
    const selected = toggleSkill(s.selected, msg.payload as string);
    return replace({ selected, ...derive({ ...s, selected }) });
  }

  "filter.clear"(_msg: Message, s: MatcherState): Effect[] {
    return replace({ selected: [], ...derive({ ...s, selected: [] }) });
  }

  "card.invite"(msg: Message, s: MatcherState): Effect[] {
    const invitedIds = toggleId(s.invitedIds, msg.payload as string);
    return replace({ invitedIds, ...derive({ ...s, invitedIds }) });
  }

  /** The "interested" button of a project card (and "Take back" in the sent list). */
  toggleInterest(msg: Message, s: MatcherState): Effect[] {
    const interestedIds = toggleId(s.interestedIds, msg.payload as string);
    return replace({ interestedIds, ...derive({ ...s, interestedIds }) });
  }

  /** "Take back" an invite from the sent list. */
  withdraw(msg: Message, s: MatcherState): Effect[] {
    const invitedIds = s.invitedIds.filter((x) => x !== msg.payload);
    return replace({ invitedIds, ...derive({ ...s, invitedIds }) });
  }

  setTab(msg: Message): Effect[] {
    return [store.set("tab", msg.payload as Tab)];
  }

  setOpen(msg: Message, s: MatcherState): Effect[] {
    const onlyOpen = Boolean(msg.event?.checked);
    return replace({ onlyOpen, ...derive({ ...s, onlyOpen }) });
  }

  setQuery(msg: Message, s: MatcherState): Effect[] {
    const query = String(msg.event?.value ?? "");
    return replace({ query, ...derive({ ...s, query }) });
  }
}

export const page = new TeamMatcherService();
