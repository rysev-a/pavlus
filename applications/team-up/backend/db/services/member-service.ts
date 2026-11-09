/**
 * The members service: the public directory (`/users`) and the member page
 * (`/users/{slug}`) — the rows behind them and the filter semantics of the
 * directory. The original teamUP had the same in `routes.rs`
 * (`profiles_all`, `profile_by_slug`, `profile_matches_*`, `sort_profiles`,
 * `collect_unique`, `skill_groups`); the rules are the same here.
 */

import { db, sql } from "@pavlus/backend";
import { type Tr } from "../../i18n/mod.ts";
import {
  avatarHueClass,
  initialsOf,
  roleCssClass,
  roleOf,
} from "../../lib/views.ts";

/** One profession of a member: the directory's name and the member's grade. */
export interface MemberProfession {
  slug: string;
  name: string;
  bucket: string;
}

/** One row of the directory. */
export interface MemberRow {
  userId: number;
  slug: string;
  name: string;
  city: string;
  bio: string;
  status: string;
  labels: string[];
  birthYear: number | null;
  createdAt: string;
  updatedAt: string;
  lastLoginAt: string | null;
  professions: MemberProfession[];
}

/** One rated skill of a member, with the profession it was rated in. */
export interface MemberSkillRow {
  professionSlug: string;
  professionName: string;
  bucket: string;
  skillSlug: string | null;
  skillName: string | null;
  level: number | null;
}

/** The card of a member (the shape `app/state.ts` declares). */
export interface MemberCard {
  slug: string;
  name: string;
  role: string;
  roleClass: string;
  bio: string;
  city: string;
  labels: string[];
  professions: string[];
  tags: string[];
  initials: string;
  avatarClass: string;
}

/** The skills of one profession, with the bar of ten segments. */
export interface SkillBar {
  slug: string;
  name: string;
  level: number;
  segments: string[];
}

/** The skills of one profession of a member. */
export interface SkillGroup {
  title: string;
  skills: SkillBar[];
}

/** The grades of the professions: junior 0 … lead 3. */
const LEVEL_RANKS: Record<string, number> = {
  junior: 0,
  middle: 1,
  senior: 2,
  lead: 3,
};

/** The rank of a grade slug ("Senior" → 2); undefined for anything else. */
export function levelRank(slug: string): number | undefined {
  return LEVEL_RANKS[slug.trim().toLowerCase()];
}

/** The status kinds of the directory: `in-search`, `open`, `not-searching`, `founder`. */
export const STATUS_KINDS: readonly string[] = [
  "in-search",
  "open",
  "not-searching",
  "founder",
];

/**
 * The kind of a member's status: a member who has none saved counts as not
 * looking (the original's `status_kind`).
 */
export function statusKind(status: string): string {
  switch (status) {
    case "searching":
      return "in-search";
    case "open":
      return "open";
    case "founder":
      return "founder";
    default:
      return "not-searching";
  }
}

/** The status a kind stands for (the text of a member's status). */
export function kindStatus(kind: string): string {
  return kind === "in-search" ? "searching" : kind;
}

/** First letter upper-case ("senior" → "Senior"). */
export function capitalize(value: string): string {
  return value.length === 0 ? value : value[0].toUpperCase() + value.slice(1);
}

/**
 * The unique values of a list: the first spelling wins, compared without the
 * case, and the list is sorted without the case (the original's
 * `collect_unique`).
 */
export function collectUnique(values: readonly string[]): string[] {
  const out: string[] = [];
  for (const raw of values) {
    const value = raw.trim();
    if (value === "") continue;
    const lower = value.toLowerCase();
    if (!out.some((known) => known.toLowerCase() === lower)) out.push(value);
  }
  return out.sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
}

/**
 * The level filter: a member matches when one of the grades of its
 * professions is chosen. A chosen label that names one of the member's
 * professions narrows the filter to that profession ("Backend developer" +
 * "Senior" finds a senior backend, not a senior designer who is a junior
 * backend); a domain alone narrows nothing.
 */
export function matchesLevels(
  row: MemberRow,
  labels: readonly string[],
  levels: readonly number[],
): boolean {
  if (levels.length === 0) return true;
  const chosen = row.professions.filter((profession) =>
    labels.some(
      (label) => label.toLowerCase() === profession.name.toLowerCase(),
    ),
  );
  const candidates = chosen.length > 0 ? chosen : row.professions;
  return candidates.some((profession) => {
    const rank = levelRank(profession.bucket);
    return rank !== undefined && levels.includes(rank);
  });
}

/** The labels: OR over the labels of the member, compared without the case. */
export function matchesLabels(
  row: MemberRow,
  selected: readonly string[],
): boolean {
  if (selected.length === 0) return true;
  return selected.some((want) =>
    row.labels.some((label) => label.toLowerCase() === want.toLowerCase()),
  );
}

/** The cities: OR, an exact match. */
export function matchesCities(
  row: MemberRow,
  selected: readonly string[],
): boolean {
  if (selected.length === 0) return true;
  return selected.some((want) => want === row.city);
}

/** The statuses: OR; a member without a status counts as not looking. */
export function matchesStatuses(
  row: MemberRow,
  selected: readonly string[],
): boolean {
  if (selected.length === 0) return true;
  const kind = statusKind(row.status);
  return selected.includes(kind);
}

/** The age of a member (the year they were born); 0 when unknown. */
export function ageOf(row: MemberRow): number {
  if (row.birthYear === null) return 0;
  return new Date().getFullYear() - row.birthYear;
}

/** The sorts of the directory; all of them descending. */
export type MemberSort = "created" | "updated" | "last_login" | "age";

/** The sort of a query value (anything unknown is the default). */
export function sortOf(value: string | undefined): MemberSort {
  switch (value) {
    case "updated":
      return "updated";
    case "last_login":
      return "last_login";
    case "age":
      return "age";
    default:
      return "created";
  }
}

/** Sorts the members; every key descends (newer, older, later sign-in first). */
export function sortMembers(rows: MemberRow[], sort: MemberSort): MemberRow[] {
  const by = (row: MemberRow): string | number => {
    switch (sort) {
      case "updated":
        return row.updatedAt;
      case "last_login":
        return row.lastLoginAt ?? "";
      case "age":
        return ageOf(row);
      default:
        return row.createdAt;
    }
  };
  return [...rows].sort((a, b) => {
    const left = by(a);
    const right = by(b);
    if (left === right) return b.userId - a.userId;
    return left < right ? 1 : -1;
  });
}

/** "Senior Backend developer" — the grade and the profession of a member. */
export function professionTitle(tr: Tr, profession: MemberProfession): string {
  return `${capitalize(profession.bucket)} ${tr.tr(profession.name)}`;
}

/** The card of a member: the directory's view of one row. */
export function memberCard(tr: Tr, row: MemberRow): MemberCard {
  const shown = new Set(
    row.professions.map((profession) => profession.name.toLowerCase()),
  );
  return {
    slug: row.slug,
    name: row.name,
    role: roleOf(tr, row.status),
    roleClass: roleCssClass(row.status),
    bio: row.bio,
    city: tr.tr(row.city),
    labels: row.labels.map((label) => tr.tr(label)),
    professions: row.professions.map((profession) =>
      professionTitle(tr, profession),
    ),
    // the labels that are not a profession already shown
    tags: row.labels
      .filter((label) => !shown.has(label.toLowerCase()))
      .map((label) => tr.tr(label)),
    initials: initialsOf(row.name),
    avatarClass: avatarHueClass("user-avatar", row.slug),
  };
}

/** The ten segments of a skill bar: 1–3 red, 4–6 yellow, 7–10 green. */
export function skillBar(slug: string, name: string, level: number): SkillBar {
  const clamped = Math.min(Math.max(level, 0), 10);
  const segments: string[] = [];
  for (let i = 1; i <= 10; i++) {
    if (i > clamped) segments.push("off");
    else if (i <= 3) segments.push("red");
    else if (i <= 6) segments.push("yellow");
    else segments.push("green");
  }
  return { slug, name, level: clamped, segments };
}

/**
 * The rated skills of a member, grouped by profession: one group per
 * profession of the member (the title is the grade and the profession), the
 * skills of the profession's tree the member has rated, the highest first. A
 * skill that sits in the trees of two professions shows under both.
 */
export function skillGroups(
  tr: Tr,
  row: MemberRow,
  skills: readonly MemberSkillRow[],
): SkillGroup[] {
  const groups = new Map<string, SkillGroup>();
  for (const profession of row.professions) {
    groups.set(profession.slug, {
      title: professionTitle(tr, profession),
      skills: [],
    });
  }
  for (const entry of skills) {
    const group = groups.get(entry.professionSlug);
    if (!group || entry.level === null || entry.level <= 0) continue;
    group.skills.push(
      skillBar(
        entry.skillSlug ?? "",
        tr.tr(entry.skillName ?? ""),
        entry.level,
      ),
    );
  }
  for (const group of groups.values()) {
    group.skills.sort((a, b) =>
      b.level === a.level ? a.name.localeCompare(b.name) : b.level - a.level,
    );
  }
  return [...groups.values()];
}

export class MemberService {
  /** Every profile of the directory, with its professions. */
  static all() {
    return db.select({
      id: "members.rows",
      errorId: "members.failed",
      query: sql`
        SELECT p.user_id AS "userId", p.slug, u.name, p.city, p.bio, p.status, p.labels,
               p.birth_year AS "birthYear",
               to_char(p.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS') AS "createdAt",
               to_char(p.updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS') AS "updatedAt",
               to_char(p.last_login_at AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS') AS "lastLoginAt",
               (SELECT coalesce(json_agg(json_build_object(
                          'slug', pr.slug, 'name', pr.name, 'bucket', pp.bucket)
                          ORDER BY pr.name), '[]')
                FROM profiles_professions pp
                JOIN professions pr ON pr.id = pp.profession_id
                WHERE pp.user_id = p.user_id) AS professions
        FROM profiles p
        JOIN users u ON u.id = p.user_id
        ORDER BY p.user_id`,
    });
  }

  /** One profile by slug; empty when there is none. */
  static bySlug(slug: string) {
    return db.select({
      id: "member.row",
      errorId: "members.failed",
      query: sql`
        SELECT p.user_id AS "userId", p.slug, u.name, p.city, p.bio, p.status, p.labels,
               p.birth_year AS "birthYear",
               to_char(p.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS') AS "createdAt",
               to_char(p.updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS') AS "updatedAt",
               to_char(p.last_login_at AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS') AS "lastLoginAt",
               (SELECT coalesce(json_agg(json_build_object(
                          'slug', pr.slug, 'name', pr.name, 'bucket', pp.bucket)
                          ORDER BY pr.name), '[]')
                FROM profiles_professions pp
                JOIN professions pr ON pr.id = pp.profession_id
                WHERE pp.user_id = p.user_id) AS professions
        FROM profiles p
        JOIN users u ON u.id = p.user_id
        WHERE p.slug = ${slug}`,
    });
  }

  /**
   * The rated skills of a member, with the profession they were rated in: the
   * skills of the profession's tree (the directory's `professions_skills`).
   */
  static skills(userId: number) {
    return db.select({
      id: "member.skills",
      errorId: "members.failed",
      query: sql`
        SELECT pr.slug AS "professionSlug", pr.name AS "professionName", pp.bucket,
               s.slug AS "skillSlug", s.name AS "skillName", ps.level
        FROM profiles_professions pp
        JOIN professions pr ON pr.id = pp.profession_id
        LEFT JOIN professions_skills psk ON psk.profession_id = pp.profession_id
        LEFT JOIN skills s ON s.id = psk.skill_id
        LEFT JOIN profiles_skills ps
               ON ps.skill_id = psk.skill_id AND ps.user_id = pp.user_id
        WHERE pp.user_id = ${userId}
        ORDER BY pr.name, s.name`,
    });
  }

  /** The relation of the viewer to a member (the row of the viewer). */
  static relation(viewerId: number, otherId: number) {
    return db.select({
      id: "member.relation",
      errorId: "members.failed",
      query: sql`SELECT status FROM friendships
                 WHERE user_id = ${viewerId} AND friend_id = ${otherId}`,
    });
  }
}
