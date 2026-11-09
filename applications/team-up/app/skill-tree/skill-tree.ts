/**
 * The skill tree (the original's `skills_tree.rs`): the branches of the
 * directory's skills and the meter that rates a leaf.
 *
 * The tree is a child of the page that shows it (`+SkillTree#tree`): a
 * keyless child, so it sees the page's whole state and its messages arrive
 * as `tree.…`. The leaves are its own children (`+SkillLeaf#leaf`).
 *
 * The tree owns the ratings of the tree (`tree.levels`): a click on a
 * segment writes them and tells the page (`tree.changed`), which saves them
 * where they belong — the profile's skills or the slot's requirements.
 */
import {
  type Children,
  Component,
  type Effect,
  type Message,
} from "@pavlus/frontend";
import { storeEffector as store } from "@pavlus/frontend/plugins";
import { DomPlugin } from "@pavlus/frontend/plugins/dom";
import type { SkillTreeSlice } from "../state.ts";
import { SkillLeaf } from "./leaf.ts";
import { levelRowsOf } from "./tree.ts";
import view from "./skill-tree.pavlus";

/** What the tree reads from the page that shows it. */
export interface SkillTreeState {
  tree: SkillTreeSlice;
}

export class SkillTree extends Component<SkillTreeState> {
  view = view;

  /** The leaves of the tree (the rated rows). */
  private readonly leaf = new SkillLeaf();

  /** The embedded children, by instance name (`leaf.…` goes to the leaf). */
  children: Children<SkillTreeState> = {
    leaf: { component: this.leaf },
  };

  paint(msg: Message): Effect[] {
    const { prev, next } = msg.payload as {
      prev: SkillTreeState;
      next: SkillTreeState;
    };
    return [DomPlugin.update(view.diff(prev, next))];
  }

  /** The ratings changed: the tree repaints (the page was told already). */
  changed(msg: Message): Effect[] {
    const { prev, next } = msg.payload as {
      prev: SkillTreeState;
      next: SkillTreeState;
    };
    return [DomPlugin.update(view.diff(prev, next))];
  }

  /** A segment was clicked: the skill gets that level. */
  "leaf.rate"(msg: Message, s: SkillTreeState): Effect[] {
    const payload = msg.payload as [number, number];
    const skillId = Number(payload?.[0]);
    const level = Number(payload?.[1]);
    if (!Number.isInteger(skillId) || level < 1 || level > 10) return [];
    return [
      store.set("tree.levels", levelRowsOf(s.tree.levels, skillId, level), {
        onSuccess: "changed",
      }),
    ];
  }

  /** "×": the rating is cleared. */
  "leaf.clear"(msg: Message, s: SkillTreeState): Effect[] {
    const skillId = Number(msg.payload);
    if (!Number.isInteger(skillId)) return [];
    return [
      store.set("tree.levels", levelRowsOf(s.tree.levels, skillId, 0), {
        onSuccess: "changed",
      }),
    ];
  }

  /** The pointer previews the rating (and leaves it when it goes away). */
  "leaf.preview"(msg: Message): Effect[] {
    const payload = msg.payload as [number, number];
    const skillId = Number(payload?.[0]);
    const level = Number(payload?.[1]);
    if (!Number.isInteger(skillId)) return [];
    return [
      store.set(
        "tree.hover",
        { skillId: skillId || 0, level: level || 0 },
        { onSuccess: "paint" },
      ),
    ];
  }
}
