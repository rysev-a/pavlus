// The profile service: the public "who I am" (professions with a grade,
// skills 1..10 on leaves), its writes, and the raw inputs of the match.

import { db, sql } from "@pavlus/backend";

export interface ProfessionRow {
  professionId: number;
  slug: string;
  name: string;
  bucket: string | null;
}
export interface SkillRow {
  skillId: number;
  slug: string;
  name: string;
  /** On the profile: 1..10; on the directory listing: null (not rated). */
  level: number | null;
}

export interface ProfileRow {
  userId: number;
  slug: string;
  name: string;
  city: string;
  bio: string;
  status: string;
  domains: string[];
  professions: ProfessionRow[];
  skills: SkillRow[];
}

/** One profile by slug, professions and skills aggregated; empty when none. */
export class ProfileService {
  /** `ownerId` may be null (a stranger reads a public page). */
  static bySlug(slug: string, ns = "profile.bySlug") {
    return db.select({
      id: ns,
      errorId: "profile.failed",
      query: sql`
        SELECT p.user_id AS "userId", p.slug, u.name, p.city, p.bio, p.status,
               p.domains,
               (SELECT coalesce(json_agg(json_build_object(
                        'professionId', pr.id, 'slug', pr.slug, 'name', pr.name,
                        'bucket', pp.bucket)), '[]')
                FROM profiles_professions pp
                JOIN professions pr ON pr.id = pp.profession_id
                WHERE pp.user_id = p.user_id) AS professions,
               (SELECT coalesce(json_agg(json_build_object(
                        'skillId', s.id, 'slug', s.slug, 'name', s.name,
                        'level', ps.level)), '[]')
                FROM profiles_skills ps
                JOIN skills s ON s.id = ps.skill_id
                WHERE ps.user_id = p.user_id) AS skills
        FROM profiles p JOIN users u ON u.id = p.user_id
        WHERE p.slug = ${slug}`,
    });
  }

  static update(userId: number, city: string, bio: string, status: string) {
    return db.execute({
      id: "profile.saved",
      errorId: "profile.failed",
      query: sql`UPDATE profiles SET city = ${city}, bio = ${bio}, status = ${status}
                 WHERE user_id = ${userId}`,
    });
  }

  /** Clears the professions; the insert follows as its own step. */
  static clearProfessions(userId: number) {
    return db.execute({
      id: "profile.clearedProfessions",
      errorId: "profile.failed",
      query: sql`DELETE FROM profiles_professions WHERE user_id = ${userId}`,
    });
  }

  /** Re-adds the professions (the match's hard filter). */
  static insertProfessions(userId: number, rows: [number, string][]) {
    return db.execute({
      id: "profile.savedProfessions",
      errorId: "profile.failed",
      query: rows.length
        ? sql`INSERT INTO profiles_professions (user_id, profession_id, bucket)
              SELECT ${userId}, p.id, x.bucket
              FROM unnest(${rows.map((r) => r[0])}::int[], ${rows.map((r) => r[1])}::text[]) AS x(pid, bucket)
              JOIN professions p ON p.id = x.pid`
        : sql`SELECT 0`,
    });
  }

  /** Clears the skill ratings (no row = no rating). */
  static clearSkills(userId: number) {
    return db.execute({
      id: "profile.clearedSkills",
      errorId: "profile.failed",
      query: sql`DELETE FROM profiles_skills WHERE user_id = ${userId}`,
    });
  }

  /** Re-adds the ratings, leaves only. */
  static insertSkills(userId: number, rows: [number, number][]) {
    return db.execute({
      id: "profile.savedSkills",
      errorId: "profile.failed",
      query: rows.length
        ? sql`INSERT INTO profiles_skills (user_id, skill_id, level)
              SELECT ${userId}, s.id, x.level
              FROM unnest(${rows.map((r) => r[0])}::int[], ${rows.map((r) => r[1])}::int[]) AS x(sid, level)
              JOIN skills s ON s.id = x.sid AND s.parent_id IS NOT NULL`
        : sql`SELECT 0`,
    });
  }

  /** The member behind a slug — the dm flow's first step. */
  static userIdBySlug(slug: string, ns = "profile.userIdBySlug") {
    return db.select({
      id: ns,
      errorId: "profile.failed",
      query: sql`SELECT user_id FROM profiles WHERE slug = ${slug}`,
    });
  }

  /** My raw skills — the match input. */
  static mySkills(userId: number, ns = "profile.mySkills") {
    return db.select({
      id: ns,
      errorId: "profile.failed",
      query: sql`SELECT skill_id AS "skillId", level FROM profiles_skills
                 WHERE user_id = ${userId}`,
    });
  }

  /** My raw professions — the match input. */
  static myProfessions(userId: number, ns = "profile.myProfessions") {
    return db.select({
      id: ns,
      errorId: "profile.failed",
      query: sql`SELECT profession_id AS "professionId", bucket
                 FROM profiles_professions WHERE user_id = ${userId}`,
    });
  }

  /** My professions with their names (the apply dialog's list). */
  static myProfessionsWithNames(userId: number, ns = "hub.applyOptions") {
    return db.select({
      id: ns,
      errorId: "profile.failed",
      query: sql`SELECT pr.id AS "professionId", pr.slug, pr.name, pp.bucket
                 FROM profiles_professions pp
                 JOIN professions pr ON pr.id = pp.profession_id
                 WHERE pp.user_id = ${userId} ORDER BY pr.name`,
    });
  }
}
