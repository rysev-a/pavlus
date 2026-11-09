/**
 * The skill tree (the original's `skills_tree.rs`): the branches of the
 * directory's skills and the ten-segment meter that rates a leaf.
 *
 * Pure helpers — the tree is built here, the meter is drawn by the template
 * (skill-tree.pavlus) and the leaf (leaf.pavlus).
 */

import type { SkillNode } from "../state.ts";

/** One skill of the directory (flat, with its parent). */
export interface FlatSkill {
  id: number;
  slug: string;
  name: string;
  parentId: number | null;
}

/** The zone of a level: 1–3 junior, 4–6 middle, 7–8 senior, 9–10 lead. */
export const zoneOf = (level: number): string => {
  if (level <= 3) return "junior";
  if (level <= 6) return "middle";
  if (level <= 8) return "senior";
  return "lead";
};

/** The ten segments of the meter: the number, its zone and its label. */
export const segmentsOf = (): { n: number; zone: string; label: string }[] =>
  Array.from({ length: 10 }, (_, i) => ({
    n: i + 1,
    zone: zoneOf(i + 1),
    label: String(i + 1),
  }));

/** The rating of a skill (by the skill's id). */
export type LevelRows = { skillId: number; level: number }[];

/** What the tree needs besides the skills themselves. */
export interface TreeOptions {
  /** The labels of the zones ("junior" → "Junior"). */
  zones?: Record<string, string>;
  /** The texts of the meter ("clearRating", "levelAria"). */
  strings?: Record<string, string>;
  /** How deep the tree goes (the template draws three levels). */
  maxDepth?: number;
}

/**
 * The tree of a profession: its skills are the roots, the directory's
 * children hang under them.
 *
 * A branch starts expanded when it is one of the first two levels; a deeper
 * one opens only when it holds a rated skill (the original's
 * `subtree_has_rated`). The depth is limited: the template draws three
 * levels, and what is deeper hangs under the third one.
 */
export const buildTree = (
  skills: FlatSkill[],
  rootIds: number[],
  levels: LevelRows,
  options: TreeOptions = {},
): SkillNode[] => {
  const zones = options.zones ?? {};
  const strings = options.strings ?? {};
  const maxDepth = options.maxDepth ?? 3;
  const byId = new Map(skills.map((s) => [s.id, s]));
  const levelOf = new Map(levels.map((l) => [l.skillId, l.level]));
  const childrenOf = (id: number): FlatSkill[] =>
    skills.filter((s) => s.parentId === id);

  const hasRating = (id: number, depth: number): boolean => {
    if (levelOf.has(id)) return true;
    if (depth >= maxDepth) return false;
    return childrenOf(id).some((c) => hasRating(c.id, depth + 1));
  };

  const node = (skill: FlatSkill, depth: number): SkillNode => {
    const kids =
      depth >= maxDepth
        ? []
        : childrenOf(skill.id).map((c) => node(c, depth + 1));
    const level = levelOf.get(skill.id) ?? null;
    return {
      id: skill.id,
      slug: skill.slug,
      name: skill.name,
      children: kids,
      // the first two levels start expanded, a deeper branch only when it
      // holds a rating
      open: depth < 2 || hasRating(skill.id, depth),
      level,
      zone: level === null ? "" : zoneOf(level),
      levelLabel:
        level === null
          ? "—"
          : `${level} · ${zones[zoneOf(level)] ?? zoneOf(level)}`,
      aria: (strings.levelAria ?? "Level: {skill}").replace(
        "{skill}",
        skill.slug,
      ),
    };
  };

  return rootIds
    .map((id) => byId.get(id))
    .filter((s): s is FlatSkill => s !== undefined)
    .map((s) => node(s, 0));
};

/** The ratings of the leaves, without the one that was cleared. */
export const levelRowsOf = (
  levels: LevelRows,
  skillId: number,
  level: number,
): LevelRows => {
  const rows = levels.filter((l) => l.skillId !== skillId);
  return level > 0 ? [...rows, { skillId, level }] : rows;
};
