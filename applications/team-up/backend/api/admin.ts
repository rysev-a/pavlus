// The back office (the original's `admin_api` package): the members, the
// roles, the permissions and the sessions.
//
// The original mounts its own router with a bearer token; the port's panel
// lives inside the app, so the app's own session cookie is the identity. The
// guard is the same: the `manage` permission opens the panel, and the `admin`
// role passes every check.
//
// The lists keep the original's envelope: `{total, items}` (the moderation
// queue of team-up keeps its own `{reports}` / `{suspended}`).

import {
  type HttpReq,
  httpEffector,
  oneOf,
  requestsEffector,
  rowsOf,
  type ServerState,
} from "@pavlus/backend";
import type { Effect, Message } from "@pavlus/core";
import {
  ADMIN_PERMISSION,
  RbacService,
  SUPERUSER_ROLE,
} from "../db/services/rbac-service.ts";
import { LOCALE_NAMES, LOCALES, trOf, type Tr } from "../i18n/mod.ts";
import { initialsOf } from "../lib/views.ts";
import { sessionEffect, sessionUserOf, unauthorized } from "./session.ts";

/** The request's parked slice. */
const parked = (
  message: Message,
  state: ServerState,
): Record<string, unknown> => state.requests[message.ctx?.rid as string] ?? {};

/** The body of a request, as a plain object. */
const bodyOf = (message: Message): Record<string, unknown> => {
  const body = (message.payload as HttpReq).body;
  return (body ?? {}) as Record<string, unknown>;
};

/** The list envelope of the original's admin api. */
const items = (rows: unknown[]): { total: number; items: unknown[] } => ({
  total: rows.length,
  items: rows,
});

/** The hue of an avatar (the ui_kit's `--hue` custom property). */
const hueOf = (name: string): number => {
  let sum = 0;
  for (const byte of new TextEncoder().encode(name)) sum += byte;
  return sum % 360;
};

/** The administrator of the panel: the name, the address and the letters. */
const accountOf = (email: string): Record<string, string> => ({
  name: email.split("@")[0] ?? email,
  email,
  initials: initialsOf(email),
});

/** The languages of the switch (the header's own list). */
const localesOf = (tr: Tr): { code: string; name: string; active: boolean }[] =>
  LOCALES.map((code) => ({
    code,
    name: LOCALE_NAMES[code],
    active: tr.locale === code,
  }));

/**
 * The texts of the panel (the original translates them in the browser; the
 * port translates on the server, so they travel with the frame).
 */
const panelStrings = (tr: Tr): Record<string, string> => ({
  // the frame
  admin: tr.tr("Admin"),
  controlPanel: tr.tr("Control panel"),
  menu: tr.tr("Menu"),
  access: tr.tr("Access"),
  system: tr.tr("System"),
  tasks: tr.tr("Tasks"),
  backToApp: tr.tr("Back to the app"),
  profile: tr.tr("Profile"),
  signOut: tr.tr("Sign out"),
  loading: tr.tr("Loading…"),
  noAccess: tr.tr("No access"),
  noAccessText: tr.tr(
    "Your account does not have the `manage` permission. Ask an administrator to grant it.",
  ),
  // the members
  usersTitle: tr.tr("Users"),
  usersDescription: tr.tr("Accounts that can sign in, with their roles."),
  totalUsers: tr.tr("Total users"),
  emailConfirmed: tr.tr("Email confirmed"),
  administrators: tr.tr("Administrators"),
  allUsers: tr.tr("All users"),
  noUsers: tr.tr("No users match."),
  searchUsers: tr.tr("Search users…"),
  user: tr.tr("User"),
  roles: tr.tr("Roles"),
  status: tr.tr("Status"),
  created: tr.tr("Created"),
  confirmed: tr.tr("Confirmed"),
  notConfirmed: tr.tr("Not confirmed"),
  // the tasks of the system
  tasksTitle: tr.tr("Tasks"),
  tasksDescription: tr.tr(
    "The background work of the service: the letters, the cleanups and the other jobs.",
  ),
  allTasks: tr.tr("All tasks"),
  newTask: tr.tr("New task"),
  handler: tr.tr("Handler"),
  schedule: tr.tr("Schedule"),
  attempts: tr.tr("Attempts"),
  lastError: tr.tr("Last error"),
  run: tr.tr("Run"),
  stop: tr.tr("Stop"),
  noTasks: tr.tr("No tasks yet."),
  createTask: tr.tr("Create the task"),
  whenToRunIt: tr.tr("When to run it"),
  searchTasks: tr.tr("Search tasks…"),
  // the roles
  rolesTitle: tr.tr("Roles"),
  rolesDescription: tr.tr(
    "A role bundles permissions; users get access through their roles.",
  ),
  allRoles: tr.tr("All roles"),
  noRoles: tr.tr("No roles match."),
  searchRoles: tr.tr("Search roles…"),
  role: tr.tr("Role"),
  usersCount: tr.tr("Users"),
  permissionsOfRole: tr.tr("Permissions of the role"),
  superuser: tr.tr(
    "The admin role is a superuser: it passes every permission check.",
  ),
  newRole: tr.tr("New role"),
  editRole: tr.tr("Edit role"),
  createRole: tr.tr("Create role"),
  // the permissions
  permissionsTitle: tr.tr("Permissions"),
  permissionsDescription: tr.tr("Single abilities that roles are made of."),
  allPermissions: tr.tr("All permissions"),
  noPermissions: tr.tr("No permissions match."),
  searchPermissions: tr.tr("Search permissions…"),
  permission: tr.tr("Permission"),
  newPermission: tr.tr("New permission"),
  editPermission: tr.tr("Edit permission"),
  createPermission: tr.tr("Create permission"),
  // the sessions
  sessionsTitle: tr.tr("Sessions"),
  sessionsDescription: tr.tr("Where users are signed in right now."),
  activeSessions: tr.tr("Active sessions"),
  noSessions: tr.tr("No active sessions."),
  searchSessions: tr.tr("Search sessions…"),
  started: tr.tr("Started"),
  lastActive: tr.tr("Last active"),
  end: tr.tr("End"),
  // the forms
  name: tr.tr("Name"),
  email: tr.tr("Email"),
  password: tr.tr("Password"),
  newPassword: tr.tr("New password"),
  passwordHint: tr.tr("At least 8 characters."),
  save: tr.tr("Save"),
  cancel: tr.tr("Cancel"),
  edit: tr.tr("Edit"),
  delete: tr.tr("Delete"),
  refresh: tr.tr("Refresh"),
  search: tr.tr("Search"),
  nameHint: tr.tr(
    "Letters and dashes, no spaces: moderator, shop-admin, team-member…",
  ),
  permissionHint: tr.tr(
    "Letters and dashes, no spaces: create, read, approve, invite…",
  ),
});

export class AdminAPI {
  // ----- the frame of the panel -----

  /**
   * GET /api/admin/panel — the frame every page of the panel shares: the
   * sections of the sidebar, the texts and the roles of the forms.
   */
  "admin.panel"(message: Message): Effect[] {
    return this.guard(message, "admin.panel");
  }

  "admin.panel.sessionUser.onSuccess"(message: Message): Effect[] {
    const user = sessionUserOf(message);
    if (!user) return [unauthorized()];
    return [
      requestsEffector.merge({ account: user.email }),
      RbacService.has(user.id, ADMIN_PERMISSION, "admin.panel.guard"),
    ];
  }

  "admin.panel.guard.onSuccess"(message: Message): Effect[] {
    if (!oneOf(message)) return this.forbidden(message);
    return [RbacService.roleNames()];
  }

  "rbac.roleNames.onSuccess"(message: Message, state: ServerState): Effect[] {
    const tr = trOf(message.payload as HttpReq);
    const slice = parked(message, state) as { account: string };
    const roleOptions = rowsOf<{ name: string }>(message).map((r) => ({
      name: r.name,
      label: r.name,
    }));
    return [
      httpEffector.makeResponse(200, {
        sections: [
          { id: "users", title: tr.tr("Users"), href: "/app/admin" },
          { id: "roles", title: tr.tr("Roles"), href: "/app/admin/roles" },
          {
            id: "permissions",
            title: tr.tr("Permissions"),
            href: "/app/admin/permissions",
          },
          {
            id: "sessions",
            title: tr.tr("Sessions"),
            href: "/app/admin/sessions",
          },
        ],
        roleOptions,
        account: accountOf(slice.account ?? ""),
        locales: localesOf(tr),
        strings: panelStrings(tr),
      }),
    ];
  }

  // ----- the guard -----

  /**
   * The session of the administrator is looked up and the `manage` permission
   * is checked; `${ns}.guard` continues with the flow of the endpoint.
   */
  private guard(message: Message, ns: string): Effect[] {
    return [...sessionEffect(message.payload as HttpReq, ns)];
  }

  /** The permission is missing: the panel is closed. */
  private forbidden(message: Message): Effect[] {
    const tr = trOf(message.payload as HttpReq);
    return [
      httpEffector.makeResponse(403, {
        error: tr.tr("Only the administrators of the site can open this page."),
      }),
    ];
  }

  // ----- the members -----

  /** GET /api/admin/users */
  "admin.users"(message: Message): Effect[] {
    return this.guard(message, "admin.users");
  }

  "admin.users.sessionUser.onSuccess"(
    message: Message,
    state: ServerState,
  ): Effect[] {
    const user = sessionUserOf(message);
    if (!user) return [unauthorized()];
    return [
      requestsEffector.merge({ userId: user.id }),
      RbacService.has(user.id, ADMIN_PERMISSION, "admin.users.guard"),
    ];
  }

  "admin.users.guard.onSuccess"(message: Message): Effect[] {
    if (!oneOf(message)) return this.forbidden(message);
    return [RbacService.users()];
  }

  "rbac.users.onSuccess"(message: Message): Effect[] {
    const rows = rowsOf<{ id: number; name: string; email: string }>(message);
    return [
      httpEffector.makeResponse(
        200,
        items(
          rows.map((row) => ({
            ...row,
            initials: initialsOf(row.name || row.email),
            hue: hueOf(row.name || row.email),
          })),
        ),
      ),
    ];
  }

  /** GET /api/admin/users/:id */
  "admin.user"(message: Message): Effect[] {
    const id = Number((message.payload as HttpReq).params.id);
    if (!Number.isInteger(id))
      return [httpEffector.makeResponse(404, { error: "no such member" })];
    return [
      requestsEffector.merge({ id }),
      ...this.guard(message, "admin.user"),
    ];
  }

  "admin.user.sessionUser.onSuccess"(
    message: Message,
    state: ServerState,
  ): Effect[] {
    const user = sessionUserOf(message);
    if (!user) return [unauthorized()];
    return [
      requestsEffector.merge({ userId: user.id }),
      RbacService.has(user.id, ADMIN_PERMISSION, "admin.user.guard"),
    ];
  }

  "admin.user.guard.onSuccess"(message: Message, state: ServerState): Effect[] {
    if (!oneOf(message)) return this.forbidden(message);
    const slice = parked(message, state) as { id: number };
    return [RbacService.userRoles(slice.id)];
  }

  "rbac.userRoles.onSuccess"(message: Message): Effect[] {
    const roles = rowsOf<{ role: string }>(message).map((r) => r.role);
    return [httpEffector.makeResponse(200, { roles })];
  }

  // ----- the roles -----

  /** GET /api/admin/roles */
  "admin.roles"(message: Message): Effect[] {
    return this.guard(message, "admin.roles");
  }

  "admin.roles.sessionUser.onSuccess"(message: Message): Effect[] {
    const user = sessionUserOf(message);
    if (!user) return [unauthorized()];
    return [RbacService.has(user.id, ADMIN_PERMISSION, "admin.roles.guard")];
  }

  "admin.roles.guard.onSuccess"(message: Message): Effect[] {
    if (!oneOf(message)) return this.forbidden(message);
    return [RbacService.roles()];
  }

  "rbac.roles.onSuccess"(message: Message): Effect[] {
    const rows = rowsOf(message);
    return [httpEffector.makeResponse(200, items(rows))];
  }

  /** POST /api/admin/roles */
  "admin.roleCreate"(message: Message): Effect[] {
    const name = String(bodyOf(message).name ?? "").trim();
    if (!name)
      return [
        httpEffector.makeResponse(400, { error: "the name of the role" }),
      ];
    return [
      requestsEffector.merge({ name }),
      ...this.guard(message, "admin.roleCreate"),
    ];
  }

  "admin.roleCreate.sessionUser.onSuccess"(message: Message): Effect[] {
    const user = sessionUserOf(message);
    if (!user) return [unauthorized()];
    return [
      requestsEffector.merge({ userId: user.id }),
      RbacService.has(user.id, ADMIN_PERMISSION, "admin.roleCreate.guard"),
    ];
  }

  "admin.roleCreate.guard.onSuccess"(
    message: Message,
    state: ServerState,
  ): Effect[] {
    if (!oneOf(message)) return this.forbidden(message);
    const slice = parked(message, state) as { name: string };
    return [RbacService.createRole(slice.name)];
  }

  "rbac.roleCreated.onSuccess"(message: Message): Effect[] {
    const row = oneOf<{ name: string }>(message);
    return [httpEffector.makeResponse(201, { name: row?.name ?? "" })];
  }

  /** PUT /api/admin/roles/:id — the role's permissions. */
  "admin.rolePermissions"(message: Message): Effect[] {
    const role = String((message.payload as HttpReq).params.id ?? "").trim();
    const permissions = (bodyOf(message).ids ??
      bodyOf(message).permissions ??
      []) as string[] | string;
    const list = Array.isArray(permissions) ? permissions : [permissions];
    if (!role)
      return [httpEffector.makeResponse(404, { error: "no such role" })];
    return [
      requestsEffector.merge({ role, permissions: list.filter(Boolean) }),
      ...this.guard(message, "admin.rolePermissions"),
    ];
  }

  "admin.rolePermissions.sessionUser.onSuccess"(
    message: Message,
    state: ServerState,
  ): Effect[] {
    const user = sessionUserOf(message);
    if (!user) return [unauthorized()];
    return [
      requestsEffector.merge({ userId: user.id }),
      RbacService.has(user.id, ADMIN_PERMISSION, "admin.rolePermissions.guard"),
    ];
  }

  "admin.rolePermissions.guard.onSuccess"(
    message: Message,
    state: ServerState,
  ): Effect[] {
    if (!oneOf(message)) return this.forbidden(message);
    const slice = parked(message, state) as {
      role: string;
      permissions: string[];
    };
    return [RbacService.setRolePermissions(slice.role, slice.permissions)];
  }

  "rbac.rolePermissionsSet.onSuccess"(): Effect[] {
    return [httpEffector.makeResponse(204, null)];
  }

  /** DELETE /api/admin/roles/:id */
  "admin.roleDelete"(message: Message): Effect[] {
    const role = String((message.payload as HttpReq).params.id ?? "").trim();
    if (!role)
      return [httpEffector.makeResponse(404, { error: "no such role" })];
    return [
      requestsEffector.merge({ role }),
      ...this.guard(message, "admin.roleDelete"),
    ];
  }

  "admin.roleDelete.sessionUser.onSuccess"(message: Message): Effect[] {
    const user = sessionUserOf(message);
    if (!user) return [unauthorized()];
    return [
      requestsEffector.merge({ userId: user.id }),
      RbacService.has(user.id, ADMIN_PERMISSION, "admin.roleDelete.guard"),
    ];
  }

  "admin.roleDelete.guard.onSuccess"(
    message: Message,
    state: ServerState,
  ): Effect[] {
    if (!oneOf(message)) return this.forbidden(message);
    const slice = parked(message, state) as { role: string };
    return [RbacService.deleteRole(slice.role)];
  }

  "rbac.roleDeleted.onSuccess"(): Effect[] {
    return [httpEffector.makeResponse(204, null)];
  }

  // ----- the permissions -----

  /** GET /api/admin/permissions */
  "admin.permissions"(message: Message): Effect[] {
    return this.guard(message, "admin.permissions");
  }

  "admin.permissions.sessionUser.onSuccess"(message: Message): Effect[] {
    const user = sessionUserOf(message);
    if (!user) return [unauthorized()];
    return [
      RbacService.has(user.id, ADMIN_PERMISSION, "admin.permissions.guard"),
    ];
  }

  "admin.permissions.guard.onSuccess"(message: Message): Effect[] {
    if (!oneOf(message)) return this.forbidden(message);
    return [RbacService.permissions()];
  }

  "rbac.permissions.onSuccess"(message: Message): Effect[] {
    const rows = rowsOf(message);
    return [httpEffector.makeResponse(200, items(rows))];
  }

  /** POST /api/admin/permissions */
  "admin.permissionCreate"(message: Message): Effect[] {
    const name = String(bodyOf(message).name ?? "").trim();
    if (!name)
      return [
        httpEffector.makeResponse(400, { error: "the name of the permission" }),
      ];
    return [
      requestsEffector.merge({ name }),
      ...this.guard(message, "admin.permissionCreate"),
    ];
  }

  "admin.permissionCreate.sessionUser.onSuccess"(message: Message): Effect[] {
    const user = sessionUserOf(message);
    if (!user) return [unauthorized()];
    return [
      requestsEffector.merge({ userId: user.id }),
      RbacService.has(
        user.id,
        ADMIN_PERMISSION,
        "admin.permissionCreate.guard",
      ),
    ];
  }

  "admin.permissionCreate.guard.onSuccess"(
    message: Message,
    state: ServerState,
  ): Effect[] {
    if (!oneOf(message)) return this.forbidden(message);
    const slice = parked(message, state) as { name: string };
    return [RbacService.createPermission(slice.name)];
  }

  "rbac.permissionCreated.onSuccess"(message: Message): Effect[] {
    const row = oneOf<{ name: string }>(message);
    return [httpEffector.makeResponse(201, { name: row?.name ?? "" })];
  }

  /** DELETE /api/admin/permissions/:id */
  "admin.permissionDelete"(message: Message): Effect[] {
    const name = String((message.payload as HttpReq).params.id ?? "").trim();
    if (!name)
      return [httpEffector.makeResponse(404, { error: "no such permission" })];
    return [
      requestsEffector.merge({ name }),
      ...this.guard(message, "admin.permissionDelete"),
    ];
  }

  "admin.permissionDelete.sessionUser.onSuccess"(message: Message): Effect[] {
    const user = sessionUserOf(message);
    if (!user) return [unauthorized()];
    return [
      requestsEffector.merge({ userId: user.id }),
      RbacService.has(
        user.id,
        ADMIN_PERMISSION,
        "admin.permissionDelete.guard",
      ),
    ];
  }

  "admin.permissionDelete.guard.onSuccess"(
    message: Message,
    state: ServerState,
  ): Effect[] {
    if (!oneOf(message)) return this.forbidden(message);
    const slice = parked(message, state) as { name: string };
    return [RbacService.deletePermission(slice.name)];
  }

  "rbac.permissionDeleted.onSuccess"(): Effect[] {
    return [httpEffector.makeResponse(204, null)];
  }

  // ----- the roles of a member -----

  /** PUT /api/admin/users/:id/roles */
  "admin.userRoles"(message: Message): Effect[] {
    const id = Number((message.payload as HttpReq).params.id);
    const body = bodyOf(message);
    const raw = (body.ids ?? body.roles ?? []) as string[] | string;
    const roles = (Array.isArray(raw) ? raw : [raw]).filter(Boolean);
    if (!Number.isInteger(id))
      return [httpEffector.makeResponse(404, { error: "no such member" })];
    return [
      requestsEffector.merge({ id, roles }),
      ...this.guard(message, "admin.userRoles"),
    ];
  }

  "admin.userRoles.sessionUser.onSuccess"(message: Message): Effect[] {
    const user = sessionUserOf(message);
    if (!user) return [unauthorized()];
    return [
      requestsEffector.merge({ userId: user.id }),
      RbacService.has(user.id, ADMIN_PERMISSION, "admin.userRoles.guard"),
    ];
  }

  "admin.userRoles.guard.onSuccess"(
    message: Message,
    state: ServerState,
  ): Effect[] {
    if (!oneOf(message)) return this.forbidden(message);
    const slice = parked(message, state) as {
      id: number;
      roles: string[];
      userId: number;
    };
    // locking yourself out of the panel is never intended
    if (slice.id === slice.userId && !slice.roles.includes(SUPERUSER_ROLE)) {
      const tr = trOf(message.payload as HttpReq);
      return [
        httpEffector.makeResponse(400, {
          error: tr.tr("You cannot remove the `admin` role from yourself"),
        }),
      ];
    }
    return [RbacService.setUserRoles(slice.id, slice.roles)];
  }

  "rbac.userRolesSet.onSuccess"(): Effect[] {
    return [httpEffector.makeResponse(204, null)];
  }

  // ----- the sessions -----

  /** GET /api/admin/sessions */
  "admin.sessions"(message: Message): Effect[] {
    return this.guard(message, "admin.sessions");
  }

  "admin.sessions.sessionUser.onSuccess"(message: Message): Effect[] {
    const user = sessionUserOf(message);
    if (!user) return [unauthorized()];
    return [RbacService.has(user.id, ADMIN_PERMISSION, "admin.sessions.guard")];
  }

  "admin.sessions.guard.onSuccess"(message: Message): Effect[] {
    if (!oneOf(message)) return this.forbidden(message);
    return [RbacService.sessions()];
  }

  "rbac.sessions.onSuccess"(message: Message): Effect[] {
    const rows = rowsOf(message);
    return [httpEffector.makeResponse(200, items(rows))];
  }

  /** DELETE /api/admin/sessions/:id — the token is the id. */
  "admin.sessionRevoke"(message: Message): Effect[] {
    const token = String((message.payload as HttpReq).params.id ?? "").trim();
    if (!token)
      return [httpEffector.makeResponse(404, { error: "no such session" })];
    return [
      requestsEffector.merge({ token }),
      ...this.guard(message, "admin.sessionRevoke"),
    ];
  }

  "admin.sessionRevoke.sessionUser.onSuccess"(message: Message): Effect[] {
    const user = sessionUserOf(message);
    if (!user) return [unauthorized()];
    return [
      requestsEffector.merge({ userId: user.id }),
      RbacService.has(user.id, ADMIN_PERMISSION, "admin.sessionRevoke.guard"),
    ];
  }

  "admin.sessionRevoke.guard.onSuccess"(
    message: Message,
    state: ServerState,
  ): Effect[] {
    if (!oneOf(message)) return this.forbidden(message);
    const slice = parked(message, state) as { token: string };
    return [RbacService.revokeSession(slice.token)];
  }

  "rbac.sessionRevoked.onSuccess"(): Effect[] {
    return [httpEffector.makeResponse(204, null)];
  }

  /** The db failed: the request answers 500 instead of waiting. */
  "rbac.failed"(): Effect[] {
    return [httpEffector.makeResponse(500, { error: "database error" })];
  }
}
