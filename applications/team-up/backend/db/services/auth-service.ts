// The auth service: users and sessions. The scrypt hashing itself is the
// crypto plugin's (an effect, so handlers stay pure); this builds the db side.

import { db, sql } from "@pavlus/backend";

export interface UserRow {
  id: number;
  email: string;
  name: string;
}

/** What a session cookie resolves to: the user plus the public profile. */
export interface SessionUser {
  id: number;
  email: string;
  name: string;
  slug: string;
  city: string;
  status: string;
}

export class AuthService {
  static byEmail(email: string) {
    return db.select({
      id: "auth.byEmail",
      errorId: "auth.failed",
      query: sql`SELECT id, email, name, password_hash FROM users WHERE email = ${email}`,
    });
  }

  static emailFree(email: string) {
    return db.select({
      id: "auth.emailFree",
      errorId: "auth.failed",
      query: sql`SELECT id FROM users WHERE email = ${email}`,
    });
  }

  static createUser(email: string, name: string, hash: string) {
    return db.execute({
      id: "auth.createdUser",
      errorId: "auth.failed",
      query: sql`INSERT INTO users (email, name, password_hash)
                 VALUES (${email}, ${name}, ${hash}) RETURNING id, email, name`,
    });
  }

  static createProfile(userId: number, slug: string) {
    return db.execute({
      id: "auth.createdProfile",
      errorId: "auth.failed",
      query: sql`INSERT INTO profiles (user_id, slug, city, status)
                 VALUES (${userId}, ${slug}, '', 'searching')`,
    });
  }

  /** The session cookie's owner (joined with the profile), or nothing.
   * `id` namespaces the continuation — every api module owns its own flow. */
  static sessionUser(token: string, id = "auth.sessionUser") {
    return db.select({
      id,
      errorId: "auth.failed",
      query: sql`SELECT u.id, u.email, u.name, p.slug, p.city, p.status
                 FROM sessions s
                 JOIN users u ON u.id = s.user_id
                 JOIN profiles p ON p.user_id = u.id
                 WHERE s.token = ${token} AND s.expires_at > now()`,
    });
  }

  static insertSession(token: string, userId: number) {
    return db.execute({
      id: "auth.session",
      errorId: "auth.failed",
      query: sql`INSERT INTO sessions (token, user_id, expires_at)
                 VALUES (${token}, ${userId}, now() + interval '30 days')`,
    });
  }

  static deleteSession(token: string) {
    return db.execute({
      id: "auth.loggedOut",
      errorId: "auth.failed",
      query: sql`DELETE FROM sessions WHERE token = ${token}`,
    });
  }
}
