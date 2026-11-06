import { Component, type Effect, type Message } from "@pavlus/frontend";
import { storeEffector as store } from "@pavlus/frontend/plugins";
import view from "./profile-card.pavlus";

export type Availability = "open" | "part" | "busy";

/** A person, as stored: skills are ids. */
export interface Profile {
  id: string;
  name: string;
  role: string;
  location: string;
  bio: string;
  skills: string[];
  availability: Availability;
  /** 1-5: the colour of the avatar. */
  tone: number;
}

/** A person, as the card shows them (what `+ProfileCard(...card)` takes). */
export interface CardData {
  id: string;
  name: string;
  initials: string;
  role: string;
  location: string;
  bio: string;
  skills: { label: string; hit: boolean }[];
  availability: Availability;
  availabilityLabel: string;
  /** 0-100, or null when nothing is selected to compare with. */
  score: number | null;
  scoreLevel: "high" | "mid" | "low" | "none";
  tone: number;
  invited: boolean;
  /** "Invite" / "Invited"; the parent may use other words. */
  actionLabel: string;
}

export const AVAILABILITY_LABEL: Record<Availability, string> = {
  open: "Open to projects",
  part: "A few hours a week",
  busy: "Not available",
};

/** Pure: "Ann Lee" -> "AL". */
export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return (
    (parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")
  );
}

/**
 * Pure: how well a person's skills cover the selected ones, 0-100. With
 * nothing selected there is nothing to compare: `null`.
 */
export function matchScore(
  personSkills: string[],
  selected: string[],
): number | null {
  const wanted = [...new Set(selected)];
  if (wanted.length === 0) return null;
  const have = new Set(personSkills);
  const hits = wanted.filter((s) => have.has(s)).length;
  return Math.round((hits / wanted.length) * 100);
}

const levelOf = (score: number | null): CardData["scoreLevel"] =>
  score === null ? "none" : score >= 75 ? "high" : score >= 40 ? "mid" : "low";

/** Pure: a profile as a card; the skills in the selection are marked as hits. */
export function cardOf(
  profile: Profile,
  labels: Record<string, string>,
  selected: string[],
  invited: boolean,
): CardData {
  const score = matchScore(profile.skills, selected);
  return {
    id: profile.id,
    name: profile.name,
    initials: initialsOf(profile.name),
    role: profile.role,
    location: profile.location,
    bio: profile.bio,
    skills: profile.skills.map((id) => ({
      label: labels[id] ?? id,
      hit: selected.includes(id),
    })),
    availability: profile.availability,
    availabilityLabel: AVAILABILITY_LABEL[profile.availability],
    score,
    scoreLevel: levelOf(score),
    tone: profile.tone,
    invited,
    actionLabel: invited ? "Invited" : "Invite",
  };
}

export const LABELS: Record<string, string> = {
  ts: "TypeScript",
  react: "React",
  node: "Node.js",
  go: "Go",
  rust: "Rust",
  python: "Python",
  design: "UI design",
  ml: "Machine learning",
  devops: "DevOps",
};

export interface ProfileCardState {
  selected: string[];
  invitedIds: string[];
  cards: CardData[];
  people: Profile[];
}

const people: Profile[] = [
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
];

const selected0 = ["ts", "react"];

const build = (selected: string[], invitedIds: string[]): CardData[] =>
  people.map((p) => cardOf(p, LABELS, selected, invitedIds.includes(p.id)));

export const initial: ProfileCardState = {
  selected: selected0,
  invitedIds: ["p2"],
  people,
  cards: build(selected0, ["p2"]),
};

/** The page: a click on Invite sends `card.invite` with the person's id. */
export class ProfileCardPage extends Component<ProfileCardState> {
  view = view;

  "card.invite"(msg: Message, state: ProfileCardState): Effect[] {
    const id = msg.payload as string;
    const invitedIds = state.invitedIds.includes(id)
      ? state.invitedIds.filter((x) => x !== id)
      : [...state.invitedIds, id];
    return [
      store.set("invitedIds", invitedIds),
      store.set("cards", build(state.selected, invitedIds)),
    ];
  }
}

export const page = new ProfileCardPage();
