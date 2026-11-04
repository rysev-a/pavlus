/** Passwords (scrypt) and Bearer tokens (random, stored as sha256). */
import { createHash, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import type { Query } from "./db/query.ts";
import { hashPassword as legacyHash } from "../../ui-kit/frontend/templates/orbit-social/auth.ts";

/** The frontend's own (weak) hash, kept in `users.passwordHash` for the template. */
export { legacyHash };

/** How long a token lives. */
export const SESSION_DAYS = 7;

const N = 16384;
const KEY_LENGTH = 64;

const derive = (password: string, salt: Buffer, n: number): Promise<Buffer> =>
  new Promise((resolve, reject) =>
    scrypt(password, salt, KEY_LENGTH, { N: n }, (e, key) =>
      e ? reject(e) : resolve(key),
    ),
  );

/** `scrypt$N$salt$hash` (base64): everything needed to check a password later. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await derive(password, salt, N);
  return `scrypt$${N}$${salt.toString("base64")}$${key.toString("base64")}`;
}

export async function verifyPassword(
  password: string,
  stored: string,
): Promise<boolean> {
  const [kind, n, salt, hash] = stored.split("$");
  if (kind !== "scrypt" || !n || !salt || !hash) return false;
  const expected = Buffer.from(hash, "base64");
  const key = await derive(password, Buffer.from(salt, "base64"), Number(n));
  return key.length === expected.length && timingSafeEqual(key, expected);
}

const sha256 = (text: string): string =>
  createHash("sha256").update(text).digest("hex");

/** Opens a session for a user; returns the token (shown once) and its expiry. */
export async function openSession(
  run: Query,
  userId: number,
): Promise<{ token: string; expiresAt: string }> {
  const token = randomBytes(32).toString("base64url");
  const [row] = await run<{ expiresAt: string }>(
    `INSERT INTO auth_sessions (token_hash, user_id, expires_at)
     VALUES ($1, $2, now() + make_interval(days => $3))
     RETURNING to_char(expires_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS "expiresAt"`,
    [sha256(token), userId, SESSION_DAYS],
  );
  // forget the sessions that ran out
  await run(`DELETE FROM auth_sessions WHERE expires_at < now()`);
  return { token, expiresAt: row.expiresAt };
}

export interface Principal {
  id: number;
  role: "user" | "moderator" | "admin";
  status: "active" | "banned";
}

/** The user a live token belongs to (null: no such token, expired, or banned). */
export async function principalOf(
  run: Query,
  token: string | null | undefined,
): Promise<Principal | null> {
  if (!token) return null;
  const [row] = await run<Principal>(
    `SELECT u.id, u.role, u.status
       FROM auth_sessions s JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = $1 AND s.expires_at > now() AND u.status = 'active'`,
    [sha256(token)],
  );
  return row ?? null;
}

export async function closeSession(run: Query, token: string): Promise<void> {
  await run(`DELETE FROM auth_sessions WHERE token_hash = $1`, [sha256(token)]);
}
