// The directory service: professions and the skill tree (an admin fills
// them; the user chooses), plus notifications.

import { db, sql } from "@pavlus/backend";

export class DirectoryService {
  static all() {
    return db.select({
      id: "dir.all",
      errorId: "dir.failed",
      query: sql`SELECT
        (SELECT coalesce(json_agg(json_build_object(
          'id', p.id, 'slug', p.slug, 'name', p.name)), '[]')
         FROM professions p) AS professions,
        (SELECT coalesce(json_agg(json_build_object(
          'id', s.id, 'slug', s.slug, 'name', s.name, 'parentId', s.parent_id)), '[]')
         FROM skills s) AS skills,
        (SELECT coalesce(json_agg(json_build_object(
          'professionId', ps.profession_id, 'skillId', ps.skill_id)), '[]')
         FROM professions_skills ps) AS "professionSkills"`,
    });
  }

  /** The options of the match feed's filters: the professions and the grades. */
  static options() {
    return db.select({
      id: "dir.options",
      errorId: "dir.failed",
      query: sql`SELECT
        (SELECT coalesce(json_agg(json_build_object(
          'slug', p.slug, 'name', p.name) ORDER BY p.name), '[]')
         FROM professions p) AS professions,
        (SELECT coalesce(json_agg(value ORDER BY ord), '[]')
         FROM unnest(ARRAY['junior','middle','senior','lead'])
              WITH ORDINALITY AS t(value, ord)) AS buckets`,
    });
  }
}

export class NotifyService {
  static insert(userId: number, kind: string, body: string) {
    return db.execute({
      id: "notify.saved",
      errorId: "notify.failed",
      query: sql`INSERT INTO notifications (user_id, kind, body)
                 VALUES (${userId}, ${kind}, ${body})`,
    });
  }

  static list(userId: number) {
    return db.select({
      id: "notify.list",
      errorId: "notify.failed",
      query: sql`SELECT id, kind, body, created_at AS "createdAt"
                 FROM notifications WHERE user_id = ${userId} ORDER BY id DESC LIMIT 20`,
    });
  }

  /** The topics of the settings page: a missing row means all of them are on. */
  static settings(userId: number) {
    return db.select({
      id: "notify.settings",
      errorId: "notify.failed",
      query: sql`SELECT applications, friends, messages FROM notify_settings
                 WHERE user_id = ${userId}`,
    });
  }

  /** The topics are saved; the ones that are not named keep their value. */
  static saveSettings(
    userId: number,
    topics: { applications?: boolean; friends?: boolean; messages?: boolean },
  ) {
    return db.execute({
      id: "notify.settingsSaved",
      errorId: "notify.failed",
      query: sql`INSERT INTO notify_settings (user_id, applications, friends, messages)
                 VALUES (${userId},
                         COALESCE(${topics.applications ?? null}, true),
                         COALESCE(${topics.friends ?? null}, true),
                         COALESCE(${topics.messages ?? null}, true))
                 ON CONFLICT (user_id) DO UPDATE SET
                   applications = COALESCE(${topics.applications ?? null}, notify_settings.applications),
                   friends      = COALESCE(${topics.friends ?? null}, notify_settings.friends),
                   messages     = COALESCE(${topics.messages ?? null}, notify_settings.messages)`,
    });
  }
}
