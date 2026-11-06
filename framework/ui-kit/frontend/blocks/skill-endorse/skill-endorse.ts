import { Component, type Effect, type Message } from "@pavlus/frontend";
import { storeEffector as store } from "@pavlus/frontend/plugins";
import view from "./skill-endorse.pavlus";

export interface Skill {
  id: string;
  name: string;
  /** Endorsements by others, without mine. */
  count: number;
  /** Who endorsed, for the line under the name. */
  by: string[];
}

export interface SkillRow {
  id: string;
  name: string;
  count: number;
  share: number;
  endorsed: boolean;
  who: string;
}

/** Pure: `Ada, Leo and 12 others`. */
export function whoLine(
  by: string[],
  count: number,
  endorsed: boolean,
): string {
  const names = endorsed ? ["You", ...by] : by;
  const total = count + (endorsed ? 1 : 0);
  if (total === 0) return "No endorsements yet";
  const shown = names.slice(0, 2);
  const others = total - shown.length;
  if (others <= 0) return shown.join(" and ");
  return `${shown.join(", ")} and ${others} ${others === 1 ? "other" : "others"}`;
}

/** Pure: the rows, most endorsed first; the bar is relative to the top one. */
export function skillRows(list: Skill[], endorsed: string[]): SkillRow[] {
  const rows = list.map((s) => {
    const mine = endorsed.includes(s.id);
    return { s, mine, count: s.count + (mine ? 1 : 0) };
  });
  const top = Math.max(1, ...rows.map((r) => r.count));
  return rows
    .sort((a, b) => b.count - a.count)
    .map((r) => ({
      id: r.s.id,
      name: r.s.name,
      count: r.count,
      share: Math.round((r.count / top) * 100),
      endorsed: r.mine,
      who: whoLine(r.s.by, r.s.count, r.mine),
    }));
}

/** Pure: add or remove an endorsement. */
export const toggleEndorse = (ids: string[], id: string): string[] =>
  ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id];

export const SKILLS: Skill[] = [
  {
    id: "k1",
    name: "Product design",
    count: 41,
    by: ["Ana Pires", "Leo Park"],
  },
  {
    id: "k2",
    name: "Design systems",
    count: 27,
    by: ["Ravi Nair", "Ana Pires"],
  },
  { id: "k3", name: "User research", count: 9, by: ["Mia Sol"] },
  { id: "k4", name: "Prototyping", count: 0, by: [] },
];

export interface SkillState {
  endorsed: string[];
  skills: { title: string; own: boolean; skills: SkillRow[] };
}

const props = (endorsed: string[]) => ({
  title: "Skills and endorsements",
  own: false,
  skills: skillRows(SKILLS, endorsed),
});

export const initial: SkillState = { endorsed: ["k2"], skills: props(["k2"]) };

export class SkillEndorsePage extends Component<SkillState> {
  view = view;

  "skills.endorse"(msg: Message, state: SkillState): Effect[] {
    const endorsed = toggleEndorse(state.endorsed, msg.payload as string);
    return [
      store.set("endorsed", endorsed),
      store.set("skills", props(endorsed)),
    ];
  }
}

export const page = new SkillEndorsePage();
