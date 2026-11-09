// The one-time tokens of the account recovery (the original's `auth`
// package): the verification of the address and the new password.
//
// Only the hash of a token is stored — the letter carries the token itself.
// A token works once and expires: the verification in a day, the new password
// in an hour.

import { createHash } from "node:crypto";
import { db, sql } from "@pavlus/backend";

/** The kinds of the tokens. */
export type TokenKind = "verify_email" | "password_reset";

/** The verification token lives a day, the new password an hour. */
export const VERIFY_TTL_HOURS = 24;
export const RESET_TTL_HOURS = 1;

/** The hash of a token — the only thing the database keeps. */
export const hashToken = (token: string): string =>
  createHash("sha256").update(token).digest("hex");

export interface TokenRow {
  id: number;
  userId: number;
  kind: string;
  expiresAt: string;
}

export class AuthTokenService {
  /** The new token: the old ones of the same kind are dropped. */
  static create(userId: number, kind: TokenKind, tokenHash: string) {
    return db.execute({
      id: "authToken.created",
      errorId: "authToken.failed",
      query: sql`WITH cleared AS (
                   DELETE FROM auth_tokens
                   WHERE user_id = ${userId} AND kind = ${kind})
                 INSERT INTO auth_tokens (user_id, kind, token_hash, expires_at)
                 VALUES (${userId}, ${kind}, ${tokenHash},
                         now() + make_interval(hours => ${
                           kind === "verify_email"
                             ? VERIFY_TTL_HOURS
                             : RESET_TTL_HOURS
                         }))
                 RETURNING id, user_id AS "userId", kind,
                           expires_at::text AS "expiresAt"`,
    });
  }

  /** The token behind its hash — only when it is unused and alive. */
  static find(kind: TokenKind, tokenHash: string) {
    return db.select({
      id: "authToken.found",
      errorId: "authToken.failed",
      query: sql`SELECT id, user_id AS "userId", kind,
                        expires_at::text AS "expiresAt"
                 FROM auth_tokens
                 WHERE kind = ${kind} AND token_hash = ${tokenHash}
                   AND used_at IS NULL AND expires_at > now()`,
    });
  }

  /** The token is spent. */
  static spend(id: number) {
    return db.execute({
      id: "authToken.spent",
      errorId: "authToken.failed",
      query: sql`UPDATE auth_tokens SET used_at = now() WHERE id = ${id}`,
    });
  }

  /** The rate limits of the db (the original counts the events in the database). */
  static countSince(key: string, since: string, ns = "authToken.rate") {
    return db.select({
      id: ns,
      errorId: "authToken.failed",
      query: sql`SELECT count(*)::int AS n FROM rate_events
                 WHERE key = ${key} AND at >= ${since}`,
    });
  }

  static note(key: string, ns = "authToken.noted") {
    return db.execute({
      id: ns,
      errorId: "authToken.failed",
      query: sql`INSERT INTO rate_events (key) VALUES (${key})`,
    });
  }
}
