// The project service: projects with their role slots. A slot with
// `user_id: null` is a vacancy — computed, never a flag.

import { db, sql } from "@pavlus/backend";

export interface SlotRow {
  id: number;
  profession: string;
  professionId: number;
  bucket: string;
  description: string;
  pay: string | null;
  payFrom: number | null;
  payTo: number | null;
  currency: string | null;
  userId: number | null;
  userName: string | null;
  skills: { name: string; level: number }[];
}

export interface ProjectRow {
  id: number;
  slug: string;
  name: string;
  tagline: string;
  description: string;
  kind: string;
  tags: string[];
  owner: string;
  ownerId: number;
  slots: SlotRow[];
}

export class ProjectService {
  /** The catalog, newest first; kind filters narrow it (`startup`, `company`…). */
  static list(kinds: string[]) {
    return db.select({
      id: "projects.list",
      errorId: "projects.failed",
      query: sql`SELECT p.id, p.slug, p.name, p.tagline, p.kind, p.tags,
                        u.name AS owner,
                        (SELECT count(*) FROM slots s
                          WHERE s.project_id = p.id AND s.user_id IS NULL)::int AS open
                 FROM projects p JOIN users u ON u.id = p.owner_id
                 WHERE p.status = 'active'
                   AND (${kinds.length} = 0 OR p.kind = ANY(${kinds}))
                 ORDER BY p.id DESC`,
    });
  }

  /** One project with every slot (and each slot's required skills).
   * `ns` namespaces the step: another module's flow (the owner's inbox)
   * re-reads a project through its own continuation. */
  static bySlug(slug: string, ns = "projects.bySlug") {
    return db.select({
      id: ns,
      errorId: "projects.failed",
      query: sql`SELECT p.id, p.slug, p.name, p.tagline, p.description, p.kind,
                        p.tags, u.name AS owner, u.id AS "ownerId",
                        (SELECT coalesce(json_agg(json_build_object(
                          'id', s.id, 'profession', pr.name,
                          'professionId', pr.id, 'bucket', s.bucket,
                          'description', s.description, 'pay', s.pay,
                          'payFrom', s.pay_from, 'payTo', s.pay_to,
                          'currency', s.currency,
                          'userId', s.user_id, 'userName', su.name,
                          'skills', (SELECT coalesce(json_agg(json_build_object(
                              'name', sk.name, 'level', ss.level)), '[]')
                            FROM slot_skills ss
                            JOIN skills sk ON sk.id = ss.skill_id
                            WHERE ss.slot_id = s.id)
                        ) ORDER BY s.id), '[]')
                 FROM slots s
                 JOIN professions pr ON pr.id = s.profession_id
                 LEFT JOIN users su ON su.id = s.user_id
                 WHERE s.project_id = p.id) AS slots
                 FROM projects p JOIN users u ON u.id = p.owner_id
                 WHERE p.slug = ${slug}`,
    });
  }

  static create(
    ownerId: number,
    slug: string,
    name: string,
    tagline: string,
    description: string,
    kind: string,
  ) {
    return db.execute({
      id: "projects.created",
      errorId: "projects.failed",
      query: sql`INSERT INTO projects (owner_id, slug, name, tagline, description, kind)
                 VALUES (${ownerId}, ${slug}, ${name}, ${tagline}, ${description}, ${kind})
                 RETURNING id, slug`,
    });
  }

  static addSlot(
    projectId: number,
    professionId: number,
    bucket: string,
    description: string,
  ) {
    return db.execute({
      id: "projects.slotAdded",
      errorId: "projects.failed",
      query: sql`INSERT INTO slots (project_id, profession_id, bucket, description)
                 VALUES (${projectId}, ${professionId}, ${bucket}, ${description})
                 RETURNING id`,
    });
  }

  /** The owner's project ids (for "may I edit" checks). */
  static ownedBy(userId: number, slug: string) {
    return db.select({
      id: "projects.owned",
      errorId: "projects.failed",
      query: sql`SELECT id FROM projects WHERE slug = ${slug} AND owner_id = ${userId}`,
    });
  }

  /** Every open slot with its required skills — the match feed's raw input. */
  static openSlots() {
    return db.select({
      id: "projects.openSlots",
      errorId: "projects.failed",
      query: sql`SELECT s.id AS "slotId", s.profession_id AS "professionId",
                        s.bucket, p.slug AS "projectSlug", p.name AS "projectName",
                        p.tagline, p.kind, u.name AS "owner",
                        (SELECT coalesce(json_agg(json_build_object(
                          'skillId', ss.skill_id, 'level', ss.level)), '[]')
                         FROM slot_skills ss WHERE ss.slot_id = s.id) AS skills
                 FROM slots s
                 JOIN projects p ON p.id = s.project_id
                 JOIN users u ON u.id = p.owner_id
                 WHERE s.user_id IS NULL AND s.status = 'open' AND p.status = 'active'`,
    });
  }

  /** Candidates for one slot: everyone with the slot's profession, skills too. */
  static candidates(slotId: number) {
    return db.select({
      id: "projects.candidates",
      errorId: "projects.failed",
      query: sql`SELECT u.id AS "userId", u.name, p.slug, p.city, p.status,
                        pr.slug AS "professionSlug", pp.bucket,
                        (SELECT coalesce(json_agg(json_build_object(
                          'skillId', ps.skill_id, 'level', ps.level)), '[]')
                         FROM profiles_skills ps WHERE ps.user_id = u.id) AS skills
                 FROM slots s
                 JOIN professions pr ON pr.id = s.profession_id
                 JOIN profiles_professions pp
                   ON pp.profession_id = s.profession_id
                 JOIN profiles p ON p.user_id = pp.user_id
                 JOIN users u ON u.id = p.user_id
                 WHERE s.id = ${slotId} AND p.status <> 'not-searching'
                 ORDER BY u.id`,
    });
  }

  /** One slot with its required skills (the candidates' coverage input). */
  static slotWithSkills(slotId: number) {
    return db.select({
      id: "projects.candidatesSlot",
      errorId: "projects.failed",
      query: sql`SELECT s.id AS "slotId", s.profession_id AS "professionId",
                        s.bucket,
                        (SELECT coalesce(json_agg(json_build_object(
                          'skillId', ss.skill_id, 'level', ss.level)), '[]')
                         FROM slot_skills ss WHERE ss.slot_id = s.id) AS skills
                 FROM slots s WHERE s.id = ${slotId}`,
    });
  }

  /** The slot's project + owner (an accept or decline checks both). */
  static slotOwner(slotId: number, ns = "projects.slotOwner") {
    return db.select({
      id: ns,
      errorId: "projects.failed",
      query: sql`SELECT s.id AS "slotId", s.user_id AS "slotUserId",
                        p.id AS "projectId", p.owner_id AS "ownerId"
                 FROM slots s JOIN projects p ON p.id = s.project_id
                 WHERE s.id = ${slotId}`,
    });
  }
}
