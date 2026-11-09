/**
 * The back office (`/app/admin`): the panel of the original's `admin_ui` —
 * the members, the roles, the permissions and the sessions.
 *
 * The panel is one page with four sections (the original's routes:
 * `/app/admin`, `/app/admin/roles`, `/app/admin/permissions`,
 * `/app/admin/sessions`). The section comes from the address; the frame (the
 * sidebar, the breadcrumb, the texts) is the same on every one of them.
 *
 * The texts and the lists come from the backend — the port translates on the
 * server, so the page renders what it is given.
 */
import { Component, type Effect, type Message } from "@pavlus/frontend";
import {
  httpEffector as http,
  routerEffector as router,
  storeEffector as store,
} from "@pavlus/frontend/plugins";
import { DomPlugin } from "@pavlus/frontend/plugins/dom";
import {
  routePath,
  type AdminPermission,
  type AdminRole,
  type AdminSession,
  type AdminTask,
  type AdminTaskHandler,
  type AdminUser,
  type AppState,
} from "../state.ts";
import view from "./admin.pavlus";

/** The page's slice: what the outlet hands it (state.admin). */
export type AdminSlice = AppState["admin"];

/** The section of the panel a path stands for. */
export const sectionOf = (path: string): string => {
  if (path.includes("/roles")) return "roles";
  if (path.includes("/permissions")) return "permissions";
  if (path.includes("/sessions")) return "sessions";
  if (path.includes("/tasks")) return "tasks";
  return "users";
};

export class AdminPage extends Component<AdminSlice> {
  view = view;

  /** The whole list, before the filter of the table. */
  private allUsers: AdminUser[] = [];
  private allRoles: AdminRole[] = [];
  private allPermissions: AdminPermission[] = [];
  private allSessions: AdminSession[] = [];

  paint(msg: Message): Effect[] {
    const { prev, next } = msg.payload as {
      prev: AdminSlice;
      next: AdminSlice;
    };
    return [DomPlugin.update(view.diff(prev, next))];
  }

  enter(_msg: Message, s: AdminSlice): Effect[] {
    const section = sectionOf(routePath(s.route) || "/app/admin");
    return [
      store.set("section", section, { onSuccess: "paint" }),
      store.set("search", "", { onSuccess: "paint" }),
      store.set("error", "", { onSuccess: "paint" }),
      store.set("notice", "", { onSuccess: "paint" }),
      http.request({
        id: "panel",
        url: "/api/admin/panel",
        onSuccess: "panel.loaded",
        onError: "panel.failed",
      }),
      ...this.listOf(section),
    ];
  }

  /** The list of the section. */
  private listOf(section: string): Effect[] {
    if (section === "tasks") {
      return [
        http.request({
          id: "tasks",
          url: "/api/admin/tasks",
          onSuccess: "tasks.loaded",
          onError: "tasks.failed",
        }),
      ];
    }
    const url =
      section === "roles"
        ? "/api/admin/roles"
        : section === "permissions"
          ? "/api/admin/permissions"
          : section === "sessions"
            ? "/api/admin/sessions"
            : "/api/admin/users";
    return [
      http.request({
        id: "list",
        url,
        onSuccess: "list.loaded",
        onError: "list.failed",
      }),
    ];
  }

  /** The tasks of the system (with the handlers the port registers). */
  "tasks.loaded"(msg: Message): Effect[] {
    const data = msg.payload as {
      data: {
        items: AdminTask[];
        handlers: AdminTaskHandler[];
        strings: Record<string, string>;
      };
    };
    return [
      store.set("tasks", data.data.items ?? [], { onSuccess: "paint" }),
      store.set("taskHandlers", data.data.handlers ?? [], {
        onSuccess: "paint",
      }),
      store.merge(data.data.strings ?? {}, { onSuccess: "paint" }),
    ];
  }

  "tasks.failed"(): Effect[] {
    return [];
  }

  /** The handler of the new task. */
  setTaskKind(msg: Message): Effect[] {
    return [
      store.set("newTaskKind", msg.event?.value ?? "", { onSuccess: "paint" }),
    ];
  }

  /** When the new task should run. */
  setTaskRunAt(msg: Message): Effect[] {
    return [
      store.set("newTaskRunAt", msg.event?.value ?? "", { onSuccess: "paint" }),
    ];
  }

  /** The task is created. */
  createTask(_msg: Message, s: AdminSlice): Effect[] {
    const kind = s.newTaskKind || s.taskHandlers[0]?.name || "";
    if (!kind || s.busy) return [];
    return [
      store.set("busy", true, { onSuccess: "paint" }),
      http.request({
        id: "task.create",
        method: "POST",
        url: "/api/admin/tasks",
        body: { kind, runAt: s.newTaskRunAt || null, payload: {} },
        onSuccess: "task.created",
        onError: "write.failed",
      }),
    ];
  }

  "task.created"(): Effect[] {
    return [
      store.set("busy", false, { onSuccess: "paint" }),
      store.set("newTaskRunAt", "", { onSuccess: "paint" }),
      ...this.listOf("tasks"),
    ];
  }

  /** The task runs now. */
  runTask(msg: Message): Effect[] {
    const id = Number(msg.payload ?? 0);
    if (!id) return [];
    return [
      http.request({
        id: "task.run",
        method: "POST",
        url: `/api/admin/tasks/${id}/run`,
        onSuccess: "task.ran",
        onError: "write.failed",
      }),
    ];
  }

  "task.ran"(): Effect[] {
    return [...this.listOf("tasks")];
  }

  /** The task is stopped. */
  stopTask(msg: Message): Effect[] {
    const id = Number(msg.payload ?? 0);
    if (!id) return [];
    return [
      http.request({
        id: "task.cancel",
        method: "POST",
        url: `/api/admin/tasks/${id}/cancel`,
        onSuccess: "task.ran",
        onError: "write.failed",
      }),
    ];
  }

  /** The task is deleted. */
  deleteTask(msg: Message): Effect[] {
    const id = Number(msg.payload ?? 0);
    if (!id) return [];
    return [
      http.request({
        id: "task.delete",
        method: "DELETE",
        url: `/api/admin/tasks/${id}`,
        onSuccess: "task.ran",
        onError: "write.failed",
      }),
    ];
  }

  /** The frame of the panel. */
  "panel.loaded"(msg: Message, s: AdminSlice): Effect[] {
    const data = msg.payload as {
      data: {
        sections: { id: string; title: string; href: string }[];
        roleOptions: { name: string; label: string }[];
        strings: Record<string, string>;
      };
    };
    const title =
      data.data.sections.find((x) => x.id === s.section)?.title ??
      (s.section === "tasks" ? (data.data.strings.tasksTitle ?? "") : "");
    return [
      store.merge(data.data as unknown as Record<string, unknown>, {
        onSuccess: "paint",
      }),
      store.set("pageTitle", title, { onSuccess: "paint" }),
    ];
  }

  "panel.failed"(msg: Message): Effect[] {
    const error = (msg.payload as { error?: string }).error ?? "";
    return [store.set("error", error, { onSuccess: "paint" })];
  }

  /** The list of the section. */
  "list.loaded"(msg: Message, s: AdminSlice): Effect[] {
    const data = msg.payload as { data: unknown };
    const body = data.data as { items?: unknown[] } | unknown[];
    const rows = Array.isArray(body) ? body : (body?.items ?? []);
    if (s.section === "roles") {
      this.allRoles = rows as AdminRole[];
      return [store.set("roles", this.allRoles, { onSuccess: "paint" })];
    }
    if (s.section === "permissions") {
      this.allPermissions = rows as AdminPermission[];
      return [
        store.set("permissions", this.allPermissions, { onSuccess: "paint" }),
      ];
    }
    if (s.section === "sessions") {
      this.allSessions = rows as AdminSession[];
      return [store.set("sessions", this.allSessions, { onSuccess: "paint" })];
    }
    this.allUsers = rows as AdminUser[];
    const admins = this.allUsers.filter((u) =>
      u.roles.includes("admin"),
    ).length;
    return [
      store.set("users", this.allUsers, { onSuccess: "paint" }),
      store.set(
        "stats",
        {
          total: this.allUsers.length,
          confirmed: this.allUsers.length,
          admins,
        },
        { onSuccess: "paint" },
      ),
    ];
  }

  "list.failed"(): Effect[] {
    return [];
  }

  /** The filter of the table. */
  setSearch(msg: Message, s: AdminSlice): Effect[] {
    const search = msg.event?.value ?? "";
    const effects: Effect[] = [
      store.set("search", search, { onSuccess: "paint" }),
    ];
    if (s.section === "users") {
      const needle = search.trim().toLowerCase();
      const shown = this.allUsers.filter(
        (u) =>
          !needle ||
          u.name.toLowerCase().includes(needle) ||
          u.email.toLowerCase().includes(needle),
      );
      effects.push(store.set("users", shown, { onSuccess: "paint" }));
    }
    if (s.section === "roles") {
      const needle = search.trim().toLowerCase();
      const shown = this.allRoles.filter(
        (r) => !needle || r.name.toLowerCase().includes(needle),
      );
      effects.push(store.set("roles", shown, { onSuccess: "paint" }));
    }
    if (s.section === "permissions") {
      const needle = search.trim().toLowerCase();
      const shown = this.allPermissions.filter(
        (p) => !needle || p.name.toLowerCase().includes(needle),
      );
      effects.push(store.set("permissions", shown, { onSuccess: "paint" }));
    }
    if (s.section === "sessions") {
      const needle = search.trim().toLowerCase();
      const shown = this.allSessions.filter(
        (x) =>
          !needle ||
          x.email.toLowerCase().includes(needle) ||
          x.userName.toLowerCase().includes(needle),
      );
      effects.push(store.set("sessions", shown, { onSuccess: "paint" }));
    }
    return effects;
  }

  /** Refresh: the list of the section again. */
  refresh(_msg: Message, s: AdminSlice): Effect[] {
    return [...this.listOf(s.section)];
  }

  // ----- the roles -----

  setNewRole(msg: Message): Effect[] {
    return [
      store.set("newRole", msg.event?.value ?? "", { onSuccess: "paint" }),
    ];
  }

  setNewPermission(msg: Message): Effect[] {
    return [
      store.set("newPermission", msg.event?.value ?? "", {
        onSuccess: "paint",
      }),
    ];
  }

  /** The new role. */
  createRole(_msg: Message, s: AdminSlice): Effect[] {
    const name = s.newRole.trim();
    if (!name) return [];
    return [
      store.set("busy", true, { onSuccess: "paint" }),
      http.request({
        id: "role.create",
        method: "POST",
        url: "/api/admin/roles",
        body: { name },
        onSuccess: "role.created",
        onError: "write.failed",
      }),
    ];
  }

  "role.created"(msg: Message): Effect[] {
    const notice =
      (msg.payload as { data?: { name?: string } })?.data?.name ?? "";
    return [
      store.set("busy", false, { onSuccess: "paint" }),
      store.set("newRole", "", { onSuccess: "paint" }),
      store.set("notice", notice, { onSuccess: "paint" }),
      ...this.listOf("roles"),
    ];
  }

  /** The new permission. */
  createPermission(_msg: Message, s: AdminSlice): Effect[] {
    const name = s.newPermission.trim();
    if (!name) return [];
    return [
      store.set("busy", true, { onSuccess: "paint" }),
      http.request({
        id: "permission.create",
        method: "POST",
        url: "/api/admin/permissions",
        body: { name },
        onSuccess: "permission.created",
        onError: "write.failed",
      }),
    ];
  }

  "permission.created"(msg: Message): Effect[] {
    const notice =
      (msg.payload as { data?: { name?: string } })?.data?.name ?? "";
    return [
      store.set("busy", false, { onSuccess: "paint" }),
      store.set("newPermission", "", { onSuccess: "paint" }),
      store.set("notice", notice, { onSuccess: "paint" }),
      ...this.listOf("permissions"),
    ];
  }

  /** The role is removed. */
  deleteRole(msg: Message): Effect[] {
    const name = String(msg.payload ?? "");
    if (!name) return [];
    return [
      http.request({
        id: "role.delete",
        method: "DELETE",
        url: `/api/admin/roles/${name}`,
        onSuccess: "role.deleted",
        onError: "write.failed",
      }),
    ];
  }

  "role.deleted"(): Effect[] {
    return [
      store.set("notice", "", { onSuccess: "paint" }),
      ...this.listOf("roles"),
    ];
  }

  /** The permission is removed. */
  deletePermission(msg: Message): Effect[] {
    const name = String(msg.payload ?? "");
    if (!name) return [];
    return [
      http.request({
        id: "permission.delete",
        method: "DELETE",
        url: `/api/admin/permissions/${name}`,
        onSuccess: "permission.deleted",
        onError: "write.failed",
      }),
    ];
  }

  "permission.deleted"(): Effect[] {
    return [
      store.set("notice", "", { onSuccess: "paint" }),
      ...this.listOf("permissions"),
    ];
  }

  // ----- the permissions of a role -----

  /** The role whose permissions are being edited. */
  editRole(msg: Message, s: AdminSlice): Effect[] {
    const name = String(msg.payload ?? "");
    const role = this.allRoles.find((r) => r.name === name);
    return [
      store.set("editingRole", name, { onSuccess: "paint" }),
      store.set("rolePermissions", role?.permissions ?? [], {
        onSuccess: "paint",
      }),
    ];
  }

  /** A permission of the edited role is ticked (or unticked). */
  togglePermission(msg: Message, s: AdminSlice): Effect[] {
    const name = String(msg.payload ?? "");
    const has = s.rolePermissions.includes(name);
    const next = has
      ? s.rolePermissions.filter((p) => p !== name)
      : [...s.rolePermissions, name];
    return [store.set("rolePermissions", next, { onSuccess: "paint" })];
  }

  /** The permissions of the role are saved. */
  saveRole(_msg: Message, s: AdminSlice): Effect[] {
    if (!s.editingRole) return [];
    return [
      store.set("busy", true, { onSuccess: "paint" }),
      http.request({
        id: "role.permissions",
        method: "PUT",
        url: `/api/admin/roles/${s.editingRole}/permissions`,
        body: { ids: s.rolePermissions },
        onSuccess: "role.saved",
        onError: "write.failed",
      }),
    ];
  }

  "role.saved"(): Effect[] {
    return [
      store.set("busy", false, { onSuccess: "paint" }),
      store.set("editingRole", "", { onSuccess: "paint" }),
      store.set("rolePermissions", [], { onSuccess: "paint" }),
      ...this.listOf("roles"),
    ];
  }

  // ----- the sessions -----

  /** The session is ended. */
  endSession(msg: Message): Effect[] {
    const id = String(msg.payload ?? "");
    if (!id) return [];
    return [
      http.request({
        id: "session.revoke",
        method: "DELETE",
        url: `/api/admin/sessions/${id}`,
        onSuccess: "session.revoked",
        onError: "write.failed",
      }),
    ];
  }

  "session.revoked"(): Effect[] {
    return [...this.listOf("sessions")];
  }

  /** Something went wrong: the backend's own words. */
  "write.failed"(msg: Message): Effect[] {
    const error = (msg.payload as { error?: string }).error ?? "";
    return [
      store.set("busy", false, { onSuccess: "paint" }),
      store.set("error", error, { onSuccess: "paint" }),
    ];
  }

  /** Back to the app. */
  backToApp(): Effect[] {
    return [router.navigate("/app", { absolute: true })];
  }

  /** The sidebar's sign-out: the session ends, the login page opens. */
  signOut(): Effect[] {
    return [
      http.request({
        id: "logout",
        url: "/api/auth/logout",
        method: "POST",
        onSuccess: "signedOut",
        onError: "signedOut",
      }),
    ];
  }

  signedOut(): Effect[] {
    return [router.navigate("/app/login", { absolute: true })];
  }
}
