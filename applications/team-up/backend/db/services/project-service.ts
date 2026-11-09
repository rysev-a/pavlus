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
                              'skillId', ss.skill_id, 'name', sk.name,
                              'level', ss.level)), '[]')
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

  /**
   * One project as the app's page sees it: the fields, the slots (with the
   * invitation state and my own application), the team and the viewer's
   * relation to the project. `viewerId` is 0 for a guest.
   */
  static view(slug: string, viewerId: number, ns = "projects.view") {
    return db.select({
      id: ns,
      errorId: "projects.failed",
      query: sql`SELECT p.id, p.slug, p.name, p.tagline, p.description, p.kind,
                        p.tags, p.status, p.work_mode AS "workMode", p.city,
                        p.website, p.budget, p.budget_currency AS "budgetCurrency",
                        p.deadline,
                        u.name AS owner, u.id AS "ownerId", pu.slug AS "ownerSlug",
                        (SELECT pr.name FROM profiles_professions pp
                          JOIN professions pr ON pr.id = pp.profession_id
                          WHERE pp.user_id = p.owner_id
                          ORDER BY pp.profession_id LIMIT 1) AS "ownerProfession",
                        (SELECT pp.bucket FROM profiles_professions pp
                          WHERE pp.user_id = p.owner_id
                          ORDER BY pp.profession_id LIMIT 1) AS "ownerBucket",
                        (p.owner_id = ${viewerId}) AS "isOwner",
                        EXISTS (SELECT 1 FROM slots s
                          WHERE s.project_id = p.id AND s.user_id = ${viewerId}
                            AND s.status = 'joined') AS "isMember",
                        (SELECT t.id FROM threads t
                          WHERE t.project_id = p.id AND t.type = 'project'
                          LIMIT 1) AS "teamChatId",
                        (SELECT count(*) FROM slots s
                          WHERE s.project_id = p.id AND s.user_id IS NULL
                            AND s.status = 'open')::int AS "openCount",
                        (SELECT coalesce(json_agg(json_build_object(
                          'id', s.id, 'profession', pr.name,
                          'professionId', pr.id, 'professionSlug', pr.slug,
                          'bucket', s.bucket, 'description', s.description,
                          'pay', s.pay, 'payFrom', s.pay_from,
                          'payTo', s.pay_to, 'currency', s.currency,
                          'userId', s.user_id, 'userName', su.name,
                          'userSlug', spu.slug, 'status', s.status,
                          'invitedByName', inv.name,
                          'invitedBySlug', invp.slug,
                          'invitedMe', (s.status = 'invited'
                                          AND s.user_id = ${viewerId}),
                          'invitedByMe', (s.status = 'invited'
                                           AND s.invited_by = ${viewerId}),
                          'myApplication', (SELECT json_build_object(
                              'id', a.id, 'status', a.status)
                            FROM applications a
                            WHERE a.slot_id = s.id AND a.user_id = ${viewerId}),
                          'skills', (SELECT coalesce(json_agg(json_build_object(
                              'name', sk.name, 'level', ss.level)), '[]')
                            FROM slot_skills ss
                            JOIN skills sk ON sk.id = ss.skill_id
                            WHERE ss.slot_id = s.id)
                        ) ORDER BY s.id), '[]')
                         FROM slots s
                         JOIN professions pr ON pr.id = s.profession_id
                         LEFT JOIN users su ON su.id = s.user_id
                         LEFT JOIN profiles spu ON spu.user_id = s.user_id
                         LEFT JOIN users inv ON inv.id = s.invited_by
                         LEFT JOIN profiles invp ON invp.user_id = s.invited_by
                         WHERE s.project_id = p.id) AS slots,
                        (SELECT coalesce(json_agg(json_build_object(
                          'userId', x."userId", 'slug', x.slug, 'name', x.name,
                          'professionName', x."professionName", 'bucket', x.bucket,
                          'isOwner', x."isOwner")
                          ORDER BY x."isOwner" DESC, x."userId"), '[]')
                         FROM (
                           SELECT u.id AS "userId", pf.slug, u.name,
                                  pr.name AS "professionName", pp.bucket,
                                  TRUE AS "isOwner"
                           FROM projects p2
                           JOIN users u ON u.id = p2.owner_id
                           JOIN profiles pf ON pf.user_id = u.id
                           LEFT JOIN profiles_professions pp ON pp.user_id = u.id
                           LEFT JOIN professions pr ON pr.id = pp.profession_id
                           WHERE p2.id = p.id
                           UNION
                           SELECT u.id, pf.slug, u.name, pr.name, s.bucket, FALSE
                           FROM slots s
                           JOIN users u ON u.id = s.user_id
                           JOIN profiles pf ON pf.user_id = u.id
                           JOIN professions pr ON pr.id = s.profession_id
                           WHERE s.project_id = p.id AND s.status = 'joined'
                         ) x) AS team
                 FROM projects p
                 JOIN users u ON u.id = p.owner_id
                 JOIN profiles pu ON pu.user_id = p.owner_id
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
    pay: string | null = null,
    payFrom: number | null = null,
    payTo: number | null = null,
    currency: string | null = null,
  ) {
    return db.execute({
      id: "projects.slotAdded",
      errorId: "projects.failed",
      query: sql`INSERT INTO slots (project_id, profession_id, bucket, description,
                                     pay, pay_from, pay_to, currency)
                 VALUES (${projectId}, ${professionId}, ${bucket}, ${description},
                         ${pay}, ${payFrom}, ${payTo}, ${currency})
                 RETURNING id`,
    });
  }

  /**
   * The skills of an opening (the leaves the owner rated): the old rows go,
   * the new ones come.
   */
  static setSlotSkills(
    slotId: number,
    rows: [number, number][],
    ns = "projects.slotSkills",
  ) {
    return db.execute({
      id: ns,
      errorId: "projects.failed",
      query: rows.length
        ? sql`WITH cleared AS (
             DELETE FROM slot_skills WHERE slot_id = ${slotId}
           )
           INSERT INTO slot_skills (slot_id, skill_id, level)
           SELECT ${slotId}, x.sid, x.level
           FROM unnest(${rows.map((r) => r[0])}::int[],
                       ${rows.map((r) => r[1])}::int[]) AS x(sid, level)`
        : sql`DELETE FROM slot_skills WHERE slot_id = ${slotId}`,
    });
  }

  /** The owner's project ids (for "may I edit" checks). */
  static ownedBy(userId: number, slug: string, ns = "projects.owned") {
    return db.select({
      id: ns,
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

  /**
   * The match feed's projects: active, not mine, not my team, with their open
   * slots (each slot knows whether I have a pending application for it). The
   * filters and the ranking happen in the api module — the service only
   * brings the raw rows together.
   */
  static matchFeed(viewerId: number, ns = "projects.matchFeed") {
    return db.select({
      id: ns,
      errorId: "projects.failed",
      query: sql`SELECT p.id, p.slug, p.name, p.tagline, p.tags, p.kind, p.city,
                        p.budget, p.budget_currency AS "budgetCurrency", p.deadline,
                        u.name AS "ownerName",
                        (SELECT pr.name FROM profiles_professions pp
                          JOIN professions pr ON pr.id = pp.profession_id
                          WHERE pp.user_id = p.owner_id
                          ORDER BY pp.profession_id LIMIT 1) AS "ownerProfession",
                        (SELECT pp.bucket FROM profiles_professions pp
                          WHERE pp.user_id = p.owner_id
                          ORDER BY pp.profession_id LIMIT 1) AS "ownerBucket",
                        (SELECT count(*) FROM slots s
                          WHERE s.project_id = p.id AND s.user_id IS NULL
                            AND s.status = 'open')::int AS "openSlots",
                        (SELECT coalesce(json_agg(json_build_object(
                            'id', s.id, 'professionId', pr.id, 'profession', pr.slug,
                            'professionName', pr.name, 'bucket', s.bucket,
                            'description', s.description, 'pay', s.pay,
                            'payFrom', s.pay_from, 'payTo', s.pay_to,
                            'currency', s.currency,
                            'applied', EXISTS (SELECT 1 FROM applications a
                              WHERE a.slot_id = s.id AND a.user_id = ${viewerId}
                                AND a.status = 'new'),
                            'skills', (SELECT coalesce(json_agg(json_build_object(
                                'skillId', ss.skill_id, 'name', sk.name,
                                'level', ss.level)), '[]')
                              FROM slot_skills ss
                              JOIN skills sk ON sk.id = ss.skill_id
                              WHERE ss.slot_id = s.id)
                        ) ORDER BY s.id), '[]')
                         FROM slots s
                         JOIN professions pr ON pr.id = s.profession_id
                         WHERE s.project_id = p.id AND s.user_id IS NULL
                           AND s.status = 'open') AS slots
                 FROM projects p
                 JOIN users u ON u.id = p.owner_id
                 WHERE p.status = 'active'
                   AND p.owner_id <> ${viewerId}
                   AND NOT EXISTS (SELECT 1 FROM slots s2
                     WHERE s2.project_id = p.id AND s2.user_id = ${viewerId}
                       AND s2.status = 'joined')
                 ORDER BY p.id DESC`,
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
