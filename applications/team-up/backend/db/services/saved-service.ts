// The saved service: what a member keeps from the catalog — the projects
// they starred and the searches they saved.

import { db, sql } from "@pavlus/backend";

/** How many searches a member may keep. */
export const SAVED_MAX = 20;
/** The name of a saved search is at most this long. */
export const NAME_MAX = 60;
/** The query of a saved search is at most this long. */
export const QUERY_MAX = 500;

export interface SavedSearchRow {
  id: number;
  name: string;
  query: string;
  createdAt: string;
}

/**
 * The query of a search as it is kept: without the `?`, without the page and
 * made only of what an address is made of, so that it is safe to put back
 * after `/projects?`. Undefined when nothing is left to keep.
 */
export function cleanQuery(raw: string): string | undefined {
  const trimmed = raw.trim().replace(/^\?/, "");
  if (trimmed.length > QUERY_MAX) return undefined;
  if (!/^[A-Za-z0-9%+=&._~*-]*$/.test(trimmed)) return undefined;
  const pairs = trimmed
    .split("&")
    .filter((p) => p !== "" && !p.startsWith("page="));
  // only the order or the saved scope: nothing narrows the list
  const narrows = pairs.some(
    (p) => !p.startsWith("sort=") && !p.endsWith("=") && p !== "scope=saved",
  );
  return narrows ? pairs.join("&") : undefined;
}

export class FavoriteService {
  /** The slugs of the projects this member starred. */
  static list(userId: number) {
    return db.select({
      id: "favorites.list",
      errorId: "favorites.failed",
      query: sql`SELECT slug FROM favorites WHERE user_id = ${userId}
                 ORDER BY slug`,
    });
  }

  /** The star is one row per project: the same star twice is still one. */
  static add(userId: number, slug: string) {
    return db.execute({
      id: "favorites.added",
      errorId: "favorites.failed",
      query: sql`INSERT INTO favorites (user_id, slug) VALUES (${userId}, ${slug})
                 ON CONFLICT (user_id, slug) DO NOTHING`,
    });
  }

  static remove(userId: number, slug: string) {
    return db.execute({
      id: "favorites.removed",
      errorId: "favorites.failed",
      query: sql`DELETE FROM favorites WHERE user_id = ${userId} AND slug = ${slug}`,
    });
  }

  /** Is this project starred by this member? */
  static has(userId: number, slug: string) {
    return db.select({
      id: "favorites.has",
      errorId: "favorites.failed",
      query: sql`SELECT 1 AS n FROM favorites
                 WHERE user_id = ${userId} AND slug = ${slug}`,
    });
  }
}

export class SavedSearchService {
  /** `ns` namespaces the step: the list of the page and the list of the
   * "is it already saved" check are two flows of their own. */
  static list(userId: number, ns = "saved.list") {
    return db.select({
      id: ns,
      errorId: "saved.failed",
      query: sql`SELECT id, name, query, created_at AS "createdAt"
                 FROM saved_searches WHERE user_id = ${userId}
                 ORDER BY created_at DESC`,
    });
  }

  /** The same query twice is refused by the api, not by the db. */
  static insert(userId: number, name: string, query: string) {
    return db.execute({
      id: "saved.inserted",
      errorId: "saved.failed",
      query: sql`INSERT INTO saved_searches (user_id, name, query)
                 VALUES (${userId}, ${name}, ${query}) RETURNING id, name`,
    });
  }

  /** Only the member's own search goes away. */
  static remove(userId: number, id: number) {
    return db.execute({
      id: "saved.removed",
      errorId: "saved.failed",
      query: sql`DELETE FROM saved_searches WHERE id = ${id} AND user_id = ${userId}`,
    });
  }
}
