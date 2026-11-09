// The back office's access model (the original's `auth` package): roles,
// permissions and who has what.
//
// The original keeps the records in SurrealDB with uuid ids; the port keeps
// them in Postgres with the name as the id — a role's id IS its name, which
// makes the same addresses readable ("admin", "manage").
//
// The `admin` role is the superuser: it passes every check. The `manage`
// permission opens the panel itself.

import { db, sql } from "@pavlus/backend";

/** The roles the original creates when the service starts. */
export const DEFAULT_ROLES = ["admin", "moderator", "user"] as const;
/** The permissions the original creates when the service starts. */
export const DEFAULT_PERMISSIONS = [
  "create",
  "read",
  "update",
  "delete",
  "manage",
] as const;
/** The role of the superuser. */
export const SUPERUSER_ROLE = "admin";
/** The permission that opens the back office. */
export const ADMIN_PERMISSION = "manage";

export interface RoleRow {
  name: string;
  /** How many members have the role. */
  members: number;
  /** The permissions the role gives. */
  permissions: string[];
  /** The role is the superuser's. */
  superuser: boolean;
}

export interface PermissionRow {
  name: string;
  /** The roles that give the permission. */
  roles: string[];
}

export interface AdminUserRow {
  id: number;
  name: string;
  email: string;
  slug: string;
  roles: string[];
  permissions: string[];
  lastLoginAt: string;
  createdAt: string;
  suspended: boolean;
}

export interface AdminSessionRow {
  /** The session's id — the token itself (the port's sessions are keyed by it). */
  id: string;
  userId: number;
  userName: string;
  email: string;
  createdAt: string;
  expiresAt: string;
}

export class RbacService {
  /** Every role, with its members and its permissions. */
  static roles() {
    return db.select({
      id: "rbac.roles",
      errorId: "rbac.failed",
      query: sql`SELECT r.name,
                        (SELECT count(*)::int FROM user_roles ur
                         WHERE ur.role = r.name) AS members,
                        (SELECT coalesce(json_agg(rp.permission ORDER BY rp.permission), '[]')
                         FROM role_permissions rp
                         WHERE rp.role = r.name) AS permissions
                 FROM roles r ORDER BY r.name`,
    });
  }

  /** Every permission, with the roles that give it. */
  static permissions() {
    return db.select({
      id: "rbac.permissions",
      errorId: "rbac.failed",
      query: sql`SELECT p.name,
                        (SELECT coalesce(json_agg(rp.role ORDER BY rp.role), '[]')
                         FROM role_permissions rp
                         WHERE rp.permission = p.name) AS roles
                 FROM permissions p ORDER BY p.name`,
    });
  }

  /** Every member, with the roles and the permissions they carry. */
  static users() {
    return db.select({
      id: "rbac.users",
      errorId: "rbac.failed",
      query: sql`SELECT u.id, u.name, u.email,
                        COALESCE(p.slug, '') AS slug,
                        COALESCE((SELECT json_agg(ur.role ORDER BY ur.role)
                                  FROM user_roles ur WHERE ur.user_id = u.id), '[]') AS roles,
                        COALESCE((SELECT json_agg(DISTINCT rp.permission ORDER BY rp.permission)
                                  FROM user_roles ur
                                  JOIN role_permissions rp ON rp.role = ur.role
                                  WHERE ur.user_id = u.id), '[]') AS permissions,
                        COALESCE(p.last_login_at::text, '') AS "lastLoginAt",
                        u.created_at::text AS "createdAt",
                        EXISTS (SELECT 1 FROM suspensions s
                                WHERE s.user_id = u.id
                                  AND (s.until IS NULL OR s.until > now())) AS suspended
                 FROM users u
                 LEFT JOIN profiles p ON p.user_id = u.id
                 ORDER BY u.id`,
    });
  }

  /** The names of the roles (the forms of the panel offer them). */
  static roleNames() {
    return db.select({
      id: "rbac.roleNames",
      errorId: "rbac.failed",
      query: sql`SELECT name FROM roles ORDER BY name`,
    });
  }

  /** The roles of one member. */
  static userRoles(userId: number) {
    return db.select({
      id: "rbac.userRoles",
      errorId: "rbac.failed",
      query: sql`SELECT role FROM user_roles WHERE user_id = ${userId}
                 ORDER BY role`,
    });
  }

  /** Gives the member exactly these roles (the others are taken away). */
  static setUserRoles(userId: number, roles: string[]) {
    return db.execute({
      id: "rbac.userRolesSet",
      errorId: "rbac.failed",
      query: sql`DELETE FROM user_roles WHERE user_id = ${userId};
                 INSERT INTO user_roles (user_id, role)
                 SELECT ${userId}, r.name FROM roles r
                 WHERE r.name = ANY(${roles}::text[])
                 ON CONFLICT DO NOTHING`,
    });
  }

  /** Gives the role exactly these permissions. */
  static setRolePermissions(role: string, permissions: string[]) {
    return db.execute({
      id: "rbac.rolePermissionsSet",
      errorId: "rbac.failed",
      query: sql`DELETE FROM role_permissions WHERE role = ${role};
                 INSERT INTO role_permissions (role, permission)
                 SELECT ${role}, p.name FROM permissions p
                 WHERE p.name = ANY(${permissions}::text[])
                 ON CONFLICT DO NOTHING`,
    });
  }

  /** Has the member the permission? (the superuser has every one). */
  static has(userId: number, permission: string, ns = "rbac.has") {
    return db.select({
      id: ns,
      errorId: "rbac.failed",
      query: sql`SELECT 1 AS n FROM user_roles ur
                 LEFT JOIN role_permissions rp ON rp.role = ur.role
                 WHERE ur.user_id = ${userId}
                   AND (ur.role = ${SUPERUSER_ROLE} OR rp.permission = ${permission})
                 LIMIT 1`,
    });
  }

  /** The new role. */
  static createRole(name: string) {
    return db.execute({
      id: "rbac.roleCreated",
      errorId: "rbac.failed",
      query: sql`INSERT INTO roles (name) VALUES (${name})
                 ON CONFLICT DO NOTHING RETURNING name`,
    });
  }

  static deleteRole(name: string) {
    return db.execute({
      id: "rbac.roleDeleted",
      errorId: "rbac.failed",
      query: sql`DELETE FROM roles WHERE name = ${name}`,
    });
  }

  /** The new permission. */
  static createPermission(name: string) {
    return db.execute({
      id: "rbac.permissionCreated",
      errorId: "rbac.failed",
      query: sql`INSERT INTO permissions (name) VALUES (${name})
                 ON CONFLICT DO NOTHING RETURNING name`,
    });
  }

  static deletePermission(name: string) {
    return db.execute({
      id: "rbac.permissionDeleted",
      errorId: "rbac.failed",
      query: sql`DELETE FROM permissions WHERE name = ${name}`,
    });
  }

  /** Every session of the service (the members' own sessions). */
  static sessions() {
    return db.select({
      id: "rbac.sessions",
      errorId: "rbac.failed",
      query: sql`SELECT s.token AS id, s.user_id AS "userId", u.name AS "userName",
                        u.email,
                        s.created_at::text AS "createdAt",
                        s.expires_at::text AS "expiresAt"
                 FROM sessions s JOIN users u ON u.id = s.user_id
                 ORDER BY s.created_at DESC`,
    });
  }

  /** Ends one session of a member (the token is the id). */
  static revokeSession(token: string) {
    return db.execute({
      id: "rbac.sessionRevoked",
      errorId: "rbac.failed",
      query: sql`DELETE FROM sessions WHERE token = ${token}`,
    });
  }
}
