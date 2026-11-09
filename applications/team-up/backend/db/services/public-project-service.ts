/**
 * The public project service: the catalog (`/projects`) and one project's
 * page (`/projects/{slug}`) — the SQL of the original teamUP's
 * `public_startups.rs` (`cards_for` and `view_for`), in the port's schema.
 *
 * The catalog reads every visible project with its open slots in one query
 * (the slots and their skills come back as json), and the viewer's own data
 * (professions, skills, stars, saved searches) in another. A cancelled
 * project is invisible to everybody but its owner.
 */

import { db, sql } from "@pavlus/backend";

/** One skill of a slot (the leaf skills with the level asked for). */
export interface SlotSkillRow {
  skillId: number;
  slug: string;
  name: string;
  level: number;
}

/** One open slot of a card. */
export interface CardSlotRow {
  id: number;
  professionId: number;
  /** The profession's slug. */
  profession: string;
  professionName: string;
  bucket: string;
  description: string;
  pay: string | null;
  payFrom: number | null;
  payTo: number | null;
  currency: string | null;
  skills: SlotSkillRow[];
}

/** One project of the catalog — the raw data of a card. */
export interface CardRow {
  id: number;
  slug: string;
  name: string;
  tagline: string;
  kind: string;
  tags: string[];
  status: string;
  workMode: string;
  city: string;
  budget: number | null;
  budgetCurrency: string | null;
  deadline: string | null;
  /** The creation time (epoch seconds) — the catalog sorts by it. */
  createdAt: number;
  ownerId: number;
  ownerName: string;
  ownerSlug: string;
  /** The founder's profession and grade (the card's "Designer · senior"). */
  ownerProfession: string | null;
  ownerBucket: string | null;
  /** The viewer sits in a joined slot of this project. */
  viewerJoined: boolean;
  slots: CardSlotRow[];
}

/** The viewer's own data: the match input, the stars, the saved searches. */
export interface ViewerRow {
  professions: {
    professionId: number;
    slug: string;
    name: string;
    bucket: string;
  }[];
  skills: { skillId: number; slug: string; level: number }[];
  favorites: string[];
  saved: { id: number; name: string; query: string }[];
  /** The skill tree — the categories the skill filter groups by. */
  tree: { id: number; slug: string; name: string; parentId: number | null }[];
}

/** One slot of the public project page (every status, not only the open). */
export interface DetailSlotRow {
  id: number;
  professionId: number;
  profession: string;
  professionName: string;
  bucket: string;
  description: string;
  pay: string | null;
  payFrom: number | null;
  payTo: number | null;
  currency: string | null;
  /** `open | joined | left`. */
  status: string;
  memberName: string | null;
  memberSlug: string | null;
  skills: { name: string; level: number }[];
}

/** One project of the public page — the raw data of the page. */
export interface DetailRow {
  slug: string;
  name: string;
  tagline: string;
  description: string;
  kind: string;
  tags: string[];
  status: string;
  workMode: string;
  city: string;
  website: string;
  budget: number | null;
  budgetCurrency: string | null;
  deadline: string | null;
  /** The creation day (`YYYY-MM-DD`), the page's "Created {date}". */
  createdOn: string;
  ownerId: number;
  ownerName: string;
  ownerSlug: string;
  ownerProfession: string | null;
  ownerBucket: string | null;
  slots: DetailSlotRow[];
}

export class PublicProjectService {
  /**
   * Every project the viewer may see, with its open slots. `viewerId` may
   * be null (a guest): then the cancelled projects stay hidden.
   */
  static cards(viewerId: number | null) {
    return db.select({
      id: "projects.catalog.cards",
      errorId: "projects.catalog.failed",
      query: sql`
        SELECT p.id, p.slug, p.name, p.tagline, p.kind, p.tags, p.status,
               p.work_mode AS "workMode", p.city, p.budget,
               p.budget_currency AS "budgetCurrency",
               p.deadline::text AS deadline,
               extract(epoch from p.created_at)::float8 AS "createdAt",
               p.owner_id AS "ownerId",
               u.name AS "ownerName", prf.slug AS "ownerSlug",
               (SELECT tpr.name FROM profiles_professions pp
                  JOIN professions tpr ON tpr.id = pp.profession_id
                 WHERE pp.user_id = p.owner_id
                 ORDER BY pp.profession_id LIMIT 1) AS "ownerProfession",
               (SELECT pp.bucket FROM profiles_professions pp
                 WHERE pp.user_id = p.owner_id
                 ORDER BY pp.profession_id LIMIT 1) AS "ownerBucket",
               EXISTS (SELECT 1 FROM slots ms
                        WHERE ms.project_id = p.id
                          AND ms.user_id = ${viewerId}
                          AND ms.status = 'joined') AS "viewerJoined",
               (SELECT coalesce(json_agg(json_build_object(
                  'id', s.id, 'professionId', pr.id, 'profession', pr.slug,
                  'professionName', pr.name, 'bucket', s.bucket,
                  'description', s.description, 'pay', s.pay,
                  'payFrom', s.pay_from, 'payTo', s.pay_to,
                  'currency', s.currency,
                  'skills', (SELECT coalesce(json_agg(json_build_object(
                      'skillId', sk.id, 'slug', sk.slug, 'name', sk.name,
                      'level', ss.level) ORDER BY ss.skill_id), '[]')
                     FROM slot_skills ss
                     JOIN skills sk ON sk.id = ss.skill_id
                    WHERE ss.slot_id = s.id)
                ) ORDER BY s.id), '[]')
                  FROM slots s
                  JOIN professions pr ON pr.id = s.profession_id
                 WHERE s.project_id = p.id AND s.status = 'open') AS slots
          FROM projects p
          JOIN users u ON u.id = p.owner_id
          JOIN profiles prf ON prf.user_id = p.owner_id
         WHERE p.status <> 'cancelled' OR p.owner_id = ${viewerId}
         ORDER BY p.created_at DESC`,
    });
  }

  /**
   * The viewer's own data (the match input, the stars, the saved searches)
   * and the skill tree. A guest gets the same shape with empty lists.
   */
  static viewer(viewerId: number | null) {
    return db.select({
      id: "projects.catalog.viewer",
      errorId: "projects.catalog.failed",
      query: sql`
        SELECT
          (SELECT coalesce(json_agg(json_build_object(
                    'professionId', pr.id, 'slug', pr.slug, 'name', pr.name,
                    'bucket', pp.bucket) ORDER BY pr.id), '[]')
             FROM profiles_professions pp
             JOIN professions pr ON pr.id = pp.profession_id
            WHERE pp.user_id = ${viewerId}) AS professions,
          (SELECT coalesce(json_agg(json_build_object(
                    'skillId', sk.id, 'slug', sk.slug, 'level', ps.level)
                    ORDER BY sk.id), '[]')
             FROM profiles_skills ps
             JOIN skills sk ON sk.id = ps.skill_id
            WHERE ps.user_id = ${viewerId}) AS skills,
          (SELECT coalesce(json_agg(f.slug), '[]') FROM favorites f
            WHERE f.user_id = ${viewerId}) AS favorites,
          (SELECT coalesce(json_agg(json_build_object(
                    'id', s.id, 'name', s.name, 'query', s.query) ORDER BY s.id),
                    '[]')
             FROM saved_searches s WHERE s.user_id = ${viewerId}) AS saved,
          (SELECT coalesce(json_agg(json_build_object(
                    'id', sk.id, 'slug', sk.slug, 'name', sk.name,
                    'parentId', sk.parent_id) ORDER BY sk.id), '[]')
             FROM skills sk) AS tree`,
    });
  }

  /**
   * One project with its team and its positions (every slot's status). The
   * cancelled ones come back too — the caller hides them from everybody but
   * the owner.
   */
  static detail(slug: string) {
    return db.select({
      id: "projects.detail.row",
      errorId: "projects.detail.failed",
      query: sql`
        SELECT p.slug, p.name, p.tagline, p.description, p.kind, p.tags,
               p.status, p.work_mode AS "workMode", p.city, p.website,
               p.budget, p.budget_currency AS "budgetCurrency",
               p.deadline::text AS deadline,
               to_char(p.created_at at time zone 'UTC', 'YYYY-MM-DD')
                 AS "createdOn",
               p.owner_id AS "ownerId",
               u.name AS "ownerName", prf.slug AS "ownerSlug",
               (SELECT tpr.name FROM profiles_professions pp
                  JOIN professions tpr ON tpr.id = pp.profession_id
                 WHERE pp.user_id = p.owner_id
                 ORDER BY pp.profession_id LIMIT 1) AS "ownerProfession",
               (SELECT pp.bucket FROM profiles_professions pp
                 WHERE pp.user_id = p.owner_id
                 ORDER BY pp.profession_id LIMIT 1) AS "ownerBucket",
               (SELECT coalesce(json_agg(json_build_object(
                  'id', s.id, 'professionId', pr.id, 'profession', pr.slug,
                  'professionName', pr.name, 'bucket', s.bucket,
                  'description', s.description, 'pay', s.pay,
                  'payFrom', s.pay_from, 'payTo', s.pay_to,
                  'currency', s.currency, 'status', s.status,
                  'memberName', mu.name, 'memberSlug', mp.slug,
                  'skills', (SELECT coalesce(json_agg(json_build_object(
                      'name', sk.name, 'level', ss.level)
                      ORDER BY ss.skill_id), '[]')
                     FROM slot_skills ss
                     JOIN skills sk ON sk.id = ss.skill_id
                    WHERE ss.slot_id = s.id)
                ) ORDER BY s.id), '[]')
                  FROM slots s
                  JOIN professions pr ON pr.id = s.profession_id
                  LEFT JOIN users mu ON mu.id = s.user_id
                  LEFT JOIN profiles mp ON mp.user_id = s.user_id
                 WHERE s.project_id = p.id) AS slots
          FROM projects p
          JOIN users u ON u.id = p.owner_id
          JOIN profiles prf ON prf.user_id = p.owner_id
         WHERE p.slug = ${slug}`,
    });
  }
}
