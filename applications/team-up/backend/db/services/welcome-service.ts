// The welcome page's own data: how full the profile of the member is.
//
// The original's `is_filled` — the role, the professions or the skills are
// enough. The port has no role column (the professions carry it), so the
// professions and the skills are what counts.

import { db, sql } from "@pavlus/backend";

export interface WelcomeProfileRow {
  /** How many professions the member has. */
  professions: number;
  /** How many skills the member has rated. */
  skills: number;
  /** The city of the member. */
  city: string;
}

export class WelcomeService {
  /** The profile of the member, counted. */
  static profile(userId: number) {
    return db.select({
      id: "welcome.profile",
      errorId: "welcome.failed",
      query: sql`SELECT
                   (SELECT count(*)::int FROM profiles_professions pp
                    WHERE pp.user_id = p.user_id) AS professions,
                   (SELECT count(*)::int FROM profiles_skills ps
                    WHERE ps.user_id = p.user_id) AS skills,
                   p.city
                 FROM profiles p WHERE p.user_id = ${userId}`,
    });
  }
}
