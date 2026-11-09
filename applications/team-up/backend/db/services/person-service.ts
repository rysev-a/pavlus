// The service of the person page (`/app/people/:slug`): the profile, the
// relation with the viewer (self / none / waiting / incoming / friends), the
// block and the contacts (the friends and the member alone see them).

import { db, sql } from "@pavlus/backend";

export interface PersonRow {
  userId: number;
  slug: string;
  name: string;
  city: string;
  bio: string;
  status: string;
  birthYear: number | null;
  domains: string[];
  contacts: string;
  professions: { slug: string; name: string; bucket: string }[];
  skills: {
    slug: string;
    name: string;
    level: number;
    profession: string | null;
  }[];
  /** The relation row of the viewer: waiting | incoming | friends | null. */
  relationRow: string | null;
  blocked: boolean;
}

export class PersonService {
  /** One member as the viewer sees them. */
  static bySlug(slug: string, viewerId: number, ns = "people.bySlug") {
    return db.select({
      id: ns,
      errorId: "people.failed",
      query: sql`SELECT p.user_id AS "userId", p.slug, u.name, p.city, p.bio,
                        p.status, p.birth_year AS "birthYear", p.domains,
                        p.contacts,
                        (SELECT coalesce(json_agg(json_build_object(
                          'slug', pr.slug, 'name', pr.name, 'bucket', pp.bucket)), '[]')
                         FROM profiles_professions pp
                         JOIN professions pr ON pr.id = pp.profession_id
                         WHERE pp.user_id = p.user_id) AS professions,
                        (SELECT coalesce(json_agg(json_build_object(
                          'slug', s.slug, 'name', s.name, 'level', ps.level,
                          'profession', (SELECT pn.name FROM professions_skills psk
                            JOIN professions pn ON pn.id = psk.profession_id
                            WHERE psk.skill_id = s.id ORDER BY psk.profession_id
                            LIMIT 1))), '[]')
                         FROM profiles_skills ps
                         JOIN skills s ON s.id = ps.skill_id
                         WHERE ps.user_id = p.user_id) AS skills,
                        f.status AS "relationRow",
                        EXISTS (SELECT 1 FROM blocks b
                          WHERE b.user_id = ${viewerId} AND b.slug = p.slug) AS blocked
                 FROM profiles p
                 JOIN users u ON u.id = p.user_id
                 LEFT JOIN friendships f
                   ON f.user_id = ${viewerId} AND f.friend_id = p.user_id
                 WHERE p.slug = ${slug}`,
    });
  }
}
