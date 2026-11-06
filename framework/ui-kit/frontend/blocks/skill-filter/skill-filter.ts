import { Component, type Effect, type Message } from "@pavlus/frontend";
import { storeEffector as store } from "@pavlus/frontend/plugins";
import view from "./skill-filter.pavlus";

export interface Skill {
  id: string;
  label: string;
}

/** A skill as the chip shows it. */
export interface Chip extends Skill {
  on: boolean;
  /** How many items have the skill (hidden when 0). */
  count: number;
}

/** Pure: adds the skill to the selection, or removes it when it is there. */
export function toggleSkill(selected: string[], id: string): string[] {
  return selected.includes(id)
    ? selected.filter((s) => s !== id)
    : [...selected, id];
}

/** Pure: the chips for a selection; `counts` is optional (skill id -> number). */
export function chipsOf(
  skills: Skill[],
  selected: string[],
  counts: Record<string, number> = {},
): Chip[] {
  return skills.map((s) => ({
    ...s,
    on: selected.includes(s.id),
    count: counts[s.id] ?? 0,
  }));
}

export interface SkillFilterState {
  skills: Skill[];
  selected: string[];
  chips: Chip[];
}

export const SKILLS: Skill[] = [
  { id: "ts", label: "TypeScript" },
  { id: "react", label: "React" },
  { id: "node", label: "Node.js" },
  { id: "go", label: "Go" },
  { id: "rust", label: "Rust" },
  { id: "python", label: "Python" },
  { id: "design", label: "UI design" },
  { id: "ml", label: "Machine learning" },
  { id: "devops", label: "DevOps" },
];

const selected0 = ["ts", "react"];

export const initial: SkillFilterState = {
  skills: SKILLS,
  selected: selected0,
  chips: chipsOf(SKILLS, selected0),
};

/** The page keeps the selection; the chips send `filter.toggle` and `filter.clear`. */
export class SkillFilterPage extends Component<SkillFilterState> {
  view = view;

  "filter.toggle"(msg: Message, state: SkillFilterState): Effect[] {
    const selected = toggleSkill(state.selected, msg.payload as string);
    return [
      store.set("selected", selected),
      store.set("chips", chipsOf(state.skills, selected)),
    ];
  }

  "filter.clear"(_msg: Message, state: SkillFilterState): Effect[] {
    return [
      store.set("selected", []),
      store.set("chips", chipsOf(state.skills, [])),
    ];
  }
}

export const page = new SkillFilterPage();
