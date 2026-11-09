// The avatar service: the picture of a member (the bytes are in the db,
// the site shows `/api/avatars/{slug}`).

import { db, sql } from "@pavlus/backend";

/** The biggest picture the port takes. */
export const AVATAR_MAX_BYTES = 2 * 1024 * 1024;
/** The kinds of picture the site shows. */
export const AVATAR_MIMES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
];

export interface AvatarRow {
  userId: number;
  mime: string;
  data: Buffer;
  updatedAt: string;
}

export class AvatarService {
  /** The picture of a member, or nothing. */
  static byUser(userId: number, ns = "avatar.byUser") {
    return db.select({
      id: ns,
      errorId: "avatar.failed",
      query: sql`SELECT user_id AS "userId", mime, data,
                        updated_at AS "updatedAt"
                 FROM avatars WHERE user_id = ${userId}`,
    });
  }

  /** The picture behind a slug (the site shows it). */
  static bySlug(slug: string) {
    return db.select({
      id: "avatar.bySlug",
      errorId: "avatar.failed",
      query: sql`SELECT a.user_id AS "userId", a.mime, a.data,
                        a.updated_at AS "updatedAt"
                 FROM avatars a JOIN profiles p ON p.user_id = a.user_id
                 WHERE p.slug = ${slug}`,
    });
  }

  /** The picture is replaced, not added. */
  static save(userId: number, mime: string, data: Buffer) {
    return db.execute({
      id: "avatar.saved",
      errorId: "avatar.failed",
      query: sql`INSERT INTO avatars (user_id, mime, data, updated_at)
                 VALUES (${userId}, ${mime}, ${data}, now())
                 ON CONFLICT (user_id) DO UPDATE
                 SET mime = EXCLUDED.mime, data = EXCLUDED.data,
                     updated_at = now()`,
    });
  }

  static remove(userId: number) {
    return db.execute({
      id: "avatar.removed",
      errorId: "avatar.failed",
      query: sql`DELETE FROM avatars WHERE user_id = ${userId}`,
    });
  }
}
