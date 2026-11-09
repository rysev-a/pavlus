/**
 * One rated skill (the original's `LevelRow`): the name, the ten segments of
 * the meter and the rating.
 *
 * The leaf is a child of the tree (skill-tree.ts): the tree owns the ratings,
 * so the leaf only sends its events — the tree answers them.
 */
import { Component, type Effect, type Message } from "@pavlus/frontend";
import { DomPlugin } from "@pavlus/frontend/plugins/dom";
import type { SkillNode } from "../state.ts";
import view from "./leaf.pavlus";

/** What the leaf reads from the tree that shows it. */
export interface LeafState {
  /** The skill (the name, the slug, the rating, the zone). */
  skill: SkillNode;
  /** The segment under the pointer (the preview of the rating). */
  hover: { skillId: number; level: number };
  /** The ten segments of the meter. */
  segments: { n: number; zone: string; label: string }[];
  /** The texts of the meter. */
  strings: Record<string, string>;
}

export class SkillLeaf extends Component<LeafState> {
  view = view;

  paint(msg: Message): Effect[] {
    const { prev, next } = msg.payload as {
      prev: LeafState;
      next: LeafState;
    };
    return [DomPlugin.update(view.diff(prev, next))];
  }

  /** The tree owns the ratings: the events travel to it. */
  rate(): Effect[] {
    return [];
  }

  /** The pointer leaves the meter: the preview is over. */
  preview(): Effect[] {
    return [];
  }

  /** "×": the rating is cleared. */
  clear(): Effect[] {
    return [];
  }
}
