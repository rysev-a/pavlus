// The friendship service: mirrored pairs — two rows per relation, every
// action writes both sides.

import { db, sql } from "@pavlus/backend";

export interface FriendRow {
  userId: number;
  slug: string;
  name: string;
  status: string;
}

export class FriendService {
  static list(userId: number) {
    return db.select({
      id: "friends.list",
      errorId: "friends.failed",
      query: sql`SELECT u.id AS "userId", pf.slug, u.name, f.status
                 FROM friendships f
                 JOIN users u ON u.id = f.friend_id
                 JOIN profiles pf ON pf.user_id = u.id
                 WHERE f.user_id = ${userId} AND f.status <> 'removed'
                 ORDER BY u.name`,
    });
  }

  /** Both sides of one pair, for mine; empty when they are strangers. */
  static pair(userId: number, otherId: number) {
    return db.select({
      id: "friends.pair",
      errorId: "friends.failed",
      query: sql`SELECT user_id, friend_id, status FROM friendships
                 WHERE (user_id = ${userId} AND friend_id = ${otherId})
                    OR (user_id = ${otherId} AND friend_id = ${userId})`,
    });
  }

  static request(userId: number, otherId: number) {
    return db.execute({
      id: "friends.requested",
      errorId: "friends.failed",
      query: sql`INSERT INTO friendships (user_id, friend_id, status)
                 VALUES (${userId}, ${otherId}, 'waiting'),
                        (${otherId}, ${userId}, 'incoming')
                 ON CONFLICT (user_id, friend_id)
                 DO UPDATE SET status = EXCLUDED.status`,
    });
  }

  static accept(userId: number, otherId: number) {
    return db.execute({
      id: "friends.accepted",
      errorId: "friends.failed",
      query: sql`UPDATE friendships SET status = 'friends'
                 WHERE (user_id = ${userId} AND friend_id = ${otherId})
                    OR (user_id = ${otherId} AND friend_id = ${userId})`,
    });
  }

  static remove(userId: number, otherId: number) {
    return db.execute({
      id: "friends.removed",
      errorId: "friends.failed",
      query: sql`UPDATE friendships SET status = 'removed'
                 WHERE (user_id = ${userId} AND friend_id = ${otherId})
                    OR (user_id = ${otherId} AND friend_id = ${userId})`,
    });
  }

  /** The member behind a slug; `ns` namespaces the step so every flow
   * (request, accept, decline, remove) owns its own continuation. */
  static bySlug(slug: string, ns = "friends.bySlug") {
    return db.select({
      id: ns,
      errorId: "friends.failed",
      query: sql`SELECT p.user_id FROM profiles p WHERE p.slug = ${slug}`,
    });
  }
}
