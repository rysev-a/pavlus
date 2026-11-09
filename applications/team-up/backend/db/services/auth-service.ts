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
  isAdmin: boolean;
  /** The language of the account (the preference of the settings page). */
  locale: string;
}

export class AuthService {
  static byEmail(email: string, ns = "auth.byEmail") {
    return db.select({
      id: ns,
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
      query: sql`SELECT u.id, u.email, u.name, u.is_admin AS "isAdmin",
                        u.locale, p.slug, p.city, p.status
                 FROM sessions s
                 JOIN users u ON u.id = s.user_id
                 JOIN profiles p ON p.user_id = u.id
                 WHERE s.token = ${token} AND s.expires_at > now()`,
    });
  }

  static insertSession(token: string, userId: number, ns = "auth.session") {
    return db.execute({
      id: ns,
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

  // ----- the account (the settings page) -----

  /** The password of the account. */
  static updatePassword(
    userId: number,
    hash: string,
    ns = "auth.passwordUpdated",
  ) {
    return db.execute({
      id: ns,
      errorId: "auth.failed",
      query: sql`UPDATE users SET password_hash = ${hash} WHERE id = ${userId}`,
    });
  }

  /** The e-mail of the account. */
  static updateEmail(userId: number, email: string, ns = "auth.emailUpdated") {
    return db.execute({
      id: ns,
      errorId: "auth.failed",
      query: sql`UPDATE users SET email = ${email} WHERE id = ${userId}`,
    });
  }

  /** The language of the account (the preference of the settings page). */
  static updateLocale(
    userId: number,
    locale: string,
    ns = "auth.localeUpdated",
  ) {
    return db.execute({
      id: ns,
      errorId: "auth.failed",
      query: sql`UPDATE users SET locale = ${locale} WHERE id = ${userId}`,
    });
  }

  /** The locale of the account. */
  static locale(userId: number) {
    return db.select({
      id: "auth.locale",
      errorId: "auth.failed",
      query: sql`SELECT locale FROM users WHERE id = ${userId}`,
    });
  }

  /** Every session of the account ends (the password changed). */
  static dropSessions(userId: number, ns = "auth.sessionsDropped") {
    return db.execute({
      id: ns,
      errorId: "auth.failed",
      query: sql`DELETE FROM sessions WHERE user_id = ${userId}`,
    });
  }

  /** The account itself. */
  static deleteUser(userId: number, ns = "auth.userDeleted") {
    return db.execute({
      id: ns,
      errorId: "auth.failed",
      query: sql`DELETE FROM users WHERE id = ${userId}`,
    });
  }

  /** The projects of the member that have a team (the owner has to clear
   * the team first — the others would lose their project without a word). */
  static ownedProjectsWithTeam(userId: number, ns = "auth.ownedProjects") {
    return db.select({
      id: ns,
      errorId: "auth.failed",
      query: sql`SELECT p.slug FROM projects p
                 WHERE p.owner_id = ${userId}
                   AND EXISTS (SELECT 1 FROM slots s
                               WHERE s.project_id = p.id AND s.user_id IS NOT NULL)`,
    });
  }

  /** Everything the port keeps about the member, except the account. One
   * statement (the data-modifying CTEs all run with the same snapshot). */
  static deleteMemberData(userId: number, ns = "auth.memberDataDeleted") {
    return db.execute({
      id: ns,
      errorId: "auth.failed",
      query: sql`WITH p AS (DELETE FROM profiles WHERE user_id = ${userId}),
                 a AS (DELETE FROM applications WHERE user_id = ${userId}),
                 f AS (DELETE FROM favorites WHERE user_id = ${userId}),
                 s AS (DELETE FROM saved_searches WHERE user_id = ${userId}),
                 b AS (DELETE FROM blocks WHERE user_id = ${userId}),
                 n AS (DELETE FROM notifications WHERE user_id = ${userId}),
                 r AS (DELETE FROM reports WHERE user_id = ${userId}),
                 pr AS (DELETE FROM projects WHERE owner_id = ${userId}),
                 fr AS (DELETE FROM friendships
                         WHERE user_id = ${userId} OR friend_id = ${userId}),
                 m AS (DELETE FROM messages WHERE user_id = ${userId}),
                 tp AS (DELETE FROM thread_participants WHERE user_id = ${userId})
                 DELETE FROM sessions WHERE user_id = ${userId}`,
    });
  }

  /** The direct chats that stayed empty after the member left them. */
  static deleteEmptyThreads(ns = "auth.emptyThreadsDeleted") {
    return db.execute({
      id: ns,
      errorId: "auth.failed",
      query: sql`DELETE FROM threads t
                 WHERE t.type = 'dm'
                   AND NOT EXISTS (SELECT 1 FROM thread_participants tp
                                   WHERE tp.thread_id = t.id)
                   AND NOT EXISTS (SELECT 1 FROM messages m
                                   WHERE m.thread_id = t.id)`,
    });
  }
}
