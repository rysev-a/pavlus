/**
 * The back office's access model: the roles and the permissions the original
 * creates when the service starts (`admin`, `moderator`, `user` and `create`,
 * `read`, `update`, `delete`, `manage`).
 *
 * The `admin` role is the superuser — it passes every check. The `manage`
 * permission opens the panel itself.
 *
 * The members with `is_admin` get the `admin` role, so the demo world's
 * administrator opens the panel.
 */
import type { Query } from "./query.ts";
import { hashPassword } from "./seed.ts";

/** The roles the original seeds. */
const ROLES = ["admin", "moderator", "user"];

/** The permissions the original seeds. */
const PERMISSIONS = ["create", "read", "update", "delete", "manage"];

/** What the roles give (the superuser gets everything anyway). */
const ROLE_PERMISSIONS: Record<string, string[]> = {
  admin: PERMISSIONS,
  moderator: ["read", "update"],
  user: ["read"],
};

/** The administrator of the demo world (the original's `boss@test.invalid`). */
const ADMIN_EMAIL = "boss@team.up";

/** The roles of the administrators of the demo world. */
export async function seedRbac(query: Query): Promise<void> {
  for (const role of ROLES) {
    await query(`INSERT INTO roles (name) VALUES ($1) ON CONFLICT DO NOTHING`, [
      role,
    ]);
  }
  for (const permission of PERMISSIONS) {
    await query(
      `INSERT INTO permissions (name) VALUES ($1) ON CONFLICT DO NOTHING`,
      [permission],
    );
  }
  for (const [role, permissions] of Object.entries(ROLE_PERMISSIONS)) {
    for (const permission of permissions) {
      await query(
        `INSERT INTO role_permissions (role, permission) VALUES ($1, $2)
         ON CONFLICT DO NOTHING`,
        [role, permission],
      );
    }
  }
  // the administrator of the demo world (the password is the world's one)
  await query(
    `INSERT INTO users (email, name, password_hash, is_admin)
     VALUES ($1, 'Boss', $2, true)
     ON CONFLICT (email) DO UPDATE SET is_admin = true`,
    [ADMIN_EMAIL, hashPassword("teamup123")],
  );
  await query(
    `INSERT INTO profiles (user_id, slug, city, status)
     SELECT u.id, 'boss', 'Moscow', 'searching' FROM users u
     WHERE u.email = $1
     ON CONFLICT (user_id) DO NOTHING`,
    [ADMIN_EMAIL],
  );
  // the administrators of the demo world are the superusers
  await query(
    `INSERT INTO user_roles (user_id, role)
     SELECT id, 'admin' FROM users WHERE is_admin
     ON CONFLICT DO NOTHING`,
  );
}
