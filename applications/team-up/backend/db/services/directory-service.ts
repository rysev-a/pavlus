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
         FROM skills s) AS skills`,
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
}
