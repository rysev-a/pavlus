/**
 * The professions page (`/app/professions`): the professions of the member
 * with their grade, the directory to add from, and the skills of the chosen
 * profession with their rating.
 *
 * The skills are chosen inside a profession (the original's tree): the
 * directory keeps the tree, the page shows the branch of the profession.
 */
import { Component, type Effect, type Message } from "@pavlus/frontend";
import {
  httpEffector as http,
  storeEffector as store,
} from "@pavlus/frontend/plugins";
import { DomPlugin } from "@pavlus/frontend/plugins/dom";
import { SkillTree } from "../skill-tree/skill-tree.ts";
import { buildTree, segmentsOf } from "../skill-tree/tree.ts";
import type { AppState, MySkill } from "../state.ts";
import view from "./professions.pavlus";

/** The page's slice: what the outlet hands it (state.professions). */
export type ProfessionsSlice = AppState["professions"];

export class ProfessionsPage extends Component<ProfessionsSlice> {
  view = view;

  /** The tree of the skills (the original's `render_node`). */
  private readonly tree = new SkillTree();

  /** The embedded children, by instance name (`tree.…` goes to the tree). */
  children = { tree: { component: this.tree } };

  /** The directory (the skill tree and the links to the professions). */
  private skills: ProfessionsSlice["skills"] = [];
  private links: { professionId: number; skillId: number }[] = [];

  paint(msg: Message): Effect[] {
    const { prev, next } = msg.payload as {
      prev: ProfessionsSlice;
      next: ProfessionsSlice;
    };
    return [DomPlugin.update(view.diff(prev, next))];
  }

  enter(): Effect[] {
    return [
      store.set("error", "", { onSuccess: "paint" }),
      store.set("notice", "", { onSuccess: "paint" }),
      http.request({
        id: "directory",
        url: "/api/directory",
        onSuccess: "directory.loaded",
        onError: "directory.failed",
      }),
      http.request({
        id: "profile",
        url: "/api/profile/me",
        onSuccess: "profile.loaded",
        onError: "profile.failed",
      }),
    ];
  }

  /** The skills of a profession: the branch of the tree with the rating. */
  private skillsOf(
    professionId: number,
    mine: MySkill[],
  ): ProfessionsSlice["openSkills"] {
    const ids = this.links
      .filter((l) => l.professionId === professionId)
      .map((l) => l.skillId);
    const roots = this.skills.filter((s) => ids.includes(s.id));
    const leaves = this.skills.filter(
      (s) => s.parentId !== null && ids.includes(s.parentId),
    );
    return [...roots, ...leaves].map((s) => ({
      id: s.id,
      slug: s.slug,
      name: s.name,
      level: mine.find((k) => k.skillId === s.id)?.level ?? null,
    }));
  }

  /** The tree of the open profession (the branches and the rated leaves). */
  private treeOf(
    s: ProfessionsSlice,
    professionId: number,
    mine: MySkill[],
  ): Effect[] {
    const ids = this.links
      .filter((l) => l.professionId === professionId)
      .map((l) => l.skillId);
    const zones: Record<string, string> = {};
    for (const bucket of s.buckets) zones[bucket.value] = bucket.label;
    const levels = mine
      .filter((k) => k.level !== null)
      .map((k) => ({ skillId: k.skillId, level: k.level as number }));
    return [
      store.set(
        "tree.roots",
        buildTree(this.skills, ids, levels, {
          zones,
          strings: s.tree.strings,
        }),
        { onSuccess: "paint" },
      ),
      store.set("tree.levels", levels, { onSuccess: "paint" }),
      store.set("tree.segments", segmentsOf(), { onSuccess: "paint" }),
      store.set("tree.hover", { skillId: 0, level: 0 }, { onSuccess: "paint" }),
    ];
  }

  /** The directory: the professions and the skill tree. */
  "directory.loaded"(msg: Message): Effect[] {
    const data = msg.payload as {
      data: {
        professions: { id: number; slug: string; name: string }[];
        skills: ProfessionsSlice["skills"];
        professionSkills: { professionId: number; skillId: number }[];
        strings?: Record<string, string>;
      };
    };
    this.skills = data.data.skills ?? [];
    this.links = data.data.professionSkills ?? [];
    const strings = data.data.strings ?? {};
    return [
      store.merge(data.data as unknown as Record<string, unknown>, {
        onSuccess: "paint",
      }),
      // the texts of the meter live in the tree
      store.set(
        "tree.strings",
        {
          clearRating: strings.clearRating ?? "Clear the rating",
          levelAria: strings.levelAria ?? "Level: {skill}",
        },
        { onSuccess: "paint" },
      ),
      store.set("tree.segments", segmentsOf(), { onSuccess: "paint" }),
    ];
  }

  /** The skills of the open profession again. */
  private openSkills(): Effect[] {
    const effects: Effect[] = [];
    return effects;
  }

  "directory.failed"(): Effect[] {
    return [];
  }

  /** The profile of the member: the professions and the skills. */
  "profile.loaded"(msg: Message, s: ProfessionsSlice): Effect[] {
    const data = msg.payload as {
      data: {
        professions: ProfessionsSlice["mine"];
        skills: ProfessionsSlice["mySkills"];
      };
    };
    const mine = data.data.professions ?? [];
    const open = s.open ? mine.find((p) => p.slug === s.open) : undefined;
    return [
      store.merge(data.data as unknown as Record<string, unknown>, {
        onSuccess: "paint",
      }),
      store.set(
        "openSkills",
        open ? this.skillsOf(open.professionId, data.data.skills ?? []) : [],
        { onSuccess: "paint" },
      ),
      ...(open
        ? this.treeOf(s, open.professionId, data.data.skills ?? [])
        : []),
    ];
  }

  "profile.failed"(): Effect[] {
    return [];
  }

  /** The grade of the new profession. */
  setBucket(msg: Message): Effect[] {
    return [
      store.set("bucket", msg.event?.value ?? "", { onSuccess: "paint" }),
    ];
  }

  /** The profession whose skills are open. */
  open(msg: Message, s: ProfessionsSlice): Effect[] {
    const slug = String(msg.payload ?? "");
    const profession = s.mine.find((p) => p.slug === slug);
    return [
      store.set("open", slug, { onSuccess: "paint" }),
      store.set(
        "openSkills",
        profession ? this.skillsOf(profession.professionId, s.mySkills) : [],
        { onSuccess: "paint" },
      ),
      ...(profession
        ? this.treeOf(s, profession.professionId, s.mySkills)
        : []),
    ];
  }

  /** The profession is added (with its grade). */
  add(msg: Message, s: ProfessionsSlice): Effect[] {
    const id = Number(msg.payload);
    if (!Number.isInteger(id) || s.busy) return [];
    const bucket = s.bucket || s.buckets[0]?.value || "middle";
    const rows = [
      ...s.mine.map((p) => ({
        professionId: p.professionId,
        bucket: p.bucket,
      })),
      { professionId: id, bucket },
    ];
    return [
      store.set("busy", true, { onSuccess: "paint" }),
      http.request({
        id: "professions.save",
        method: "PUT",
        url: "/api/profile/professions",
        body: { professions: rows },
        onSuccess: "professions.saved",
        onError: "write.failed",
      }),
    ];
  }

  /** The profession is removed (its skills go with it). */
  remove(msg: Message, s: ProfessionsSlice): Effect[] {
    const id = Number(msg.payload);
    if (!Number.isInteger(id) || s.busy) return [];
    const rows = s.mine
      .filter((p) => p.professionId !== id)
      .map((p) => ({ professionId: p.professionId, bucket: p.bucket }));
    return [
      store.set("busy", true, { onSuccess: "paint" }),
      http.request({
        id: "professions.save",
        method: "PUT",
        url: "/api/profile/professions",
        body: { professions: rows },
        onSuccess: "professions.saved",
        onError: "write.failed",
      }),
    ];
  }

  "professions.saved"(msg: Message): Effect[] {
    return [
      store.set("busy", false, { onSuccess: "paint" }),
      store.set("notice", "", { onSuccess: "paint" }),
      http.request({
        id: "profile",
        url: "/api/profile/me",
        onSuccess: "profile.loaded",
        onError: "profile.failed",
      }),
    ];
  }

  /**
   * The tree changed a rating (the meter): the skills are saved.
   *
   * The tree owns the ratings of the whole profile, so the body carries every
   * rated leaf — the ones of the other professions travel along.
   */
  "tree.changed"(_msg: Message, s: ProfessionsSlice): Effect[] {
    if (s.busy) return [];
    const rows = s.tree.levels.map((l) => ({
      skillId: l.skillId,
      level: l.level,
    }));
    if (!rows.length) return [];
    return [
      store.set("busy", true, { onSuccess: "paint" }),
      http.request({
        id: "skills.save",
        method: "PUT",
        url: "/api/profile/skills",
        body: { skills: rows },
        onSuccess: "skills.saved",
        onError: "write.failed",
      }),
    ];
  }

  "skills.saved"(): Effect[] {
    return [
      store.set("busy", false, { onSuccess: "paint" }),
      http.request({
        id: "profile",
        url: "/api/profile/me",
        onSuccess: "profile.loaded",
        onError: "profile.failed",
      }),
    ];
  }

  /** Something went wrong: the backend's own words. */
  "write.failed"(msg: Message): Effect[] {
    const error = (msg.payload as { error?: string }).error ?? "";
    return [
      store.set("busy", false, { onSuccess: "paint" }),
      store.set("error", error, { onSuccess: "paint" }),
    ];
  }
}
